/// <reference types="bun" />

// ---- polyfill sessionStorage / localStorage for bun test ----
if (typeof sessionStorage === 'undefined') {
  const store = new Map<string, string>()
  const storage: Storage = {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => { store.set(key, value) },
    removeItem: (key: string) => { store.delete(key) },
    clear: () => { store.clear() },
    get length() { return store.size },
    key: (index: number) => [...store.keys()][index] ?? null,
  }
  ;(globalThis as any).sessionStorage = storage
  ;(globalThis as any).localStorage = storage
}

import { beforeEach, describe, expect, mock, test } from 'bun:test'

// ---- mock factories ----
const api = <T>() => mock(async (): Promise<T> => ({} as T))
const apiVoid = () => mock(async (): Promise<void> => {})

// mocks under test
export const mockUpsertThinSessionSummary = mock(async (input: any) => ({
  id: `summary-${input.externalSessionId}`,
  projectPath: input.projectPath,
  externalSessionId: input.externalSessionId,
  itemId: input.itemId ?? null,
  variant: input.variant ?? null,
  titleSnapshot: input.titleSnapshot,
  statusSnapshot: input.statusSnapshot,
  activityAt: input.activityAt,
  updatedAt: new Date().toISOString(),
}))

export const mockFindProjectByPath = mock(async () => ({
  id: 'proj-legacy-1',
  name: 'Test Project',
  worktree: '/tmp/test-project',
  sandboxes: [],
  time: { created: 1, updated: 1 },
}))

export const mockEnsureDefaultThinServerProfile = mock(async () => ({
  id: 'profile-1',
  userId: 'user-1',
  name: 'Test Server',
  baseUrl: 'http://localhost:3000',
  isDefault: true,
}))

// ---- mock thinServer module BEFORE store import ----
mock.module('../api/thinServer', () => ({
  ensureDefaultThinServerProfile: mockEnsureDefaultThinServerProfile,
  listThinServerProfiles: api(),
  createThinServerProfile: api(),
  updateThinServerProfile: api(),
  deleteThinServerProfile: apiVoid(),
  setDefaultThinServerProfile: api(),
  getLegacyProjectIdByPathMap: mock(async () => new Map()),
  getLegacyProjectIdForPath: mock(() => null),
  findProjectByPath: mockFindProjectByPath,
  listThinItems: mock(async () => []),
  createThinItem: api(),
  updateThinItem: api(),
  deleteThinItem: apiVoid(),
  listThinSessionSummaries: mock(async () => []),
  listAllThinSessionSummaries: mock(async () => []),
  listThinItemSessionSummaries: mock(async () => []),
  upsertThinSessionSummary: mockUpsertThinSessionSummary,
  bindThinSessionSummary: api(),
  unbindThinSessionSummary: api(),
  searchThinProjectFiles: mock(async () => []),
  createBoundSession: api(),
}))

// ---- mock auth module to prevent API calls during module init ----
mock.module('../api/auth', () => ({
  ThinAuthError: class ThinAuthError extends Error {
    status: number
    code?: string
    constructor(message: string, status: number, code?: string) {
      super(message)
      this.name = 'ThinAuthError'
      this.status = status
      this.code = code
    }
  },
  ensureThinAuth: mock(async (): Promise<void> => {}),
  getThinAuthMe: mock(async () => ({ user: null, auth: null })),
  loginWithGithub: mock(async () => {}),
  logoutThinAuth: mock(async () => {}),
}))

// ---- now import store (mock applied) ----
const { useItemWorkspaceStore } = await import('./itemWorkspaceStore')

const DEFAULT_PROFILE = {
  id: 'profile-1',
  userId: 'user-1',
  name: 'Test',
  baseUrl: 'http://localhost:3000',
  isDefault: true,
}

function resetStore() {
  useItemWorkspaceStore.setState({
    profile: DEFAULT_PROFILE,
    allSummaries: [],
    projectStates: {},
    loadingProjects: {},
    pinnedItemIds: [],
    archivedItemIds: [],
    pendingItemSessionBinding: null,
    draftItem: null,
    selectedItemId: null,
    selectedItemProjectPath: null,
  })
}

beforeEach(() => {
  resetStore()
  mockUpsertThinSessionSummary.mockClear()
  mockFindProjectByPath.mockClear()
  mockEnsureDefaultThinServerProfile.mockClear()
})

