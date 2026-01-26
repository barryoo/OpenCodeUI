// ============================================
// useSessionManager - Session 加载和状态管理
// ============================================
// 
// 职责：
// 1. 加载 session 消息（初始加载 + 懒加载历史）
// 2. 处理 undo/redo（调用 API + 更新 store）
// 3. 同步路由和 store 的 currentSessionId

import { useCallback, useEffect, useRef } from 'react'
import { messageStore, type RevertState } from '../store'
import {
  getSessionMessages,
  getSession,
  revertMessage,
  unrevertSession,
  extractUserMessageContent,
  type ApiMessageWithParts,
} from '../api'

const INITIAL_MESSAGE_LIMIT = 20

interface UseSessionManagerOptions {
  sessionId: string | null
  onLoadComplete?: () => void
  onError?: (error: Error) => void
}

export function useSessionManager({
  sessionId,
  onLoadComplete,
  onError,
}: UseSessionManagerOptions) {
  const loadingRef = useRef(false)
  const fullHistoryRef = useRef<Map<string, ApiMessageWithParts[]>>(new Map())

  // ============================================
  // Load Session
  // ============================================

  const loadSession = useCallback(async (sid: string) => {
    if (loadingRef.current) return
    loadingRef.current = true

    messageStore.setLoadState(sid, 'loading')

    try {
      // 并行加载 session 信息和消息
      const [sessionInfo, apiMessages] = await Promise.all([
        getSession(sid).catch(() => null),
        getSessionMessages(sid, INITIAL_MESSAGE_LIMIT),
      ])

      // 设置消息到 store
      messageStore.setMessages(sid, apiMessages, {
        directory: sessionInfo?.directory ?? '',
        hasMoreHistory: apiMessages.length >= INITIAL_MESSAGE_LIMIT,
        revertState: sessionInfo?.revert ?? null,
      })

      onLoadComplete?.()
    } catch (error) {
      console.error('[SessionManager] Load session failed:', error)
      messageStore.setLoadState(sid, 'error')
      onError?.(error instanceof Error ? error : new Error(String(error)))
    } finally {
      loadingRef.current = false
    }
  }, [onLoadComplete, onError])

  // ============================================
  // Load More History
  // ============================================

  const loadMoreHistory = useCallback(async () => {
    if (!sessionId) return
    
    const state = messageStore.getSessionState(sessionId)
    if (!state || !state.hasMoreHistory) return

    try {
      // 获取或缓存完整历史
      let allMessages = fullHistoryRef.current.get(sessionId)
      if (!allMessages) {
        allMessages = await getSessionMessages(sessionId)
        fullHistoryRef.current.set(sessionId, allMessages)
      }

      // 找到当前最老的消息
      const currentMessages = state.messages
      const oldestId = currentMessages[0]?.info.id
      
      if (!oldestId) {
        // 没有当前消息，直接设置所有历史
        messageStore.setMessages(sessionId, allMessages, {
          directory: state.directory,
          hasMoreHistory: false,
        })
        return
      }

      const oldestIndex = allMessages.findIndex(m => m.info.id === oldestId)
      if (oldestIndex <= 0) {
        // 已经加载完所有历史
        messageStore.prependMessages(sessionId, [], false)
        return
      }

      // 向前加载 15 条
      const startIndex = Math.max(0, oldestIndex - 15)
      const newMessages = allMessages.slice(startIndex, oldestIndex)
      const hasMore = startIndex > 0

      messageStore.prependMessages(sessionId, newMessages, hasMore)
    } catch (error) {
      console.error('[SessionManager] Load more history failed:', error)
    }
  }, [sessionId])

  // ============================================
  // Undo
  // ============================================

  const handleUndo = useCallback(async (userMessageId: string) => {
    if (!sessionId) return

    // 获取当前 session 的 directory
    const state = messageStore.getSessionState(sessionId)
    if (!state) return

    const directory = state.directory || undefined

    try {
      // 调用 API 设置 revert 点（传递 directory）
      await revertMessage(sessionId, userMessageId, undefined, directory)

      // 找到 revert 点的索引
      const revertIndex = state.messages.findIndex(m => m.info.id === userMessageId)
      if (revertIndex === -1) return

      // 收集被撤销的用户消息，构建 redo 历史
      const revertedUserMessages = state.messages
        .slice(revertIndex)
        .filter(m => m.info.role === 'user')

      const history = revertedUserMessages.map(m => {
        const content = extractUserMessageContent({
          info: m.info as any,
          parts: m.parts as any[],
        })
        return {
          messageId: m.info.id,
          text: content.text,
          attachments: content.attachments,
        }
      })

      // 更新 store 的 revert 状态
      const revertState: RevertState = {
        messageId: userMessageId,
        history,
      }
      messageStore.setRevertState(sessionId, revertState)
    } catch (error) {
      console.error('[SessionManager] Undo failed:', error)
    }
  }, [sessionId])

  // ============================================
  // Redo
  // ============================================

  const handleRedo = useCallback(async () => {
    if (!sessionId) return

    const state = messageStore.getSessionState(sessionId)
    if (!state?.revertState) return

    const { history } = state.revertState
    if (history.length === 0) return

    const directory = state.directory || undefined

    try {
      // 移除第一条历史记录（最早撤销的）
      const newHistory = history.slice(1)

      if (newHistory.length > 0) {
        // 还有更多历史，设置新的 revert 点
        const newRevertMessageId = newHistory[0].messageId
        await revertMessage(sessionId, newRevertMessageId, undefined, directory)

        messageStore.setRevertState(sessionId, {
          messageId: newRevertMessageId,
          history: newHistory,
        })
      } else {
        // 没有更多历史，完全清除 revert 状态
        await unrevertSession(sessionId, directory)
        messageStore.setRevertState(sessionId, null)
      }
    } catch (error) {
      console.error('[SessionManager] Redo failed:', error)
    }
  }, [sessionId])

  // ============================================
  // Redo All
  // ============================================

  const handleRedoAll = useCallback(async () => {
    if (!sessionId) return

    const state = messageStore.getSessionState(sessionId)
    const directory = state?.directory || undefined

    try {
      await unrevertSession(sessionId, directory)
      messageStore.setRevertState(sessionId, null)
    } catch (error) {
      console.error('[SessionManager] Redo all failed:', error)
    }
  }, [sessionId])

  // ============================================
  // Clear Revert
  // ============================================

  const clearRevert = useCallback(() => {
    if (!sessionId) return
    messageStore.setRevertState(sessionId, null)
  }, [sessionId])

  // ============================================
  // Effects
  // ============================================

  // 同步 sessionId 到 store，并加载数据
  useEffect(() => {
    // 先更新 currentSessionId
    messageStore.setCurrentSession(sessionId)

    if (sessionId) {
      const state = messageStore.getSessionState(sessionId)
      // 只有未加载时才加载
      if (!state || state.loadState === 'idle') {
        loadSession(sessionId)
      }
    }

    // 清理缓存
    return () => {
      if (sessionId) {
        fullHistoryRef.current.delete(sessionId)
      }
    }
  }, [sessionId, loadSession])

  return {
    loadSession,
    loadMoreHistory,
    handleUndo,
    handleRedo,
    handleRedoAll,
    clearRevert,
  }
}
