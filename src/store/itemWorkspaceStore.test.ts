/// <reference types="bun" />

import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test'
import type { ApiSession } from '../api'
import type { ThinItem, ThinSessionSummary } from '../api/thinServer'

// ---------------------------------------------------------------------------
// Polyfill browser storage APIs before any dynamic import.
// ---------------------------------------------------------------------------

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

// Dynamic imports (after polyfills are in place)
let useItemWorkspaceStore: typeof import('./itemWorkspaceStore').useItemWorkspaceStore

beforeAll(async () => {
  const mod = await import('./itemWorkspaceStore')
  useItemWorkspaceStore = mod.useItemWorkspaceStore
})

afterAll(() => {
  delete (globalThis as Record<string, unknown>).sessionStorage
  delete (globalThis as Record<string, unknown>).localStorage
})

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

const projectPath = '/tmp/project-a'
const itemId = 'item-1'
const sessionId = 'session-1'
const summaryId = 'summary-1'
const summaryId2 = 'summary-2'

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

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

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

    expect(entries.some((entry) => entry.kind === 'session' && entry.id === sessionId)).toBe(false)
    expect(linked.map((summary) => summary.externalSessionId)).toEqual([sessionId])
  })

  test('deduplicates by externalSessionId and keeps bound entry when re-written with a different id', () => {
    useItemWorkspaceStore.getState().upsertLocalSummary(
      makeSummary({ id: summaryId2, itemId }),
    )

    const state = useItemWorkspaceStore.getState()
    const projectSummaries = state.projectStates[projectPath]?.summaries ?? []
    const sameSessionSummaries = projectSummaries.filter((s) => s.externalSessionId === sessionId)

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
    const sameSession = allSummaries.filter((s) => s.externalSessionId === sessionId)
    expect(sameSession).toHaveLength(1)
  })
})
