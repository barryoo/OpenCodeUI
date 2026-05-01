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

describe('updateLocalSessionSnapshot', () => {
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

  test('updates titleSnapshot in allSummaries and project states', () => {
    useItemWorkspaceStore.getState().updateLocalSessionSnapshot(sessionId, {
      titleSnapshot: 'AI Generated Title',
    })

    const state = useItemWorkspaceStore.getState()
    const updatedAll = state.allSummaries.find((s) => s.externalSessionId === sessionId)
    expect(updatedAll?.titleSnapshot).toBe('AI Generated Title')

    const updatedProject = state.projectStates[projectPath]?.summaries.find((s) => s.externalSessionId === sessionId)
    expect(updatedProject?.titleSnapshot).toBe('AI Generated Title')
  })

  test('updates activityAt and updatedAt when provided', () => {
    const newActivityAt = '2026-05-01T12:00:00.000Z'
    const newUpdatedAt = '2026-05-01T12:05:00.000Z'
    useItemWorkspaceStore.getState().updateLocalSessionSnapshot(sessionId, {
      titleSnapshot: 'Updated Title',
      activityAt: newActivityAt,
      updatedAt: newUpdatedAt,
    })

    const updated = useItemWorkspaceStore.getState().getSessionSummaryByExternalId(sessionId)
    expect(updated?.titleSnapshot).toBe('Updated Title')
    expect(updated?.activityAt).toBe(newActivityAt)
    expect(updated?.updatedAt).toBe(newUpdatedAt)
  })

  test('is reflected in getLinkedSummaries', () => {
    useItemWorkspaceStore.getState().upsertLocalSummary(makeSummary({ itemId }))
    useItemWorkspaceStore.getState().updateLocalSessionSnapshot(sessionId, {
      titleSnapshot: 'Linked Title Update',
    })

    const linked = useItemWorkspaceStore.getState().getLinkedSummaries(itemId)
    expect(linked).toHaveLength(1)
    expect(linked[0].titleSnapshot).toBe('Linked Title Update')
  })

  test('loadProject returns early when project already has items and summaries', async () => {
    useItemWorkspaceStore.getState().reset()
    useItemWorkspaceStore.setState({
      projectStates: {
        [projectPath]: {
          items: [makeItem()],
          summaries: [makeSummary()],
          error: undefined,
        },
      },
      loadingProjects: {},
      loadedProjects: { [projectPath]: true },
    })

    const stateBefore = useItemWorkspaceStore.getState()

    // loadProject should short-circuit: project already has items + summaries, not loading
    await useItemWorkspaceStore.getState().loadProject(projectPath)

    const stateAfter = useItemWorkspaceStore.getState()
    // loadingProjects must NOT be set (short-circuit prevented any work)
    expect(stateAfter.loadingProjects[projectPath]).toBeUndefined()
    // Existing state must be preserved
    expect(stateAfter.projectStates[projectPath]?.items).toEqual(stateBefore.projectStates[projectPath]?.items)
    expect(stateAfter.projectStates[projectPath]?.summaries).toEqual(stateBefore.projectStates[projectPath]?.summaries)
  })

  test('loadProject does not short-circuit when project has stale error state', async () => {
    useItemWorkspaceStore.getState().reset()
    useItemWorkspaceStore.setState({
      projectStates: {
        [projectPath]: {
          items: [],
          summaries: [],
          error: '请先手动创建 Server Profile',
        },
      },
      loadingProjects: {},
      loadedProjects: { [projectPath]: false },
    })

    const before = useItemWorkspaceStore.getState()
    await before.loadProject(projectPath)
    const after = useItemWorkspaceStore.getState()

    expect(after.loadingProjects[projectPath]).toBe(false)
    expect(after.loadedProjects[projectPath]).toBe(false)
  })

  test('rename scenario: updates titleSnapshot in both allSummaries and project states via getLinkedSummaries', () => {
    // Bind the session first
    useItemWorkspaceStore.getState().upsertLocalSummary(makeSummary({ itemId }))

    // Simulate a rename operation
    useItemWorkspaceStore.getState().updateLocalSessionSnapshot(sessionId, {
      titleSnapshot: 'Renamed Session',
      updatedAt: '2026-05-01T13:00:00.000Z',
    })

    // Check allSummaries
    const all = useItemWorkspaceStore.getState().allSummaries.find((s) => s.externalSessionId === sessionId)
    expect(all?.titleSnapshot).toBe('Renamed Session')
    expect(all?.updatedAt).toBe('2026-05-01T13:00:00.000Z')

    // Check project states
    const project = useItemWorkspaceStore.getState().projectStates[projectPath]?.summaries.find((s) => s.externalSessionId === sessionId)
    expect(project?.titleSnapshot).toBe('Renamed Session')

    // Linked summaries reflect the rename
    const linked = useItemWorkspaceStore.getState().getLinkedSummaries(itemId)
    expect(linked).toHaveLength(1)
    expect(linked[0].titleSnapshot).toBe('Renamed Session')
  })
})
