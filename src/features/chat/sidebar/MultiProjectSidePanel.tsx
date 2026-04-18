import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type DragEvent } from 'react'
import { createPortal } from 'react-dom'
import {
  deleteSession as deleteSessionApi,
  getGlobalSessions,
  getSessions,
  subscribeToConnectionState,
  subscribeToEvents,
  type ApiSession,
  type ConnectionInfo,
  type ThinItem,
  updateSession,
} from '../../../api'
import {
  CheckIcon,
  ChevronDownIcon,
  ClockIcon,
  ComposeIcon,
  CopyIcon,
  FilterIcon,
  FolderIcon,
  FolderOpenIcon,
  MoreHorizontalIcon,
  PencilIcon,
  PinIcon,
  PlusIcon,
  SidebarIcon,
  SpinnerIcon,
  TrashIcon,
} from '../../../components/Icons'
import { Button, Dialog, DropdownMenu } from '../../../components/ui'
import { ConfirmDialog } from '../../../components/ui/ConfirmDialog'
import { TauriWindowControls } from '../../../components/TauriWindowControls'
import { useDirectory, useSessionStats, fetchSessionQuery, fetchSessionStatusQuery } from '../../../hooks'
import { useMessageStore } from '../../../store'
import { activeSessionStore, useBusySessions } from '../../../store/activeSessionStore'
import { notificationStore, useNotifications } from '../../../store/notificationStore'
import { isSameDirectory, serverStorage, uiErrorHandler } from '../../../utils'
import type { SessionStatusMap } from '../../../types/api/session'
import { handleWindowTitlebarMouseDown, isTauri, isTauriMacOS } from '../../../utils/tauri'
import { getProjectIdByPathMap } from '../../../api/thinServer'
import { serverStore } from '../../../store/serverStore'
import { useItemWorkspaceStore } from '../../../store/itemWorkspaceStore'
import { SidePanel, SidebarFooter, type SidePanelProps } from './SidePanel'
import { ActionMenu, ActionMenuItem, SessionListItem } from './SessionListItem'
import type { ThinSessionSummary, ThinWorkflowStatus } from '../../../api/thinServer'

const THREAD_TYPE_FILTER_OPTIONS = [
  { value: 'all', label: '所有' },
  { value: 'item', label: '事项' },
  { value: 'session', label: '会话' },
] as const

const THREAD_STATUS_FILTER_OPTIONS: Array<{ value: 'all' | ThinWorkflowStatus; label: string }> = [
  { value: 'all', label: '所有' },
  { value: 'not_started', label: '未开始' },
  { value: 'in_progress', label: '进行中' },
  { value: 'completed', label: '完成' },
  { value: 'abandoned', label: '放弃' },
]

const THREAD_STATUS_VALUES: ThinWorkflowStatus[] = ['not_started', 'in_progress', 'completed', 'abandoned']
const DEFAULT_THREAD_STATUS_FILTERS: ThinWorkflowStatus[] = ['not_started', 'in_progress']

type ThreadTypeFilter = (typeof THREAD_TYPE_FILTER_OPTIONS)[number]['value']

const DEFAULT_VISIBLE_COUNT = 3
const DEFAULT_RECENT_VISIBLE_COUNT = 10
const RECENT_WINDOW_MS = 24 * 60 * 60 * 1000
const PINNED_SESSIONS_STORAGE_KEY = 'opencode-pinned-sessions'
const PINNED_ITEMS_STORAGE_KEY = 'opencode-pinned-items-sidebar'
const PROJECT_DRAG_TYPE = 'application/x-opencode-project-path'

function getItemTypeLabel(type: string): string {
  switch (type) {
    case 'bug':
      return 'Bug'
    case 'research':
      return '研究'
    case 'code_review':
      return '审查'
    case 'requirement':
    default:
      return '需求'
  }
}

function getProjectDragPath(dataTransfer: DataTransfer | null): string {
  if (!dataTransfer) return ''
  return dataTransfer.getData(PROJECT_DRAG_TYPE) || dataTransfer.getData('text/plain') || ''
}

function isInternalProjectDrag(dataTransfer: DataTransfer | null): boolean {
  if (!dataTransfer) return false
  const types = Array.from(dataTransfer.types || [])
  return types.includes(PROJECT_DRAG_TYPE)
}

function toTimestamp(value?: string | null): number {
  if (!value) return 0
  const parsed = Date.parse(value)
  return Number.isNaN(parsed) ? 0 : parsed
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

  return Array.from(byExternalId.values())
}

function hasSameStatusSelection(current: ThinWorkflowStatus[], target: ThinWorkflowStatus[]): boolean {
  return current.length === target.length && target.every((value) => current.includes(value))
}

interface ProjectNode {
  path: string
  name: string
  expanded?: boolean
}

interface PinnedSessionEntry {
  sessionId: string
  title: string
  directory: string
  projectPath: string
  updatedAt: number
  pinnedAt: number
}

interface PinnedItemEntry {
  itemId: string
  title: string
  projectPath: string
  updatedAt: string
  pinnedAt: number
}

interface SessionRenameState {
  projectPath: string
  session: ApiSession
}

type OpenMenuState =
  | { type: 'project'; projectPath: string; anchorRect: DOMRect }
  | { type: 'session'; projectPath: string; sessionId: string; source: 'pinned' | 'project' | 'recent'; anchorRect: DOMRect }
  | { type: 'item'; projectPath: string; itemId: string; anchorRect: DOMRect }
  | null

