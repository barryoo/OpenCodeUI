// ============================================
// Permission & Question API Functions
// 基于 OpenAPI: /permission, /question 相关接口
// ============================================

import { get, post } from './http'
import { formatPathForApi } from '../utils/directoryUtils'
import type {
  ApiPermissionRequest,
  PermissionReply,
  ApiQuestionRequest,
  QuestionAnswer,
} from './types'

// ============================================
// Permission API
// ============================================

/**
 * GET /permission - 获取待处理的权限请求列表
 * directory 会根据 pathMode 自动转换格式
 */
export async function getPendingPermissions(
  sessionId?: string,
  directory?: string
): Promise<ApiPermissionRequest[]> {
  const formattedDir = formatPathForApi(directory)
  const permissions = await get<ApiPermissionRequest[]>('/permission', { 
    directory: formattedDir 
  }, { directory: formattedDir })
  return sessionId 
    ? permissions.filter((p: ApiPermissionRequest) => p.sessionID === sessionId) 
    : permissions
}

/**
 * POST /permission/{requestID}/reply - 回复权限请求
 */
export async function replyPermission(
  requestId: string,
  reply: PermissionReply,
  message?: string,
  directory?: string
): Promise<boolean> {
  const formattedDir = formatPathForApi(directory)
  return post<boolean>(`/permission/${requestId}/reply`, { 
    directory: formattedDir 
  }, { reply, message }, { directory: formattedDir })
}

// ============================================
// Question API
// ============================================

/**
 * GET /question - 获取待处理的问题请求列表
 * directory 会根据 pathMode 自动转换格式
 */
export async function getPendingQuestions(
  sessionId?: string,
  directory?: string
): Promise<ApiQuestionRequest[]> {
  const formattedDir = formatPathForApi(directory)
  const questions = await get<ApiQuestionRequest[]>('/question', { 
    directory: formattedDir 
  }, { directory: formattedDir })
  return sessionId 
    ? questions.filter((q: ApiQuestionRequest) => q.sessionID === sessionId) 
    : questions
}

/**
 * POST /question/{requestID}/reply - 回复问题请求
 */
export async function replyQuestion(
  requestId: string,
  answers: QuestionAnswer[],
  directory?: string
): Promise<boolean> {
  const formattedDir = formatPathForApi(directory)
  return post<boolean>(`/question/${requestId}/reply`, { 
    directory: formattedDir 
  }, { answers }, { directory: formattedDir })
}

/**
 * POST /question/{requestID}/reject - 拒绝问题请求
 */
export async function rejectQuestion(
  requestId: string,
  directory?: string
): Promise<boolean> {
  const formattedDir = formatPathForApi(directory)
  return post<boolean>(`/question/${requestId}/reject`, { 
    directory: formattedDir 
  }, undefined, { directory: formattedDir })
}
