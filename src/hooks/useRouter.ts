import { useState, useEffect, useCallback } from 'react'
import { normalizeToForwardSlash, serverStorage } from '../utils'
import { STORAGE_KEY_LAST_DIRECTORY } from '../constants/storage'

/**
 * Hash 路由，支持 directory 参数
 * 格式: #/session/{sessionId}?dir={path} 或 #/?dir={path}
 * 
 * directory 存 URL 的好处：每个标签独立，刷新保持状态
 */

interface RouteState {
  sessionId: string | null
  directory: string | undefined
  itemProjectId: string | undefined
  itemId: string | undefined
}

function parseHash(): RouteState {
  const hash = window.location.hash
  
  // 分离路径和查询参数
  const [path, queryString] = hash.split('?')
  
  // 解析查询参数
  const params = new URLSearchParams(queryString || '')
  const rawDir = params.get('dir')
  let directory: string | undefined = rawDir ? (normalizeToForwardSlash(rawDir) || undefined) : undefined
  const itemProjectId = params.get('itemProject') || undefined
  const itemId = params.get('item') || undefined
  const hasValidItemContext = Boolean(itemProjectId && itemId)
  
  // URL 没有 dir 参数时，从 per-server storage 恢复上次目录
  if (!directory) {
    const saved = serverStorage.get(STORAGE_KEY_LAST_DIRECTORY)
    if (saved) directory = saved
  }
  
  // 匹配 #/session/{id}
  const sessionMatch = path.match(/^#\/session\/(.+)$/)
  if (sessionMatch) {
    return {
      sessionId: sessionMatch[1],
      directory,
      itemProjectId: hasValidItemContext ? itemProjectId : undefined,
      itemId: hasValidItemContext ? itemId : undefined,
    }
  }

  return {
    sessionId: null,
    directory,
    itemProjectId: hasValidItemContext ? itemProjectId : undefined,
    itemId: hasValidItemContext ? itemId : undefined,
  }
}

function buildHash(
  sessionId: string | null,
  directory: string | undefined,
  itemProjectId: string | undefined,
  itemId: string | undefined,
): string {
  const path = sessionId ? `#/session/${sessionId}` : '#/'
  const params = new URLSearchParams()
  if (directory) {
    params.set('dir', directory)
  }
  if (itemProjectId && itemId) {
    params.set('itemProject', itemProjectId)
    params.set('item', itemId)
  }

  const query = params.toString()
  return query ? `${path}?${query}` : path
}

export function useRouter() {
  const [route, setRoute] = useState<RouteState>(parseHash)

  // 监听 hash 变化
  useEffect(() => {
    const handleHashChange = () => {
      setRoute(parseHash())
    }
    
    window.addEventListener('hashchange', handleHashChange)
    return () => window.removeEventListener('hashchange', handleHashChange)
  }, [])

  // 导航到 session（默认保留当前 directory，可选传入目标 directory）
  const navigateToSession = useCallback((sessionId: string, directory?: string) => {
    const dir = directory !== undefined ? (normalizeToForwardSlash(directory) || undefined) : route.directory
    window.location.hash = buildHash(sessionId, dir, route.itemProjectId, route.itemId)
  }, [route.directory, route.itemId, route.itemProjectId])

  // 导航到首页（保留当前 directory）
  const navigateHome = useCallback(() => {
    window.location.hash = buildHash(null, route.directory, route.itemProjectId, route.itemId)
  }, [route.directory, route.itemId, route.itemProjectId])

  // 替换当前路由（不产生历史记录）
  const replaceSession = useCallback((sessionId: string | null) => {
    const newHash = buildHash(sessionId, route.directory, route.itemProjectId, route.itemId)
    window.history.replaceState(null, '', newHash)
    setRoute({
      sessionId,
      directory: route.directory,
      itemProjectId: route.itemProjectId,
      itemId: route.itemId,
    })
  }, [route.directory, route.itemId, route.itemProjectId])

  // 设置 directory（切换目录时清除当前 session，避免 session 与目录不匹配）
  const setDirectory = useCallback((directory: string | undefined) => {
    // 入口标准化：统一转为正斜杠
    const normalized = directory ? normalizeToForwardSlash(directory) : undefined
    // 切换目录时清除 sessionId，回到首页
    // 否则 URL 会变成 #/session/OLD_SESSION?dir=NEW_DIR，导致请求路径错乱
    const newHash = buildHash(null, normalized || undefined, route.itemProjectId, route.itemId)
    // 持久化到 per-server storage
    if (normalized) {
      serverStorage.set(STORAGE_KEY_LAST_DIRECTORY, normalized)
    } else {
      serverStorage.remove(STORAGE_KEY_LAST_DIRECTORY)
    }
    window.location.hash = newHash
  }, [route.itemId, route.itemProjectId])

  // 替换 directory（不产生历史记录）
  const replaceDirectory = useCallback((directory: string | undefined) => {
    // 入口标准化：统一转为正斜杠
    const normalized = directory ? normalizeToForwardSlash(directory) : undefined
    const newHash = buildHash(route.sessionId, normalized || undefined, route.itemProjectId, route.itemId)
    // 持久化到 per-server storage
    if (normalized) {
      serverStorage.set(STORAGE_KEY_LAST_DIRECTORY, normalized)
    } else {
      serverStorage.remove(STORAGE_KEY_LAST_DIRECTORY)
    }
    window.history.replaceState(null, '', newHash)
    setRoute({
      sessionId: route.sessionId,
      directory: normalized || undefined,
      itemProjectId: route.itemProjectId,
      itemId: route.itemId,
    })
  }, [route.itemId, route.itemProjectId, route.sessionId])

  const setItemContext = useCallback((projectId: string | undefined, itemId: string | undefined, replace = true) => {
    const normalizedProjectId = projectId || undefined
    const normalizedItemId = itemId || undefined
    const newHash = buildHash(route.sessionId, route.directory, normalizedProjectId, normalizedItemId)

    if (replace) {
      window.history.replaceState(null, '', newHash)
      setRoute({
        sessionId: route.sessionId,
        directory: route.directory,
        itemProjectId: normalizedProjectId,
        itemId: normalizedItemId,
      })
      return
    }

    window.location.hash = newHash
  }, [route.directory, route.sessionId])

  return {
    sessionId: route.sessionId,
    directory: route.directory,
    itemProjectId: route.itemProjectId,
    itemId: route.itemId,
    navigateToSession,
    navigateHome,
    replaceSession,
    setDirectory,
    replaceDirectory,
    setItemContext,
  }
}
