import { create } from 'zustand'
import { getProjects, searchFiles, type ApiSession } from '../api'
import {
  bindThinSessionSummary,
  createBoundSession,
  createThinItem,
  deleteThinItem,
  ensureDefaultThinServerProfile,
  listAllThinSessionSummaries,
  listThinItems,
  listThinSessionSummaries,
  type ThinItem,
  type ThinSessionSummary,
  type ThinServerProfile,
  type ThinWorkflowStatus,
  unbindThinSessionSummary,
  updateThinItem,
  upsertThinSessionSummary,
} from '../api/thinServer'
import { serverStore } from './serverStore'

const PINNED_ITEMS_STORAGE_KEY = 'opencode-pinned-items'
const ARCHIVED_ITEMS_STORAGE_KEY = 'opencode-archived-items'

function readLocalArray(key: string): string[] {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed.filter((value): value is string => typeof value === 'string') : []
  } catch {
    return []
  }
}

function writeLocalArray(key: string, value: string[]) {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // ignore
  }
}

interface PendingItemSessionBinding {
  projectId: string
  itemId: string
}

export interface MixedSidebarEntry {
  kind: 'item' | 'session'
  id: string
  title: string
  status: ThinWorkflowStatus
  updatedAt: string
  item?: ThinItem
  sessionSummary?: ThinSessionSummary
}

function toTimestamp(value?: string): number {
  if (!value) return 0
  const parsed = Date.parse(value)
  return Number.isNaN(parsed) ? 0 : parsed
}

interface ProjectItemState {
  items: ThinItem[]
  summaries: ThinSessionSummary[]
  error?: string
}

interface ItemWorkspaceState {
  profile: ThinServerProfile | null
  pinnedItemIds: string[]
  archivedItemIds: string[]
  pendingItemSessionBinding: PendingItemSessionBinding | null
  draftItem: ThinItem | null
  allSummaries: ThinSessionSummary[]
  selectedItemId: string | null
  selectedItemProjectId: string | null
  projectStates: Record<string, ProjectItemState>
  loadingProjects: Record<string, boolean>
  initialize: () => Promise<void>
  loadProject: (projectId: string) => Promise<void>
  ensureProjectSummaryForSessions: (projectId: string, sessions: ApiSession[]) => Promise<void>
  getProjectEntries: (projectId: string, sessions: ApiSession[]) => MixedSidebarEntry[]
  getProjectItems: (projectId: string) => ThinItem[]
  getItemById: (projectId: string, itemId: string) => ThinItem | null
  getProjectUnboundSummaries: (projectId: string) => ThinSessionSummary[]
  getLinkedSummaries: (itemId: string) => ThinSessionSummary[]
  getSessionSummaryByExternalId: (externalSessionId: string) => ThinSessionSummary | null
  getProjectError: (projectId: string) => string | undefined
  isProjectLoading: (projectId: string) => boolean
  selectItem: (projectId: string, itemId: string | null) => void
  setDraftItem: (item: ThinItem | null) => void
  createItem: (projectId: string, input: Pick<ThinItem, 'title' | 'type' | 'description'>) => Promise<ThinItem | null>
  updateItem: (itemId: string, input: Partial<Pick<ThinItem, 'title' | 'type' | 'description' | 'status'>>) => Promise<ThinItem | null>
  deleteItem: (projectId: string, itemId: string) => Promise<void>
  togglePinnedItem: (itemId: string) => void
  isItemPinned: (itemId: string) => boolean
  archiveItem: (projectId: string, itemId: string) => Promise<void>
  isItemArchived: (itemId: string) => boolean
  preparePendingItemSession: (projectId: string, itemId: string) => void
  consumePendingItemSessionBinding: () => PendingItemSessionBinding | null
  bindSession: (summaryId: string, itemId: string) => Promise<void>
  unbindSession: (summaryId: string) => Promise<void>
  updateSessionStatus: (input: { projectId: string; externalSessionId: string; titleSnapshot: string; activityAt: string; status: ThinWorkflowStatus }) => Promise<ThinSessionSummary | null>
  createSessionForItem: (projectId: string, itemId: string) => Promise<ApiSession | null>
  searchFiles: (projectId: string, query: string) => Promise<string[]>
  reset: () => void
}

function mergeProjectState(projectStates: Record<string, ProjectItemState>, projectId: string, next: Partial<ProjectItemState>) {
  return {
    ...projectStates,
    [projectId]: {
      items: next.items ?? projectStates[projectId]?.items ?? [],
      summaries: next.summaries ?? projectStates[projectId]?.summaries ?? [],
      error: next.error,
    },
  }
}

function mergeSummaries(current: ThinSessionSummary[], incoming: ThinSessionSummary[]): ThinSessionSummary[] {
  const byId = new Map(current.map((summary) => [summary.id, summary]))
  for (const summary of incoming) {
    byId.set(summary.id, summary)
  }
  return Array.from(byId.values())
}

