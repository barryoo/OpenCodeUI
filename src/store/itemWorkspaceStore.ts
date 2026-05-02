import { create } from 'zustand'
import { searchFiles, type ApiSession } from '../api'
import {
  bindThinSessionSummary,
  createBoundSession,
  createThinItem,
  deleteThinItem,
  findProjectByPath,
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
import { ThinAuthError } from '../api/auth'
import { buildSummaryUpsertInputs } from './sessionSummarySync'
import { serverStore } from './serverStore'
import {
  fetchAllThinSessionSummariesQuery,
  fetchThinServerProfileByBaseUrlQuery,
  invalidateAllThinSessionSummariesQuery,
} from '../query/admin'

const PINNED_ITEMS_STORAGE_KEY = 'opencode-pinned-items'
const ARCHIVED_ITEMS_STORAGE_KEY = 'opencode-archived-items'
const MISSING_PROFILE_ERROR = '请先手动创建 Server Profile'
let initializePromise: Promise<void> | null = null

function isActiveBaseUrl(baseUrl: string): boolean {
  return serverStore.getActiveBaseUrl() === baseUrl
}

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
  projectPath: string
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
  profileBaseUrl: string | null
  pinnedItemIds: string[]
  archivedItemIds: string[]
  pendingItemSessionBinding: PendingItemSessionBinding | null
  draftItem: ThinItem | null
  allSummaries: ThinSessionSummary[]
  selectedItemId: string | null
  selectedItemProjectPath: string | null
  projectStates: Record<string, ProjectItemState>
  loadingProjects: Record<string, boolean>
  loadedProjects: Record<string, boolean>
  initialize: () => Promise<void>
  loadProject: (projectPath: string) => Promise<void>
  ensureProjectSummaryForSessions: (projectPath: string, sessions: ApiSession[]) => Promise<void>
  getProjectEntries: (projectPath: string, sessions: ApiSession[]) => MixedSidebarEntry[]
  getProjectItems: (projectPath: string) => ThinItem[]
  getItemById: (projectPath: string, itemId: string) => ThinItem | null
  getProjectUnboundSummaries: (projectPath: string) => ThinSessionSummary[]
  getLinkedSummaries: (itemId: string) => ThinSessionSummary[]
  getSessionSummaryByExternalId: (externalSessionId: string) => ThinSessionSummary | null
  getProjectError: (projectPath: string) => string | undefined
  isProjectLoading: (projectPath: string) => boolean
  selectItem: (projectPath: string, itemId: string | null) => void
  setDraftItem: (item: ThinItem | null) => void
  createItem: (projectPath: string, input: Pick<ThinItem, 'title' | 'type' | 'description'>) => Promise<ThinItem | null>
  updateItem: (itemId: string, input: Partial<Pick<ThinItem, 'title' | 'type' | 'description' | 'status'>>) => Promise<ThinItem | null>
  deleteItem: (projectPath: string, itemId: string) => Promise<void>
  togglePinnedItem: (itemId: string) => void
  isItemPinned: (itemId: string) => boolean
  archiveItem: (projectPath: string, itemId: string) => Promise<void>
  isItemArchived: (itemId: string) => boolean
  preparePendingItemSession: (projectPath: string, itemId: string) => void
  consumePendingItemSessionBinding: () => PendingItemSessionBinding | null
  bindSession: (summaryId: string, itemId: string) => Promise<void>
  unbindSession: (summaryId: string) => Promise<void>
  updateSessionStatus: (input: { projectPath: string; externalSessionId: string; titleSnapshot: string; activityAt: string; status: ThinWorkflowStatus }) => Promise<ThinSessionSummary | null>
  createSessionForItem: (projectPath: string, itemId: string) => Promise<ApiSession | null>
  searchFiles: (projectPath: string, query: string) => Promise<string[]>
  upsertLocalSummary: (summary: ThinSessionSummary) => void
  updateLocalSessionSnapshot: (externalSessionId: string, patch: { titleSnapshot?: string; activityAt?: string; updatedAt?: string }) => void
  reset: () => void
}

