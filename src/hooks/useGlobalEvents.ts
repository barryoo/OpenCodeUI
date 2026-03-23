// ============================================
// useGlobalEvents - 全局 SSE 事件订阅
// ============================================
// 
// 职责：
// 1. 订阅全局 SSE 事件流
// 2. 将事件分发到 messageStore
// 3. 追踪子 session 关系（用于权限请求冒泡）
// 4. 与具体 session 无关，处理所有 session 的事件

import { useEffect, useRef, useCallback } from 'react'
import { queryClient } from '../query/client'
import { messageStore, childSessionStore, autoApproveStore } from '../store'
import { activeSessionStore } from '../store/activeSessionStore'
import { notificationStore } from '../store/notificationStore'
import { subscribeToEvents, replyPermission } from '../api'
import { useSavedDirectories, useCurrentDirectory } from '../contexts/DirectoryContext'
import type { SavedDirectory } from '../contexts/DirectoryContext'
import type { 
  ApiMessage, 
  ApiPart,
  ApiPermissionRequest,
  ApiQuestionRequest,
} from '../api/types'
import type { SessionStatus } from '../types/api/session'
import {
  fetchPendingPermissionsQuery,
  fetchPendingQuestionsQuery,
  fetchSessionStatusQuery,
  sessionQueryKeys,
  setSessionQueryData,
  setSessionStatusQueryData,
} from '../query/session'

type SessionStatusResponse = Record<string, SessionStatus>

interface ExpandedDirectorySnapshot {
  directories: string[]
  key: string
}

function buildExpandedDirectorySnapshot(
  savedDirectories: SavedDirectory[],
  currentDirectory?: string
): ExpandedDirectorySnapshot {
  let directories = savedDirectories
    .filter((dir: SavedDirectory) => dir.expanded)
    .map((dir: SavedDirectory) => dir.path)

  if (directories.length === 0 && currentDirectory) {
    directories = [currentDirectory]
  }

  const uniqueDirectories: string[] = []
  for (const directory of directories) {
    if (!directory || uniqueDirectories.includes(directory)) continue
    uniqueDirectories.push(directory)
  }

  return {
    directories: uniqueDirectories,
    key: uniqueDirectories.join('\n'),
  }
}

async function fetchExpandedDirectoryState(directories: string[]) {
  if (directories.length === 0) {
    return {
      statusMaps: [{} as SessionStatusResponse],
      permissionsList: [[] as ApiPermissionRequest[]],
      questionsList: [[] as ApiQuestionRequest[]],
    }
  }

  const statusRequests = directories.map((directory: string) =>
    fetchSessionStatusQuery(directory).catch(() => ({} as SessionStatusResponse))
  )
  const permissionRequests = directories.map((directory: string) =>
    fetchPendingPermissionsQuery(directory).catch(() => [])
  )
  const questionRequests = directories.map((directory: string) =>
    fetchPendingQuestionsQuery(directory).catch(() => [])
  )

  const [statusMaps, permissionsList, questionsList] = await Promise.all([
    Promise.all(statusRequests),
    Promise.all(permissionRequests),
    Promise.all(questionRequests),
  ])

  return { statusMaps, permissionsList, questionsList }
}

interface GlobalEventsCallbacks {
  onPermissionAsked?: (request: ApiPermissionRequest) => void
  onPermissionReplied?: (data: { sessionID: string; requestID: string }) => void
  onQuestionAsked?: (request: ApiQuestionRequest) => void
  onQuestionReplied?: (data: { sessionID: string; requestID: string }) => void
  onQuestionRejected?: (data: { sessionID: string; requestID: string }) => void
  onScrollRequest?: () => void
  onSessionIdle?: (sessionID: string) => void
  onSessionError?: (sessionID: string) => void
  /** SSE 重连成功后触发，调用方可刷新当前 session 数据 */
  onReconnected?: (reason: 'network' | 'server-switch') => void
}

