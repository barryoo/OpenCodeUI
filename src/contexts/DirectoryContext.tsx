// ============================================
// DirectoryContext - 管理当前工作目录
// ============================================

import { createContext, useContext, useState, useCallback, useEffect, useMemo, useRef, type ReactNode } from 'react'
import { getPath, type ApiPath, getPendingPermissions, getPendingQuestions, getProjects, listDirectory } from '../api'
import { useRouter } from '../hooks/useRouter'
import { handleError, normalizeToForwardSlash, getDirectoryName, isSameDirectory, serverStorage } from '../utils'
import { layoutStore, useLayoutStore } from '../store/layoutStore'
import { activeSessionStore } from '../store/activeSessionStore'
import { serverStore } from '../store/serverStore'
import { isTauri } from '../utils/tauri'

export interface SavedDirectory {
  path: string
  name: string
  addedAt: number
  /** 项目是否展开（用于侧边栏状态恢复） */
  expanded?: boolean
}

export interface DirectoryContextValue {
  /** 当前工作目录（undefined 表示全部/不筛选） */
  currentDirectory: string | undefined
  /** 设置当前工作目录 */
  setCurrentDirectory: (directory: string | undefined) => void
  /** 保存的目录列表 */
  savedDirectories: SavedDirectory[]
  /** 设置目录展开状态 */
  setDirectoryExpanded: (path: string, expanded: boolean) => void
  /** 添加目录 */
  addDirectory: (path: string) => void
  /** 移除目录 */
  removeDirectory: (path: string) => void
  /** 调整目录顺序 */
  reorderDirectory: (sourcePath: string, targetPath: string) => void
  /** 服务端路径信息 */
  pathInfo: ApiPath | null
  /** 侧边栏是否展开（桌面端）- 从 layoutStore 读取 */
  sidebarExpanded: boolean
  /** 设置侧边栏展开状态 - 委托给 layoutStore */
  setSidebarExpanded: (expanded: boolean) => void
  /** 最近使用的项目时间戳 { [path]: lastUsedAt } */
  recentProjects: Record<string, number>
}

const DirectoryContext = createContext<DirectoryContextValue | null>(null)

const STORAGE_KEY_SAVED = 'opencode-saved-directories'
const STORAGE_KEY_RECENT = 'opencode-recent-projects'

// 最近使用记录: { [path]: lastUsedAt }
type RecentProjects = Record<string, number>

function normalizeDirectoryPath(path: string): string {
  let normalized = normalizeToForwardSlash(path)

  // normalizeToForwardSlash 会去掉尾斜杠，导致根路径 "/" -> "" 和 "C:/" -> "C:"
  // 需要修正：如果原始路径是根路径，恢复正确的值
  const trimmed = path.replace(/\\/g, '/').replace(/\/+$/, '/')
  if (!normalized && (trimmed === '/' || /^[a-zA-Z]:\/$/.test(trimmed))) {
    normalized = trimmed.slice(0, -1) || '/'
  }

  return normalized
}

function getDirectoryKey(path: string): string {
  return normalizeDirectoryPath(path).toLowerCase()
}

function pickDefaultProjectPath(projects: SavedDirectory[], recent: RecentProjects): string | undefined {
  if (projects.length === 0) return undefined

  let bestPath: string | undefined
  let bestTime = 0

  for (const project of projects) {
    const usedAt = recent[project.path] ?? 0
    if (usedAt > bestTime) {
      bestTime = usedAt
      bestPath = project.path
    }
  }

  return bestPath ?? projects[0].path
}

