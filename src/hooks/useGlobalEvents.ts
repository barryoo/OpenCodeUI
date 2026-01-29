// ============================================
// useGlobalEvents - 全局 SSE 事件订阅
// ============================================
// 
// 职责：
// 1. 订阅全局 SSE 事件流
// 2. 将事件分发到 messageStore
// 3. 追踪子 session 关系（用于权限请求冒泡）
// 4. 与具体 session 无关，处理所有 session 的事件

import { useEffect, useRef } from 'react'
import { messageStore, childSessionStore } from '../store'
import { subscribeToEvents } from '../api'
import type { 
  ApiMessage, 
  ApiPart,
  ApiPermissionRequest,
  ApiQuestionRequest,
} from '../api/types'

interface GlobalEventsCallbacks {
  onPermissionAsked?: (request: ApiPermissionRequest) => void
  onPermissionReplied?: (data: { sessionID: string; requestID: string }) => void
  onQuestionAsked?: (request: ApiQuestionRequest) => void
  onQuestionReplied?: (data: { sessionID: string; requestID: string }) => void
  onQuestionRejected?: (data: { sessionID: string; requestID: string }) => void
  onScrollRequest?: () => void
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

    const unsubscribe = subscribeToEvents({
      // ============================================
      // Message Events → messageStore
      // ============================================
      
      onMessageUpdated: (apiMsg: ApiMessage) => {
        messageStore.handleMessageUpdated(apiMsg)
      },

      onPartUpdated: (apiPart: ApiPart) => {
        console.log('[GlobalEvents] onPartUpdated received:', {
          id: apiPart.id,
          type: apiPart.type,
          hasSessionID: 'sessionID' in apiPart,
          hasMessageID: 'messageID' in apiPart,
          sessionID: (apiPart as any).sessionID,
          messageID: (apiPart as any).messageID,
        })
        
        if ('sessionID' in apiPart && 'messageID' in apiPart) {
          messageStore.handlePartUpdated(apiPart as ApiPart & { sessionID: string; messageID: string })
          scheduleScroll()
        } else {
          console.warn('[GlobalEvents] Part missing sessionID or messageID, skipping')
        }
      },

      onPartRemoved: (data) => {
        messageStore.handlePartRemoved(data)
      },

      // ============================================
      // Session Events → childSessionStore
      // ============================================

      onSessionCreated: (session) => {
        console.log('[GlobalEvents] Session created:', session.id, 'parentID:', session.parentID)
        // 注册子 session 关系
        if (session.parentID) {
          childSessionStore.registerChildSession(session)
          
          // 处理因时序问题缓存的权限请求
          const pendingPermission = pendingPermissions.get(session.id)
          if (pendingPermission && belongsToCurrentSession(session.id)) {
            console.log('[GlobalEvents] Processing delayed permission for session:', session.id)
            callbacksRef.current?.onPermissionAsked?.(pendingPermission.request)
            pendingPermissions.delete(session.id)
          }
          
          // 处理因时序问题缓存的问题请求
          const pendingQuestion = pendingQuestions.get(session.id)
          if (pendingQuestion && belongsToCurrentSession(session.id)) {
            console.log('[GlobalEvents] Processing delayed question for session:', session.id)
            callbacksRef.current?.onQuestionAsked?.(pendingQuestion.request)
            pendingQuestions.delete(session.id)
          }
        }
        
        // 清理过期缓存
        cleanupExpired(pendingPermissions)
        cleanupExpired(pendingQuestions)
      },

      onSessionIdle: (data) => {
        messageStore.handleSessionIdle(data.sessionID)
        // 更新子 session 状态
        childSessionStore.markIdle(data.sessionID)
      },

      onSessionError: (error) => {
        const isAbort = error.name === 'MessageAbortedError' || error.name === 'AbortError'
        if (!isAbort) {
          console.error('[GlobalEvents] Session error:', error)
        }
        messageStore.handleSessionError(error.sessionID)
        // 更新子 session 状态
        childSessionStore.markError(error.sessionID)
      },

      onSessionUpdated: (session) => {
        // 可以在这里更新 session 标题等信息
        console.log('[GlobalEvents] Session updated:', session.id, session.title)
      },

      // ============================================
      // Permission Events → callbacks (通过 ref 调用)
      // 关键变化：不仅处理当前 session，也处理子 session 的权限请求
      // 时序处理：如果 session 还没注册，缓存请求等 session.created 后处理
      // ============================================
      
      onPermissionAsked: (request) => {
        // 检查是否属于当前 session 或其子 session
        if (belongsToCurrentSession(request.sessionID)) {
          callbacksRef.current?.onPermissionAsked?.(request)
        } else {
          // 可能是子 session 的请求先于 session.created 到达
          // 缓存它，等 session 注册后处理
          console.log('[GlobalEvents] Caching permission request for unregistered session:', request.sessionID)
          pendingPermissions.set(request.sessionID, {
            request,
            timestamp: Date.now(),
          })
        }
      },

      onPermissionReplied: (data) => {
        // 清理缓存（无论是否属于当前 session）
        pendingPermissions.delete(data.sessionID)
        
        if (belongsToCurrentSession(data.sessionID)) {
          callbacksRef.current?.onPermissionReplied?.(data)
        }
      },

      // ============================================
      // Question Events → callbacks (通过 ref 调用)
      // 同样处理子 session 的问题请求，以及时序问题
      // ============================================

      onQuestionAsked: (request) => {
        if (belongsToCurrentSession(request.sessionID)) {
          callbacksRef.current?.onQuestionAsked?.(request)
        } else {
          // 缓存未注册 session 的请求
          console.log('[GlobalEvents] Caching question request for unregistered session:', request.sessionID)
          pendingQuestions.set(request.sessionID, {
            request,
            timestamp: Date.now(),
          })
        }
      },

      onQuestionReplied: (data) => {
        pendingQuestions.delete(data.sessionID)
        
        if (belongsToCurrentSession(data.sessionID)) {
          callbacksRef.current?.onQuestionReplied?.(data)
        }
      },

      onQuestionRejected: (data) => {
        pendingQuestions.delete(data.sessionID)
        
        if (belongsToCurrentSession(data.sessionID)) {
          callbacksRef.current?.onQuestionRejected?.(data)
        }
      },
    })

    return unsubscribe
  }, []) // 空依赖，只订阅一次
}