// ============================================
// 待处理请求缓存 - 处理 permission/question 事件先于 session.created 到达的时序问题
// ============================================
interface PendingRequest<T> {
  request: T
  timestamp: number
}

const pendingPermissions = new Map<string, PendingRequest<ApiPermissionRequest>>()
const pendingQuestions = new Map<string, PendingRequest<ApiQuestionRequest>>()

// 5秒后过期，防止内存泄漏
const PENDING_TIMEOUT = 5000

function cleanupExpired<T>(map: Map<string, PendingRequest<T>>) {
  const now = Date.now()
  for (const [key, value] of map) {
    if (now - value.timestamp > PENDING_TIMEOUT) {
      map.delete(key)
    }
  }
}

/**
 * 检查 sessionID 是否属于当前 session 或其子 session
 */
function belongsToCurrentSession(sessionId: string): boolean {
  const currentSessionId = messageStore.getCurrentSessionId()
  if (!currentSessionId) return false
  
  // 是当前 session
  if (sessionId === currentSessionId) return true
  
  // 是当前 session 的子 session
  return childSessionStore.belongsToSession(sessionId, currentSessionId)
}

export function useGlobalEvents(callbacks?: GlobalEventsCallbacks) {
  // 使用 ref 保存 callbacks，避免重新订阅 SSE
  const callbacksRef = useRef(callbacks)
  callbacksRef.current = callbacks
  const savedDirectories = useSavedDirectories()
  const currentDirectory = useCurrentDirectory()
  const savedDirectoriesRef = useRef(savedDirectories)
  const currentDirectoryRef = useRef(currentDirectory)
  const lastFetchKeyRef = useRef<string | null>(null)

  useEffect(() => {
    savedDirectoriesRef.current = savedDirectories
  }, [savedDirectories])

  useEffect(() => {
    currentDirectoryRef.current = currentDirectory
  }, [currentDirectory])

  const handleManualPermissionRequest = useCallback((request: ApiPermissionRequest, directory?: string) => {
    const meta = activeSessionStore.getSessionMeta(request.sessionID)
    const sessionLabel = meta?.title || request.sessionID.slice(0, 8)
    const desc = request.patterns?.length
      ? `${request.permission}: ${request.patterns[0]}`
      : request.permission

    activeSessionStore.addPendingRequest(request.id, request.sessionID, 'permission', desc)

    if (!belongsToCurrentSession(request.sessionID)) {
      const metadata = request.metadata as Record<string, unknown> | undefined
      const operation = typeof metadata?.operation === 'string'
        ? metadata.operation
        : request.permission
      const intent = typeof metadata?.intent === 'string'
        ? metadata.intent
        : undefined
      const keyDetail = request.patterns?.[0]
      notificationStore.push(
        'permission',
        sessionLabel,
        desc,
        request.sessionID,
        directory ?? meta?.directory,
        {
          kind: 'permission',
          requestId: request.id,
          operation,
          intent,
          keyDetail,
        },
      )
    }

    if (belongsToCurrentSession(request.sessionID)) {
      callbacksRef.current?.onPermissionAsked?.(request)
      return
    }

    pendingPermissions.set(request.sessionID, {
      request,
      timestamp: Date.now(),
    })
  }, [])

  const fetchIncrementalDirectoryState = useCallback((directories: string[]) => {
    const uniqueDirectories = directories.filter((directory, index) => directory && directories.indexOf(directory) === index)
    if (uniqueDirectories.length === 0) return

    void fetchExpandedDirectoryState(uniqueDirectories).then(({
      statusMaps,
      permissionsList,
      questionsList,
    }) => {
      const mergedStatus = statusMaps.reduce(
        (acc, map) => ({ ...acc, ...map }),
        {} as SessionStatusResponse
      )

      uniqueDirectories.forEach((directory, index) => {
        setSessionStatusQueryData(directory, statusMaps[index] ?? {})
      })
      activeSessionStore.mergeStatusMap(mergedStatus)
      activeSessionStore.mergePendingRequests(permissionsList.flat(), questionsList.flat())
    })
  }, [])

  const fetchAndInitialize = useCallback(() => {
    const snapshot = buildExpandedDirectorySnapshot(savedDirectoriesRef.current, currentDirectoryRef.current)
    lastFetchKeyRef.current = snapshot.key

    void fetchExpandedDirectoryState(snapshot.directories).then(({
      statusMaps,
      permissionsList,
      questionsList,
    }) => {
      if (lastFetchKeyRef.current !== snapshot.key) return

      const mergedStatus = statusMaps.reduce(
        (acc, map) => ({ ...acc, ...map }),
        {} as SessionStatusResponse
      )

      snapshot.directories.forEach((directory, index) => {
        setSessionStatusQueryData(directory, statusMaps[index] ?? {})
        queryClient.setQueryData(sessionQueryKeys.pendingPermissions(directory), permissionsList[index] ?? [])
        queryClient.setQueryData(sessionQueryKeys.pendingQuestions(directory), questionsList[index] ?? [])
      })

      activeSessionStore.initialize(mergedStatus)

      const permissions = permissionsList.flat()
      const questions = questionsList.flat()
      activeSessionStore.initializePendingRequests(permissions, questions)
    })
  }, [])

  useEffect(() => {
    fetchAndInitialize()
  }, [fetchAndInitialize])

  useEffect(() => {
    const snapshot = buildExpandedDirectorySnapshot(savedDirectories, currentDirectory)
    const prevKey = lastFetchKeyRef.current

    if (prevKey === null) {
      lastFetchKeyRef.current = snapshot.key
      return
    }

    if (prevKey === snapshot.key) {
      return
    }

    const prevDirectories = prevKey ? prevKey.split('\n').filter(Boolean) : []
    const addedDirectories = snapshot.directories.filter((directory) => !prevDirectories.includes(directory))
    lastFetchKeyRef.current = snapshot.key

    if (addedDirectories.length > 0) {
      fetchIncrementalDirectoryState(addedDirectories)
    }
  }, [savedDirectories, currentDirectory, fetchIncrementalDirectoryState])

  useEffect(() => {
    // 节流滚动
    let scrollPending = false
    const scheduleScroll = () => {
      if (scrollPending) return
      scrollPending = true
      requestAnimationFrame(() => {
        scrollPending = false
        callbacksRef.current?.onScrollRequest?.()
      })
    }

    // ============================================
    // 拉取 session 状态 + pending requests（初始化 & 重连共用）
    // ============================================

    const fetchAndInitializeWithLatest = () => {
      fetchAndInitialize()
    }

    const unsubscribe = subscribeToEvents({
      // ============================================
      // Message Events → messageStore
      // ============================================
      
      onMessageUpdated: (apiMsg: ApiMessage) => {
        messageStore.handleMessageUpdated(apiMsg)
      },

      onPartUpdated: (apiPart: ApiPart) => {
        if ('sessionID' in apiPart && 'messageID' in apiPart) {
          messageStore.handlePartUpdated(apiPart as ApiPart & { sessionID: string; messageID: string })
          scheduleScroll()
        }
      },

      onPartDelta: (data) => {
        messageStore.handlePartDelta(data)
        scheduleScroll()
      },

      onPartRemoved: (data) => {
        messageStore.handlePartRemoved(data)
      },

      // ============================================
      // Session Events → childSessionStore
      // ============================================

      onSessionCreated: (session) => {
        // 注册子 session 关系
        if (session.parentID) {
          childSessionStore.registerChildSession(session)
          
          // 处理因时序问题缓存的权限请求
          const pendingPermission = pendingPermissions.get(session.id)
          if (pendingPermission && belongsToCurrentSession(session.id)) {
            callbacksRef.current?.onPermissionAsked?.(pendingPermission.request)
            pendingPermissions.delete(session.id)
          }
          
          // 处理因时序问题缓存的问题请求
          const pendingQuestion = pendingQuestions.get(session.id)
          if (pendingQuestion && belongsToCurrentSession(session.id)) {
            callbacksRef.current?.onQuestionAsked?.(pendingQuestion.request)
            pendingQuestions.delete(session.id)
          }
        }
        
        // 更新 session meta 供 active tab 使用
        activeSessionStore.setSessionMeta(session.id, session.title, session.directory)
        setSessionQueryData(session)
        
        // 清理过期缓存
        cleanupExpired(pendingPermissions)
        cleanupExpired(pendingQuestions)
      },

      onSessionIdle: (data) => {
        messageStore.handleSessionIdle(data.sessionID)
        childSessionStore.markIdle(data.sessionID)
        callbacksRef.current?.onSessionIdle?.(data.sessionID)
      },

      onSessionError: (error) => {
        const isAbort = error.name === 'MessageAbortedError' || error.name === 'AbortError'
        if (!isAbort && import.meta.env.DEV) {
          console.warn('[GlobalEvents] Session error:', error)
        }
        messageStore.handleSessionError(error.sessionID)
        childSessionStore.markError(error.sessionID)
        if (!isAbort) {
          // 从 Working 列表移除
          activeSessionStore.updateStatus(error.sessionID, { type: 'idle' })
          // 通知（跳过当前 session family）
          if (!belongsToCurrentSession(error.sessionID)) {
            const meta = activeSessionStore.getSessionMeta(error.sessionID)
            const sessionLabel = meta?.title || error.sessionID.slice(0, 8)
            notificationStore.push('error', sessionLabel, 'Session error', error.sessionID, meta?.directory)
          }
        }
        callbacksRef.current?.onSessionError?.(error.sessionID)
      },

      onSessionUpdated: (session) => {
        // 更新 session meta 供 active tab 使用
        activeSessionStore.setSessionMeta(session.id, session.title, session.directory)
        setSessionQueryData(session)
        if (session.parentID) {
          childSessionStore.registerChildSession(session)
        }
      },

      // ============================================
      // Permission Events → callbacks (通过 ref 调用)
      // 关键变化：不仅处理当前 session，也处理子 session 的权限请求
      // 时序处理：如果 session 还没注册，缓存请求等 session.created 后处理
      // ============================================
      
      onPermissionAsked: (request) => {
        const requestDirectoryFromCache = Array.from(queryClient.getQueriesData<ApiPermissionRequest[]>({ queryKey: ['pending-permissions'] }))
          .find(([, permissions]) => permissions?.some((item) => item.id === request.id))?.[0]?.[1]
        const meta = activeSessionStore.getSessionMeta(request.sessionID)
        const requestDirectory = meta?.directory
          ?? (typeof requestDirectoryFromCache === 'string' && requestDirectoryFromCache.length > 0 ? requestDirectoryFromCache : undefined)
          ?? (belongsToCurrentSession(request.sessionID) ? currentDirectoryRef.current : undefined)

        if (autoApproveStore.shouldAutoApprove(request.sessionID, requestDirectory)) {
          void replyPermission(request.id, 'once', undefined, requestDirectory)
            .then(() => {
              if (belongsToCurrentSession(request.sessionID)) {
                callbacksRef.current?.onPermissionReplied?.({ sessionID: request.sessionID, requestID: request.id })
              }
            })
            .catch(() => {
              handleManualPermissionRequest(request, requestDirectory)
            })
          return
        }

        handleManualPermissionRequest(request, requestDirectory)
      },

      onPermissionReplied: (data) => {
        pendingPermissions.delete(data.sessionID)
        activeSessionStore.resolvePendingRequest(data.requestID)
        Array.from(queryClient.getQueriesData<ApiPermissionRequest[]>({ queryKey: ['pending-permissions'] })).forEach(([queryKey]) => {
          queryClient.setQueryData<ApiPermissionRequest[]>(queryKey, (prev = []) => prev.filter((item) => item.id !== data.requestID))
        })
        
        if (belongsToCurrentSession(data.sessionID)) {
          callbacksRef.current?.onPermissionReplied?.(data)
        }
      },

      // ============================================
      // Question Events
      // ============================================

      onQuestionAsked: (request) => {
        const meta = activeSessionStore.getSessionMeta(request.sessionID)
        const sessionLabel = meta?.title || request.sessionID.slice(0, 8)
        const desc = request.questions?.[0]?.header || 'AI is waiting for your input'

        // Active 列表：注册 pending request
        activeSessionStore.addPendingRequest(request.id, request.sessionID, 'question', desc)

        // Toast 通知
        if (!belongsToCurrentSession(request.sessionID)) {
          notificationStore.push('question', `${sessionLabel} — Question`, desc, request.sessionID, meta?.directory)
        }

        if (belongsToCurrentSession(request.sessionID)) {
          callbacksRef.current?.onQuestionAsked?.(request)
        } else {
          pendingQuestions.set(request.sessionID, {
            request,
            timestamp: Date.now(),
          })
        }
      },

      onQuestionReplied: (data) => {
        pendingQuestions.delete(data.sessionID)
        activeSessionStore.resolvePendingRequest(data.requestID)
        Array.from(queryClient.getQueriesData<ApiQuestionRequest[]>({ queryKey: ['pending-questions'] })).forEach(([queryKey]) => {
          queryClient.setQueryData<ApiQuestionRequest[]>(queryKey, (prev = []) => prev.filter((item) => item.id !== data.requestID))
        })
        
        if (belongsToCurrentSession(data.sessionID)) {
          callbacksRef.current?.onQuestionReplied?.(data)
        }
      },

      onQuestionRejected: (data) => {
        pendingQuestions.delete(data.sessionID)
        activeSessionStore.resolvePendingRequest(data.requestID)
        Array.from(queryClient.getQueriesData<ApiQuestionRequest[]>({ queryKey: ['pending-questions'] })).forEach(([queryKey]) => {
          queryClient.setQueryData<ApiQuestionRequest[]>(queryKey, (prev = []) => prev.filter((item) => item.id !== data.requestID))
        })
        
        if (belongsToCurrentSession(data.sessionID)) {
          callbacksRef.current?.onQuestionRejected?.(data)
        }
      },

      // ============================================
      // Session Status → activeSessionStore
      // ============================================

      onSessionStatus: (data) => {
        const prevStatus = activeSessionStore.getSnapshot().statusMap[data.sessionID]
        const wasBusy = prevStatus && (prevStatus.type === 'busy' || prevStatus.type === 'retry')

        activeSessionStore.updateStatus(data.sessionID, data.status)
        const meta = activeSessionStore.getSessionMeta(data.sessionID)
        setSessionStatusQueryData(meta?.directory, { [data.sessionID]: data.status })

        // Toast — session 从 busy/retry 变成 idle 时弹 completed 通知
        if (wasBusy && data.status.type === 'idle' && !belongsToCurrentSession(data.sessionID)) {
          const sessionLabel = meta?.title || data.sessionID.slice(0, 8)
          notificationStore.push('completed', sessionLabel, 'Session completed', data.sessionID, meta?.directory)
        }
      },

      // ============================================
      // Reconnected → 通知调用方刷新数据 + 重新拉取 session status
      // ============================================

      onReconnected: (reason) => {
        if (import.meta.env.DEV) {
          console.log(`[GlobalEvents] SSE reconnected (reason: ${reason}), notifying for data refresh`)
        }
        // 重连后重新拉取全量状态 + pending requests
        fetchAndInitializeWithLatest()
        callbacksRef.current?.onReconnected?.(reason)
      },
    })

    return unsubscribe
  }, [fetchAndInitialize]) // 保持 SSE 订阅稳定
}
