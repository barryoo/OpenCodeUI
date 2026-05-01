/// <reference types="bun" />

import { afterAll, beforeAll, beforeEach, describe, expect, mock, test } from 'bun:test'
import type { ApiSession } from '../api'
import type { ThinItem, ThinSessionSummary } from '../api/thinServer'

const storageMap = new Map<string, string>()
const polyfill: Storage = {
  getItem: (key: string) => storageMap.get(key) ?? null,
  setItem: (key: string, value: string) => { storageMap.set(key, value) },
  removeItem: (key: string) => { storageMap.delete(key) },
  clear: () => { storageMap.clear() },
  get length() { return storageMap.size },
  key: (index: number) => Array.from(storageMap.keys())[index] ?? null,
}

;(globalThis as Record<string, unknown>).sessionStorage = polyfill
;(globalThis as Record<string, unknown>).localStorage = polyfill

const projectPath = '/tmp/project-a'
const itemId = 'item-1'
const sessionId = 'session-1'
const summaryId = 'summary-1'

function makeItem(): ThinItem {
  return {
    id: itemId,
    projectPath,
    serverProfileId: 'profile-1',
    title: 'Bug item',
    type: 'bug',
    status: 'in_progress',
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

function makeSession(): ApiSession {
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

const upsertCalls: Array<Record<string, unknown>> = []
const unbindCalls: string[] = []
const upsertThinSessionSummaryMock = mock((input: Record<string, unknown>) => {
  upsertCalls.push(input)
  return Promise.resolve(makeSummary({
    id: `upserted-${String(input.externalSessionId)}`,
    externalSessionId: String(input.externalSessionId),
    itemId: 'itemId' in input ? (input.itemId as string | null) : itemId,
    variant: (input.variant as string | null | undefined) ?? null,
    titleSnapshot: String(input.titleSnapshot),
    statusSnapshot: input.statusSnapshot as ThinSessionSummary['statusSnapshot'],
    activityAt: String(input.activityAt),
    updatedAt: String(input.activityAt),
  }))
})
const findProjectByPathMock = mock(async () => ({ id: 'proj-1', worktree: projectPath }))

mock.module('../api/thinServer', () => ({
  upsertThinSessionSummary: upsertThinSessionSummaryMock,
  findProjectByPath: findProjectByPathMock,
  ensureDefaultThinServerProfile: mock(async () => ({ id: 'profile-1', userId: 'user-1', name: 'Mock', baseUrl: '', isDefault: true })),
  listThinServerProfiles: mock(async () => []),
  createThinServerProfile: mock(async () => ({ id: 'profile-1', userId: 'user-1', name: 'Mock', baseUrl: '', isDefault: true })),
  updateThinServerProfile: mock(async () => ({ id: 'profile-1', userId: 'user-1', name: 'Mock', baseUrl: '', isDefault: true })),
  deleteThinServerProfile: mock(async () => undefined),
  setDefaultThinServerProfile: mock(async () => ({ id: 'profile-1', userId: 'user-1', name: 'Mock', baseUrl: '', isDefault: true })),
  listAllThinSessionSummaries: mock(async () => []),
  listThinItems: mock(async () => []),
  listThinSessionSummaries: mock(async () => []),
  createThinItem: mock(async () => null),
  updateThinItem: mock(async () => null),
  deleteThinItem: mock(async () => undefined),
  bindThinSessionSummary: mock(async (nextSummaryId: string, nextItemId: string) => makeSummary({ id: nextSummaryId, itemId: nextItemId })),
  unbindThinSessionSummary: mock(async (nextSummaryId: string) => {
    unbindCalls.push(nextSummaryId)
    return makeSummary({ id: nextSummaryId, itemId: null })
  }),
  createBoundSession: mock(async () => null),
}))

let useItemWorkspaceStore: typeof import('./itemWorkspaceStore').useItemWorkspaceStore

beforeAll(async () => {
  const mod = await import('./itemWorkspaceStore')
  useItemWorkspaceStore = mod.useItemWorkspaceStore
})

afterAll(() => {
  delete (globalThis as Record<string, unknown>).sessionStorage
  delete (globalThis as Record<string, unknown>).localStorage
  mock.restore()
})

describe('itemWorkspaceStore binding preservation', () => {
  beforeEach(() => {
    upsertCalls.length = 0
    unbindCalls.length = 0
    upsertThinSessionSummaryMock.mockClear()
    findProjectByPathMock.mockClear()
    useItemWorkspaceStore.getState().reset()
    useItemWorkspaceStore.setState({
      profile: {
        id: 'profile-1',
        userId: 'user-1',
        name: 'Mock',
        baseUrl: '',
        isDefault: true,
      },
      projectStates: {
        [projectPath]: {
          items: [makeItem()],
          summaries: [makeSummary()],
          error: undefined,
        },
      },
      allSummaries: [makeSummary()],
    })
  })

  test('ensureProjectSummaryForSessions omits itemId when local cache misses an already-bound session', async () => {
    useItemWorkspaceStore.getState().reset()
    useItemWorkspaceStore.setState({
      profile: {
        id: 'profile-1',
        userId: 'user-1',
        name: 'Mock',
        baseUrl: '',
        isDefault: true,
      },
      projectStates: {},
      allSummaries: [],
    })

    await useItemWorkspaceStore.getState().ensureProjectSummaryForSessions(projectPath, [makeSession()])

    expect(upsertCalls).toHaveLength(1)
    expect(upsertCalls[0]).not.toHaveProperty('itemId')
  })

  test('unbindSession still performs explicit manual unbind', async () => {
    await useItemWorkspaceStore.getState().unbindSession(summaryId)

    expect(unbindCalls).toEqual([summaryId])
    const latest = useItemWorkspaceStore.getState().getSessionSummaryByExternalId(sessionId)
    expect(latest?.itemId).toBeNull()
  })
})
