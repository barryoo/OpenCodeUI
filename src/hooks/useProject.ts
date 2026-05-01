import { useState, useEffect, useCallback, useRef } from 'react'
import { getCurrentProject, type ApiProject } from '../api'
import { projectCatalog, isStaleGeneration } from '../api/projectCatalog'
import { apiErrorHandler } from '../utils'
import { serverStorage } from '../utils/perServerStorage'
import { serverStore } from '../store/serverStore'

export interface UseProjectResult {
  // 当前选中的 project
  currentProject: ApiProject | null
  // 所有可用的 projects
  projects: ApiProject[]
  // 加载状态
  isLoading: boolean
  // 错误信息
  error: string | null
  // 选择一个 project
  selectProject: (projectId: string) => void
  // 刷新项目列表
  refresh: () => Promise<void>
}

const STORAGE_KEY = 'selected-project-id'

export function useProject(): UseProjectResult {
  const [currentProject, setCurrentProject] = useState<ApiProject | null>(null)
  const [projects, setProjects] = useState<ApiProject[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  /** 代际计数器：保护异步 loadProjects 不会用旧结果覆盖新 state */
  const loadGenRef = useRef(0)

  // 加载项目列表
  const loadProjects = useCallback(async () => {
    const gen = ++loadGenRef.current
    setIsLoading(true)
    setError(null)

    try {
      // 并行获取当前项目和所有项目
      const [current, all] = await Promise.all([
        getCurrentProject(),
        projectCatalog.list(),
      ])

      // 代际保护：旧请求不得覆盖新 state
      if (isStaleGeneration(gen, loadGenRef.current)) return

      setProjects(all)

      // 检查 localStorage 中是否有保存的选择
      const savedProjectId = serverStorage.get(STORAGE_KEY)
      
      if (savedProjectId) {
        // 尝试找到保存的项目
        const savedProject = all.find(p => p.id === savedProjectId)
        if (savedProject) {
          setCurrentProject(savedProject)
        } else {
          // 保存的项目不存在了，用当前项目
          setCurrentProject(current)
          serverStorage.remove(STORAGE_KEY)
        }
      } else {
        // 没有保存的，用当前项目
        setCurrentProject(current)
      }
    } catch (e) {
      if (isStaleGeneration(gen, loadGenRef.current)) return
      apiErrorHandler('load projects', e)
      setError(e instanceof Error ? e.message : 'Failed to load projects')
    } finally {
      // 只有最新一轮请求才能清除 loading 状态
      if (!isStaleGeneration(gen, loadGenRef.current)) setIsLoading(false)
    }
  }, [])

  // 初始加载
  useEffect(() => {
    loadProjects()
  }, [loadProjects])

  // 服务器切换时，重新加载项目列表
  useEffect(() => {
    return serverStore.onServerChange(() => {
      projectCatalog.invalidate()
      void loadProjects()
    })
  }, [loadProjects])

  // 选择项目
  const selectProject = useCallback((projectId: string) => {
    const project = projects.find(p => p.id === projectId)
    if (project) {
      setCurrentProject(project)
      serverStorage.set(STORAGE_KEY, projectId)
    }
  }, [projects])

  // 刷新项目列表 - 先失效缓存再重新加载
  const refresh = useCallback(async () => {
    projectCatalog.invalidate()
    await loadProjects()
  }, [loadProjects])

  return {
    currentProject,
    projects,
    isLoading,
    error,
    selectProject,
    refresh,
  }
}