function mergeProjectState(projectStates: Record<string, ProjectItemState>, projectPath: string, next: Partial<ProjectItemState>) {
  return {
    ...projectStates,
    [projectPath]: {
      items: next.items ?? projectStates[projectPath]?.items ?? [],
      summaries: next.summaries ?? projectStates[projectPath]?.summaries ?? [],
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

function isThinUnauthorized(error: unknown): boolean {
  return error instanceof ThinAuthError && (error.status === 401 || error.code === 'UNAUTHORIZED')
}

export const useItemWorkspaceStore = create<ItemWorkspaceState>((set, get) => ({
  profile: null,
  profileBaseUrl: null,
  pinnedItemIds: readLocalArray(PINNED_ITEMS_STORAGE_KEY),
  archivedItemIds: readLocalArray(ARCHIVED_ITEMS_STORAGE_KEY),
  pendingItemSessionBinding: null,
  draftItem: null,
  allSummaries: [],
  selectedItemId: null,
  selectedItemProjectPath: null,
  projectStates: {},
  loadingProjects: {},
  loadedProjects: {},

  initialize: async () => {
    const baseUrl = serverStore.getActiveBaseUrl()
    if (get().profile && get().profileBaseUrl === baseUrl) return
    if (initializePromise) return initializePromise
    initializePromise = (async () => {
      try {
        const profile = await fetchThinServerProfileByBaseUrlQuery(baseUrl)
        if (!isActiveBaseUrl(baseUrl)) return
        if (!profile) {
          set({ profile: null, profileBaseUrl: null, allSummaries: [] })
          return
        }
        const allSummaries = await fetchAllThinSessionSummariesQuery().catch(() => [])
        if (!isActiveBaseUrl(baseUrl)) return
        set({ profile, profileBaseUrl: baseUrl, allSummaries })
      } catch (error) {
        if (!isActiveBaseUrl(baseUrl)) return
        if (!isThinUnauthorized(error)) throw error
        set({ profile: null, profileBaseUrl: null, allSummaries: [] })
      } finally {
        initializePromise = null
      }
    })()
    return initializePromise
  },

  loadProject: async (projectPath: string) => {
    const activeBaseUrl = serverStore.getActiveBaseUrl()
    const current = get().projectStates[projectPath]
    const hasFreshProfile = get().profileBaseUrl === activeBaseUrl
    if (hasFreshProfile && !get().loadingProjects[projectPath] && (get().loadedProjects[projectPath] || (current && !current.error && current.items !== undefined && current.summaries !== undefined))) {
      return
    }

    set((state) => ({ loadingProjects: { ...state.loadingProjects, [projectPath]: true } }))
    try {
      await get().initialize()
      if (!isActiveBaseUrl(activeBaseUrl)) {
        set((state) => ({ loadingProjects: { ...state.loadingProjects, [projectPath]: false } }))
        return
      }
      const activeProfile = get().profile
      if (!activeProfile) {
        set((state) => ({
          projectStates: mergeProjectState(state.projectStates, projectPath, { items: [], summaries: [], error: MISSING_PROFILE_ERROR }),
          loadingProjects: { ...state.loadingProjects, [projectPath]: false },
          loadedProjects: { ...state.loadedProjects, [projectPath]: false },
        }))
        return
      }
      const project = await findProjectByPath(projectPath)
      const legacyProjectId = project?.id ?? null

      const [items, summaries] = await Promise.all([
        listThinItems(projectPath, legacyProjectId),
        listThinSessionSummaries(projectPath, legacyProjectId),
      ])
      if (!isActiveBaseUrl(activeBaseUrl)) {
        set((state) => ({ loadingProjects: { ...state.loadingProjects, [projectPath]: false } }))
        return
      }
      set((state) => ({
        projectStates: mergeProjectState(state.projectStates, projectPath, { items, summaries, error: undefined }),
        allSummaries: mergeSummaries(state.allSummaries, summaries),
        loadingProjects: { ...state.loadingProjects, [projectPath]: false },
        loadedProjects: { ...state.loadedProjects, [projectPath]: true },
      }))
    } catch (error) {
      set((state) => ({
        projectStates: mergeProjectState(state.projectStates, projectPath, { error: error instanceof Error ? error.message : 'Failed to load items' }),
        loadingProjects: { ...state.loadingProjects, [projectPath]: false },
        loadedProjects: { ...state.loadedProjects, [projectPath]: false },
      }))
    }
  },

  ensureProjectSummaryForSessions: async (projectPath: string, sessions: ApiSession[]) => {
    const profile = get().profile
    if (!profile) {
      await get().initialize()
    }
    const activeProfile = get().profile
    if (!activeProfile) return
    const project = await findProjectByPath(projectPath)
    const legacyProjectId = project?.id ?? null
    const state = get().projectStates[projectPath]
    const existing = dedupeSummariesByExternalSessionId([
      ...(state?.summaries ?? []),
      ...get().allSummaries.filter((summary) => summary.projectPath === projectPath),
    ])

    const inputs = buildSummaryUpsertInputs({
      projectPath,
      sessions,
      existing,
    })

    if (inputs.length === 0) return

    const touched = await Promise.all(inputs.map((input) =>
      upsertThinSessionSummary({
        serverProfileId: activeProfile.id,
        projectPath: input.projectPath,
        legacyProjectId,
        externalSessionId: input.externalSessionId,
        itemId: input.itemId,
        variant: input.variant,
        titleSnapshot: input.titleSnapshot,
        statusSnapshot: input.statusSnapshot,
        activityAt: input.activityAt,
      })
    ))
    set((state) => ({
      projectStates: mergeProjectState(state.projectStates, projectPath, {
        summaries: mergeSummaries(state.projectStates[projectPath]?.summaries ?? [], touched),
      }),
      allSummaries: mergeSummaries(state.allSummaries, touched),
    }))
  },

  getProjectEntries: (projectPath: string, sessions: ApiSession[]) => {
    const state = get().projectStates[projectPath]
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

  getProjectItems: (projectPath: string) => get().projectStates[projectPath]?.items ?? [],
  getItemById: (projectPath: string, itemId: string) => {
    if (itemId === '__draft__') return get().draftItem
    return get().projectStates[projectPath]?.items.find((item) => item.id === itemId) ?? null
  },
  getProjectUnboundSummaries: (projectPath: string) => dedupeSummariesByExternalSessionId(
    (get().projectStates[projectPath]?.summaries ?? []).filter((summary: ThinSessionSummary) => !summary.itemId)
  ),
  getLinkedSummaries: (itemId: string) => dedupeSummariesByExternalSessionId(
    Object.values(get().projectStates)
      .flatMap((state) => state.summaries)
      .filter((summary: ThinSessionSummary) => summary.itemId === itemId)
  ),
  getSessionSummaryByExternalId: (externalSessionId: string) => dedupeSummariesByExternalSessionId(
    get().allSummaries.filter((summary) => summary.externalSessionId === externalSessionId)
  )[0] ?? null,
  getProjectError: (projectPath: string) => get().projectStates[projectPath]?.error,
  isProjectLoading: (projectPath: string) => !!get().loadingProjects[projectPath],

  selectItem: (projectPath: string, itemId: string | null) => set({ selectedItemId: itemId, selectedItemProjectPath: itemId ? projectPath : null }),

  setDraftItem: (item) => set({ draftItem: item }),

  createItem: async (projectPath: string, input) => {
    await get().initialize()
    const profile = get().profile
    if (!profile) return null
    const project = await findProjectByPath(projectPath)
    const created = await createThinItem({ serverProfileId: profile.id, projectPath, legacyProjectId: project?.id ?? null, title: input.title, type: input.type, description: input.description })
    set((state: ItemWorkspaceState) => ({ projectStates: mergeProjectState(state.projectStates, projectPath, { items: [created, ...(state.projectStates[projectPath]?.items ?? [])] }) }))
    set({ selectedItemId: created.id, selectedItemProjectPath: projectPath, draftItem: null })
    return created
  },

  updateItem: async (itemId: string, input) => {
    const projectPath = get().selectedItemProjectPath
    if (!projectPath) return null
    const updated = await updateThinItem(itemId, input)
    set((state: ItemWorkspaceState) => ({
      projectStates: mergeProjectState(state.projectStates, projectPath, {
        items: (state.projectStates[projectPath]?.items ?? []).map((item: ThinItem) => item.id === itemId ? updated : item),
      }),
    }))
    return updated
  },

  deleteItem: async (projectPath: string, itemId: string) => {
    await deleteThinItem(itemId)
    const pinnedItemIds = get().pinnedItemIds.filter((id) => id !== itemId)
    const archivedItemIds = get().archivedItemIds.filter((id) => id !== itemId)
    writeLocalArray(PINNED_ITEMS_STORAGE_KEY, pinnedItemIds)
    writeLocalArray(ARCHIVED_ITEMS_STORAGE_KEY, archivedItemIds)
    set((state: ItemWorkspaceState) => ({
      pinnedItemIds,
      archivedItemIds,
      projectStates: mergeProjectState(state.projectStates, projectPath, {
        items: (state.projectStates[projectPath]?.items ?? []).filter((item: ThinItem) => item.id !== itemId),
      }),
      selectedItemId: state.selectedItemId === itemId ? null : state.selectedItemId,
      selectedItemProjectPath: state.selectedItemId === itemId ? null : state.selectedItemProjectPath,
    }))
  },

  togglePinnedItem: (itemId: string) => {
    const current = get().pinnedItemIds
    const next = current.includes(itemId) ? current.filter((id) => id !== itemId) : [itemId, ...current]
    writeLocalArray(PINNED_ITEMS_STORAGE_KEY, next)
    set({ pinnedItemIds: next })
  },

  isItemPinned: (itemId: string) => get().pinnedItemIds.includes(itemId),

  archiveItem: async (_projectPath: string, itemId: string) => {
    const current = get().archivedItemIds
    if (current.includes(itemId)) return
    const next = [itemId, ...current]
    writeLocalArray(ARCHIVED_ITEMS_STORAGE_KEY, next)
    set((state) => ({
      archivedItemIds: next,
      draftItem: state.selectedItemId === itemId ? null : state.draftItem,
      selectedItemId: state.selectedItemId === itemId ? null : state.selectedItemId,
      selectedItemProjectPath: state.selectedItemId === itemId ? null : state.selectedItemProjectPath,
    }))
  },

  isItemArchived: (itemId: string) => get().archivedItemIds.includes(itemId),

  preparePendingItemSession: (projectPath: string, itemId: string) => {
    set({ pendingItemSessionBinding: { projectPath, itemId } })
  },

  consumePendingItemSessionBinding: () => {
    const binding = get().pendingItemSessionBinding
    set({ pendingItemSessionBinding: null })
    return binding
  },

  bindSession: async (summaryId: string, itemId: string) => {
    const updated = await bindThinSessionSummary(summaryId, itemId)
    await invalidateAllThinSessionSummariesQuery()
    const projectPath = updated.projectPath
    set((state: ItemWorkspaceState) => ({
      projectStates: mergeProjectState(state.projectStates, projectPath, {
        summaries: (state.projectStates[projectPath]?.summaries ?? []).map((summary: ThinSessionSummary) => summary.id === summaryId ? updated : summary),
      }),
      allSummaries: state.allSummaries.map((summary: ThinSessionSummary) => summary.id === summaryId ? updated : summary),
    }))
  },

  unbindSession: async (summaryId: string) => {
    const updated = await unbindThinSessionSummary(summaryId)
    await invalidateAllThinSessionSummariesQuery()
    const projectPath = updated.projectPath
    set((state: ItemWorkspaceState) => ({
      projectStates: mergeProjectState(state.projectStates, projectPath, {
        summaries: (state.projectStates[projectPath]?.summaries ?? []).map((summary: ThinSessionSummary) => summary.id === summaryId ? updated : summary),
      }),
      allSummaries: state.allSummaries.map((summary: ThinSessionSummary) => summary.id === summaryId ? updated : summary),
    }))
  },

  updateSessionStatus: async ({ projectPath, externalSessionId, titleSnapshot, activityAt, status }) => {
    await get().initialize()
    const profile = get().profile
    if (!profile) return null

    const project = await findProjectByPath(projectPath)
    const existing = (get().projectStates[projectPath]?.summaries ?? [])
      .find((summary) => summary.externalSessionId === externalSessionId)
      ?? get().allSummaries.find(
        (summary) => summary.projectPath === projectPath && summary.externalSessionId === externalSessionId
      )
      ?? null
    const updated = await upsertThinSessionSummary({
      serverProfileId: profile.id,
      projectPath,
      legacyProjectId: project?.id ?? null,
      externalSessionId,
      variant: existing?.variant,
      titleSnapshot,
      statusSnapshot: status,
      activityAt,
      ...(existing?.itemId !== undefined ? { itemId: existing.itemId } : {}),
    })
    await invalidateAllThinSessionSummariesQuery()

    set((state: ItemWorkspaceState) => {
      const currentSummaries = state.projectStates[projectPath]?.summaries ?? []
      const exists = currentSummaries.some((summary) => summary.id === updated.id)
      return {
        projectStates: mergeProjectState(state.projectStates, projectPath, {
          summaries: exists
            ? currentSummaries.map((summary: ThinSessionSummary) => summary.id === updated.id ? updated : summary)
            : [updated, ...currentSummaries],
        }),
        allSummaries: mergeSummaries(state.allSummaries, [updated]),
      }
    })

    return updated
  },

  createSessionForItem: async (projectPath: string, itemId: string) => {
    await get().initialize()
    const profile = get().profile
    if (!profile) return null
    const project = await findProjectByPath(projectPath)
    const session = await createBoundSession({ projectPath, legacyProjectId: project?.id ?? null, serverProfileId: profile.id, itemId, title: undefined })
    await get().loadProject(projectPath)
    return session
  },

  searchFiles: async (projectPath: string, query: string) => {
    if (!query.trim()) return []
    const project = await findProjectByPath(projectPath)
    if (!projectPath) return []
    if (!project?.worktree) {
      return searchFiles(query, {
        directory: projectPath,
        type: 'file',
        limit: 8,
      })
    }
    return searchFiles(query, {
      directory: project.worktree,
      type: 'file',
      limit: 8,
    })
  },

  upsertLocalSummary: (summary: ThinSessionSummary) => {
    const projectPath = summary.projectPath
    set((state: ItemWorkspaceState) => {
      const existingProjectSummaries = state.projectStates[projectPath]?.summaries ?? []
      return {
        projectStates: mergeProjectState(state.projectStates, projectPath, {
          summaries: mergeSummaries(
            existingProjectSummaries.filter((s) => s.externalSessionId !== summary.externalSessionId),
            [summary],
          ),
        }),
        allSummaries: mergeSummaries(
          state.allSummaries.filter((s) => s.externalSessionId !== summary.externalSessionId),
          [summary],
        ),
      }
    })
  },

  updateLocalSessionSnapshot: (externalSessionId: string, patch: { titleSnapshot?: string; activityAt?: string; updatedAt?: string }) => {
    set((state: ItemWorkspaceState) => {
      const updatedAll = state.allSummaries.map((summary) =>
        summary.externalSessionId === externalSessionId
          ? { ...summary, ...patch }
          : summary,
      )

      const updatedProjectStates: Record<string, ProjectItemState> = {}
      for (const [path, projectState] of Object.entries(state.projectStates)) {
        updatedProjectStates[path] = {
          ...projectState,
          summaries: projectState.summaries.map((summary) =>
            summary.externalSessionId === externalSessionId
              ? { ...summary, ...patch }
              : summary,
          ),
        }
      }

      return {
        allSummaries: updatedAll,
        projectStates: updatedProjectStates,
      }
    })
  },

  reset: () => {
    initializePromise = null
    set({
    profile: null,
    profileBaseUrl: null,
    pendingItemSessionBinding: null,
    draftItem: null,
    allSummaries: [],
    selectedItemId: null,
    selectedItemProjectPath: null,
    projectStates: {},
    loadingProjects: {},
    loadedProjects: {},
    })
  },
}))
