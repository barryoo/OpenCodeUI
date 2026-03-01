import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent, type ReactNode, type RefObject } from 'react'
import {
  deleteSession as deleteSessionApi,
  getSession,
  getSessions,
  subscribeToConnectionState,
  subscribeToEvents,
  type ApiSession,
  type ConnectionInfo,
  updateSession,
} from '../../../api'
import {
  ChevronDownIcon,
  ClockIcon,
  ComposeIcon,
  CopyIcon,
  FolderIcon,
  FolderOpenIcon,
  MoreHorizontalIcon,
  PencilIcon,
  PinIcon,
  SidebarIcon,
  SpinnerIcon,
  TrashIcon,
} from '../../../components/Icons'
import { ConfirmDialog } from '../../../components/ui/ConfirmDialog'
import { useDirectory, useSessionStats } from '../../../hooks'
import { useMessageStore } from '../../../store'
import { useBusySessions } from '../../../store/activeSessionStore'
import { notificationStore, useNotifications } from '../../../store/notificationStore'
import { formatRelativeTime } from '../../../utils/dateUtils'
import { isSameDirectory, serverStorage } from '../../../utils'
import { serverStore } from '../../../store/serverStore'
import { SidePanel, SidebarFooter, type SidePanelProps } from './SidePanel'

const DEFAULT_VISIBLE_COUNT = 3
const PINNED_SESSIONS_STORAGE_KEY = 'opencode-pinned-sessions'

interface ProjectNode {
  path: string
  name: string
}

interface PinnedSessionEntry {
  sessionId: string
  title: string
  directory: string
  projectPath: string
  updatedAt: number
  pinnedAt: number
}

type OpenMenuState =
  | { type: 'project'; projectPath: string }
  | { type: 'session'; projectPath: string; sessionId: string }
  | null

interface ActionMenuProps {
  menuRef?: RefObject<HTMLDivElement | null>
  children: ReactNode
}

function ActionMenu({ menuRef, children }: ActionMenuProps) {
  return (
    <div
      ref={menuRef}
      className="absolute right-0 top-full mt-1 w-40 rounded-lg border border-border-200/60 bg-bg-000 shadow-xl z-30 p-1"
    >
      {children}
    </div>
  )
}

interface ActionMenuItemProps {
  label: string
  icon: ReactNode
  danger?: boolean
  onClick: () => void
}

