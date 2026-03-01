import { useCallback, useEffect, useMemo, useState } from 'react'
import { getSessions, type ApiSession } from '../../../api'
import {
  ChevronDownIcon,
  FolderIcon,
  FolderOpenIcon,
  PlusIcon,
  SidebarIcon,
  SpinnerIcon,
} from '../../../components/Icons'
import { useDirectory } from '../../../hooks'
import { formatRelativeTime } from '../../../utils/dateUtils'
import { isSameDirectory } from '../../../utils'
import { SidePanel, type SidePanelProps } from './SidePanel'

const DEFAULT_VISIBLE_COUNT = 3

interface ProjectNode {
  path: string
  name: string
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
  } = props

  const {
    currentDirectory,
    savedDirectories,
    setCurrentDirectory,
  } = useDirectory()

  const showLabels = isExpanded || isMobile

  // 收起到 rail 时先复用旧实现，避免重复维护收起态细节
  if (!showLabels) {
    return <SidePanel {...props} />
  }

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
    } catch {
      setSessionsByProject((prev) => ({ ...prev, [projectPath]: [] }))
      setHasMoreByProject((prev) => ({ ...prev, [projectPath]: false }))
      setLoadedLimitByProject((prev) => ({ ...prev, [projectPath]: limit }))
    } finally {
      setLoadingByProject((prev) => ({ ...prev, [projectPath]: false }))
    }
  }, [])

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

  const handleProjectRowClick = useCallback((projectPath: string) => {
    setCurrentDirectory(projectPath)
    setExpandedProjects((prev) => ({
      ...prev,
      [projectPath]: !prev[projectPath],
    }))
  }, [setCurrentDirectory])

  const handleSelect = useCallback((session: ApiSession) => {
    onSelectSession(session)
    if (window.innerWidth < 768 && onCloseMobile) {
      onCloseMobile()
    }
  }, [onSelectSession, onCloseMobile])

  const handleLoadMore = useCallback((projectPath: string) => {
    setVisibleCountByProject((prev) => ({
      ...prev,
      [projectPath]: (prev[projectPath] ?? DEFAULT_VISIBLE_COUNT) + DEFAULT_VISIBLE_COUNT,
    }))
  }, [])

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

      <div className="mx-2 mb-1 shrink-0">
        <button
          onClick={onNewSession}
          className="h-8 w-full flex items-center rounded-lg text-text-300 hover:text-text-100 hover:bg-bg-200 active:scale-[0.98] transition-all duration-300 group overflow-hidden px-1.5"
          title="New chat"
        >
          <span className="size-5 flex items-center justify-center shrink-0">
            <PlusIcon size={16} />
          </span>
          <span className="ml-1.5 text-xs whitespace-nowrap">New chat</span>
        </button>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar px-1.5 pb-3">
        <div className="flex items-center justify-between px-1.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-text-400/80">
          <span>线程</span>
        </div>

        {projects.length === 0 ? (
          <div className="px-2 py-8 text-[11px] text-text-400/70">
            正在初始化项目...
          </div>
        ) : (
          <div className="space-y-1">
            {projects.map((project) => {
              const isCurrentProject = currentDirectory
                ? isSameDirectory(currentDirectory, project.path)
                : false
              const isExpandedProject = expandedProjects[project.path] ?? false
              const sessions = sessionsByProject[project.path] ?? []
              const isLoading = loadingByProject[project.path] ?? false
              const hasMore = hasMoreByProject[project.path] ?? false

              return (
                <div key={project.path} className="rounded-lg">
                  <button
                    type="button"
                    onClick={() => handleProjectRowClick(project.path)}
                    title={project.path}
                    aria-expanded={isExpandedProject}
                    className={`group/project w-full h-7 flex items-center gap-1.5 rounded-lg px-1.5 text-left transition-colors ${
                      isCurrentProject
                        ? 'bg-bg-200/70 text-text-100'
                        : 'text-text-300 hover:text-text-100 hover:bg-bg-200/50'
                    }`}
                  >
                    <span className="relative size-4 shrink-0 text-text-400">
                      <span className="absolute inset-0 flex items-center justify-center transition-opacity duration-150 group-hover/project:opacity-0 group-focus-visible/project:opacity-0">
                        {isExpandedProject ? (
                          <FolderOpenIcon size={15} className="shrink-0" />
                        ) : (
                          <FolderIcon size={15} className="shrink-0" />
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
                  </button>

                  {isExpandedProject && (
                    <div className="ml-5 mt-1 space-y-0.5">
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

                          return (
                            <button
                              key={session.id}
                              type="button"
                              onClick={() => handleSelect(session)}
                              className={`w-full h-6 px-1.5 rounded-lg flex items-center gap-1.5 text-left transition-colors ${
                                isSelected
                                  ? 'bg-bg-200/80 text-text-100'
                                  : 'text-text-200 hover:text-text-100 hover:bg-bg-200/40'
                              }`}
                              title={session.title || 'Untitled Chat'}
                            >
                              <span className="truncate text-[12px] leading-none flex-1 min-w-0">
                                {session.title || 'Untitled Chat'}
                              </span>
                              <span className="text-[9px] text-text-400/90 shrink-0">
                                {formatRelativeTime(updatedTime)}
                              </span>
                            </button>
                          )
                        })
                      )}

                      {hasMore && (
                        <button
                          type="button"
                          onClick={() => handleLoadMore(project.path)}
                          className="h-6 px-1.5 rounded-lg text-[11px] text-text-400 hover:text-text-100 hover:bg-bg-200/40 transition-colors"
                        >
                          加载更多
                        </button>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
