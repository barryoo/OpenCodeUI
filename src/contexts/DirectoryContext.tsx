// ============================================
// DirectoryContext - 管理当前工作目录
// ============================================

import { createContext, useContext, useState, useCallback, useEffect, useMemo, useRef, type ReactNode } from 'react'
import { getPath, type ApiPath, getProjects, listDirectory } from '../api'
import { useRouter } from '../hooks/useRouter'
import { handleError, normalizeToForwardSlash, getDirectoryName, isSameDirectory, serverStorage } from '../utils'
import { layoutStore, useLayoutStore } from '../store/layoutStore'
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
  /** 隐藏的项目路径列表（仅 UI 隐藏，不影响服务端数据） */
  hiddenDirectories: string[]
  /** 设置目录展开状态 */
  setDirectoryExpanded: (path: string, expanded: boolean) => void
  /** 添加目录 */
  addDirectory: (path: string) => void
  /** 移除目录 */
  removeDirectory: (path: string) => void
  /** 调整目录顺序 */
  reorderDirectory: (sourcePath: string, targetPath?: string) => void
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
const STORAGE_KEY_HIDDEN = 'opencode-hidden-projects'

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
    const saved = serverStorage.getJSON<SavedDirectory[]>(STORAGE_KEY_SAVED) ?? []
    const hiddenRaw = serverStorage.getJSON<string[]>(STORAGE_KEY_HIDDEN)
    const hidden = Array.isArray(hiddenRaw) ? hiddenRaw.filter((p) => typeof p === 'string' && p.trim().length > 0) : []
    if (hidden.length === 0) return saved
    return saved.filter((d) => !hidden.some((p) => isSameDirectory(p, d.path)))
  })

  const [hiddenDirectories, setHiddenDirectories] = useState<string[]>(() => {
    const raw = serverStorage.getJSON<string[]>(STORAGE_KEY_HIDDEN)
    return Array.isArray(raw) ? raw.filter((p) => typeof p === 'string' && p.trim().length > 0) : []
  })

  const hiddenDirectoriesRef = useRef(hiddenDirectories)
  useEffect(() => {
    hiddenDirectoriesRef.current = hiddenDirectories
  }, [hiddenDirectories])

  const [recentProjects, setRecentProjects] = useState<RecentProjects>(() => {
    return serverStorage.getJSON<RecentProjects>(STORAGE_KEY_RECENT) ?? {}
  })
  
  const [pathInfo, setPathInfo] = useState<ApiPath | null>(null)

  const ensureDirectoryVisible = useCallback((path: string) => {
    const normalized = normalizeDirectoryPath(path)
    if (!normalized || normalized === '.') return

    // 1) 自动从隐藏列表恢复
    setHiddenDirectories((prev) => prev.filter((p) => !isSameDirectory(p, normalized)))

    // 2) 确保存在于 savedDirectories（Multi 视图依赖该列表渲染项目树）
    setSavedDirectories((prev) => {
      if (prev.some((d) => isSameDirectory(d.path, normalized))) return prev
      return [
        ...prev,
        {
          path: normalized,
          name: getDirectoryName(normalized) || normalized,
          addedAt: Date.now(),
          expanded: true,
        },
      ]
    })
  }, [])

  const syncProjectsFromApi = useCallback(async (
    targetCurrentDirectory: string | undefined,
    targetRecentProjects: RecentProjects
  ) => {
    try {
      const apiProjects = await getProjects()
      if (apiProjects.length === 0) return

      const now = Date.now()
      const fromApi: SavedDirectory[] = []

      const hidden = hiddenDirectoriesRef.current
      const normalizedCurrent = targetCurrentDirectory ? normalizeDirectoryPath(targetCurrentDirectory) : undefined

      // 如果当前目录在隐藏列表中，视为“用户打开了该项目”，自动恢复显示。
      if (normalizedCurrent && hidden.some((p) => isSameDirectory(p, normalizedCurrent))) {
        setHiddenDirectories((prev) => prev.filter((p) => !isSameDirectory(p, normalizedCurrent)))
      }

      for (const project of apiProjects) {
        const normalizedPath = normalizeDirectoryPath(project.worktree || '')
        if (!normalizedPath || normalizedPath === '.') continue

        // 隐藏项目：从 UI 项目列表中过滤掉（但如果就是当前目录，则保留并自动恢复）
        const isHidden = hidden.some((p) => isSameDirectory(p, normalizedPath))
        if (isHidden && (!normalizedCurrent || !isSameDirectory(normalizedCurrent, normalizedPath))) {
          continue
        }

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

      const nextHiddenRaw = serverStorage.getJSON<string[]>(STORAGE_KEY_HIDDEN)
      const nextHidden = Array.isArray(nextHiddenRaw) ? nextHiddenRaw.filter((p) => typeof p === 'string' && p.trim().length > 0) : []

      // 先更新 ref，避免 syncProjectsFromApi 使用旧隐藏列表
      hiddenDirectoriesRef.current = nextHidden

      setHiddenDirectories(nextHidden)
      setSavedDirectories(nextSaved.filter((d) => !nextHidden.some((p) => isSameDirectory(p, d.path))))
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


  // 保存 savedDirectories 到 per-server storage
  useEffect(() => {
    serverStorage.setJSON(STORAGE_KEY_SAVED, savedDirectories)
  }, [savedDirectories])

  // 保存 hiddenDirectories 到 per-server storage
  useEffect(() => {
    serverStorage.setJSON(STORAGE_KEY_HIDDEN, hiddenDirectories)
  }, [hiddenDirectories])

  // 保存 recentProjects 到 per-server storage
  useEffect(() => {
    serverStorage.setJSON(STORAGE_KEY_RECENT, recentProjects)
  }, [recentProjects])

  // 设置当前目录（更新 URL + 记录最近使用）
  const setCurrentDirectory = useCallback((directory: string | undefined) => {
    if (directory) {
      const normalized = normalizeDirectoryPath(directory)
      if (normalized) {
        ensureDirectoryVisible(normalized)
        setUrlDirectory(normalized)
        setRecentProjects(prev => ({ ...prev, [normalized]: Date.now() }))
        return
      }
    }

    setUrlDirectory(undefined)
  }, [ensureDirectoryVisible, setUrlDirectory])

  // 添加目录
  const addDirectory = useCallback((path: string) => {
    const normalized = normalizeDirectoryPath(path)
    
    // 验证路径非空（只阻止空字符串和 "."）
    if (!normalized || normalized === '.') return
    
    // 使用 isSameDirectory 检查是否已存在（处理大小写和斜杠差异）
    if (savedDirectories.some(d => isSameDirectory(d.path, normalized))) {
      // 如果此前被隐藏，添加行为视为“重新打开”，自动恢复
      setHiddenDirectories((prev) => prev.filter((p) => !isSameDirectory(p, normalized)))
      setCurrentDirectory(normalized)
      return
    }

    // 如果此前被隐藏，添加行为视为“重新打开”，自动恢复
    setHiddenDirectories((prev) => prev.filter((p) => !isSameDirectory(p, normalized)))
    
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

    // 语义：仅从 UI 项目列表隐藏（刷新也不再出现）；不删除服务端数据
    if (normalized && normalized !== '.') {
      setHiddenDirectories((prev) => {
        if (prev.some((p) => isSameDirectory(p, normalized))) return prev
        return [...prev, normalized]
      })
    }

    setSavedDirectories(prev => prev.filter(d => !isSameDirectory(d.path, normalized)))
    if (isSameDirectory(urlDirectory, normalized)) {
      setCurrentDirectory(undefined)
    }
  }, [urlDirectory, setCurrentDirectory])

  // URL 直接打开某个目录时（刷新/深链），确保该目录可见（自动从隐藏恢复）
  useEffect(() => {
    if (!urlDirectory) return
    ensureDirectoryVisible(urlDirectory)
  }, [urlDirectory, ensureDirectoryVisible])

  // 调整目录顺序
  const reorderDirectory = useCallback((sourcePath: string, targetPath?: string) => {
    const normalizedSource = normalizeDirectoryPath(sourcePath)
    const normalizedTarget = targetPath ? normalizeDirectoryPath(targetPath) : ''

    if (!normalizedSource || (normalizedTarget && isSameDirectory(normalizedSource, normalizedTarget))) {
      return
    }

    setSavedDirectories((prev) => {
      const sourceIndex = prev.findIndex((dir) => isSameDirectory(dir.path, normalizedSource))

      if (sourceIndex < 0) {
        return prev
      }

      const next = [...prev]
      const [moved] = next.splice(sourceIndex, 1)

      if (!normalizedTarget) {
        next.push(moved)
        return next
      }

      const targetIndex = next.findIndex((dir) => isSameDirectory(dir.path, normalizedTarget))
      if (targetIndex < 0) {
        next.push(moved)
        return next
      }

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
    hiddenDirectories,
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
    hiddenDirectories,
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