function ActionMenuItem({ label, icon, danger = false, onClick }: ActionMenuItemProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full h-7 px-2 rounded-md flex items-center gap-2 text-[11px] transition-colors ${
        danger
          ? 'text-danger-100 hover:bg-danger-100/10'
          : 'text-text-200 hover:text-text-100 hover:bg-bg-200/70'
      }`}
    >
      <span className="text-text-400">{icon}</span>
      <span>{label}</span>
    </button>
  )
}

function RunningIndicator() {
  const delays = [0, 140, 280]

  return (
    <span className="inline-flex items-center gap-[2px]">
      {delays.map((delay) => (
        <span
          key={delay}
          className="h-1 w-1 rounded-full bg-accent-main-100 animate-pulse"
          style={{ animationDelay: `${delay}ms` }}
        />
      ))}
    </span>
  )
}

export function MultiProjectSidePanel(props: SidePanelProps) {
  const {
    onNewSession,
    onSelectSession,
    onCloseMobile,
    selectedSessionId,
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
  } = useDirectory()

  const showLabels = isExpanded || isMobile

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
      }))
  }, [savedDirectories])

  const [expandedProjects, setExpandedProjects] = useState<Record<string, boolean>>({})
  const [visibleCountByProject, setVisibleCountByProject] = useState<Record<string, number>>({})
  const [sessionsByProject, setSessionsByProject] = useState<Record<string, ApiSession[]>>({})
  const [loadingByProject, setLoadingByProject] = useState<Record<string, boolean>>({})
  const [hasMoreByProject, setHasMoreByProject] = useState<Record<string, boolean>>({})
  const [loadedLimitByProject, setLoadedLimitByProject] = useState<Record<string, number>>({})
  const [openMenu, setOpenMenu] = useState<OpenMenuState>(null)
  const [draggingProjectPath, setDraggingProjectPath] = useState<string | null>(null)
  const [dropTargetProjectPath, setDropTargetProjectPath] = useState<string | null>(null)
  const [projectDeleteConfirm, setProjectDeleteConfirm] = useState<string | null>(null)
  const [sessionDeleteConfirm, setSessionDeleteConfirm] = useState<{ projectPath: string; session: ApiSession } | null>(null)
  const menuRef = useRef<HTMLDivElement | null>(null)

  const loadedSessionById = useMemo(() => {
    const map = new Map<string, ApiSession>()
    for (const list of Object.values(sessionsByProject)) {
      for (const session of list) {
        map.set(session.id, session)
      }
    }
    return map
  }, [sessionsByProject])

  const projectNameByPath = useMemo(() => {
    const map = new Map<string, string>()
    for (const project of projects) {
      map.set(project.path, project.name)
    }
    return map
  }, [projects])

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

    const rowHeight = 24
    const rowGap = 2
    return pinnedSessionsForDisplay.length * rowHeight + Math.max(0, pinnedSessionsForDisplay.length - 1) * rowGap
  }, [pinnedSessionsForDisplay.length])

  useEffect(() => {
    return subscribeToConnectionState(setConnectionState)
  }, [])

  useEffect(() => {
    serverStorage.setJSON(PINNED_SESSIONS_STORAGE_KEY, pinnedSessions)
  }, [pinnedSessions])

  useEffect(() => {
    return serverStore.onServerChange(() => {
      const saved = serverStorage.getJSON<PinnedSessionEntry[]>(PINNED_SESSIONS_STORAGE_KEY)
      setPinnedSessions(Array.isArray(saved) ? saved.filter((item) => !!item?.sessionId && !!item?.directory) : [])
    })
  }, [])

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
    setExpandedProjects((prev) => {
      const next: Record<string, boolean> = {}

      for (let i = 0; i < projects.length; i += 1) {
        const project = projects[i]
        const existing = prev[project.path]

        if (existing !== undefined) {
          next[project.path] = existing
          continue
        }

        if (currentDirectory) {
          next[project.path] = isSameDirectory(currentDirectory, project.path)
        } else {
          next[project.path] = i === 0
        }
      }

      return next
    })

    setVisibleCountByProject((prev) => {
      const next: Record<string, number> = {}
      for (const project of projects) {
        next[project.path] = prev[project.path] ?? DEFAULT_VISIBLE_COUNT
      }
      return next
    })
  }, [projects, currentDirectory])

  useEffect(() => {
    if (!currentDirectory) return

    const matched = projects.find((project) => isSameDirectory(project.path, currentDirectory))
    if (!matched) return

    setExpandedProjects((prev) => {
      if (prev[matched.path]) return prev
      return { ...prev, [matched.path]: true }
    })
  }, [currentDirectory, projects])

  const loadProjectSessions = useCallback(async (projectPath: string, limit: number) => {
    setLoadingByProject((prev) => ({ ...prev, [projectPath]: true }))

    try {
      const data = await getSessions({
        roots: true,
        directory: projectPath,
        limit,
      })

      setSessionsByProject((prev) => ({ ...prev, [projectPath]: data }))
      setHasMoreByProject((prev) => ({ ...prev, [projectPath]: data.length >= limit }))
      setLoadedLimitByProject((prev) => ({ ...prev, [projectPath]: limit }))
      syncPinnedEntriesWithSessions(projectPath, data)
    } catch {
      setSessionsByProject((prev) => ({ ...prev, [projectPath]: [] }))
      setHasMoreByProject((prev) => ({ ...prev, [projectPath]: false }))
      setLoadedLimitByProject((prev) => ({ ...prev, [projectPath]: limit }))
    } finally {
      setLoadingByProject((prev) => ({ ...prev, [projectPath]: false }))
    }
  }, [syncPinnedEntriesWithSessions])

  useEffect(() => {
    for (const project of projects) {
      if (!expandedProjects[project.path]) continue

      const targetLimit = visibleCountByProject[project.path] ?? DEFAULT_VISIBLE_COUNT
      const loadedLimit = loadedLimitByProject[project.path] ?? 0

      if (loadedLimit >= targetLimit) continue
      if (loadingByProject[project.path]) continue

      void loadProjectSessions(project.path, targetLimit)
    }
  }, [
    projects,
    expandedProjects,
    visibleCountByProject,
    loadedLimitByProject,
    loadingByProject,
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
            [matchPath]: [session, ...currentList],
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
            [matchPath]: nextList,
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
      },
    })

    return unsubscribe
  }, [projects, expandedProjects, loadedLimitByProject, visibleCountByProject, loadProjectSessions])

  useEffect(() => {
    if (!selectedSessionId || !currentDirectory) return

    const projectPath = projects.find((project) => isSameDirectory(project.path, currentDirectory))?.path
    if (!projectPath) return

    const currentList = sessionsByProject[projectPath] ?? []
    if (currentList.some((session) => session.id === selectedSessionId)) return

    if (loadingByProject[projectPath]) return

    const currentLimit = Math.max(
      loadedLimitByProject[projectPath] ?? 0,
      visibleCountByProject[projectPath] ?? DEFAULT_VISIBLE_COUNT
    )
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
    setOpenMenu(null)
    setExpandedProjects((prev) => ({
      ...prev,
      [projectPath]: !prev[projectPath],
    }))
  }, [])

  const handleCreateSessionInProject = useCallback((projectPath: string) => {
    setOpenMenu(null)
    setCurrentDirectory(projectPath)
    setExpandedProjects((prev) => ({
      ...prev,
      [projectPath]: true,
    }))

    onNewSession()
    if (window.innerWidth < 768 && onCloseMobile) {
      onCloseMobile()
    }
  }, [onCloseMobile, onNewSession, setCurrentDirectory])

  const handleToggleProjectMenu = useCallback((projectPath: string) => {
    setOpenMenu((prev) => {
      if (prev?.type === 'project' && prev.projectPath === projectPath) {
        return null
      }
      return { type: 'project', projectPath }
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

  const handleToggleSessionMenu = useCallback((projectPath: string, sessionId: string) => {
    setOpenMenu((prev) => {
      if (prev?.type === 'session' && prev.projectPath === projectPath && prev.sessionId === sessionId) {
        return null
      }
      return { type: 'session', projectPath, sessionId }
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

  const handleRenameSession = useCallback(async (projectPath: string, session: ApiSession) => {
    const currentTitle = session.title || ''
    const nextTitle = window.prompt('重命名会话', currentTitle)
    if (nextTitle === null) return

    const trimmed = nextTitle.trim()
    if (!trimmed || trimmed === currentTitle) {
      setOpenMenu(null)
      return
    }

    try {
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
    } catch {
      // ignore rename errors, keep list state untouched
    } finally {
      setOpenMenu(null)
    }
  }, [])

  const handleArchiveSession = useCallback(async (projectPath: string, session: ApiSession) => {
    try {
      await updateSession(session.id, { time: { archived: Date.now() } }, projectPath)
      setSessionsByProject((prev) => ({
        ...prev,
        [projectPath]: (prev[projectPath] ?? []).filter((item) => item.id !== session.id),
      }))
      setPinnedSessions((prev) => prev.filter((entry) => entry.sessionId !== session.id))
      reloadProjectSessions(projectPath)
    } catch {
      // ignore archive errors, keep list state untouched
    } finally {
      setOpenMenu(null)
    }
  }, [reloadProjectSessions])

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
      if (selectedSessionId === session.id) {
        onNewSession()
      }
    } catch {
      // ignore delete errors, keep list state untouched
    } finally {
      setSessionDeleteConfirm(null)
    }
  }, [onNewSession, selectedSessionId])

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
    if (isMobile) return

    setDraggingProjectPath(projectPath)
    event.dataTransfer.effectAllowed = 'move'
    event.dataTransfer.setData('text/plain', projectPath)
  }, [isMobile])

  const handleProjectDragOver = useCallback((projectPath: string, event: DragEvent<HTMLDivElement>) => {
    if (isMobile || !draggingProjectPath || draggingProjectPath === projectPath) return

    event.preventDefault()
    event.dataTransfer.dropEffect = 'move'
    setDropTargetProjectPath(projectPath)
  }, [draggingProjectPath, isMobile])

  const handleProjectDragLeave = useCallback((projectPath: string) => {
    setDropTargetProjectPath((prev) => (prev === projectPath ? null : prev))
  }, [])

  const handleProjectDrop = useCallback((projectPath: string, event: DragEvent<HTMLDivElement>) => {
    if (isMobile || !draggingProjectPath || draggingProjectPath === projectPath) return

    event.preventDefault()
    reorderDirectory(draggingProjectPath, projectPath)
    setDropTargetProjectPath(null)
    setDraggingProjectPath(null)
  }, [draggingProjectPath, isMobile, reorderDirectory])

  const handleProjectDragEnd = useCallback(() => {
    setDraggingProjectPath(null)
    setDropTargetProjectPath(null)
  }, [])

  const markSessionNotificationsRead = useCallback((sessionId: string) => {
    const unreadIds = unreadNotificationIdsBySession.get(sessionId)
    if (!unreadIds || unreadIds.length === 0) return

    for (const notificationId of unreadIds) {
      notificationStore.markRead(notificationId)
    }
  }, [unreadNotificationIdsBySession])

  useEffect(() => {
    if (!selectedSessionId) return
    markSessionNotificationsRead(selectedSessionId)
  }, [selectedSessionId, markSessionNotificationsRead])

  const handleSelectPinnedSession = useCallback(async (entry: PinnedSessionEntry) => {
    setOpenMenu(null)

    const targetProjectPath = entry.projectPath || entry.directory
    if (targetProjectPath) {
      setCurrentDirectory(targetProjectPath)
      setExpandedProjects((prev) => ({
        ...prev,
        [targetProjectPath]: true,
      }))
    }

    let targetSession = loadedSessionById.get(entry.sessionId)

    if (!targetSession) {
      try {
        targetSession = await getSession(entry.sessionId, entry.directory || targetProjectPath)
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
  }, [loadedSessionById, markSessionNotificationsRead, onCloseMobile, onSelectSession, setCurrentDirectory])

  const handleSelect = useCallback((session: ApiSession) => {
    setOpenMenu(null)
    markSessionNotificationsRead(session.id)
    onSelectSession(session)
    if (window.innerWidth < 768 && onCloseMobile) {
      onCloseMobile()
    }
  }, [onSelectSession, onCloseMobile, markSessionNotificationsRead])

  const handleLoadMore = useCallback((projectPath: string) => {
    setVisibleCountByProject((prev) => ({
      ...prev,
      [projectPath]: (prev[projectPath] ?? DEFAULT_VISIBLE_COUNT) + DEFAULT_VISIBLE_COUNT,
    }))
  }, [])

  // 收起到 rail 时复用旧实现，避免重复维护收起态细节
  if (!showLabels) {
    return <SidePanel {...props} />
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="h-14 shrink-0 flex items-center">
        <div className="pl-3 overflow-hidden transition-all duration-300 ease-out">
          <a href="/" className="flex items-center whitespace-nowrap">
            <span className="text-base font-semibold text-text-100 tracking-tight">OpenCode</span>
          </a>
        </div>

        <div className="flex-1 flex items-center justify-end pr-2 transition-all duration-300 ease-out">
          <button
            onClick={onToggleSidebar}
            aria-label={isExpanded ? 'Collapse sidebar' : 'Expand sidebar'}
            className="h-8 w-8 flex items-center justify-center rounded-lg text-text-400 hover:text-text-100 hover:bg-bg-200 active:scale-[0.98] transition-all duration-200"
          >
            <SidebarIcon size={18} />
          </button>
        </div>
      </div>

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
                  openMenu.projectPath === pinnedProjectPath &&
                  openMenu.sessionId === entry.sessionId
                const showSessionActions = isMobile || isSessionMenuOpen
                const sessionForPinnedAction = entry.session ?? {
                  id: entry.sessionId,
                  title: entry.title,
                  directory: entry.directory,
                  projectID: '',
                  time: { created: entry.updatedAt, updated: entry.updatedAt },
                } as ApiSession

                return (
                  <div key={entry.sessionId} className="group/pinned relative">
                    <button
                      type="button"
                      onClick={() => {
                        void handleSelectPinnedSession(entry)
                      }}
                      className={`w-full h-6 px-1.5 pr-7 rounded-md flex items-center gap-1.5 text-left transition-colors ${
                        isSelected
                          ? 'bg-bg-200/80 text-text-100'
                          : 'text-text-200 hover:text-text-100 hover:bg-bg-200/40'
                      }`}
                      title={entry.title}
                    >
                      <span className="relative h-4 w-4 shrink-0">
                        <span
                          className={`absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 h-1.5 w-1.5 rounded-full transition-opacity ${
                            hasUnreadNotification
                              ? 'bg-accent-main-100 opacity-100'
                              : 'bg-transparent opacity-0'
                          } group-hover/pinned:opacity-0 group-focus-within/pinned:opacity-0`}
                        />
                        <span
                          role="button"
                          tabIndex={-1}
                          onMouseDown={(event) => event.preventDefault()}
                          onClick={(event) => {
                            event.stopPropagation()
                            handleToggleSessionPin(pinnedProjectPath, sessionForPinnedAction)
                          }}
                          className="absolute inset-0 rounded flex items-center justify-center text-accent-main-100 opacity-0 transition-opacity duration-150 group-hover/pinned:opacity-100 group-focus-within/pinned:opacity-100"
                          title="取消置顶"
                        >
                          <PinIcon size={11} />
                        </span>
                      </span>

                      <span className="truncate text-[12px] leading-none flex-1 min-w-0">
                        {entry.title || 'Untitled Chat'}
                      </span>

                      <span className="text-[9px] text-text-400/90 shrink-0">
                        {formatRelativeTime(entry.updatedAt)}
                      </span>
                    </button>

                    <div className="absolute right-1 top-1/2 -translate-y-1/2 h-5 w-5">
                      {!isMobile && isRunning && !isSessionMenuOpen && (
                        <span className="absolute inset-0 flex items-center justify-center transition-opacity duration-150 opacity-100 group-hover/pinned:opacity-0 group-focus-within/pinned:opacity-0">
                          <RunningIndicator />
                        </span>
                      )}

                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation()
                          handleToggleSessionMenu(pinnedProjectPath, entry.sessionId)
                        }}
                        className={`absolute inset-0 rounded-md flex items-center justify-center text-text-400 hover:text-text-100 hover:bg-bg-200/80 transition-colors ${
                          showSessionActions
                            ? 'opacity-100 pointer-events-auto'
                            : 'opacity-0 pointer-events-none group-hover/pinned:opacity-100 group-hover/pinned:pointer-events-auto group-focus-within/pinned:opacity-100 group-focus-within/pinned:pointer-events-auto'
                        }`}
                        title="会话菜单"
                      >
                        <MoreHorizontalIcon size={12} />
                      </button>
                    </div>

                    {isSessionMenuOpen && (
                      <ActionMenu menuRef={menuRef}>
                        <ActionMenuItem
                          label="取消置顶"
                          icon={<PinIcon size={12} />}
                          onClick={() => {
                            handleToggleSessionPin(pinnedProjectPath, sessionForPinnedAction)
                          }}
                        />
                        <ActionMenuItem
                          label="重命名"
                          icon={<PencilIcon size={12} />}
                          onClick={() => {
                            void handleRenameSession(pinnedProjectPath, sessionForPinnedAction)
                          }}
                        />
                        <ActionMenuItem
                          label="归档"
                          icon={<ClockIcon size={12} />}
                          onClick={() => {
                            void handleArchiveSession(pinnedProjectPath, sessionForPinnedAction)
                          }}
                        />
                        <ActionMenuItem
                          label="复制工作目录"
                          icon={<CopyIcon size={12} />}
                          onClick={() => {
                            void handleCopySessionDirectory(sessionForPinnedAction)
                          }}
                        />
                        <ActionMenuItem
                          label="移除会话"
                          icon={<TrashIcon size={12} />}
                          danger
                          onClick={() => {
                            handleRequestDeleteSession(pinnedProjectPath, sessionForPinnedAction)
                          }}
                        />
                      </ActionMenu>
                    )}
                  </div>
                )
              })}
          </div>
        </div>

        <div className="flex items-center justify-between px-1.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-text-400/80">
          <span>线程</span>
        </div>

        {projects.length === 0 ? (
          <div className="px-2 py-8 text-[11px] text-text-400/70">
            正在初始化项目...
          </div>
        ) : (
          <div className="space-y-0">
            {projects.map((project) => {
              const isCurrentProject = currentDirectory
                ? isSameDirectory(currentDirectory, project.path)
                : false
              const isExpandedProject = expandedProjects[project.path] ?? false
              const sessions = sessionsByProject[project.path] ?? []
              const isLoading = loadingByProject[project.path] ?? false
              const hasMore = hasMoreByProject[project.path] ?? false
              const isProjectMenuOpen = openMenu?.type === 'project' && openMenu.projectPath === project.path
              const showProjectActions = isMobile || isProjectMenuOpen
              const isDropTarget =
                draggingProjectPath !== null &&
                draggingProjectPath !== project.path &&
                dropTargetProjectPath === project.path

              return (
                <div
                  key={project.path}
                  draggable={!isMobile}
                  onDragStart={(event) => handleProjectDragStart(project.path, event)}
                  onDragOver={(event) => handleProjectDragOver(project.path, event)}
                  onDragLeave={() => handleProjectDragLeave(project.path)}
                  onDrop={(event) => handleProjectDrop(project.path, event)}
                  onDragEnd={handleProjectDragEnd}
                  className="rounded-md"
                >
                  <div
                    className={`group/project relative h-8 flex items-center rounded-md transition-colors ${
                      isCurrentProject
                        ? 'bg-bg-200/70 text-text-100'
                        : 'text-text-300 hover:text-text-100 hover:bg-bg-200/50'
                    } ${isDropTarget ? 'ring-1 ring-accent-main-100/60' : ''} ${
                      draggingProjectPath === project.path ? 'opacity-70' : ''
                    }`}
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
                          handleToggleProjectMenu(project.path)
                        }}
                        className="h-5 w-5 rounded-md flex items-center justify-center text-text-400 hover:text-text-100 hover:bg-bg-200/80 transition-colors"
                        title="项目菜单"
                      >
                        <MoreHorizontalIcon size={12} />
                      </button>

                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation()
                          handleCreateSessionInProject(project.path)
                        }}
                        className="h-5 w-5 rounded-md flex items-center justify-center text-text-400 hover:text-text-100 hover:bg-bg-200/80 transition-colors"
                        title="在此项目中创建会话"
                      >
                        <ComposeIcon size={12} />
                      </button>
                    </div>

                    {isProjectMenuOpen && (
                      <ActionMenu menuRef={menuRef}>
                        <ActionMenuItem
                          label="移除项目"
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
                        {isLoading && sessions.length === 0 ? (
                          <div className="h-6 flex items-center text-text-400 text-[11px]">
                            <SpinnerIcon size={12} className="animate-spin mr-2" />
                            加载中...
                          </div>
                        ) : sessions.length === 0 ? (
                          <div className="h-6 flex items-center text-[11px] text-text-500">
                            暂无会话
                          </div>
                        ) : (
                          sessions.map((session) => {
                            const updatedTime = session.time.updated ?? session.time.created
                            const isSelected = session.id === selectedSessionId
                            const isPinned = pinnedSessionIds.has(session.id)
                            const isRunning = busySessionIds.has(session.id)
                            const hasUnreadNotification =
                              !isSelected &&
                              (unreadNotificationIdsBySession.get(session.id)?.length ?? 0) > 0
                            const isSessionMenuOpen =
                              openMenu?.type === 'session' &&
                              openMenu.projectPath === project.path &&
                              openMenu.sessionId === session.id
                            const showSessionActions = isMobile || isSessionMenuOpen

                            return (
                              <div key={session.id} className="group/session relative">
                                <button
                                  type="button"
                                  onClick={() => handleSelect(session)}
                                  className={`w-full h-6 px-1.5 pr-7 rounded-md flex items-center gap-1.5 text-left transition-colors ${
                                    isSelected
                                      ? 'bg-bg-200/80 text-text-100'
                                      : 'text-text-200 hover:text-text-100 hover:bg-bg-200/40'
                                  }`}
                                  title={session.title || 'Untitled Chat'}
                                >
                                  <span className="relative h-4 w-4 shrink-0">
                                    <span
                                      className={`absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 h-1.5 w-1.5 rounded-full transition-opacity ${
                                        hasUnreadNotification
                                          ? 'bg-accent-main-100 opacity-100'
                                          : 'bg-transparent opacity-0'
                                      } group-hover/session:opacity-0 group-focus-within/session:opacity-0`}
                                    />
                                    <span
                                      role="button"
                                      tabIndex={-1}
                                      onMouseDown={(event) => event.preventDefault()}
                                      onClick={(event) => {
                                        event.stopPropagation()
                                        handleToggleSessionPin(project.path, session)
                                      }}
                                      className={`absolute inset-0 rounded flex items-center justify-center transition-all duration-150 ${
                                        isPinned
                                          ? 'text-accent-main-100 opacity-0 group-hover/session:opacity-100 group-focus-within/session:opacity-100'
                                          : 'text-text-400 opacity-0 group-hover/session:opacity-100 group-focus-within/session:opacity-100 hover:text-text-100'
                                      }`}
                                      title={isPinned ? '取消置顶' : '置顶会话'}
                                    >
                                      <PinIcon size={11} />
                                    </span>
                                  </span>
                                  <span className="truncate text-[12px] leading-none flex-1 min-w-0">
                                    {session.title || 'Untitled Chat'}
                                  </span>
                                  <span className="text-[9px] text-text-400/90 shrink-0">
                                    {formatRelativeTime(updatedTime)}
                                  </span>
                                </button>

                                <div className="absolute right-1 top-1/2 -translate-y-1/2 h-5 w-5">
                                  {!isMobile && isRunning && !isSessionMenuOpen && (
                                    <span className="absolute inset-0 flex items-center justify-center transition-opacity duration-150 opacity-100 group-hover/session:opacity-0 group-focus-within/session:opacity-0">
                                      <RunningIndicator />
                                    </span>
                                  )}

                                  <button
                                    type="button"
                                    onClick={(event) => {
                                      event.stopPropagation()
                                      handleToggleSessionMenu(project.path, session.id)
                                    }}
                                    className={`absolute inset-0 rounded-md flex items-center justify-center text-text-400 hover:text-text-100 hover:bg-bg-200/80 transition-colors ${
                                      showSessionActions
                                        ? 'opacity-100 pointer-events-auto'
                                        : 'opacity-0 pointer-events-none group-hover/session:opacity-100 group-hover/session:pointer-events-auto group-focus-within/session:opacity-100 group-focus-within/session:pointer-events-auto'
                                    }`}
                                    title="会话菜单"
                                  >
                                    <MoreHorizontalIcon size={12} />
                                  </button>
                                </div>

                                {isSessionMenuOpen && (
                                  <ActionMenu menuRef={menuRef}>
                                    <ActionMenuItem
                                      label={isPinned ? '取消置顶' : '置顶会话'}
                                      icon={<PinIcon size={12} />}
                                      onClick={() => {
                                        handleToggleSessionPin(project.path, session)
                                      }}
                                    />
                                    <ActionMenuItem
                                      label="重命名"
                                      icon={<PencilIcon size={12} />}
                                      onClick={() => {
                                        void handleRenameSession(project.path, session)
                                      }}
                                    />
                                    <ActionMenuItem
                                      label="归档"
                                      icon={<ClockIcon size={12} />}
                                      onClick={() => {
                                        void handleArchiveSession(project.path, session)
                                      }}
                                    />
                                    <ActionMenuItem
                                      label="复制工作目录"
                                      icon={<CopyIcon size={12} />}
                                      onClick={() => {
                                        void handleCopySessionDirectory(session)
                                      }}
                                    />
                                    <ActionMenuItem
                                      label="移除会话"
                                      icon={<TrashIcon size={12} />}
                                      danger
                                      onClick={() => {
                                        handleRequestDeleteSession(project.path, session)
                                      }}
                                    />
                                  </ActionMenu>
                                )}
                              </div>
                            )
                          })
                        )}

                        {hasMore && (
                          <button
                            type="button"
                            onClick={() => handleLoadMore(project.path)}
                            className="ml-5 h-6 px-1.5 rounded-md text-[11px] text-text-400 hover:text-text-100 hover:bg-bg-200/40 transition-colors"
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

      <ConfirmDialog
        isOpen={projectDeleteConfirm !== null}
        onClose={() => setProjectDeleteConfirm(null)}
        onConfirm={() => {
          if (projectDeleteConfirm) {
            handleRemoveProject(projectDeleteConfirm)
          }
        }}
        title="移除项目"
        description="确认要从列表中移除该项目吗？不会删除磁盘文件。"
        confirmText="移除"
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
    </div>
  )
}