export function DirectoryProvider({ children }: { children: ReactNode }) {
  // 从 URL 获取 directory（替代 localStorage）
  const { directory: urlDirectory, setDirectory: setUrlDirectory } = useRouter()
  
  // 从 layoutStore 获取 sidebarExpanded
  const { sidebarExpanded } = useLayoutStore()
  
  const [savedDirectories, setSavedDirectories] = useState<SavedDirectory[]>(() => {
    return serverStorage.getJSON<SavedDirectory[]>(STORAGE_KEY_SAVED) ?? []
  })

  const [recentProjects, setRecentProjects] = useState<RecentProjects>(() => {
    return serverStorage.getJSON<RecentProjects>(STORAGE_KEY_RECENT) ?? {}
  })
  
  const [pathInfo, setPathInfo] = useState<ApiPath | null>(null)

  const syncProjectsFromApi = useCallback(async (
    targetCurrentDirectory: string | undefined,
    targetRecentProjects: RecentProjects
  ) => {
    try {
      const apiProjects = await getProjects()
      if (apiProjects.length === 0) return

      const now = Date.now()
      const fromApi: SavedDirectory[] = []

      for (const project of apiProjects) {
        const normalizedPath = normalizeDirectoryPath(project.worktree || '')
        if (!normalizedPath || normalizedPath === '.') continue

        if (fromApi.some((dir) => isSameDirectory(dir.path, normalizedPath))) continue

        fromApi.push({
          path: normalizedPath,
          name: project.name?.trim() || getDirectoryName(normalizedPath) || normalizedPath,
          addedAt: project.time?.created ?? now,
        })
      }

      if (fromApi.length === 0) return

      setSavedDirectories((prev) => {
        const apiByKey = new Map<string, SavedDirectory>()
        for (const item of fromApi) {
          apiByKey.set(getDirectoryKey(item.path), item)
        }

        const ordered: SavedDirectory[] = []
        for (const existing of prev) {
          const key = getDirectoryKey(existing.path)
          const fromServer = apiByKey.get(key)

          if (fromServer) {
            ordered.push({
              path: fromServer.path,
              name: fromServer.name || existing.name || fromServer.path,
              addedAt: existing.addedAt ?? fromServer.addedAt,
              expanded: existing.expanded,
            })
            apiByKey.delete(key)
          } else {
            // 保留本地额外目录，避免覆盖用户手动添加项
            ordered.push(existing)
          }
        }

        for (const newProject of apiByKey.values()) {
          ordered.push(newProject)
        }

        return ordered
      })

      // 无目录上下文时，自动选择默认项目（最近使用优先）
      if (!targetCurrentDirectory) {
        const defaultPath = pickDefaultProjectPath(fromApi, targetRecentProjects)
        if (defaultPath) {
          setCurrentDirectory(defaultPath)
        }
      }
    } catch {
      // 项目同步失败不阻断基础功能
    }
  }, [])

  // 服务器切换时，重新从 serverStorage 读取（key 前缀已变）
  useEffect(() => {
    return serverStore.onServerChange(() => {
      const nextSaved = serverStorage.getJSON<SavedDirectory[]>(STORAGE_KEY_SAVED) ?? []
      const nextRecent = serverStorage.getJSON<RecentProjects>(STORAGE_KEY_RECENT) ?? {}

      setSavedDirectories(nextSaved)
      setRecentProjects(nextRecent)
      setPathInfo(null) // 重置，等待重新加载
      setUrlDirectory(undefined) // 清除当前目录选择

      void syncProjectsFromApi(undefined, nextRecent)
    })
  }, [setUrlDirectory, syncProjectsFromApi])

  // 启动时同步服务端项目，自动初始化项目列表
  useEffect(() => {
    void syncProjectsFromApi(urlDirectory, recentProjects)
    // 只在初始化时同步一次，避免频繁请求
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // 加载路径信息
  useEffect(() => {
    getPath().then(setPathInfo).catch(handleError('get path info', 'api'))
  }, [])

  // 页面加载时，如果 URL 已有目录，拉取该目录下的 pending requests 补充 active 列表
  useEffect(() => {
    if (!urlDirectory) return
    Promise.all([
      getPendingPermissions(undefined, urlDirectory).catch(() => []),
      getPendingQuestions(undefined, urlDirectory).catch(() => []),
    ]).then(([permissions, questions]) => {
      if (permissions.length > 0 || questions.length > 0) {
        activeSessionStore.initializePendingRequests(permissions, questions)
      }
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []) // 只在挂载时跑一次

  // 保存 savedDirectories 到 per-server storage
  useEffect(() => {
    serverStorage.setJSON(STORAGE_KEY_SAVED, savedDirectories)
  }, [savedDirectories])

  // 保存 recentProjects 到 per-server storage
  useEffect(() => {
    serverStorage.setJSON(STORAGE_KEY_RECENT, recentProjects)
  }, [recentProjects])

  // 设置当前目录（更新 URL + 记录最近使用 + 拉取 pending requests）
  const setCurrentDirectory = useCallback((directory: string | undefined) => {
    setUrlDirectory(directory)
    if (directory) {
      setRecentProjects(prev => ({ ...prev, [directory]: Date.now() }))
    }
    // 切换目录后拉取该目录下的 pending permission/question，补充到 active 列表
    Promise.all([
      getPendingPermissions(undefined, directory).catch(() => []),
      getPendingQuestions(undefined, directory).catch(() => []),
    ]).then(([permissions, questions]) => {
      if (permissions.length > 0 || questions.length > 0) {
        activeSessionStore.initializePendingRequests(permissions, questions)
      }
    })
  }, [setUrlDirectory])

  // 添加目录
  const addDirectory = useCallback((path: string) => {
    const normalized = normalizeDirectoryPath(path)
    
    // 验证路径非空（只阻止空字符串和 "."）
    if (!normalized || normalized === '.') return
    
    // 使用 isSameDirectory 检查是否已存在（处理大小写和斜杠差异）
    if (savedDirectories.some(d => isSameDirectory(d.path, normalized))) {
      setCurrentDirectory(normalized)
      return
    }
    
    const newDir: SavedDirectory = {
      path: normalized,
      name: getDirectoryName(normalized) || normalized,
      addedAt: Date.now(),
      expanded: true,
    }
    
    setSavedDirectories(prev => [...prev, newDir])
    setCurrentDirectory(normalized)
  }, [savedDirectories, setCurrentDirectory])

  // 移除目录
  const removeDirectory = useCallback((path: string) => {
    const normalized = normalizeDirectoryPath(path)
    setSavedDirectories(prev => prev.filter(d => !isSameDirectory(d.path, normalized)))
    if (isSameDirectory(urlDirectory, normalized)) {
      setCurrentDirectory(undefined)
    }
  }, [urlDirectory, setCurrentDirectory])

  // 调整目录顺序
  const reorderDirectory = useCallback((sourcePath: string, targetPath: string) => {
    const normalizedSource = normalizeDirectoryPath(sourcePath)
    const normalizedTarget = normalizeDirectoryPath(targetPath)

    if (!normalizedSource || !normalizedTarget || isSameDirectory(normalizedSource, normalizedTarget)) {
      return
    }

    setSavedDirectories((prev) => {
      const sourceIndex = prev.findIndex((dir) => isSameDirectory(dir.path, normalizedSource))
      const targetIndex = prev.findIndex((dir) => isSameDirectory(dir.path, normalizedTarget))

      if (sourceIndex < 0 || targetIndex < 0 || sourceIndex === targetIndex) {
        return prev
      }

      const next = [...prev]
      const [moved] = next.splice(sourceIndex, 1)
      next.splice(targetIndex, 0, moved)
      return next
    })
  }, [])

  // 设置目录展开状态
  const setDirectoryExpanded = useCallback((path: string, expanded: boolean) => {
    const normalized = normalizeDirectoryPath(path)
    if (!normalized) return

    setSavedDirectories((prev) => {
      let changed = false
      const next = prev.map((dir) => {
        if (!isSameDirectory(dir.path, normalized)) return dir
        if (dir.expanded === expanded) return dir
        changed = true
        return { ...dir, expanded }
      })
      return changed ? next : prev
    })
  }, [])

  // Tauri: 启动时获取 CLI 传入的目录 + 监听后续 open-directory 事件
  // 用 ref 持有最新的 addDirectory 避免 stale closure
  const addDirectoryRef = useRef(addDirectory)
  addDirectoryRef.current = addDirectory

  useEffect(() => {
    if (!isTauri()) return

    let unlistenOpenDirectory: (() => void) | undefined
    let unlistenDragDrop: (() => void) | undefined

    // 拉取启动时的 CLI 目录（一次性）
    import('@tauri-apps/api/core').then(({ invoke }) => {
      invoke<string | null>('get_cli_directory').then((dir) => {
        if (dir) addDirectoryRef.current(dir)
      }).catch(() => {})
    })

    // 监听后续的 open-directory 事件（single-instance / macOS RunEvent::Opened）
    import('@tauri-apps/api/event').then(({ listen }) => {
      listen<string>('open-directory', (event) => {
        addDirectoryRef.current(event.payload)
      }).then(fn => { unlistenOpenDirectory = fn })
    })

    // 监听 Tauri 窗口拖拽（仅桌面端）
    import('@tauri-apps/api/window').then(({ getCurrentWindow }) => {
      getCurrentWindow().onDragDropEvent((event) => {
        if (event.payload.type !== 'drop') return
        for (const path of event.payload.paths) {
          void listDirectory(path)
            .then(() => {
              addDirectoryRef.current(path)
            })
            .catch(() => {
              // 仅导入目录；文件或不可访问路径直接忽略
            })
        }
      }).then(fn => { unlistenDragDrop = fn })
    })

    return () => {
      unlistenOpenDirectory?.()
      unlistenDragDrop?.()
    }
  }, [])

  // 设置侧边栏展开 - 委托给 layoutStore
  const setSidebarExpanded = useCallback((expanded: boolean) => {
    layoutStore.setSidebarExpanded(expanded)
  }, [])

  // 稳定化 Provider value，避免每次渲染创建新对象导致子组件不必要重渲染
  const value = useMemo<DirectoryContextValue>(() => ({
    currentDirectory: urlDirectory,
    setCurrentDirectory,
    savedDirectories,
    setDirectoryExpanded,
    addDirectory,
    removeDirectory,
    reorderDirectory,
    pathInfo,
    sidebarExpanded,
    setSidebarExpanded,
    recentProjects,
  }), [
    urlDirectory,
    setCurrentDirectory,
    savedDirectories,
    setDirectoryExpanded,
    addDirectory,
    removeDirectory,
    reorderDirectory,
    pathInfo,
    sidebarExpanded,
    setSidebarExpanded,
    recentProjects,
  ])

  return (
    <DirectoryContext.Provider value={value}>
      {children}
    </DirectoryContext.Provider>
  )
}

export function useDirectory(): DirectoryContextValue {
  const context = useContext(DirectoryContext)
  if (!context) {
    throw new Error('useDirectory must be used within a DirectoryProvider')
  }
  return context
}

// ============================================
// 细粒度 Hooks - 避免不必要的重渲染
// ============================================

/** 只获取当前目录 */
export function useCurrentDirectory(): string | undefined {
  const { currentDirectory } = useDirectory()
  return currentDirectory
}

/** 只获取保存的目录列表 */
export function useSavedDirectories(): SavedDirectory[] {
  const { savedDirectories } = useDirectory()
  return savedDirectories
}

/** 只获取路径信息 */
export function usePathInfo(): ApiPath | null {
  const { pathInfo } = useDirectory()
  return pathInfo
}

/** 侧边栏状态 - 直接从 layoutStore 读取，更高效 */
export function useSidebarExpanded(): [boolean, (expanded: boolean) => void] {
  const { sidebarExpanded } = useLayoutStore()
  const setSidebarExpanded = useCallback((expanded: boolean) => {
    layoutStore.setSidebarExpanded(expanded)
  }, [])
  return [sidebarExpanded, setSidebarExpanded]
}