function compareSummaryPriority(a: ThinSessionSummary, b: ThinSessionSummary): number {
  const aBound = a.itemId ? 1 : 0
  const bBound = b.itemId ? 1 : 0
  if (aBound !== bBound) return bBound - aBound

  const activityDiff = toTimestamp(b.activityAt) - toTimestamp(a.activityAt)
  if (activityDiff !== 0) return activityDiff

  const updatedDiff = toTimestamp(b.updatedAt) - toTimestamp(a.updatedAt)
  if (updatedDiff !== 0) return updatedDiff

  return b.id.localeCompare(a.id)
}

function dedupeSummariesByExternalSessionId(summaries: ThinSessionSummary[]): ThinSessionSummary[] {
  const byExternalId = new Map<string, ThinSessionSummary>()

  for (const summary of summaries) {
    const existing = byExternalId.get(summary.externalSessionId)
    if (!existing || compareSummaryPriority(summary, existing) < 0) {
      byExternalId.set(summary.externalSessionId, summary)
    }
  }

  return Array.from(byExternalId.values()).sort(compareSummaryPriority)
}

export const useItemWorkspaceStore = create<ItemWorkspaceState>((set, get) => ({
  profile: null,
  pinnedItemIds: readLocalArray(PINNED_ITEMS_STORAGE_KEY),
  archivedItemIds: readLocalArray(ARCHIVED_ITEMS_STORAGE_KEY),
  pendingItemSessionBinding: null,
  draftItem: null,
  allSummaries: [],
  selectedItemId: null,
  selectedItemProjectId: null,
  projectStates: {},
  loadingProjects: {},

  initialize: async () => {
    if (get().profile) return
    const baseUrl = serverStore.getActiveBaseUrl()
    const activeServer = serverStore.getActiveServer()
    const profile = await ensureDefaultThinServerProfile(baseUrl, activeServer?.name ?? 'Active OpenCode Server')
    const allSummaries = await listAllThinSessionSummaries().catch(() => [])
    set({ profile, allSummaries })
  },

  loadProject: async (projectId: string) => {
    await get().initialize()
    set((state) => ({ loadingProjects: { ...state.loadingProjects, [projectId]: true } }))
    try {
      const [items, summaries] = await Promise.all([
        listThinItems(projectId),
        listThinSessionSummaries(projectId),
      ])
      set((state) => ({
        projectStates: mergeProjectState(state.projectStates, projectId, { items, summaries, error: undefined }),
        allSummaries: mergeSummaries(state.allSummaries, summaries),
        loadingProjects: { ...state.loadingProjects, [projectId]: false },
      }))
    } catch (error) {
      set((state) => ({
        projectStates: mergeProjectState(state.projectStates, projectId, { error: error instanceof Error ? error.message : 'Failed to load items' }),
        loadingProjects: { ...state.loadingProjects, [projectId]: false },
      }))
    }
  },

  ensureProjectSummaryForSessions: async (projectId: string, sessions: ApiSession[]) => {
    const profile = get().profile
    if (!profile) {
      await get().initialize()
    }
    const activeProfile = get().profile
    if (!activeProfile) return
    const state = get().projectStates[projectId]
    const existingByExternalId = new Map(
      dedupeSummariesByExternalSessionId([
        ...(state?.summaries ?? []),
        ...get().allSummaries.filter((summary) => summary.projectId === projectId),
      ]).map((summary) => [summary.externalSessionId, summary])
    )
    const touched = await Promise.all(sessions.map(async (session) => {
      const existing = existingByExternalId.get(session.id)
      const activityAt = new Date(session.time.updated ?? session.time.created).toISOString()
      const nextStatus = existing?.statusSnapshot ?? 'in_progress'

      return upsertThinSessionSummary({
        serverProfileId: activeProfile.id,
        projectId,
        externalSessionId: session.id,
        titleSnapshot: session.title,
        statusSnapshot: nextStatus,
        activityAt,
        itemId: existing?.itemId ?? null,
      })
    }))
    set((state) => ({
      projectStates: mergeProjectState(state.projectStates, projectId, {
        summaries: mergeSummaries(state.projectStates[projectId]?.summaries ?? [], touched),
      }),
      allSummaries: mergeSummaries(state.allSummaries, touched),
    }))
  },

  getProjectEntries: (projectId: string, sessions: ApiSession[]) => {
    const state = get().projectStates[projectId]
    const items = (state?.items ?? []).filter((item) => !get().archivedItemIds.includes(item.id))
    const summaries = dedupeSummariesByExternalSessionId(state?.summaries ?? [])
    const summaryByExternalId = new Map(summaries.map((summary) => [summary.externalSessionId, summary]))
    const itemOrderById = new Map(items.map((item, index) => [item.id, index]))
    const sessionOrderById = new Map(sessions.map((session, index) => [session.id, index]))

    const itemEntries: MixedSidebarEntry[] = items.map((item) => ({
      kind: 'item',
      id: item.id,
      title: item.title,
      status: item.status,
      updatedAt: item.updatedAt || item.activityAt,
      item,
    }))

    const unboundSessionEntries: MixedSidebarEntry[] = []
    for (const session of sessions) {
      const summary = summaryByExternalId.get(session.id)
      if (summary?.itemId) continue
      unboundSessionEntries.push({
        kind: 'session',
        id: session.id,
        title: summary?.titleSnapshot || session.title || 'Untitled Chat',
        status: summary?.statusSnapshot || 'in_progress',
        updatedAt: summary?.activityAt || summary?.updatedAt || new Date(session.time.updated ?? session.time.created).toISOString(),
        sessionSummary: summary,
      })
    }

    return [...itemEntries, ...unboundSessionEntries].sort((a, b) => {
      const diff = toTimestamp(b.updatedAt) - toTimestamp(a.updatedAt)
      if (diff !== 0) return diff

      if (a.kind === 'item' && b.kind === 'item') {
        return (itemOrderById.get(a.id) ?? 0) - (itemOrderById.get(b.id) ?? 0)
      }

      if (a.kind === 'session' && b.kind === 'session') {
        return (sessionOrderById.get(a.id) ?? 0) - (sessionOrderById.get(b.id) ?? 0)
      }

      return b.id.localeCompare(a.id)
    })
  },

  getProjectItems: (projectId: string) => get().projectStates[projectId]?.items ?? [],
  getItemById: (projectId: string, itemId: string) => {
    if (itemId === '__draft__') return get().draftItem
    return get().projectStates[projectId]?.items.find((item) => item.id === itemId) ?? null
  },
  getProjectUnboundSummaries: (projectId: string) => dedupeSummariesByExternalSessionId(
    (get().projectStates[projectId]?.summaries ?? []).filter((summary: ThinSessionSummary) => !summary.itemId)
  ),
  getLinkedSummaries: (itemId: string) => dedupeSummariesByExternalSessionId(
    Object.values(get().projectStates)
      .flatMap((state) => state.summaries)
      .filter((summary: ThinSessionSummary) => summary.itemId === itemId)
  ),
  getSessionSummaryByExternalId: (externalSessionId: string) => dedupeSummariesByExternalSessionId(
    get().allSummaries.filter((summary) => summary.externalSessionId === externalSessionId)
  )[0] ?? null,
  getProjectError: (projectId: string) => get().projectStates[projectId]?.error,
  isProjectLoading: (projectId: string) => !!get().loadingProjects[projectId],

  selectItem: (projectId: string, itemId: string | null) => set({ selectedItemId: itemId, selectedItemProjectId: itemId ? projectId : null }),

  setDraftItem: (item) => set({ draftItem: item }),

  createItem: async (projectId: string, input) => {
    await get().initialize()
    const profile = get().profile
    if (!profile) return null
    const created = await createThinItem({ serverProfileId: profile.id, projectId, title: input.title, type: input.type, description: input.description })
    set((state: ItemWorkspaceState) => ({ projectStates: mergeProjectState(state.projectStates, projectId, { items: [created, ...(state.projectStates[projectId]?.items ?? [])] }) }))
    set({ selectedItemId: created.id, selectedItemProjectId: projectId, draftItem: null })
    return created
  },

  updateItem: async (itemId: string, input) => {
    const projectId = get().selectedItemProjectId
    if (!projectId) return null
    const updated = await updateThinItem(itemId, input)
    set((state: ItemWorkspaceState) => ({
      projectStates: mergeProjectState(state.projectStates, projectId, {
        items: (state.projectStates[projectId]?.items ?? []).map((item: ThinItem) => item.id === itemId ? updated : item),
      }),
    }))
    return updated
  },

  deleteItem: async (projectId: string, itemId: string) => {
    await deleteThinItem(itemId)
    const pinnedItemIds = get().pinnedItemIds.filter((id) => id !== itemId)
    const archivedItemIds = get().archivedItemIds.filter((id) => id !== itemId)
    writeLocalArray(PINNED_ITEMS_STORAGE_KEY, pinnedItemIds)
    writeLocalArray(ARCHIVED_ITEMS_STORAGE_KEY, archivedItemIds)
    set((state: ItemWorkspaceState) => ({
      pinnedItemIds,
      archivedItemIds,
      projectStates: mergeProjectState(state.projectStates, projectId, {
        items: (state.projectStates[projectId]?.items ?? []).filter((item: ThinItem) => item.id !== itemId),
      }),
      selectedItemId: state.selectedItemId === itemId ? null : state.selectedItemId,
      selectedItemProjectId: state.selectedItemId === itemId ? null : state.selectedItemProjectId,
    }))
  },

  togglePinnedItem: (itemId: string) => {
    const current = get().pinnedItemIds
    const next = current.includes(itemId) ? current.filter((id) => id !== itemId) : [itemId, ...current]
    writeLocalArray(PINNED_ITEMS_STORAGE_KEY, next)
    set({ pinnedItemIds: next })
  },

  isItemPinned: (itemId: string) => get().pinnedItemIds.includes(itemId),

  archiveItem: async (_projectId: string, itemId: string) => {
    const current = get().archivedItemIds
    if (current.includes(itemId)) return
    const next = [itemId, ...current]
    writeLocalArray(ARCHIVED_ITEMS_STORAGE_KEY, next)
    set((state) => ({
      archivedItemIds: next,
      draftItem: state.selectedItemId === itemId ? null : state.draftItem,
      selectedItemId: state.selectedItemId === itemId ? null : state.selectedItemId,
      selectedItemProjectId: state.selectedItemId === itemId ? null : state.selectedItemProjectId,
    }))
  },

  isItemArchived: (itemId: string) => get().archivedItemIds.includes(itemId),

  preparePendingItemSession: (projectId: string, itemId: string) => {
    set({ pendingItemSessionBinding: { projectId, itemId } })
  },

  consumePendingItemSessionBinding: () => {
    const binding = get().pendingItemSessionBinding
    set({ pendingItemSessionBinding: null })
    return binding
  },

  bindSession: async (summaryId: string, itemId: string) => {
    const updated = await bindThinSessionSummary(summaryId, itemId)
    const projectId = updated.projectId
    set((state: ItemWorkspaceState) => ({
      projectStates: mergeProjectState(state.projectStates, projectId, {
        summaries: (state.projectStates[projectId]?.summaries ?? []).map((summary: ThinSessionSummary) => summary.id === summaryId ? updated : summary),
      }),
      allSummaries: state.allSummaries.map((summary: ThinSessionSummary) => summary.id === summaryId ? updated : summary),
    }))
  },

  unbindSession: async (summaryId: string) => {
    const updated = await unbindThinSessionSummary(summaryId)
    const projectId = updated.projectId
    set((state: ItemWorkspaceState) => ({
      projectStates: mergeProjectState(state.projectStates, projectId, {
        summaries: (state.projectStates[projectId]?.summaries ?? []).map((summary: ThinSessionSummary) => summary.id === summaryId ? updated : summary),
      }),
      allSummaries: state.allSummaries.map((summary: ThinSessionSummary) => summary.id === summaryId ? updated : summary),
    }))
  },

  updateSessionStatus: async ({ projectId, externalSessionId, titleSnapshot, activityAt, status }) => {
    await get().initialize()
    const profile = get().profile
    if (!profile) return null

    const existing = get().getSessionSummaryByExternalId(externalSessionId)
    const updated = await upsertThinSessionSummary({
      serverProfileId: profile.id,
      projectId,
      externalSessionId,
      titleSnapshot,
      statusSnapshot: status,
      activityAt,
      itemId: existing?.itemId ?? null,
    })

    set((state: ItemWorkspaceState) => {
      const currentSummaries = state.projectStates[projectId]?.summaries ?? []
      const exists = currentSummaries.some((summary) => summary.id === updated.id)
      return {
        projectStates: mergeProjectState(state.projectStates, projectId, {
          summaries: exists
            ? currentSummaries.map((summary: ThinSessionSummary) => summary.id === updated.id ? updated : summary)
            : [updated, ...currentSummaries],
        }),
        allSummaries: mergeSummaries(state.allSummaries, [updated]),
      }
    })

    return updated
  },

  createSessionForItem: async (projectId: string, itemId: string) => {
    await get().initialize()
    const profile = get().profile
    if (!profile) return null
    const projects = await getProjects()
    const project = projects.find((entry) => entry.id === projectId)
    if (!project) return null
    const session = await createBoundSession({ project, serverProfileId: profile.id, itemId, title: undefined })
    await get().loadProject(projectId)
    return session
  },

  searchFiles: async (projectId: string, query: string) => {
    if (!query.trim()) return []
    const projects = await getProjects()
    const project = projects.find((entry) => entry.id === projectId)
    if (!project?.worktree) return []
    return searchFiles(query, {
      directory: project.worktree,
      type: 'file',
      limit: 8,
    })
  },

  reset: () => set({
    profile: null,
    pendingItemSessionBinding: null,
    draftItem: null,
    allSummaries: [],
    selectedItemId: null,
    selectedItemProjectId: null,
    projectStates: {},
    loadingProjects: {},
  }),
}))
