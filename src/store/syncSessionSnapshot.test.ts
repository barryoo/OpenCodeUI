/// <reference types="bun" />

import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test'
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

let useItemWorkspaceStore: typeof import('./itemWorkspaceStore').useItemWorkspaceStore
let syncSessionSnapshotToItemWorkspace: typeof import('./syncSessionSnapshot').syncSessionSnapshotToItemWorkspace

const projectPath = '/tmp/project-a'
const itemId = 'item-1'
const sessionId = 'session-1'

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
    id: 'summary-1',
    projectPath,
    externalSessionId: sessionId,
    itemId,
    variant: null,
    titleSnapshot: 'New session - 2026-05-01T13:22:33.000Z',
    statusSnapshot: 'in_progress',
    activityAt: '2026-05-01T10:01:00.000Z',
    updatedAt: '2026-05-01T10:01:00.000Z',
    ...overrides,
  }
}

function makeSession(overrides: Partial<ApiSession> = {}): ApiSession {
  return {
    id: sessionId,
    title: '事项面板新建会话后显示问题',
    directory: projectPath,
    projectID: 'proj-1',
    time: {
      created: Date.parse('2026-05-01T10:00:00.000Z'),
      updated: Date.parse('2026-05-01T10:05:00.000Z'),
    },
    ...overrides,
  }
}

beforeAll(async () => {
  const [storeMod, syncMod] = await Promise.all([
    import('./itemWorkspaceStore'),
    import('./syncSessionSnapshot'),
  ])
  useItemWorkspaceStore = storeMod.useItemWorkspaceStore
  syncSessionSnapshotToItemWorkspace = syncMod.syncSessionSnapshotToItemWorkspace
})

afterAll(() => {
  delete (globalThis as Record<string, unknown>).sessionStorage
  delete (globalThis as Record<string, unknown>).localStorage
})

describe('syncSessionSnapshotToItemWorkspace', () => {
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

  test('updates linked summary title from the latest session title', () => {
    syncSessionSnapshotToItemWorkspace(makeSession())

    const linked = useItemWorkspaceStore.getState().getLinkedSummaries(itemId)
    expect(linked).toHaveLength(1)
    expect(linked[0].titleSnapshot).toBe('事项面板新建会话后显示问题')
  })

  test('uses real session timestamps for activityAt and updatedAt', () => {
    syncSessionSnapshotToItemWorkspace(makeSession())

    const summary = useItemWorkspaceStore.getState().getSessionSummaryByExternalId(sessionId)
    expect(summary?.activityAt).toBe('2026-05-01T10:05:00.000Z')
    expect(summary?.updatedAt).toBe('2026-05-01T10:05:00.000Z')
  })
})