export function MultiProjectSidePanel(props: SidePanelProps) {
  const {
    onNewSession,
    onSelectSession,
    onSelectItem,
    onCloseMobile,
    selectedSessionId,
    selectedItemId,
    onAddProject,
    isMobile = false,
    isExpanded = true,
    onToggleSidebar,
    contextLimit = 200000,
    onOpenSettings,
    themeMode,
    onThemeChange,
    isWideMode,
    onToggleWideMode,
    modeTabs,
  } = props

  const {
    currentDirectory,
    savedDirectories,
    removeDirectory,
    reorderDirectory,
    setCurrentDirectory,
    setDirectoryExpanded,
  } = useDirectory()

  const showLabels = isExpanded || isMobile
  const tauriWindowMode = isTauri()
  const nativeMacTitlebar = isTauriMacOS()
  const customTauriWindowMode = tauriWindowMode && !nativeMacTitlebar

  const { messages } = useMessageStore()
  const stats = useSessionStats(contextLimit)
  const hasMessages = messages.length > 0
  const busySessions = useBusySessions()
  const notifications = useNotifications()

  const [pinnedSessions, setPinnedSessions] = useState<PinnedSessionEntry[]>(() => {
    const saved = serverStorage.getJSON<PinnedSessionEntry[]>(PINNED_SESSIONS_STORAGE_KEY)
    if (!saved || !Array.isArray(saved)) return []

    return saved.filter((item) => !!item?.sessionId && !!item?.directory)
  })
  const [pinnedItems, setPinnedItems] = useState<PinnedItemEntry[]>(() => {
    const saved = serverStorage.getJSON<PinnedItemEntry[]>(PINNED_ITEMS_STORAGE_KEY)
    if (!saved || !Array.isArray(saved)) return []
    return saved.filter((item) => !!item?.itemId && !!item?.projectPath)
  })

  const [connectionState, setConnectionState] = useState<ConnectionInfo | null>(null)

  const unreadNotificationIdsBySession = useMemo(() => {
    const map = new Map<string, string[]>()

    for (const notification of notifications) {
      if (notification.read) continue
      const existing = map.get(notification.sessionId)
      if (existing) {
        existing.push(notification.id)
      } else {
        map.set(notification.sessionId, [notification.id])
      }
    }

    return map
  }, [notifications])

  const projects = useMemo<ProjectNode[]>(() => {
    return savedDirectories.map((item) => ({
        path: item.path,
        name: item.name,
        expanded: item.expanded,
      }))
  }, [savedDirectories])

  const updateProjectExpanded = useCallback((projectPath: string, expanded: boolean) => {
    setExpandedProjects((prev) => {
      if (prev[projectPath] === expanded) return prev
      return { ...prev, [projectPath]: expanded }
    })
    setDirectoryExpanded(projectPath, expanded)
  }, [setDirectoryExpanded])

  const [recentSessions, setRecentSessions] = useState<ApiSession[]>([])
  const [recentLimit, setRecentLimit] = useState(DEFAULT_RECENT_VISIBLE_COUNT)
  const [recentHasMore, setRecentHasMore] = useState(false)
  const [recentLoading, setRecentLoading] = useState(false)
  const [expandedProjects, setExpandedProjects] = useState<Record<string, boolean>>({})
  const [visibleCountByProject, setVisibleCountByProject] = useState<Record<string, number>>({})
  const [sessionsByProject, setSessionsByProject] = useState<Record<string, ApiSession[]>>({})
  const [projectIdByPath, setProjectIdByPath] = useState<Record<string, string>>({})
  const [loadingByProject, setLoadingByProject] = useState<Record<string, boolean>>({})
  const [hasMoreByProject, setHasMoreByProject] = useState<Record<string, boolean>>({})
  const [loadedLimitByProject, setLoadedLimitByProject] = useState<Record<string, number>>({})
  const [openMenu, setOpenMenu] = useState<OpenMenuState>(null)
  const [isThreadFilterOpen, setIsThreadFilterOpen] = useState(false)
  const [threadTypeFilter, setThreadTypeFilter] = useState<ThreadTypeFilter>('all')
  const [threadStatusFilters, setThreadStatusFilters] = useState<ThinWorkflowStatus[]>(DEFAULT_THREAD_STATUS_FILTERS)
  // 移动端：记录最近被点击的项目，用于控制该项目操作按钮的显示
  const [tappedProjectPath, setTappedProjectPath] = useState<string | null>(null)
  const [draggingProjectPath, setDraggingProjectPath] = useState<string | null>(null)
  const [dropTargetProjectPath, setDropTargetProjectPath] = useState<string | null>(null)
  const [dropTargetIndex, setDropTargetIndex] = useState<number | null>(null)
  const draggingProjectPathRef = useRef<string | null>(null)
  const pointerDragSourceRef = useRef<string | null>(null)
  const pointerDragStartRef = useRef<{ x: number; y: number } | null>(null)
  const pointerDragActiveRef = useRef(false)
  const pointerDragSuppressClickRef = useRef(false)
  const [pointerDragActive, setPointerDragActive] = useState(false)
  const dropTargetIndexRef = useRef<number | null>(null)
  const pendingDropIndexRef = useRef<number | null>(null)
  const dropIndexRafRef = useRef<number | null>(null)
  const projectListRef = useRef<HTMLDivElement | null>(null)
  const projectItemRefs = useRef(new Map<string, HTMLDivElement>())
  const dragGhostContainerRef = useRef<HTMLDivElement | null>(null)
  const dragGhostNodeRef = useRef<HTMLElement | null>(null)
  const dragGhostPositionRef = useRef<{ x: number; y: number } | null>(null)
  const dragGhostRafRef = useRef<number | null>(null)
  const dragItemOffsetRef = useRef<{ x: number; y: number } | null>(null)
  const dragItemHeightRef = useRef(0)
  const dragItemWidthRef = useRef(0)
  const dragOriginalIndexRef = useRef<number | null>(null)
  const dragDropZonesRef = useRef<Array<{ path: string; mid: number }>>([])
  const prevProjectRectsRef = useRef<Map<string, DOMRect>>(new Map())
  const flipAnimationRef = useRef(new WeakMap<Element, Animation>())
  const pointerMoveHandlerRef = useRef<(event: PointerEvent) => void>(() => {})
  const pointerUpHandlerRef = useRef<(event?: PointerEvent) => void>(() => {})
  const [projectDeleteConfirm, setProjectDeleteConfirm] = useState<string | null>(null)
  const [sessionDeleteConfirm, setSessionDeleteConfirm] = useState<{ projectPath: string; session: ApiSession } | null>(null)
  const [itemDeleteConfirm, setItemDeleteConfirm] = useState<{ projectId: string; itemId: string; title: string } | null>(null)
  const [sessionRenameState, setSessionRenameState] = useState<SessionRenameState | null>(null)
  const [sessionRenameInput, setSessionRenameInput] = useState('')
  const [isRenamingSession, setIsRenamingSession] = useState(false)
  const menuRef = useRef<HTMLDivElement | null>(null)
  const threadFilterTriggerRef = useRef<HTMLButtonElement | null>(null)
  const threadFilterMenuRef = useRef<HTMLDivElement | null>(null)
  const renameInputRef = useRef<HTMLInputElement | null>(null)
  const recentRefreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const selectedSessionReloadKeyRef = useRef<string | null>(null)
  const prefetchedStatusDirectoriesRef = useRef<string[]>([])
  const inFlightStatusDirectoriesRef = useRef<string[]>([])
  // 移动端长按检测
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const longPressTouchStartRef = useRef<{ x: number; y: number } | null>(null)
  const longPressActivatedRef = useRef(false)

  const loadedSessionById = useMemo(() => {
    const map = new Map<string, ApiSession>()
    for (const list of Object.values(sessionsByProject)) {
      for (const session of list) {
        map.set(session.id, session)
      }
    }
    return map
  }, [sessionsByProject])

  const loadItemProject = useItemWorkspaceStore((state) => state.loadProject)
  const ensureProjectSummaryForSessions = useItemWorkspaceStore((state) => state.ensureProjectSummaryForSessions)
  const getProjectEntries = useItemWorkspaceStore((state) => state.getProjectEntries)
  const getProjectError = useItemWorkspaceStore((state) => state.getProjectError)
  const isProjectLoading = useItemWorkspaceStore((state) => state.isProjectLoading)
  const allSummaries = useItemWorkspaceStore((state) => state.allSummaries)
  useItemWorkspaceStore((state) => state.projectStates)
  const setDraftItem = useItemWorkspaceStore((state) => state.setDraftItem)
  const deleteItem = useItemWorkspaceStore((state) => state.deleteItem)
  const togglePinnedItem = useItemWorkspaceStore((state) => state.togglePinnedItem)
  const archiveItem = useItemWorkspaceStore((state) => state.archiveItem)

  useEffect(() => {
    let cancelled = false
    void getProjectIdByPathMap()
      .then((map) => {
        if (cancelled) return
        const next: Record<string, string> = {}
        for (const [path, projectId] of map.entries()) {
          next[path] = projectId
        }
        setProjectIdByPath(next)
      })
      .catch(() => {
        if (!cancelled) setProjectIdByPath({})
      })
    return () => {
      cancelled = true
    }
  }, [savedDirectories])

  const projectNameByPath = useMemo(() => {
    const map = new Map<string, string>()
    for (const project of projects) {
      map.set(project.path, project.name)
    }
    return map
  }, [projects])

  const projectByPath = useMemo(() => {
    const map = new Map<string, ProjectNode>()
    for (const project of projects) {
      map.set(project.path, project)
    }
    return map
  }, [projects])

  const projectsRef = useRef<ProjectNode[]>(projects)
  useEffect(() => {
    projectsRef.current = projects
  }, [projects])

  useEffect(() => {
    dropTargetIndexRef.current = dropTargetIndex
  }, [dropTargetIndex])

  const pinnedSessionIds = useMemo(() => {
    return new Set(pinnedSessions.map((item) => item.sessionId))
  }, [pinnedSessions])

  const pinnedSessionsForDisplay = useMemo(() => {
    return [...pinnedSessions]
      .sort((a, b) => b.pinnedAt - a.pinnedAt)
      .map((entry) => {
        const loaded = loadedSessionById.get(entry.sessionId)
        const title = loaded?.title || entry.title || 'Untitled Chat'
        const directory = loaded?.directory || entry.directory
        const updatedAt = loaded?.time.updated ?? loaded?.time.created ?? entry.updatedAt
        const projectPath = loaded?.directory || entry.projectPath || directory
        const projectName = projectNameByPath.get(projectPath) || projectPath

        return {
          ...entry,
          title,
          directory,
          updatedAt,
          projectPath,
          projectName,
          session: loaded,
        }
      })
  }, [pinnedSessions, loadedSessionById, projectNameByPath])

  const busySessionIds = useMemo(() => {
    return new Set(busySessions.map((entry) => entry.sessionId))
  }, [busySessions])

  const pinnedSectionMaxHeight = useMemo(() => {
    if (pinnedSessionsForDisplay.length === 0) return 0

    const rowHeight = 28
    const rowGap = 2
    return pinnedSessionsForDisplay.length * rowHeight + Math.max(0, pinnedSessionsForDisplay.length - 1) * rowGap
  }, [pinnedSessionsForDisplay.length])

  const getSessionUpdatedAt = useCallback((session: ApiSession): number => {
    return session.time.updated ?? session.time.created ?? 0
  }, [])

  const sortSessionsByRecent = useCallback((sessions: ApiSession[]) => {
    return [...sessions].sort((a, b) => getSessionUpdatedAt(b) - getSessionUpdatedAt(a))
  }, [getSessionUpdatedAt])

  const allSummaryByExternalId = useMemo(() => {
    return new Map(
      dedupeSummariesByExternalSessionId(allSummaries).map((summary) => [summary.externalSessionId, summary])
    )
  }, [allSummaries])

  const threadStatusFilterSet = useMemo(() => new Set(threadStatusFilters), [threadStatusFilters])
  const isThreadStatusAllSelected = hasSameStatusSelection(threadStatusFilters, THREAD_STATUS_VALUES)
  const matchesThreadFilters = useCallback((entry: { kind: 'item' | 'session'; status: ThinWorkflowStatus }) => {
    if (threadTypeFilter !== 'all' && entry.kind !== threadTypeFilter) return false
    return threadStatusFilterSet.has(entry.status)
  }, [threadStatusFilterSet, threadTypeFilter])

  const handleThreadStatusToggle = useCallback((value: 'all' | ThinWorkflowStatus) => {
    if (value === 'all') {
      setThreadStatusFilters(THREAD_STATUS_VALUES)
      return
    }

    setThreadStatusFilters((prev) => {
      const exists = prev.includes(value)
      if (exists) {
        if (prev.length === 1) return prev
        return prev.filter((item) => item !== value)
      }
      return [...prev, value]
    })
  }, [])

  const loadRecentSessions = useCallback(async (limit: number) => {
    setRecentLoading(true)

    try {
      const windowStart = Date.now() - RECENT_WINDOW_MS
      const data = await getGlobalSessions({
        roots: true,
        start: windowStart,
        limit: limit + 1,
      })

      const withinWindow = data
        .filter((session) => getSessionUpdatedAt(session) >= windowStart)
        .sort((a, b) => getSessionUpdatedAt(b) - getSessionUpdatedAt(a))

      setRecentSessions(withinWindow.slice(0, limit))
      setRecentHasMore(withinWindow.length > limit)
    } catch {
      setRecentSessions([])
      setRecentHasMore(false)
    } finally {
      setRecentLoading(false)
    }
  }, [getSessionUpdatedAt])

  const scheduleRecentRefresh = useCallback((delay = 120) => {
    if (recentRefreshTimerRef.current) {
      clearTimeout(recentRefreshTimerRef.current)
      recentRefreshTimerRef.current = null
    }

    recentRefreshTimerRef.current = setTimeout(() => {
      recentRefreshTimerRef.current = null
      void loadRecentSessions(recentLimit)
    }, delay)
  }, [loadRecentSessions, recentLimit])

  const expandedProjectPaths = useMemo(() => {
    return projects.filter((project) => expandedProjects[project.path]).map((project) => project.path)
  }, [projects, expandedProjects])

  useEffect(() => {
    return subscribeToConnectionState(setConnectionState)
  }, [])

  useEffect(() => {
    serverStorage.setJSON(PINNED_SESSIONS_STORAGE_KEY, pinnedSessions)
  }, [pinnedSessions])

  useEffect(() => {
    serverStorage.setJSON(PINNED_ITEMS_STORAGE_KEY, pinnedItems)
  }, [pinnedItems])

  useEffect(() => {
    return serverStore.onServerChange(() => {
      prefetchedStatusDirectoriesRef.current = []
      inFlightStatusDirectoriesRef.current = []
      const saved = serverStorage.getJSON<PinnedSessionEntry[]>(PINNED_SESSIONS_STORAGE_KEY)
      setPinnedSessions(Array.isArray(saved) ? saved.filter((item) => !!item?.sessionId && !!item?.directory) : [])

      setRecentLimit(DEFAULT_RECENT_VISIBLE_COUNT)
      void loadRecentSessions(DEFAULT_RECENT_VISIBLE_COUNT)
    })
  }, [loadRecentSessions])

  useEffect(() => {
    void loadRecentSessions(recentLimit)
  }, [loadRecentSessions, recentLimit])

  useEffect(() => {
    return () => {
      if (recentRefreshTimerRef.current) {
        clearTimeout(recentRefreshTimerRef.current)
        recentRefreshTimerRef.current = null
      }
    }
  }, [])

  useEffect(() => {
    if (recentSessions.length === 0 && pinnedSessions.length === 0) return

    const directories: string[] = []
    const addDirectory = (directory?: string) => {
      if (!directory) return
      if (directories.some((existing) => isSameDirectory(existing, directory))) return
      directories.push(directory)
    }

    recentSessions.forEach((session) => addDirectory(session.directory))
    pinnedSessions.forEach((entry) => addDirectory(entry.directory))

    const targetDirectories = directories.filter((directory) => {
      return !expandedProjectPaths.some((expanded) => isSameDirectory(expanded, directory))
    })

    if (targetDirectories.length === 0) return

    const directoriesToFetch = targetDirectories.filter((directory) => {
      const alreadyFetched = prefetchedStatusDirectoriesRef.current.some((existing) => isSameDirectory(existing, directory))
      if (alreadyFetched) return false

      const inFlight = inFlightStatusDirectoriesRef.current.some((existing) => isSameDirectory(existing, directory))
      return !inFlight
    })

    if (directoriesToFetch.length === 0) return

    let cancelled = false

    inFlightStatusDirectoriesRef.current = [
      ...inFlightStatusDirectoriesRef.current,
      ...directoriesToFetch,
    ]

    Promise.all(
      directoriesToFetch.map((directory) => fetchSessionStatusQuery(directory).catch(() => ({} as SessionStatusMap)))
    ).then((maps) => {
      inFlightStatusDirectoriesRef.current = inFlightStatusDirectoriesRef.current.filter(
        (existing) => !directoriesToFetch.some((directory) => isSameDirectory(directory, existing))
      )

      if (cancelled) return

      prefetchedStatusDirectoriesRef.current = [
        ...prefetchedStatusDirectoriesRef.current,
        ...directoriesToFetch.filter(
          (directory) => !prefetchedStatusDirectoriesRef.current.some((existing) => isSameDirectory(existing, directory))
        ),
      ]

      const merged = maps.reduce((acc, map) => ({ ...acc, ...map }), {} as SessionStatusMap)
      activeSessionStore.mergeStatusMap(merged)
    })

    return () => {
      cancelled = true
    }
  }, [recentSessions, pinnedSessions, expandedProjectPaths])

  useEffect(() => {
    if (!sessionRenameState || !renameInputRef.current) return
    renameInputRef.current.focus()
    renameInputRef.current.select()
  }, [sessionRenameState])

  const syncPinnedEntriesWithSessions = useCallback((projectPath: string, sessions: ApiSession[]) => {
    if (sessions.length === 0) return

    setPinnedSessions((prev) => {
      let changed = false

      const next = prev.map((entry) => {
        const matched = sessions.find((session) => session.id === entry.sessionId)
        if (!matched) return entry

        const nextTitle = matched.title || entry.title
        const nextDirectory = matched.directory || entry.directory
        const nextUpdatedAt = matched.time.updated ?? matched.time.created ?? entry.updatedAt

        if (
          entry.title === nextTitle &&
          entry.directory === nextDirectory &&
          entry.projectPath === projectPath &&
          entry.updatedAt === nextUpdatedAt
        ) {
          return entry
        }

        changed = true
        return {
          ...entry,
          title: nextTitle,
          directory: nextDirectory,
          projectPath,
          updatedAt: nextUpdatedAt,
        }
      })

      return changed ? next : prev
    })
  }, [])

  useEffect(() => {
    const nextExpanded: Record<string, boolean> = {}
    const expandedToPersist: string[] = []

    for (let i = 0; i < projects.length; i += 1) {
      const project = projects[i]
      const existing = expandedProjects[project.path]

      if (existing !== undefined) {
        nextExpanded[project.path] = existing
        continue
      }

      if (project.expanded !== undefined) {
        nextExpanded[project.path] = project.expanded
        continue
      }

      if (currentDirectory) {
        nextExpanded[project.path] = isSameDirectory(currentDirectory, project.path)
      } else {
        nextExpanded[project.path] = i === 0
      }

      if (nextExpanded[project.path]) {
        expandedToPersist.push(project.path)
      }
    }

    if (projects.length > 0) {
      const nextKeys = Object.keys(nextExpanded)
      const currentKeys = Object.keys(expandedProjects)
      const isSame = nextKeys.length === currentKeys.length
        && nextKeys.every((key) => expandedProjects[key] === nextExpanded[key])

      if (!isSame) {
        setExpandedProjects(nextExpanded)
      }
    }

    if (expandedToPersist.length > 0) {
      expandedToPersist.forEach((path) => setDirectoryExpanded(path, true))
    }

    setVisibleCountByProject((prev) => {
      const next: Record<string, number> = {}
      for (const project of projects) {
        next[project.path] = prev[project.path] ?? DEFAULT_VISIBLE_COUNT
      }
      return next
    })
  }, [projects, currentDirectory, expandedProjects, setDirectoryExpanded])

  const lastAutoExpandedProjectRef = useRef<string | null>(null)
  useEffect(() => {
    if (!currentDirectory) return

    const matched = projects.find((project) => isSameDirectory(project.path, currentDirectory))
    if (!matched) return

    // Auto-expand when a project becomes current, but don't immediately re-expand
    // if the user manually collapses the current project (projects may re-render).
    if (lastAutoExpandedProjectRef.current && isSameDirectory(lastAutoExpandedProjectRef.current, matched.path)) {
      return
    }

    lastAutoExpandedProjectRef.current = matched.path
    updateProjectExpanded(matched.path, true)
  }, [currentDirectory, projects, updateProjectExpanded])

  const loadProjectSessions = useCallback(async (projectPath: string, limit: number) => {
    setLoadingByProject((prev) => ({ ...prev, [projectPath]: true }))

    try {
      const data = await getSessions({
        roots: true,
        directory: projectPath,
        limit,
      })

      setSessionsByProject((prev) => ({ ...prev, [projectPath]: sortSessionsByRecent(data) }))
      setHasMoreByProject((prev) => ({ ...prev, [projectPath]: data.length >= limit }))
      setLoadedLimitByProject((prev) => ({ ...prev, [projectPath]: limit }))
      syncPinnedEntriesWithSessions(projectPath, data)
      const projectId = data[0]?.projectID
      if (projectId) {
        void loadItemProject(projectId)
        void ensureProjectSummaryForSessions(projectId, data)
      }
    } catch {
      setSessionsByProject((prev) => ({ ...prev, [projectPath]: [] }))
      setHasMoreByProject((prev) => ({ ...prev, [projectPath]: false }))
      setLoadedLimitByProject((prev) => ({ ...prev, [projectPath]: limit }))
    } finally {
      setLoadingByProject((prev) => ({ ...prev, [projectPath]: false }))
    }
  }, [ensureProjectSummaryForSessions, loadItemProject, sortSessionsByRecent, syncPinnedEntriesWithSessions])

  useEffect(() => {
    for (const project of projects) {
      if (!expandedProjects[project.path]) continue

      const mappedProjectId = projectIdByPath[project.path]
      if (mappedProjectId) {
        void loadItemProject(mappedProjectId)
      }

      const targetLimit = visibleCountByProject[project.path] ?? DEFAULT_VISIBLE_COUNT
      const loadedLimit = loadedLimitByProject[project.path] ?? 0

      if (loadedLimit >= targetLimit) continue
      if (loadingByProject[project.path]) continue

      void loadProjectSessions(project.path, targetLimit)
    }
  }, [
    projects,
    expandedProjects,
    projectIdByPath,
    visibleCountByProject,
    loadedLimitByProject,
    loadingByProject,
    loadItemProject,
    loadProjectSessions,
  ])

  useEffect(() => {
    if (!openMenu) return

    const handleOutside = (event: MouseEvent | TouchEvent) => {
      const target = event.target as Node
      if (menuRef.current && menuRef.current.contains(target)) {
        return
      }
      setOpenMenu(null)
    }

    document.addEventListener('mousedown', handleOutside)
    document.addEventListener('touchstart', handleOutside)
    return () => {
      document.removeEventListener('mousedown', handleOutside)
      document.removeEventListener('touchstart', handleOutside)
    }
  }, [openMenu])

  useEffect(() => {
    if (!isThreadFilterOpen) return

    const handleOutside = (event: MouseEvent | TouchEvent) => {
      const target = event.target as Node
      if (threadFilterMenuRef.current?.contains(target)) return
      if (threadFilterTriggerRef.current?.contains(target)) return
      setIsThreadFilterOpen(false)
    }

    document.addEventListener('mousedown', handleOutside)
    document.addEventListener('touchstart', handleOutside)
    return () => {
      document.removeEventListener('mousedown', handleOutside)
      document.removeEventListener('touchstart', handleOutside)
    }
  }, [isThreadFilterOpen])

  useEffect(() => {
    const unsubscribe = subscribeToEvents({
      onSessionCreated: (session) => {
        if (session.parentID) return

        const sessionDirectory = session.directory
        if (!sessionDirectory) return

        setSessionsByProject((prev) => {
          const matchPath = Object.keys(prev).find((path) => isSameDirectory(path, sessionDirectory))
          if (!matchPath) return prev

          const currentList = prev[matchPath] ?? []
          if (currentList.some((item) => item.id === session.id)) return prev

          return {
            ...prev,
            [matchPath]: sortSessionsByRecent([session, ...currentList]),
          }
        })

        setPinnedSessions((prev) => {
          let changed = false
          const next = prev.map((entry) => {
            if (entry.sessionId !== session.id) return entry
            changed = true
            return {
              ...entry,
              title: session.title || entry.title,
              directory: session.directory || entry.directory,
              projectPath: session.directory || entry.projectPath,
              updatedAt: session.time.updated ?? session.time.created ?? entry.updatedAt,
            }
          })
          return changed ? next : prev
        })

        scheduleRecentRefresh()
      },
      onSessionUpdated: (session) => {
        const sessionDirectory = session.directory
        if (!sessionDirectory) return

        setSessionsByProject((prev) => {
          const matchPath = Object.keys(prev).find((path) => isSameDirectory(path, sessionDirectory))
          if (!matchPath) return prev

          const currentList = prev[matchPath] ?? []
          let changed = false
          const nextList = currentList.map((item) => {
            if (item.id !== session.id) return item
            changed = true
            return { ...item, ...session }
          })

          if (!changed) return prev
          return {
            ...prev,
            [matchPath]: sortSessionsByRecent(nextList),
          }
        })

        setPinnedSessions((prev) => {
          let changed = false
          const next = prev.map((entry) => {
            if (entry.sessionId !== session.id) return entry
            changed = true
            return {
              ...entry,
              title: session.title || entry.title,
              directory: session.directory || entry.directory,
              projectPath: session.directory || entry.projectPath,
              updatedAt: session.time.updated ?? session.time.created ?? entry.updatedAt,
            }
          })
          return changed ? next : prev
        })

        scheduleRecentRefresh()
      },
      onSessionDeleted: (sessionId) => {
        setSessionsByProject((prev) => {
          let changed = false
          const next: Record<string, ApiSession[]> = {}

          for (const [projectPath, list] of Object.entries(prev)) {
            const filtered = list.filter((item) => item.id !== sessionId)
            if (filtered.length !== list.length) {
              changed = true
            }
            next[projectPath] = filtered
          }

          return changed ? next : prev
        })

        setPinnedSessions((prev) => prev.filter((entry) => entry.sessionId !== sessionId))
        scheduleRecentRefresh()
      },
      onReconnected: () => {
        for (const project of projects) {
          if (!expandedProjects[project.path]) continue

          const currentLimit = Math.max(
            loadedLimitByProject[project.path] ?? 0,
            visibleCountByProject[project.path] ?? DEFAULT_VISIBLE_COUNT
          )
          void loadProjectSessions(project.path, currentLimit)
        }

        scheduleRecentRefresh(0)
      },
    })

    return unsubscribe
  }, [projects, expandedProjects, loadedLimitByProject, visibleCountByProject, loadProjectSessions, scheduleRecentRefresh, sortSessionsByRecent])

  useEffect(() => {
    if (!selectedSessionId || !currentDirectory) return

    const projectPath = projects.find((project) => isSameDirectory(project.path, currentDirectory))?.path
    if (!projectPath) return

    const currentList = sessionsByProject[projectPath] ?? []
    if (currentList.some((session) => session.id === selectedSessionId)) {
      selectedSessionReloadKeyRef.current = null
      return
    }

    if (loadingByProject[projectPath]) return

    const currentLimit = Math.max(
      loadedLimitByProject[projectPath] ?? 0,
      visibleCountByProject[projectPath] ?? DEFAULT_VISIBLE_COUNT
    )

    const reloadKey = `${projectPath}:${selectedSessionId}:${currentLimit}`
    if (selectedSessionReloadKeyRef.current === reloadKey) return

    selectedSessionReloadKeyRef.current = reloadKey
    void loadProjectSessions(projectPath, currentLimit)
  }, [
    selectedSessionId,
    currentDirectory,
    projects,
    sessionsByProject,
    loadingByProject,
    loadedLimitByProject,
    visibleCountByProject,
    loadProjectSessions,
  ])

  const reloadProjectSessions = useCallback((projectPath: string) => {
    const currentLimit = Math.max(
      loadedLimitByProject[projectPath] ?? 0,
      visibleCountByProject[projectPath] ?? DEFAULT_VISIBLE_COUNT
    )
    void loadProjectSessions(projectPath, currentLimit)
  }, [loadedLimitByProject, visibleCountByProject, loadProjectSessions])

  const handleProjectRowClick = useCallback((projectPath: string) => {
    if (pointerDragSuppressClickRef.current) {
      pointerDragSuppressClickRef.current = false
      return
    }
    setOpenMenu(null)
    setTappedProjectPath(projectPath)
    const nextExpanded = !(expandedProjects[projectPath] ?? false)
    updateProjectExpanded(projectPath, nextExpanded)
  }, [expandedProjects, updateProjectExpanded])

  const handleCreateSessionInProject = useCallback((projectPath: string) => {
    setOpenMenu(null)
    updateProjectExpanded(projectPath, true)

    onNewSession(projectPath)
    if (window.innerWidth < 768 && onCloseMobile) {
      onCloseMobile()
    }
  }, [onCloseMobile, onNewSession, updateProjectExpanded])

  const handleCreateItemInProject = useCallback(async (projectPath: string) => {
    const projectId = projectIdByPath[projectPath]
    if (!projectId) return
    setOpenMenu(null)
    updateProjectExpanded(projectPath, true)
    setCurrentDirectory(projectPath)
    const draftItem: ThinItem = {
      id: '__draft__',
      projectId,
      serverProfileId: '',
      title: '',
      type: 'requirement',
      status: 'not_started',
      description: '',
      activityAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }
    setDraftItem(draftItem)
    onSelectItem?.(projectId, draftItem)
  }, [onSelectItem, projectIdByPath, setCurrentDirectory, setDraftItem, updateProjectExpanded])

  const handleOpenProjectFolder = useCallback(async (projectPath: string) => {
    try {
      if (!tauriWindowMode) return

      const { invoke } = await import('@tauri-apps/api/core')
      await invoke('open_path', {
        path: projectPath,
        appName: null,
      })
    } catch (error) {
      uiErrorHandler('open project folder', error)
    } finally {
      setOpenMenu(null)
    }
  }, [tauriWindowMode])

  const handleCopyProjectPath = useCallback(async (projectPath: string) => {
    if (!projectPath) {
      setOpenMenu(null)
      return
    }

    try {
      await navigator.clipboard.writeText(projectPath)
    } catch {
      // clipboard unavailable in some environments
    } finally {
      setOpenMenu(null)
    }
  }, [])

  const handleToggleProjectMenu = useCallback((projectPath: string, anchorRect: DOMRect) => {
    setOpenMenu((prev) => {
      if (prev?.type === 'project' && prev.projectPath === projectPath) {
        return null
      }
      return { type: 'project', projectPath, anchorRect }
    })
  }, [])

  const handleRequestRemoveProject = useCallback((projectPath: string) => {
    setOpenMenu(null)
    setProjectDeleteConfirm(projectPath)
  }, [])

  const handleRemoveProject = useCallback((projectPath: string) => {
    const nextProject = projects.find((project) => !isSameDirectory(project.path, projectPath))

    removeDirectory(projectPath)
    setPinnedSessions((prev) => prev.filter((entry) => !isSameDirectory(entry.projectPath, projectPath)))
    if (currentDirectory && isSameDirectory(currentDirectory, projectPath) && nextProject) {
      setCurrentDirectory(nextProject.path)
    }

    setOpenMenu(null)
    setProjectDeleteConfirm(null)
  }, [projects, currentDirectory, removeDirectory, setCurrentDirectory])

  const handleToggleSessionMenu = useCallback((projectPath: string, sessionId: string, source: 'pinned' | 'project' | 'recent', anchorRect: DOMRect) => {
    setOpenMenu((prev) => {
      if (prev?.type === 'session' && prev.projectPath === projectPath && prev.sessionId === sessionId && prev.source === source) {
        return null
      }
      return { type: 'session', projectPath, sessionId, source, anchorRect }
    })
  }, [])

  const handleToggleSessionPin = useCallback((projectPath: string, session: ApiSession) => {
    setPinnedSessions((prev) => {
      const existingIndex = prev.findIndex((entry) => entry.sessionId === session.id)
      if (existingIndex >= 0) {
        const next = [...prev]
        next.splice(existingIndex, 1)
        return next
      }

      const updatedAt = session.time.updated ?? session.time.created ?? Date.now()
      return [
        {
          sessionId: session.id,
          title: session.title || 'Untitled Chat',
          directory: session.directory || projectPath,
          projectPath,
          updatedAt,
          pinnedAt: Date.now(),
        },
        ...prev,
      ]
    })
  }, [])

  const handleToggleItemPin = useCallback((projectPath: string, item: { id: string; title: string; updatedAt: string }) => {
    togglePinnedItem(item.id)
    setPinnedItems((prev) => {
      const existing = prev.find((entry) => entry.itemId === item.id)
      if (existing) return prev.filter((entry) => entry.itemId !== item.id)
      return [{ itemId: item.id, title: item.title, projectPath, updatedAt: item.updatedAt, pinnedAt: Date.now() }, ...prev]
    })
  }, [togglePinnedItem])

  const handleCopyItemProjectPath = useCallback(async (projectPath: string) => {
    try {
      await navigator.clipboard.writeText(projectPath)
    } catch {
      // ignore
    } finally {
      setOpenMenu(null)
    }
  }, [])

  const applySessionRename = useCallback(async (projectPath: string, session: ApiSession, nextTitle: string) => {
    const trimmed = nextTitle.trim()
    const updated = await updateSession(session.id, { title: trimmed }, projectPath)

    setSessionsByProject((prev) => ({
      ...prev,
      [projectPath]: (prev[projectPath] ?? []).map((item) =>
        item.id === session.id ? { ...item, ...updated, title: updated.title ?? trimmed } : item
      ),
    }))
    setPinnedSessions((prev) => prev.map((entry) => {
      if (entry.sessionId !== session.id) return entry
      return {
        ...entry,
        title: updated.title ?? trimmed,
        updatedAt: updated.time?.updated ?? updated.time?.created ?? entry.updatedAt,
        projectPath,
      }
    }))
    setRecentSessions((prev) => prev.map((item) => (
      item.id === session.id
        ? { ...item, ...updated, title: updated.title ?? trimmed }
        : item
    )))

    scheduleRecentRefresh()
  }, [scheduleRecentRefresh])

  const handleRequestRenameSession = useCallback((projectPath: string, session: ApiSession) => {
    setOpenMenu(null)
    setSessionRenameState({ projectPath, session })
    setSessionRenameInput(session.title || '')
  }, [])

  const handleCloseRenameSessionDialog = useCallback(() => {
    if (isRenamingSession) return
    setSessionRenameState(null)
    setSessionRenameInput('')
  }, [isRenamingSession])

  const handleConfirmRenameSession = useCallback(async () => {
    if (!sessionRenameState || isRenamingSession) return

    const trimmed = sessionRenameInput.trim()
    const currentTitle = sessionRenameState.session.title || ''
    if (!trimmed || trimmed === currentTitle) {
      handleCloseRenameSessionDialog()
      return
    }

    setIsRenamingSession(true)
    try {
      await applySessionRename(sessionRenameState.projectPath, sessionRenameState.session, trimmed)
      setSessionRenameState(null)
      setSessionRenameInput('')
    } catch (e) {
      uiErrorHandler('rename session', e)
    } finally {
      setIsRenamingSession(false)
    }
  }, [applySessionRename, handleCloseRenameSessionDialog, isRenamingSession, sessionRenameInput, sessionRenameState])

  const handleArchiveSession = useCallback(async (projectPath: string, session: ApiSession) => {
    try {
      await updateSession(session.id, { time: { archived: Date.now() } }, projectPath)
      setSessionsByProject((prev) => ({
        ...prev,
        [projectPath]: (prev[projectPath] ?? []).filter((item) => item.id !== session.id),
      }))
      setPinnedSessions((prev) => prev.filter((entry) => entry.sessionId !== session.id))
      setRecentSessions((prev) => prev.filter((item) => item.id !== session.id))
      reloadProjectSessions(projectPath)
      scheduleRecentRefresh()
    } catch {
      // ignore archive errors, keep list state untouched
    } finally {
      setOpenMenu(null)
    }
  }, [reloadProjectSessions, scheduleRecentRefresh])

  const handleRequestDeleteSession = useCallback((projectPath: string, session: ApiSession) => {
    setOpenMenu(null)
    setSessionDeleteConfirm({ projectPath, session })
  }, [])

  const handleDeleteSession = useCallback(async (projectPath: string, session: ApiSession) => {
    try {
      await deleteSessionApi(session.id, projectPath)
      setSessionsByProject((prev) => ({
        ...prev,
        [projectPath]: (prev[projectPath] ?? []).filter((item) => item.id !== session.id),
      }))
      setPinnedSessions((prev) => prev.filter((entry) => entry.sessionId !== session.id))
      setRecentSessions((prev) => prev.filter((item) => item.id !== session.id))
      if (selectedSessionId === session.id) {
        onNewSession()
      }
      scheduleRecentRefresh()
    } catch {
      // ignore delete errors, keep list state untouched
    } finally {
      setSessionDeleteConfirm(null)
    }
  }, [onNewSession, scheduleRecentRefresh, selectedSessionId])

  const handleCopySessionDirectory = useCallback(async (session: ApiSession) => {
    const targetDirectory = session.directory || ''
    if (!targetDirectory) {
      setOpenMenu(null)
      return
    }

    try {
      await navigator.clipboard.writeText(targetDirectory)
    } catch {
      // clipboard unavailable in some environments
    } finally {
      setOpenMenu(null)
    }
  }, [])

  const handleProjectDragStart = useCallback((projectPath: string, event: DragEvent<HTMLDivElement>) => {
    if (isMobile || tauriWindowMode) return

    draggingProjectPathRef.current = projectPath
    setDraggingProjectPath(projectPath)
    event.dataTransfer.effectAllowed = 'move'
    event.dataTransfer.setData(PROJECT_DRAG_TYPE, projectPath)
    event.dataTransfer.setData('text/plain', projectPath)
  }, [isMobile, tauriWindowMode])

  const handleProjectDragOver = useCallback((projectPath: string, event: DragEvent<HTMLDivElement>) => {
    if (isMobile || tauriWindowMode) return

    const dataTransfer = event.dataTransfer
    const activeDragPath = draggingProjectPathRef.current || draggingProjectPath
    const isInternalDrag = Boolean(activeDragPath) || isInternalProjectDrag(dataTransfer)
    if (!isInternalDrag) return

    const sourcePath = getProjectDragPath(dataTransfer) || activeDragPath
    if (!sourcePath || isSameDirectory(sourcePath, projectPath)) return

    event.preventDefault()
    event.dataTransfer.dropEffect = 'move'
    setDropTargetProjectPath(projectPath)
  }, [draggingProjectPath, isMobile, tauriWindowMode])

  const handleProjectDragLeave = useCallback((projectPath: string) => {
    setDropTargetProjectPath((prev) => (prev === projectPath ? null : prev))
  }, [])

  const handleProjectListDragOverCapture = useCallback((event: DragEvent<HTMLDivElement>) => {
    if (isMobile || !draggingProjectPathRef.current) return

    const target = event.target as Element | null
    const row = target?.closest?.('[data-project-path]') as HTMLElement | null
    const targetPath = row?.dataset?.projectPath || ''
    if (!targetPath || isSameDirectory(targetPath, draggingProjectPathRef.current)) {
      return
    }

    event.preventDefault()
    event.dataTransfer.dropEffect = 'move'
    setDropTargetProjectPath(targetPath)
  }, [isMobile])

  const handleProjectListDropCapture = useCallback((event: DragEvent<HTMLDivElement>) => {
    if (isMobile || !draggingProjectPathRef.current) return

    const target = event.target as Element | null
    const row = target?.closest?.('[data-project-path]') as HTMLElement | null
    const targetPath = row?.dataset?.projectPath || ''
    if (!targetPath || isSameDirectory(targetPath, draggingProjectPathRef.current)) {
      return
    }

    event.preventDefault()
    reorderDirectory(draggingProjectPathRef.current, targetPath)
    setDropTargetProjectPath(null)
    setDraggingProjectPath(null)
    draggingProjectPathRef.current = null
  }, [isMobile, reorderDirectory])

  const handleProjectDrop = useCallback((projectPath: string, event: DragEvent<HTMLDivElement>) => {
    if (isMobile || tauriWindowMode) return

    const dataTransfer = event.dataTransfer
    const activeDragPath = draggingProjectPathRef.current || draggingProjectPath
    const isInternalDrag = Boolean(activeDragPath) || isInternalProjectDrag(dataTransfer)
    if (!isInternalDrag) return
    const sourcePath = getProjectDragPath(dataTransfer) || activeDragPath
    if (!sourcePath || isSameDirectory(sourcePath, projectPath)) return

    event.preventDefault()
    reorderDirectory(sourcePath, projectPath)
    setDropTargetProjectPath(null)
    setDraggingProjectPath(null)
    draggingProjectPathRef.current = null
  }, [draggingProjectPath, isMobile, reorderDirectory, tauriWindowMode])

  const handleProjectDragEnd = useCallback(() => {
    setDraggingProjectPath(null)
    setDropTargetProjectPath(null)
    draggingProjectPathRef.current = null
  }, [])

  const setProjectItemRef = useCallback((projectPath: string, node: HTMLDivElement | null) => {
    const map = projectItemRefs.current
    if (node) {
      map.set(projectPath, node)
    } else {
      map.delete(projectPath)
    }
  }, [])

  const getBaseProjectPaths = useCallback((sourcePath: string | null) => {
    const paths = projectsRef.current.map((project) => project.path)
    if (!sourcePath) return paths
    return paths.filter((path) => !isSameDirectory(path, sourcePath))
  }, [])

  const updateDragGhostPosition = useCallback((clientX: number, clientY: number) => {
    const offset = dragItemOffsetRef.current
    if (!offset || !dragGhostContainerRef.current) return

    dragGhostPositionRef.current = {
      x: clientX - offset.x,
      y: clientY - offset.y,
    }

    if (dragGhostRafRef.current !== null) return
    dragGhostRafRef.current = window.requestAnimationFrame(() => {
      dragGhostRafRef.current = null
      const position = dragGhostPositionRef.current
      if (!position || !dragGhostContainerRef.current) return
      dragGhostContainerRef.current.style.transform = `translate3d(${position.x}px, ${position.y}px, 0)`
    })
  }, [])

  const mountDragGhost = useCallback(() => {
    if (!dragGhostContainerRef.current || !dragGhostNodeRef.current) return
    dragGhostContainerRef.current.innerHTML = ''
    dragGhostContainerRef.current.appendChild(dragGhostNodeRef.current)
  }, [])

  const clearDragGhost = useCallback(() => {
    if (dragGhostRafRef.current !== null) {
      window.cancelAnimationFrame(dragGhostRafRef.current)
      dragGhostRafRef.current = null
    }
    if (dragGhostContainerRef.current) {
      dragGhostContainerRef.current.innerHTML = ''
    }
    dragGhostNodeRef.current = null
    dragGhostPositionRef.current = null
    dragItemOffsetRef.current = null
    dragItemHeightRef.current = 0
    dragItemWidthRef.current = 0
  }, [])

  const scheduleDropTargetIndex = useCallback((nextIndex: number) => {
    pendingDropIndexRef.current = nextIndex
    if (dropIndexRafRef.current !== null) return

    dropIndexRafRef.current = window.requestAnimationFrame(() => {
      dropIndexRafRef.current = null
      const pending = pendingDropIndexRef.current
      if (pending === null) return
      if (dropTargetIndexRef.current !== pending) {
        dropTargetIndexRef.current = pending
        setDropTargetIndex(pending)
      }
    })
  }, [])

  const resetPointerDrag = useCallback(() => {
    pointerDragSourceRef.current = null
    pointerDragStartRef.current = null
    pointerDragActiveRef.current = false
    draggingProjectPathRef.current = null
    dragOriginalIndexRef.current = null
    dragDropZonesRef.current = []
    pendingDropIndexRef.current = null
    if (dropIndexRafRef.current !== null) {
      window.cancelAnimationFrame(dropIndexRafRef.current)
      dropIndexRafRef.current = null
    }
    dropTargetIndexRef.current = null
    setDraggingProjectPath(null)
    setDropTargetProjectPath(null)
    setDropTargetIndex(null)
    setPointerDragActive(false)
    clearDragGhost()
  }, [clearDragGhost])

  const handleProjectPointerMove = useCallback((event: PointerEvent) => {
    const sourcePath = pointerDragSourceRef.current
    const startPoint = pointerDragStartRef.current
    if (!sourcePath || !startPoint) return

    const dx = event.clientX - startPoint.x
    const dy = event.clientY - startPoint.y
    const distance = Math.hypot(dx, dy)

    if (!pointerDragActiveRef.current) {
      if (distance < 6) return

      const sourceNode = projectItemRefs.current.get(sourcePath)
      if (!sourceNode) return

      const rect = sourceNode.getBoundingClientRect()
      dragItemHeightRef.current = rect.height
      dragItemWidthRef.current = rect.width
      dragItemOffsetRef.current = {
        x: event.clientX - rect.left,
        y: event.clientY - rect.top,
      }
      dragGhostPositionRef.current = { x: rect.left, y: rect.top }

      const originalIndex = projectsRef.current.findIndex((project) => isSameDirectory(project.path, sourcePath))
      dragOriginalIndexRef.current = originalIndex

      const basePaths = getBaseProjectPaths(sourcePath)
      dragDropZonesRef.current = basePaths
        .map((path) => {
          const node = projectItemRefs.current.get(path)
          if (!node) return null
          const rect = node.getBoundingClientRect()
          return { path, mid: rect.top + rect.height / 2 }
        })
        .filter((entry): entry is { path: string; mid: number } => Boolean(entry))

      pointerDragActiveRef.current = true
      pointerDragSuppressClickRef.current = true
      draggingProjectPathRef.current = sourcePath
      setDraggingProjectPath(sourcePath)
      setDropTargetIndex(originalIndex >= 0 ? originalIndex : 0)
      setDropTargetProjectPath(null)
      window.getSelection?.()?.removeAllRanges()

      const clone = sourceNode.cloneNode(true) as HTMLElement
      clone.style.width = `${rect.width}px`
      clone.style.boxSizing = 'border-box'
      clone.style.margin = '0'
      clone.style.pointerEvents = 'none'
      dragGhostNodeRef.current = clone

      setPointerDragActive(true)
    }

    if (!pointerDragActiveRef.current) return

    event.preventDefault()
    updateDragGhostPosition(event.clientX, event.clientY)

    const zones = dragDropZonesRef.current
    let nextIndex = zones.length
    for (let i = 0; i < zones.length; i += 1) {
      if (event.clientY < zones[i].mid) {
        nextIndex = i
        break
      }
    }

    scheduleDropTargetIndex(nextIndex)
  }, [getBaseProjectPaths, updateDragGhostPosition])

  const handleProjectPointerUp = useCallback(() => {
    window.removeEventListener('pointermove', onPointerMove)
    window.removeEventListener('pointerup', onPointerUp)
    window.removeEventListener('pointercancel', onPointerUp)

    if (pointerDragActiveRef.current && pointerDragSourceRef.current) {
      const sourcePath = pointerDragSourceRef.current
      const basePaths = getBaseProjectPaths(sourcePath)
      const fallbackIndex = dragOriginalIndexRef.current ?? basePaths.length
      const pendingIndex = pendingDropIndexRef.current ?? dropTargetIndexRef.current ?? dropTargetIndex
      const insertIndex = Math.max(0, Math.min(basePaths.length, pendingIndex ?? fallbackIndex))
      const targetPath = insertIndex >= basePaths.length ? '' : basePaths[insertIndex]

      if (!targetPath || !isSameDirectory(sourcePath, targetPath)) {
        reorderDirectory(sourcePath, targetPath)
      }
    }

    resetPointerDrag()
  }, [dropTargetIndex, getBaseProjectPaths, reorderDirectory, resetPointerDrag])

  useEffect(() => {
    pointerMoveHandlerRef.current = handleProjectPointerMove
    pointerUpHandlerRef.current = handleProjectPointerUp
  }, [handleProjectPointerMove, handleProjectPointerUp])

  const onPointerMove = useCallback((event: PointerEvent) => {
    pointerMoveHandlerRef.current(event)
  }, [])

  const onPointerUp = useCallback((event?: PointerEvent) => {
    pointerUpHandlerRef.current(event)
  }, [])

  const handleProjectPointerDown = useCallback((projectPath: string, event: React.PointerEvent<HTMLDivElement>) => {
    if (!tauriWindowMode || isMobile || event.button !== 0) return

    const target = event.target as Element | null
    if (target?.closest('button, a, input, textarea, select, [data-no-project-drag="true"]')) {
      return
    }

    pointerDragSuppressClickRef.current = false
    pointerDragSourceRef.current = projectPath
    pointerDragStartRef.current = { x: event.clientX, y: event.clientY }
    pointerDragActiveRef.current = false

    window.addEventListener('pointermove', onPointerMove, { passive: false })
    window.addEventListener('pointerup', onPointerUp)
    window.addEventListener('pointercancel', onPointerUp)
  }, [isMobile, onPointerMove, onPointerUp, tauriWindowMode])

  useLayoutEffect(() => {
    if (!pointerDragActive) return

    mountDragGhost()
    const position = dragGhostPositionRef.current
    if (position && dragGhostContainerRef.current) {
      dragGhostContainerRef.current.style.transform = `translate3d(${position.x}px, ${position.y}px, 0)`
    }
  }, [mountDragGhost, pointerDragActive])

  useLayoutEffect(() => {
    const nextRects = new Map<string, DOMRect>()
    projectItemRefs.current.forEach((node, path) => {
      nextRects.set(path, node.getBoundingClientRect())
    })

    if (pointerDragActive) {
      prevProjectRectsRef.current.forEach((prevRect, path) => {
        const node = projectItemRefs.current.get(path)
        const nextRect = nextRects.get(path)
        if (!node || !nextRect) return
        const dx = prevRect.left - nextRect.left
        const dy = prevRect.top - nextRect.top
        if (dx || dy) {
          const existing = flipAnimationRef.current.get(node)
          if (existing) {
            existing.cancel()
          }
          node.animate(
            [
              { transform: `translate(${dx}px, ${dy}px)` },
              { transform: 'translate(0, 0)' },
            ],
            {
              duration: 160,
              easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)',
            },
          )
          const animation = node.getAnimations().at(-1)
          if (animation) {
            flipAnimationRef.current.set(node, animation)
          }
        }
      })
    }

    prevProjectRectsRef.current = nextRects
  }, [dropTargetIndex, pointerDragActive])

  useEffect(() => {
    return () => {
      window.removeEventListener('pointermove', onPointerMove)
      window.removeEventListener('pointerup', onPointerUp)
      window.removeEventListener('pointercancel', onPointerUp)
    }
  }, [onPointerMove, onPointerUp])

  useEffect(() => {
    if (pointerDragActive) {
      document.body.classList.add('project-dragging')
    } else {
      document.body.classList.remove('project-dragging')
    }

    return () => {
      document.body.classList.remove('project-dragging')
    }
  }, [pointerDragActive])

  // 移动端长按：取消定时器
  const cancelLongPress = useCallback(() => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current)
      longPressTimerRef.current = null
    }
    longPressTouchStartRef.current = null
  }, [])

  // 移动端长按：touch 开始
  const handleSessionLongPressStart = useCallback(
    (e: React.TouchEvent<HTMLButtonElement>, projectPath: string, sessionId: string, source: 'pinned' | 'project' | 'recent') => {
      if (!isMobile) return
      const touch = e.touches[0]
      longPressTouchStartRef.current = { x: touch.clientX, y: touch.clientY }
      longPressActivatedRef.current = false
      const rect = e.currentTarget.getBoundingClientRect()
      longPressTimerRef.current = setTimeout(() => {
        longPressActivatedRef.current = true
        setOpenMenu({ type: 'session', projectPath, sessionId, source, anchorRect: rect })
      }, 500)
    },
    [isMobile]
  )

  // 移动端长按：移动超出阈值则取消
  const handleSessionLongPressMove = useCallback((e: React.TouchEvent) => {
    if (!longPressTouchStartRef.current || !longPressTimerRef.current) return
    const touch = e.touches[0]
    const dx = Math.abs(touch.clientX - longPressTouchStartRef.current.x)
    const dy = Math.abs(touch.clientY - longPressTouchStartRef.current.y)
    if (dx > 8 || dy > 8) cancelLongPress()
  }, [cancelLongPress])

  // 移动端长按：touch 结束，若已触发则阻止 click
  const handleSessionLongPressEnd = useCallback((e: React.TouchEvent<HTMLButtonElement>) => {
    if (longPressActivatedRef.current) {
      e.preventDefault()
      longPressActivatedRef.current = false
    }
    cancelLongPress()
  }, [cancelLongPress])

  const markSessionNotificationsRead = useCallback((sessionId: string) => {
    notificationStore.acknowledgeSession(sessionId)
  }, [])

  useEffect(() => {
    if (!selectedSessionId) return
    markSessionNotificationsRead(selectedSessionId)
  }, [selectedSessionId, markSessionNotificationsRead])

  const handleSelectPinnedSession = useCallback(async (entry: PinnedSessionEntry) => {
    setOpenMenu(null)

    const targetProjectPath = entry.projectPath || entry.directory
    if (targetProjectPath) {
      setCurrentDirectory(targetProjectPath)
      updateProjectExpanded(targetProjectPath, true)
    }

    let targetSession = loadedSessionById.get(entry.sessionId)

    if (!targetSession) {
      try {
        targetSession = await fetchSessionQuery(entry.sessionId, entry.directory || targetProjectPath)
      } catch {
        targetSession = undefined
      }
    }

    if (!targetSession) return

    markSessionNotificationsRead(targetSession.id)
    onSelectSession(targetSession)

    if (window.innerWidth < 768 && onCloseMobile) {
      onCloseMobile()
    }
  }, [loadedSessionById, markSessionNotificationsRead, onCloseMobile, onSelectSession, setCurrentDirectory, updateProjectExpanded])

  const handleSelect = useCallback((session: ApiSession) => {
    setOpenMenu(null)
    markSessionNotificationsRead(session.id)
    onSelectSession(session)
    if (window.innerWidth < 768 && onCloseMobile) {
      onCloseMobile()
    }
  }, [onSelectSession, onCloseMobile, markSessionNotificationsRead])

  const handleSelectRecentSession = useCallback((session: ApiSession) => {
    setOpenMenu(null)

    const sessionDirectory = session.directory
    if (sessionDirectory) {
      const matchedProjectPath = projects.find((project) => isSameDirectory(project.path, sessionDirectory))?.path ?? sessionDirectory
      setCurrentDirectory(matchedProjectPath)
      updateProjectExpanded(matchedProjectPath, true)
    }

    markSessionNotificationsRead(session.id)
    onSelectSession(session)

    if (window.innerWidth < 768 && onCloseMobile) {
      onCloseMobile()
    }
  }, [markSessionNotificationsRead, onCloseMobile, onSelectSession, projects, setCurrentDirectory, updateProjectExpanded])

  const handleLoadMoreRecent = useCallback(() => {
    if (recentLoading || !recentHasMore) return

    setRecentLimit((prev) => prev + DEFAULT_RECENT_VISIBLE_COUNT)
  }, [recentHasMore, recentLoading])

  const handleLoadMore = useCallback((projectPath: string) => {
    setVisibleCountByProject((prev) => ({
      ...prev,
      [projectPath]: (prev[projectPath] ?? DEFAULT_VISIBLE_COUNT) + DEFAULT_VISIBLE_COUNT,
    }))
  }, [])

  const handleHeaderMouseDown = useCallback((event: React.MouseEvent<HTMLDivElement>) => {
    if (!tauriWindowMode) {
      return
    }

    void handleWindowTitlebarMouseDown(event.target, event.button, event.detail)
  }, [tauriWindowMode])

  const activeDragPath = pointerDragActive ? draggingProjectPath : null
  const baseProjectPaths = useMemo(() => {
    const paths = projects.map((project) => project.path)
    if (!activeDragPath) return paths
    return paths.filter((path) => !isSameDirectory(path, activeDragPath))
  }, [activeDragPath, projects])

  const resolvedDropIndex = useMemo(() => {
    if (!activeDragPath) return null
    const fallbackIndex = dragOriginalIndexRef.current ?? baseProjectPaths.length
    const candidate = dropTargetIndex ?? fallbackIndex
    return Math.max(0, Math.min(baseProjectPaths.length, candidate))
  }, [activeDragPath, baseProjectPaths.length, dropTargetIndex])

  const projectRenderItems = useMemo(() => {
    if (!activeDragPath) {
      return baseProjectPaths.map((path) => ({ type: 'project' as const, path }))
    }

    const items: Array<{ type: 'project' | 'placeholder'; path?: string }> = []
    const insertIndex = resolvedDropIndex ?? baseProjectPaths.length

    baseProjectPaths.forEach((path, index) => {
      if (index === insertIndex) {
        items.push({ type: 'placeholder' })
      }
      items.push({ type: 'project', path })
    })

    if (insertIndex === baseProjectPaths.length) {
      items.push({ type: 'placeholder' })
    }

    return items
  }, [activeDragPath, baseProjectPaths, resolvedDropIndex])

  const placeholderHeight = pointerDragActive
    ? Math.max(dragItemHeightRef.current, 32)
    : 0

  // 收起到 rail 时复用旧实现，避免重复维护收起态细节
  if (!showLabels) {
    return <SidePanel {...props} />
  }

  return (
    <div className="flex flex-col h-full overflow-hidden bg-[var(--sidebar-bg)]">
      {customTauriWindowMode ? (
        <div className="h-14 shrink-0 flex items-center gap-2 px-3 select-none" onMouseDown={handleHeaderMouseDown}>
          <div className="shrink-0">
            <TauriWindowControls />
          </div>
          <div className="flex-1 min-w-0" />
          <div className="flex items-center justify-end shrink-0" data-no-window-drag="true">
            <button
              onClick={onAddProject}
              aria-label="Add project"
              className="h-8 w-8 mr-1 flex items-center justify-center rounded-lg text-text-400 hover:text-text-100 hover:bg-[var(--sidebar-hover-bg)] active:scale-[0.98] transition-all duration-200"
              title="Add project"
            >
              <FolderIcon size={16} />
            </button>
            <button
              onClick={() => onNewSession(currentDirectory)}
              aria-label="New session"
              className="h-8 w-8 mr-1 flex items-center justify-center rounded-lg text-text-400 hover:text-text-100 hover:bg-[var(--sidebar-hover-bg)] active:scale-[0.98] transition-all duration-200"
              title="New chat"
            >
              <ComposeIcon size={16} />
            </button>
            <button
              onClick={onToggleSidebar}
              aria-label={isExpanded ? 'Collapse sidebar' : 'Expand sidebar'}
              className="h-8 w-8 flex items-center justify-center rounded-lg text-text-400 hover:text-text-100 hover:bg-[var(--sidebar-hover-bg)] active:scale-[0.98] transition-all duration-200"
            >
              <SidebarIcon size={18} />
            </button>
          </div>
        </div>
      ) : nativeMacTitlebar ? (
        <div className="h-14 shrink-0 flex items-center gap-2 pl-[4.75rem] pr-2" onMouseDown={handleHeaderMouseDown}>
          <div className="flex-1 min-w-0" />
          <div className="flex items-center justify-end shrink-0" data-no-window-drag="true">
            <button
              onClick={onAddProject}
              aria-label="Add project"
              className="h-8 w-8 mr-1 flex items-center justify-center rounded-lg text-text-400 hover:text-text-100 hover:bg-[var(--sidebar-hover-bg)] active:scale-[0.98] transition-all duration-200"
              title="Add project"
            >
              <FolderIcon size={16} />
            </button>
            <button
              onClick={() => onNewSession(currentDirectory)}
              aria-label="New session"
              className="h-8 w-8 mr-1 flex items-center justify-center rounded-lg text-text-400 hover:text-text-100 hover:bg-[var(--sidebar-hover-bg)] active:scale-[0.98] transition-all duration-200"
              title="New chat"
            >
              <ComposeIcon size={16} />
            </button>
            <button
              onClick={onToggleSidebar}
              aria-label={isExpanded ? 'Collapse sidebar' : 'Expand sidebar'}
              className="h-8 w-8 flex items-center justify-center rounded-lg text-text-400 hover:text-text-100 hover:bg-[var(--sidebar-hover-bg)] active:scale-[0.98] transition-all duration-200"
            >
              <SidebarIcon size={18} />
            </button>
          </div>
        </div>
      ) : (
        <div className="h-14 shrink-0 flex items-center">
          <div className="pl-3 overflow-hidden transition-all duration-300 ease-out">
            <a href="/" className="flex items-center whitespace-nowrap">
              <span className="text-base font-semibold text-text-100 tracking-tight">OpenCode</span>
            </a>
          </div>

          <div className="flex-1 flex items-center justify-end pr-2 transition-all duration-300 ease-out">
            <button
              onClick={onAddProject}
              aria-label="Add project"
              className="h-8 w-8 mr-1 flex items-center justify-center rounded-lg text-text-400 hover:text-text-100 hover:bg-[var(--sidebar-hover-bg)] active:scale-[0.98] transition-all duration-200"
              title="Add project"
            >
              <FolderIcon size={16} />
            </button>
            <button
              onClick={() => onNewSession(currentDirectory)}
              aria-label="New session"
              className="h-8 w-8 mr-1 flex items-center justify-center rounded-lg text-text-400 hover:text-text-100 hover:bg-[var(--sidebar-hover-bg)] active:scale-[0.98] transition-all duration-200"
              title="New chat"
            >
              <ComposeIcon size={16} />
            </button>
            <button
              onClick={onToggleSidebar}
              aria-label={isExpanded ? 'Collapse sidebar' : 'Expand sidebar'}
              className="h-8 w-8 flex items-center justify-center rounded-lg text-text-400 hover:text-text-100 hover:bg-[var(--sidebar-hover-bg)] active:scale-[0.98] transition-all duration-200"
            >
              <SidebarIcon size={18} />
            </button>
          </div>
        </div>
      )}

      {modeTabs && (
        <div className="mx-2 mb-1 shrink-0">
          {modeTabs}
        </div>
      )}

      <div className="flex-1 min-h-0 overflow-y-auto no-scrollbar px-1.5 pb-3">
        <div
          className={`overflow-hidden transition-[max-height,opacity,margin] duration-200 ease-out ${
            pinnedSessionsForDisplay.length > 0
              ? 'opacity-100 mb-1 pointer-events-auto'
              : 'opacity-0 mb-0 pointer-events-none'
          }`}
          style={{ maxHeight: `${pinnedSectionMaxHeight}px` }}
        >
          <div className="space-y-0.5">
            {pinnedSessionsForDisplay.map((entry) => {
                const pinnedProjectPath = entry.projectPath || entry.directory
                const isSelected = entry.sessionId === selectedSessionId
                const isRunning = busySessionIds.has(entry.sessionId)
                const hasUnreadNotification =
                  !isSelected &&
                  (unreadNotificationIdsBySession.get(entry.sessionId)?.length ?? 0) > 0
                const isSessionMenuOpen =
                  openMenu?.type === 'session' &&
                  openMenu.source === 'pinned' &&
                  openMenu.projectPath === pinnedProjectPath &&
                  openMenu.sessionId === entry.sessionId
                const sessionForPinnedAction = entry.session ?? {
                  id: entry.sessionId,
                  title: entry.title,
                  directory: entry.directory,
                  projectID: '',
                  time: { created: entry.updatedAt, updated: entry.updatedAt },
                } as ApiSession

                return (
                  <SessionListItem
                    key={entry.sessionId}
                    title={entry.title || 'Untitled Chat'}
                    selected={isSelected}
                    pinned
                    running={isRunning}
                    hasUnread={hasUnreadNotification}
                    updatedTime={entry.updatedAt}
                    menuOpen={isSessionMenuOpen}
                    menuRef={menuRef}
                    menuAnchorRect={isSessionMenuOpen ? openMenu?.anchorRect : null}
                    tagStatus={entry.session?.projectID ? (allSummaryByExternalId.get(entry.sessionId)?.statusSnapshot ?? 'in_progress') : 'in_progress'}
                    menuActions={[
                      {
                        label: '取消置顶',
                        icon: <PinIcon size={12} />,
                        onClick: () => {
                          handleToggleSessionPin(pinnedProjectPath, sessionForPinnedAction)
                        },
                      },
                      {
                        label: '重命名',
                        icon: <PencilIcon size={12} />,
                        onClick: () => {
                          handleRequestRenameSession(pinnedProjectPath, sessionForPinnedAction)
                        },
                      },
                      {
                        label: '归档',
                        icon: <ClockIcon size={12} />,
                        onClick: () => {
                          void handleArchiveSession(pinnedProjectPath, sessionForPinnedAction)
                        },
                      },
                      {
                        label: '复制工作目录',
                        icon: <CopyIcon size={12} />,
                        onClick: () => {
                          void handleCopySessionDirectory(sessionForPinnedAction)
                        },
                      },
                      {
                        label: '移除会话',
                        icon: <TrashIcon size={12} />,
                        danger: true,
                        onClick: () => {
                          handleRequestDeleteSession(pinnedProjectPath, sessionForPinnedAction)
                        },
                      },
                    ]}
                    onSelect={() => {
                      void handleSelectPinnedSession(entry)
                    }}
                    onTogglePin={() => handleToggleSessionPin(pinnedProjectPath, sessionForPinnedAction)}
                    onToggleMenu={!isMobile ? (anchorRect) => handleToggleSessionMenu(pinnedProjectPath, entry.sessionId, 'pinned', anchorRect) : undefined}
                    showMenuButton={!isMobile}
                    onTouchStart={(e) => handleSessionLongPressStart(e, pinnedProjectPath, entry.sessionId, 'pinned')}
                    onTouchMove={handleSessionLongPressMove}
                    onTouchEnd={handleSessionLongPressEnd}
                    onContextMenu={(e) => e.preventDefault()}
                  />
                )
              })}
          </div>
        </div>

        <div className="mb-1">
          <div className="flex items-center justify-between px-1.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-text-400/80">
            <span>最近会话</span>
          </div>

          <div className="space-y-0.5">
            {recentLoading && recentSessions.length === 0 ? (
              <div className="h-7 px-1.5 flex items-center text-text-400 text-[11px]">
                <SpinnerIcon size={12} className="animate-spin mr-2" />
                加载中...
              </div>
            ) : recentSessions.length === 0 ? (
              <div className="ml-5 h-7 px-1.5 flex items-center text-[11px] text-text-500">
                24 小时内暂无会话
              </div>
            ) : (
              recentSessions.map((session) => {
                const recentProjectPath = session.directory || ''
                const updatedTime = getSessionUpdatedAt(session)
                const isSelected = session.id === selectedSessionId
                const isPinned = pinnedSessionIds.has(session.id)
                const isRunning = busySessionIds.has(session.id)
                const hasUnreadNotification =
                  !isSelected &&
                  (unreadNotificationIdsBySession.get(session.id)?.length ?? 0) > 0
                const isSessionMenuOpen =
                  openMenu?.type === 'session' &&
                  openMenu.source === 'recent' &&
                  openMenu.projectPath === recentProjectPath &&
                  openMenu.sessionId === session.id

                return (
                  <SessionListItem
                    key={session.id}
                    title={session.title || 'Untitled Chat'}
                    selected={isSelected}
                    pinned={isPinned}
                    running={isRunning}
                    hasUnread={hasUnreadNotification}
                    updatedTime={updatedTime}
                    menuOpen={isSessionMenuOpen}
                    menuRef={menuRef}
                    menuAnchorRect={isSessionMenuOpen ? openMenu?.anchorRect : null}
                    tagStatus={session.projectID ? (allSummaryByExternalId.get(session.id)?.statusSnapshot ?? 'in_progress') : 'in_progress'}
                    menuActions={[
                      {
                        label: isPinned ? '取消置顶' : '置顶会话',
                        icon: <PinIcon size={12} />,
                        onClick: () => {
                          handleToggleSessionPin(recentProjectPath, session)
                        },
                      },
                      {
                        label: '重命名',
                        icon: <PencilIcon size={12} />,
                        onClick: () => {
                          handleRequestRenameSession(recentProjectPath, session)
                        },
                      },
                      {
                        label: '归档',
                        icon: <ClockIcon size={12} />,
                        onClick: () => {
                          void handleArchiveSession(recentProjectPath, session)
                        },
                      },
                      {
                        label: '复制工作目录',
                        icon: <CopyIcon size={12} />,
                        onClick: () => {
                          void handleCopySessionDirectory(session)
                        },
                      },
                      {
                        label: '移除会话',
                        icon: <TrashIcon size={12} />,
                        danger: true,
                        onClick: () => {
                          handleRequestDeleteSession(recentProjectPath, session)
                        },
                      },
                    ]}
                    onSelect={() => handleSelectRecentSession(session)}
                    onTogglePin={() => handleToggleSessionPin(recentProjectPath, session)}
                    onToggleMenu={!isMobile ? (anchorRect) => handleToggleSessionMenu(recentProjectPath, session.id, 'recent', anchorRect) : undefined}
                    showMenuButton={!isMobile}
                    onTouchStart={(e) => handleSessionLongPressStart(e, recentProjectPath, session.id, 'recent')}
                    onTouchMove={handleSessionLongPressMove}
                    onTouchEnd={handleSessionLongPressEnd}
                    onContextMenu={(e) => e.preventDefault()}
                  />
                )
              })
            )}

            {recentHasMore && (
              <button
                type="button"
                onClick={handleLoadMoreRecent}
                disabled={recentLoading}
                className="ml-5 h-7 px-1.5 rounded-md text-[11px] text-text-500 hover:text-text-100 hover:bg-[var(--sidebar-hover-bg)] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {recentLoading ? '加载中...' : '加载更多'}
              </button>
            )}
          </div>
        </div>

        <div className="flex items-center justify-between px-1.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-text-400/80">
          <span>线程</span>
          <div className="relative">
            <button
              ref={threadFilterTriggerRef}
              type="button"
              onClick={() => setIsThreadFilterOpen((prev) => !prev)}
              className={`relative h-5 w-5 rounded-md flex items-center justify-center transition-colors ${
                isThreadFilterOpen
                  ? 'text-text-100 bg-[var(--sidebar-hover-bg)]'
                  : 'text-text-400 hover:text-text-100 hover:bg-[var(--sidebar-hover-bg)]'
              }`}
              title="过滤线程"
              aria-label="过滤线程"
              aria-expanded={isThreadFilterOpen}
            >
              <FilterIcon size={12} />
            </button>

            <DropdownMenu
              triggerRef={threadFilterTriggerRef}
              isOpen={isThreadFilterOpen}
              align="right"
              minWidth="180px"
              maxWidth="min(220px, calc(100vw - 24px))"
              className="!p-0 overflow-hidden"
            >
              <div ref={threadFilterMenuRef} className="w-[180px] max-w-[calc(100vw-24px)] bg-bg-000/98 px-1 py-1">
                <div className="px-2 py-1 text-[10px] font-semibold tracking-wider text-text-400/80">类型</div>
                <div className="space-y-0.5">
                  {THREAD_TYPE_FILTER_OPTIONS.map((option) => {
                    const selected = threadTypeFilter === option.value
                    return (
                      <button
                        key={option.value}
                        type="button"
                        onClick={() => setThreadTypeFilter(option.value)}
                        className={`flex h-7 w-full items-center justify-between rounded-md px-2 text-[12px] transition-colors ${
                          selected
                            ? 'bg-[var(--sidebar-hover-bg)] text-text-100'
                            : 'text-text-200 hover:bg-[var(--sidebar-hover-bg)] hover:text-text-100'
                        }`}
                      >
                        <span>{option.label}</span>
                        <span className={`text-text-400 transition-opacity ${selected ? 'opacity-100' : 'opacity-0'}`}>
                          <CheckIcon size={12} />
                        </span>
                      </button>
                    )
                  })}
                </div>

                <div className="my-1 border-t border-border-200/50" />

                <div className="px-2 py-1 text-[10px] font-semibold tracking-wider text-text-400/80">状态</div>
                <div className="space-y-0.5">
                  {THREAD_STATUS_FILTER_OPTIONS.map((option) => {
                    const selected = option.value === 'all'
                      ? isThreadStatusAllSelected
                      : threadStatusFilterSet.has(option.value)
                    return (
                      <button
                        key={option.value}
                        type="button"
                        onClick={() => handleThreadStatusToggle(option.value)}
                        className={`flex h-7 w-full items-center justify-between rounded-md px-2 text-[12px] transition-colors ${
                          selected
                            ? 'bg-[var(--sidebar-hover-bg)] text-text-100'
                            : 'text-text-200 hover:bg-[var(--sidebar-hover-bg)] hover:text-text-100'
                        }`}
                      >
                        <span>{option.label}</span>
                        <span className={`text-text-400 transition-opacity ${selected ? 'opacity-100' : 'opacity-0'}`}>
                          <CheckIcon size={12} />
                        </span>
                      </button>
                    )
                  })}
                </div>
              </div>
            </DropdownMenu>
          </div>
        </div>

        {projects.length === 0 ? (
          <div className="px-2 py-8 text-[11px] text-text-400/70">
            正在初始化项目...
          </div>
        ) : (
          <div
            ref={projectListRef}
            className="space-y-0"
            onDragOverCapture={handleProjectListDragOverCapture}
            onDropCapture={handleProjectListDropCapture}
          >
            {projectRenderItems.map((item, index) => {
              if (item.type === 'placeholder') {
                return (
                  <div
                    key={`project-placeholder-${index}`}
                    aria-hidden="true"
                    className="rounded-md"
                    style={{ height: placeholderHeight }}
                  />
                )
              }

              const project = projectByPath.get(item.path ?? '')
              if (!project) return null

              const isExpandedProject = expandedProjects[project.path] ?? false
              const sessions = sessionsByProject[project.path] ?? []
              const projectId = sessions[0]?.projectID ?? projectIdByPath[project.path] ?? null
              const mixedEntries = projectId ? getProjectEntries(projectId, sessions) : []
              const filteredEntries = mixedEntries.filter(matchesThreadFilters)
              const itemProjectError = projectId ? getProjectError(projectId) : undefined
              const itemProjectLoading = projectId ? isProjectLoading(projectId) : false
              const isLoading = loadingByProject[project.path] ?? false
              const hasMore = hasMoreByProject[project.path] ?? false
              const isProjectMenuOpen = openMenu?.type === 'project' && openMenu.projectPath === project.path
              const showProjectActions = isProjectMenuOpen || (isMobile && tappedProjectPath === project.path)
              const isDropTarget =
                draggingProjectPath !== null &&
                draggingProjectPath !== project.path &&
                dropTargetProjectPath === project.path

              return (
                <div
                  key={project.path}
                  data-project-path={project.path}
                  draggable={!isMobile && !tauriWindowMode}
                  onPointerDown={(event) => handleProjectPointerDown(project.path, event)}
                  onDragStart={(event) => handleProjectDragStart(project.path, event)}
                  onDragOver={(event) => handleProjectDragOver(project.path, event)}
                  onDragLeave={() => handleProjectDragLeave(project.path)}
                  onDrop={(event) => handleProjectDrop(project.path, event)}
                  onDragEnd={handleProjectDragEnd}
                  className="rounded-md"
                  ref={(node) => setProjectItemRef(project.path, node)}
                >
                  <div
                    className={`group/project relative h-8 flex items-center rounded-md transition-colors text-text-400 hover:text-text-100 hover:bg-[var(--sidebar-hover-bg)] ${isDropTarget ? 'ring-1 ring-accent-main-100/60' : ''} ${
                      draggingProjectPath === project.path ? 'opacity-70' : ''
                    } ${tauriWindowMode ? 'cursor-grab' : ''}`}
                    role="button"
                    tabIndex={0}
                    aria-expanded={isExpandedProject}
                    title={project.path}
                    onClick={() => handleProjectRowClick(project.path)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault()
                        handleProjectRowClick(project.path)
                      }
                    }}
                  >
                    <div className="w-full h-8 flex items-center gap-1.5 px-1.5 pr-[52px] text-left">
                      <span className="relative size-4 shrink-0 text-text-400">
                        <span className="absolute inset-0 flex items-center justify-center transition-opacity duration-150 group-hover/project:opacity-0 group-focus-visible/project:opacity-0">
                          {isExpandedProject ? (
                            <FolderOpenIcon size={13} className="shrink-0" />
                          ) : (
                            <FolderIcon size={13} className="shrink-0" />
                          )}
                        </span>
                        <span className="absolute inset-0 flex items-center justify-center opacity-0 text-text-400 transition-opacity duration-150 group-hover/project:opacity-100 group-focus-visible/project:opacity-100">
                          <ChevronDownIcon
                            size={12}
                            className={`transition-transform duration-200 ${isExpandedProject ? '' : '-rotate-90'}`}
                          />
                        </span>
                      </span>
                      <span className="flex-1 min-w-0 flex items-center">
                        <span className="truncate text-[13px] leading-none">{project.name}</span>
                      </span>
                    </div>

                    <div
                      className={`absolute right-1 top-1/2 -translate-y-1/2 flex items-center gap-0.5 transition-opacity duration-150 ${
                        showProjectActions
                          ? 'opacity-100 pointer-events-auto'
                          : 'opacity-0 pointer-events-none group-hover/project:opacity-100 group-hover/project:pointer-events-auto group-focus-within/project:opacity-100 group-focus-within/project:pointer-events-auto'
                      }`}
                    >
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation()
                          handleToggleProjectMenu(project.path, event.currentTarget.getBoundingClientRect())
                        }}
                        className="h-5 w-5 rounded-md flex items-center justify-center text-text-400 hover:text-text-100 hover:bg-[var(--sidebar-hover-bg)] transition-colors"
                        title="项目菜单"
                      >
                        <MoreHorizontalIcon size={12} />
                      </button>

                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation()
                          void handleCreateItemInProject(project.path)
                        }}
                        className="h-5 w-5 rounded-md flex items-center justify-center text-text-400 hover:text-text-100 hover:bg-[var(--sidebar-hover-bg)] transition-colors"
                        title="在此项目中创建事项"
                      >
                        <PlusIcon size={12} />
                      </button>

                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation()
                          handleCreateSessionInProject(project.path)
                        }}
                        className="h-5 w-5 rounded-md flex items-center justify-center text-text-400 hover:text-text-100 hover:bg-[var(--sidebar-hover-bg)] transition-colors"
                        title="在此项目中创建会话"
                      >
                        <ComposeIcon size={12} />
                      </button>
                    </div>

                    {isProjectMenuOpen && openMenu?.anchorRect && (
                      <ActionMenu menuRef={menuRef} anchorRect={openMenu.anchorRect}>
                        {tauriWindowMode && (
                          <ActionMenuItem
                            label="打开文件夹"
                            icon={<FolderOpenIcon size={12} />}
                            onClick={() => {
                              void handleOpenProjectFolder(project.path)
                            }}
                          />
                        )}
                        {!tauriWindowMode && (
                          <ActionMenuItem
                            label="复制文件夹路径"
                            icon={<CopyIcon size={12} />}
                            onClick={() => {
                              void handleCopyProjectPath(project.path)
                            }}
                          />
                        )}
                        <ActionMenuItem
                          label="隐藏项目"
                          icon={<TrashIcon size={12} />}
                          danger
                          onClick={() => handleRequestRemoveProject(project.path)}
                        />
                      </ActionMenu>
                    )}
                  </div>

                  <div
                    className={`grid transition-[grid-template-rows,opacity,margin] duration-200 ease-out ${
                      isExpandedProject
                        ? 'grid-rows-[1fr] opacity-100 mt-1 pointer-events-auto'
                        : 'grid-rows-[0fr] opacity-0 mt-0 pointer-events-none'
                    }`}
                  >
                    <div className="overflow-hidden">
                      <div className="ml-0 space-y-0.5">
                        {isLoading && mixedEntries.length === 0 && sessions.length === 0 ? (
                          <div className="h-7 flex items-center text-text-400 text-[11px]">
                            <SpinnerIcon size={12} className="animate-spin mr-2" />
                            加载中...
                          </div>
                        ) : itemProjectLoading && mixedEntries.length === 0 ? (
                          <div className="h-7 flex items-center text-text-400 text-[11px]">
                            <SpinnerIcon size={12} className="animate-spin mr-2" />
                            正在加载事项...
                          </div>
                        ) : itemProjectError ? (
                          <div className="ml-5 px-1.5 py-2 text-[11px] text-rose-300 space-y-2">
                            <div>事项加载失败</div>
                            <div className="text-text-500 break-all">{itemProjectError}</div>
                            {projectId && (
                              <button
                                type="button"
                                onClick={() => void loadItemProject(projectId)}
                                className="inline-flex items-center rounded-md bg-bg-200 px-2 py-1 text-[11px] text-text-200 hover:text-text-100"
                              >
                                重试
                              </button>
                            )}
                          </div>
                        ) : mixedEntries.length === 0 ? (
                          <div className="ml-5 px-1.5 py-2 text-[11px] text-text-500 space-y-2">
                            <div>暂无事项或未绑定会话</div>
                            {projectId && (
                              <button
                                type="button"
                                onClick={() => void handleCreateItemInProject(project.path)}
                                className="inline-flex items-center rounded-md bg-bg-200 px-2 py-1 text-[11px] text-text-200 hover:text-text-100"
                              >
                                新建事项
                              </button>
                            )}
                          </div>
                        ) : filteredEntries.length === 0 ? (
                          <div className="ml-5 px-1.5 py-2 text-[11px] text-text-500">
                            暂无匹配线程
                          </div>
                        ) : (
                          filteredEntries.map((entry) => {
                            if (entry.kind === 'item' && entry.item && projectId) {
                              const isSelected = entry.item.id === selectedItemId
                              const isPinnedItem = pinnedItems.some((candidate) => candidate.itemId === entry.item!.id)
                              const isItemMenuOpen = openMenu?.type === 'item' && openMenu.projectPath === project.path && openMenu.itemId === entry.item.id
                              return (
                                <div key={`item-${entry.item.id}`} className="group/session relative">
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setCurrentDirectory(project.path)
                                      onSelectItem?.(projectId, entry.item!)
                                    }}
                                    className={`w-full h-7 px-1.5 pr-12 rounded-md flex items-center gap-1.5 text-left transition-colors ${
                                      isSelected
                                        ? 'bg-[var(--sidebar-hover-bg)] text-text-100'
                                        : 'text-text-200 hover:text-text-100 hover:bg-[var(--sidebar-hover-bg)]'
                                    }`}
                                    title={entry.item.title}
                                  >
                                    <span className="relative h-4 w-4 shrink-0">
                                      <span
                                        role="button"
                                        tabIndex={-1}
                                        onMouseDown={(event) => event.preventDefault()}
                                        onClick={(event) => {
                                          event.stopPropagation()
                                          handleToggleItemPin(project.path, {
                                            id: entry.item!.id,
                                            title: entry.item!.title,
                                            updatedAt: entry.item!.updatedAt || entry.item!.activityAt,
                                          })
                                        }}
                                        className={`absolute inset-0 rounded flex items-center justify-center transition-all duration-150 ${
                                          isPinnedItem
                                            ? 'text-accent-main-100 opacity-0 group-hover/session:opacity-100 group-focus-within/session:opacity-100'
                                            : 'text-text-400 opacity-0 group-hover/session:opacity-100 group-focus-within/session:opacity-100 hover:text-text-100'
                                        }`}
                                        title={isPinnedItem ? '取消置顶' : '置顶事项'}
                                      >
                                        <PinIcon size={11} />
                                      </span>
                                    </span>
                                    <span className="min-w-0 flex-1 flex items-center gap-1.5 overflow-hidden">
                                      <span className={`shrink-0 rounded px-1.5 py-0.5 text-[9px] leading-none ${entry.status === 'in_progress' ? 'bg-sky-500/15 text-sky-300' : entry.status === 'not_started' ? 'bg-violet-500/15 text-violet-300' : entry.status === 'completed' ? 'bg-emerald-500/15 text-emerald-300' : 'bg-zinc-500/15 text-zinc-400'}`}>
                                        {getItemTypeLabel(entry.item.type)}
                                      </span>
                                      <span className="truncate text-[12px] font-medium leading-none">
                                        {entry.item.title}
                                      </span>
                                    </span>
                                  </button>
                                  <div className="absolute right-1 top-1/2 -translate-y-1/2 h-5 w-10 flex items-center justify-center">
                                    <button
                                      type="button"
                                      onClick={(event) => {
                                        event.stopPropagation()
                                        const rect = event.currentTarget.getBoundingClientRect()
                                        setOpenMenu((prev) => prev?.type === 'item' && prev.itemId === entry.item!.id ? null : { type: 'item', projectPath: project.path, itemId: entry.item!.id, anchorRect: rect })
                                      }}
                                      className={`absolute inset-0 rounded-md flex items-center justify-center text-text-400 hover:text-text-100 hover:bg-[var(--sidebar-hover-bg)] transition-all duration-150 ${
                                        isItemMenuOpen
                                          ? 'opacity-100 pointer-events-auto'
                                          : 'opacity-0 pointer-events-none group-hover/session:opacity-100 group-hover/session:pointer-events-auto'
                                      }`}
                                      title="事项菜单"
                                    >
                                      <MoreHorizontalIcon size={12} />
                                    </button>
                                  </div>
                                  {isItemMenuOpen && openMenu?.anchorRect && (
                                    <ActionMenu menuRef={menuRef} anchorRect={openMenu.anchorRect}>
                                      <ActionMenuItem
                                        label={isPinnedItem ? '取消置顶' : '置顶事项'}
                                        icon={<PinIcon size={12} />}
                                        onClick={() => {
                                          handleToggleItemPin(project.path, { id: entry.item!.id, title: entry.item!.title, updatedAt: entry.item!.updatedAt || entry.item!.activityAt })
                                          setOpenMenu(null)
                                        }}
                                      />
                                      <ActionMenuItem
                                        label="重命名"
                                        icon={<PencilIcon size={12} />}
                                        onClick={() => {
                                          onSelectItem?.(projectId, entry.item!)
                                          setOpenMenu(null)
                                        }}
                                      />
                                      <ActionMenuItem
                                        label="归档"
                                        icon={<ClockIcon size={12} />}
                                        onClick={() => {
                                          void archiveItem(projectId, entry.item!.id)
                                          setOpenMenu(null)
                                        }}
                                      />
                                      <ActionMenuItem
                                        label="复制工作目录"
                                        icon={<CopyIcon size={12} />}
                                        onClick={() => {
                                          void handleCopyItemProjectPath(project.path)
                                        }}
                                      />
                                      <ActionMenuItem
                                        label="删除事项"
                                        icon={<TrashIcon size={12} />}
                                        danger
                                        onClick={() => {
                                          setItemDeleteConfirm({ projectId, itemId: entry.item!.id, title: entry.item!.title })
                                          setOpenMenu(null)
                                        }}
                                      />
                                    </ActionMenu>
                                  )}
                                </div>
                              )
                            }

                            const session = sessions.find((candidate) => candidate.id === entry.id)
                            if (!session) return null
                            const updatedTime = session.time.updated ?? session.time.created
                            const isSelected = session.id === selectedSessionId
                            const isPinned = pinnedSessionIds.has(session.id)
                            const isRunning = busySessionIds.has(session.id)
                            const hasUnreadNotification =
                              !isSelected &&
                              (unreadNotificationIdsBySession.get(session.id)?.length ?? 0) > 0
                            const isSessionMenuOpen =
                              openMenu?.type === 'session' &&
                              openMenu.source === 'project' &&
                              openMenu.projectPath === project.path &&
                              openMenu.sessionId === session.id

                            return (
                              <SessionListItem
                                key={session.id}
                                title={session.title || 'Untitled Chat'}
                                selected={isSelected}
                                pinned={isPinned}
                                running={isRunning}
                                hasUnread={hasUnreadNotification}
                                updatedTime={updatedTime}
                                menuOpen={isSessionMenuOpen}
                                tagLabel="会话"
                                tagStatus={entry.status}
                                menuRef={menuRef}
                                menuAnchorRect={isSessionMenuOpen ? openMenu?.anchorRect : null}
                                menuActions={[
                                  {
                                    label: isPinned ? '取消置顶' : '置顶会话',
                                    icon: <PinIcon size={12} />,
                                    onClick: () => {
                                      handleToggleSessionPin(project.path, session)
                                    },
                                  },
                                  {
                                    label: '重命名',
                                    icon: <PencilIcon size={12} />,
                                    onClick: () => {
                                      handleRequestRenameSession(project.path, session)
                                    },
                                  },
                                  {
                                    label: '归档',
                                    icon: <ClockIcon size={12} />,
                                    onClick: () => {
                                      void handleArchiveSession(project.path, session)
                                    },
                                  },
                                  {
                                    label: '复制工作目录',
                                    icon: <CopyIcon size={12} />,
                                    onClick: () => {
                                      void handleCopySessionDirectory(session)
                                    },
                                  },
                                  {
                                    label: '移除会话',
                                    icon: <TrashIcon size={12} />,
                                    danger: true,
                                    onClick: () => {
                                      handleRequestDeleteSession(project.path, session)
                                    },
                                  },
                                ]}
                                onSelect={() => handleSelect(session)}
                                onTogglePin={() => handleToggleSessionPin(project.path, session)}
                                onToggleMenu={!isMobile ? (anchorRect) => handleToggleSessionMenu(project.path, session.id, 'project', anchorRect) : undefined}
                                showMenuButton={!isMobile}
                              />
                            )
                          })
                        )}

                        {hasMore && (
                          <button
                            type="button"
                            onClick={() => handleLoadMore(project.path)}
                            className="ml-5 h-7 px-1.5 rounded-md text-[11px] text-text-500 hover:text-text-100 hover:bg-[var(--sidebar-hover-bg)] transition-colors"
                          >
                            加载更多
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {pointerDragActive && createPortal(
        <div
          ref={dragGhostContainerRef}
          aria-hidden="true"
          className="fixed left-0 top-0 z-[9999] pointer-events-none"
        />,
        document.body,
      )}

      <SidebarFooter
        showLabels={showLabels}
        connectionState={connectionState?.state || 'disconnected'}
        stats={stats}
        hasMessages={hasMessages}
        onOpenSettings={onOpenSettings}
        themeMode={themeMode}
        onThemeChange={onThemeChange}
        isWideMode={isWideMode}
        onToggleWideMode={onToggleWideMode}
      />

      <Dialog
        isOpen={sessionRenameState !== null}
        onClose={handleCloseRenameSessionDialog}
        title="重命名会话"
        width={420}
        showCloseButton={!isRenamingSession}
      >
        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault()
            void handleConfirmRenameSession()
          }}
        >
          <div className="space-y-1.5">
            <label htmlFor="session-rename-input" className="block text-[11px] font-medium text-text-300">
              新名称
            </label>
            <input
              id="session-rename-input"
              ref={renameInputRef}
              type="text"
              value={sessionRenameInput}
              onChange={(event) => setSessionRenameInput(event.target.value)}
              maxLength={120}
              className="w-full h-9 px-3 rounded-lg bg-bg-000 border border-border-200/70 text-sm text-text-100 placeholder:text-text-500 focus:outline-none focus:ring-1 focus:ring-accent-main-100/40 focus:border-accent-main-100/60"
              placeholder="输入会话名称"
              disabled={isRenamingSession}
            />
          </div>

          <div className="flex items-center justify-end gap-2">
            <Button
              type="button"
              variant="secondary"
              onClick={handleCloseRenameSessionDialog}
              disabled={isRenamingSession}
            >
              取消
            </Button>
            <Button
              type="submit"
              isLoading={isRenamingSession}
              disabled={!sessionRenameInput.trim()}
            >
              保存
            </Button>
          </div>
        </form>
      </Dialog>

      <ConfirmDialog
        isOpen={projectDeleteConfirm !== null}
        onClose={() => setProjectDeleteConfirm(null)}
        onConfirm={() => {
          if (projectDeleteConfirm) {
            handleRemoveProject(projectDeleteConfirm)
          }
        }}
        title="隐藏项目"
        description="确认要隐藏该项目吗？刷新后仍会保持隐藏；当你再次打开该项目时会自动恢复显示。不会删除磁盘文件。"
        confirmText="隐藏"
        variant="danger"
      />

      <ConfirmDialog
        isOpen={sessionDeleteConfirm !== null}
        onClose={() => setSessionDeleteConfirm(null)}
        onConfirm={() => {
          if (sessionDeleteConfirm) {
            void handleDeleteSession(sessionDeleteConfirm.projectPath, sessionDeleteConfirm.session)
          }
        }}
        title="移除会话"
        description="确认要移除这个会话吗？该操作不可撤销。"
        confirmText="移除"
        variant="danger"
      />

      <ConfirmDialog
        isOpen={itemDeleteConfirm !== null}
        onClose={() => setItemDeleteConfirm(null)}
        onConfirm={() => {
          if (itemDeleteConfirm) {
            void deleteItem(itemDeleteConfirm.projectId, itemDeleteConfirm.itemId).then(() => setItemDeleteConfirm(null))
          }
        }}
        title="删除事项"
        description={itemDeleteConfirm ? `确认删除事项「${itemDeleteConfirm.title || '未命名事项'}」吗？` : undefined}
        confirmText="删除"
        cancelText="取消"
        variant="danger"
      />
    </div>
  )
}
