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
import type { ThinSessionSummary } from '../api/thinServer'

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

export const mockFindThinServerProfileByBaseUrl = mock(async () => ({
  id: 'profile-1',
  userId: 'user-1',
  name: 'Test Server',
  baseUrl: 'http://localhost:3000',
  isDefault: true,
}))

export const mockListAllThinSessionSummaries = mock(async () => [])
export const mockFetchThinServerProfileByBaseUrlQuery = mock(async () => ({
  id: 'profile-1',
  userId: 'user-1',
  name: 'Test Server',
  baseUrl: 'http://localhost:3000',
  isDefault: true,
}))
export const mockFetchAllThinSessionSummariesQuery = mock(async () => [])
export const mockInvalidateAllThinSessionSummariesQuery = mock(async () => {})

// ---- mock thinServer module BEFORE store import ----
mock.module('../api/thinServer', () => ({
  ensureDefaultThinServerProfile: mockEnsureDefaultThinServerProfile,
  findThinServerProfileByBaseUrl: mockFindThinServerProfileByBaseUrl,
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
  listAllThinSessionSummaries: mockListAllThinSessionSummaries,
  listThinItemSessionSummaries: mock(async () => []),
  upsertThinSessionSummary: mockUpsertThinSessionSummary,
  bindThinSessionSummary: api(),
  unbindThinSessionSummary: api(),
  searchThinProjectFiles: mock(async () => []),
  createBoundSession: api(),
}))

