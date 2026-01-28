import { useState, useEffect, useCallback } from 'react'

/**
 * Hash 路由，支持 directory 参数
 * 格式: #/session/{sessionId}?dir={path} 或 #/?dir={path}
 * 
 * directory 存 URL 的好处：每个标签独立，刷新保持状态
 */

interface RouteState {
  sessionId: string | null
  directory: string | undefined
}

function parseHash(): RouteState {
  const hash = window.location.hash
  
  // 分离路径和查询参数
  const [path, queryString] = hash.split('?')
  
  // 解析 directory 参数
  let directory: string | undefined
  if (queryString) {
    const params = new URLSearchParams(queryString)
    const dir = params.get('dir')
    if (dir) {
      directory = decodeURIComponent(dir)
    }
  }
  
  // 匹配 #/session/{id}
  const sessionMatch = path.match(/^#\/session\/(.+)$/)
  if (sessionMatch) {
    return { sessionId: sessionMatch[1], directory }
  }
  
  return { sessionId: null, directory }
}

function buildHash(sessionId: string | null, directory: string | undefined): string {
  const path = sessionId ? `#/session/${sessionId}` : '#/'
  if (directory) {
    return `${path}?dir=${encodeURIComponent(directory)}`
  }
  return path
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

  // 导航到 session（保留当前 directory）
  const navigateToSession = useCallback((sessionId: string) => {
    window.location.hash = buildHash(sessionId, route.directory)
  }, [route.directory])

  // 导航到首页（保留当前 directory）
  const navigateHome = useCallback(() => {
    window.location.hash = buildHash(null, route.directory)
  }, [route.directory])

  // 替换当前路由（不产生历史记录）
  const replaceSession = useCallback((sessionId: string | null) => {
    const newHash = buildHash(sessionId, route.directory)
    window.history.replaceState(null, '', newHash)
    setRoute({ sessionId, directory: route.directory })
  }, [route.directory])

  // 设置 directory（保留当前 session）
  const setDirectory = useCallback((directory: string | undefined) => {
    const newHash = buildHash(route.sessionId, directory)
    window.location.hash = newHash
  }, [route.sessionId])

  // 替换 directory（不产生历史记录）
  const replaceDirectory = useCallback((directory: string | undefined) => {
    const newHash = buildHash(route.sessionId, directory)
    window.history.replaceState(null, '', newHash)
    setRoute({ sessionId: route.sessionId, directory })
  }, [route.sessionId])

  return {
    sessionId: route.sessionId,
    directory: route.directory,
    navigateToSession,
    navigateHome,
    replaceSession,
    setDirectory,
    replaceDirectory,
  }
}
