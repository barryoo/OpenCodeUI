// ============================================
// PermissionContext
// 将待处理的 permission 请求注入消息渲染树，
// 避免多层 prop drilling
// ============================================

import { createContext, useContext } from 'react'
import type { ApiPermissionRequest, PermissionReply } from '../api'

export interface PermissionContextValue {
  /** 当前待处理的 permission 请求（取队列第一个） */
  pendingPermission: ApiPermissionRequest | null
  /** 队列总长度 */
  queueLength: number
  /** 是否正在回复中 */
  isReplying: boolean
  /** 回复回调 */
  onReply: (reply: PermissionReply) => void
  /** 当前主 sessionId */
  currentSessionId?: string | null
}

const defaultValue: PermissionContextValue = {
  pendingPermission: null,
  queueLength: 0,
  isReplying: false,
  onReply: () => {},
}

export const PermissionContext = createContext<PermissionContextValue>(defaultValue)

export function usePermissionContext() {
  return useContext(PermissionContext)
}