describe('ensureProjectSummaryForSessions', () => {
  test('does not call upsert when sessions unchanged (inputs.length === 0)', async () => {
    // Pre-populate project state with a summary matching the session
    useItemWorkspaceStore.setState({
      projectStates: {
        '/tmp/test': {
          items: [],
          summaries: [{
            id: 'sum-s1',
            projectPath: '/tmp/test',
            externalSessionId: 's1',
            itemId: null,
            variant: null,
            titleSnapshot: 'Chat',
            statusSnapshot: 'in_progress',
            activityAt: '2024-05-01T10:00:00.000Z',
            updatedAt: '2024-05-01T10:00:00.000Z',
          }],
        },
      },
    })

    await useItemWorkspaceStore.getState().ensureProjectSummaryForSessions('/tmp/test', [{
      id: 's1',
      title: 'Chat',
      directory: '/tmp/test',
      projectID: 'proj-1',
      time: { created: 1714557600000, updated: 1714557600000 },
    }])

    expect(mockUpsertThinSessionSummary).toHaveBeenCalledTimes(0)
  })
})

describe('loadProject short-circuit', () => {
  test('skips when project already has items and summaries', async () => {
    // Pre-populate a fully loaded project
    useItemWorkspaceStore.setState({
      projectStates: {
        '/tmp/test': {
          items: [{
            id: 'it-1', projectPath: '/tmp/test', serverProfileId: 'p1',
            title: 'X', type: 'bug', status: 'in_progress',
            description: '', activityAt: '', updatedAt: '',
          }],
          summaries: [{
            id: 's1', projectPath: '/tmp/test', externalSessionId: 'ext-1',
            itemId: null, variant: null, titleSnapshot: 'Y',
            statusSnapshot: 'in_progress', activityAt: '', updatedAt: '',
          }],
        },
      },
      loadingProjects: {},
    })

    mockFindProjectByPath.mockClear()

    await useItemWorkspaceStore.getState().loadProject('/tmp/test')

    // Short-circuit: findProjectByPath should NOT be called
    expect(mockFindProjectByPath).toHaveBeenCalledTimes(0)
  })
})

describe('updateSessionStatus', () => {
  test('preserves itemId/variant from allSummaries when project state missing', async () => {
    // Set up allSummaries with a summary that has itemId/variant
    useItemWorkspaceStore.setState({
      allSummaries: [{
        id: 'sum-s2',
        projectPath: '/tmp/test',
        externalSessionId: 's2',
        itemId: 'item-99',
        variant: 'plan',
        titleSnapshot: 'Some Chat',
        statusSnapshot: 'in_progress',
        activityAt: '2024-05-01T10:00:00.000Z',
        updatedAt: '2024-05-01T10:00:00.000Z',
      }],
    })

    await useItemWorkspaceStore.getState().updateSessionStatus({
      projectPath: '/tmp/test',
      externalSessionId: 's2',
      titleSnapshot: 'Some Chat',
      activityAt: '2024-05-02T10:00:00.000Z',
      status: 'completed',
    })

    // Verify upsert was called with the preserved itemId/variant from allSummaries
    expect(mockUpsertThinSessionSummary).toHaveBeenCalledTimes(1)
    const callArg = mockUpsertThinSessionSummary.mock.calls[0]?.[0]
    expect(callArg?.itemId).toBe('item-99')
    expect(callArg?.variant).toBe('plan')
    expect(callArg?.statusSnapshot).toBe('completed')
  })

  test('does not leak itemId/variant across projects with same externalSessionId', async () => {
    // Two projects share the same externalSessionId but different itemId/variant
    useItemWorkspaceStore.setState({
      allSummaries: [
        {
          id: 'sum-a',
          projectPath: '/tmp/project-a',
          externalSessionId: 'shared-session',
          itemId: 'item-a',
          variant: 'plan',
          titleSnapshot: 'Chat A',
          statusSnapshot: 'in_progress',
          activityAt: '2024-05-01T10:00:00.000Z',
          updatedAt: '2024-05-01T10:00:00.000Z',
        },
        {
          id: 'sum-b',
          projectPath: '/tmp/project-b',
          externalSessionId: 'shared-session',
          itemId: 'item-b',
          variant: 'bugfix',
          titleSnapshot: 'Chat B',
          statusSnapshot: 'in_progress',
          activityAt: '2024-05-01T10:00:00.000Z',
          updatedAt: '2024-05-01T10:00:00.000Z',
        },
      ],
    })

    await useItemWorkspaceStore.getState().updateSessionStatus({
      projectPath: '/tmp/project-a',
      externalSessionId: 'shared-session',
      titleSnapshot: 'Chat A',
      activityAt: '2024-05-02T10:00:00.000Z',
      status: 'completed',
    })

    expect(mockUpsertThinSessionSummary).toHaveBeenCalledTimes(1)
    const callArg = mockUpsertThinSessionSummary.mock.calls[0]?.[0]
    expect(callArg?.itemId).toBe('item-a')
    expect(callArg?.variant).toBe('plan')
    // must NOT leak project-b's itemId/variant
    expect(callArg?.itemId).not.toBe('item-b')
    expect(callArg?.variant).not.toBe('bugfix')
  })
})