mock.module('../query/admin', () => ({
  fetchThinServerProfileByBaseUrlQuery: mockFetchThinServerProfileByBaseUrlQuery,
  fetchAllThinSessionSummariesQuery: mockFetchAllThinSessionSummariesQuery,
  invalidateAllThinSessionSummariesQuery: mockInvalidateAllThinSessionSummariesQuery,
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

let activeBaseUrl = 'http://localhost:3000'

mock.module('./serverStore', () => ({
  serverStore: {
    getActiveBaseUrl: () => activeBaseUrl,
  },
  makeBasicAuthHeader: () => 'Basic mocked',
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
  useItemWorkspaceStore.getState().reset()
  useItemWorkspaceStore.setState({
    profile: DEFAULT_PROFILE,
    profileBaseUrl: DEFAULT_PROFILE.baseUrl,
    allSummaries: [],
    projectStates: {},
    loadingProjects: {},
    loadedProjects: {},
    pinnedItemIds: [],
    archivedItemIds: [],
    pendingItemSessionBinding: null,
    draftItem: null,
    selectedItemId: null,
    selectedItemProjectPath: null,
  })
}

beforeEach(() => {
  activeBaseUrl = 'http://localhost:3000'
  mockUpsertThinSessionSummary.mockClear()
  mockFindProjectByPath.mockClear()
  mockEnsureDefaultThinServerProfile.mockClear()
  mockFindThinServerProfileByBaseUrl.mockClear()
  mockListAllThinSessionSummaries.mockClear()
  mockFetchThinServerProfileByBaseUrlQuery.mockClear()
  mockFetchAllThinSessionSummariesQuery.mockClear()
  mockInvalidateAllThinSessionSummariesQuery.mockClear()

  mockFetchThinServerProfileByBaseUrlQuery.mockImplementation(async () => ({
    id: 'profile-1',
    userId: 'user-1',
    name: 'Test Server',
    baseUrl: activeBaseUrl,
    isDefault: true,
  }))
  mockFetchAllThinSessionSummariesQuery.mockImplementation(async () => [])
  mockFindProjectByPath.mockImplementation(async () => ({
    id: 'proj-legacy-1',
    name: 'Test Project',
    worktree: '/tmp/test-project',
    sandboxes: [],
    time: { created: 1, updated: 1 },
  }))
  resetStore()
})

describe('initialize singleflight', () => {
  test('dedupes concurrent initialize calls for same baseUrl', async () => {
    useItemWorkspaceStore.setState({
      profile: null,
      profileBaseUrl: null,
      allSummaries: [],
    })

    await Promise.all([
      useItemWorkspaceStore.getState().initialize(),
      useItemWorkspaceStore.getState().initialize(),
    ])

    expect(mockFetchThinServerProfileByBaseUrlQuery).toHaveBeenCalledTimes(1)
    expect(mockFetchAllThinSessionSummariesQuery).toHaveBeenCalledTimes(1)
  })

  test('ignores stale initialize result after active baseUrl changes', async () => {
    let resolveProfile!: (value: typeof DEFAULT_PROFILE) => void

    mockFetchThinServerProfileByBaseUrlQuery.mockImplementationOnce(() => new Promise<typeof DEFAULT_PROFILE>((resolve) => {
      resolveProfile = resolve
    }))

    useItemWorkspaceStore.setState({
      profile: null,
      profileBaseUrl: null,
      allSummaries: [],
    })

    const pending = useItemWorkspaceStore.getState().initialize()
    activeBaseUrl = 'http://localhost:4000'
    resolveProfile(DEFAULT_PROFILE)
    await pending

    expect(useItemWorkspaceStore.getState().profileBaseUrl).toBeNull()
    expect(useItemWorkspaceStore.getState().profile).toBeNull()
  })
})

describe('loadProject server switch isolation', () => {
  test('does not short-circuit on cached project data after active baseUrl changes', async () => {
    useItemWorkspaceStore.setState({
      profile: DEFAULT_PROFILE,
      profileBaseUrl: 'http://localhost:3000',
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
      loadedProjects: { '/tmp/test': true },
    })

    activeBaseUrl = 'http://localhost:4000'

    await useItemWorkspaceStore.getState().loadProject('/tmp/test')

    expect(mockFetchThinServerProfileByBaseUrlQuery).toHaveBeenCalledTimes(1)
    expect(mockFindProjectByPath).toHaveBeenCalledTimes(1)
  })
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

// ---- helpers for local summary sync tests ----
const projectPath = '/tmp/project-a'
const itemId = 'item-1'
const sessionId = 'session-1'
const summaryId = 'summary-1'
const summaryId2 = 'summary-2'

function makeItem() {
  return {
    id: itemId,
    projectPath,
    serverProfileId: 'profile-1',
    title: 'Bug item',
    type: 'bug' as const,
    status: 'in_progress' as const,
    description: 'desc',
    activityAt: '2026-05-01T10:00:00.000Z',
    updatedAt: '2026-05-01T10:00:00.000Z',
  }
}

function makeSummary(overrides: Partial<ThinSessionSummary> = {}): ThinSessionSummary {
  return {
    id: summaryId,
    projectPath,
    externalSessionId: sessionId,
    itemId: null,
    variant: null,
    titleSnapshot: 'New Chat',
    statusSnapshot: 'in_progress',
    activityAt: '2026-05-01T10:01:00.000Z',
    updatedAt: '2026-05-01T10:01:00.000Z',
    ...overrides,
  }
}

function makeSession() {
  return {
    id: sessionId,
    title: 'New Chat',
    directory: projectPath,
    projectID: 'proj-1',
    time: {
      created: Date.parse('2026-05-01T10:00:00.000Z'),
      updated: Date.parse('2026-05-01T10:01:00.000Z'),
    },
  }
}

describe('itemWorkspaceStore local summary sync', () => {
  beforeEach(() => {
    useItemWorkspaceStore.getState().reset()
    useItemWorkspaceStore.setState({
      projectStates: {
        [projectPath]: {
          items: [makeItem()],
          summaries: [makeSummary()],
          error: undefined,
        },
      },
      allSummaries: [makeSummary()],
      selectedItemId: itemId,
      selectedItemProjectPath: projectPath,
    })
  })

  test('moves a newly bound session out of project entries and into linked summaries', () => {
    useItemWorkspaceStore.getState().upsertLocalSummary(
      makeSummary({ itemId }),
    )

    const entries = useItemWorkspaceStore.getState().getProjectEntries(projectPath, [makeSession()])
    const linked = useItemWorkspaceStore.getState().getLinkedSummaries(itemId)

    expect(entries.some((entry: any) => entry.kind === 'session' && entry.id === sessionId)).toBe(false)
    expect(linked.map((summary: any) => summary.externalSessionId)).toEqual([sessionId])
  })

  test('deduplicates by externalSessionId and keeps bound entry when re-written with a different id', () => {
    useItemWorkspaceStore.getState().upsertLocalSummary(
      makeSummary({ id: summaryId2, itemId }),
    )

    const state = useItemWorkspaceStore.getState()
    const projectSummaries = state.projectStates[projectPath]?.summaries ?? []
    const sameSessionSummaries = projectSummaries.filter((s: any) => s.externalSessionId === sessionId)

    expect(sameSessionSummaries).toHaveLength(1)
    expect(sameSessionSummaries[0].id).toBe(summaryId2)
    expect(sameSessionSummaries[0].itemId).toBe(itemId)
  })

  test('writes into an empty project state and is readable through getLinkedSummaries', () => {
    useItemWorkspaceStore.getState().reset()
    useItemWorkspaceStore.setState({ allSummaries: [] })

    const newPath = '/tmp/project-b'

    useItemWorkspaceStore.getState().upsertLocalSummary(
      makeSummary({ projectPath: newPath, itemId }),
    )

    const linked = useItemWorkspaceStore.getState().getLinkedSummaries(itemId)
    expect(linked).toHaveLength(1)
    expect(linked[0].externalSessionId).toBe(sessionId)
    expect(linked[0].projectPath).toBe(newPath)
  })

  test('getProjectSummaries deduplicates by externalSessionId and prefers bound version', () => {
    useItemWorkspaceStore.getState().reset()
    const boundSummary = makeSummary({ id: 'bound-1', itemId: 'item-99', externalSessionId: sessionId })
    const unboundSummary = makeSummary({ id: 'unbound-1', itemId: null, externalSessionId: sessionId })
    useItemWorkspaceStore.setState({
      projectStates: {
        [projectPath]: {
          items: [],
          summaries: [boundSummary, unboundSummary],
          error: undefined,
        },
      },
    })

    const result = useItemWorkspaceStore.getState().getProjectSummaries(projectPath)

    // 同一 externalSessionId 只保留一个
    expect(result).toHaveLength(1)
    // 优先保留已绑定的版本
    expect(result[0].id).toBe('bound-1')
    expect(result[0].itemId).toBe('item-99')
    expect(result[0].externalSessionId).toBe(sessionId)
  })

  test('getSessionSummaryByExternalId returns the latest and allSummaries has no stale duplicate', () => {
    useItemWorkspaceStore.getState().upsertLocalSummary(
      makeSummary({ id: summaryId2, itemId }),
    )

    const latest = useItemWorkspaceStore.getState().getSessionSummaryByExternalId(sessionId)
    expect(latest).not.toBeNull()
    expect(latest!.id).toBe(summaryId2)
    expect(latest!.itemId).toBe(itemId)

    const allSummaries = useItemWorkspaceStore.getState().allSummaries
    const sameSession = allSummaries.filter((s: any) => s.externalSessionId === sessionId)
    expect(sameSession).toHaveLength(1)
  })
})
