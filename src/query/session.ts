import { useQuery } from '@tanstack/react-query'
import {
  getPendingPermissions,
  getPendingQuestions,
  getSession,
  getSessionStatus,
  type ApiPermissionRequest,
  type ApiQuestionRequest,
  type ApiSession,
} from '../api'
import type { SessionStatusMap } from '../types/api/session'
import { queryClient, SESSION_QUERY_STALE_TIME } from './client'

export const sessionQueryKeys = {
  session: (sessionId: string) => ['session', sessionId] as const,
  pendingPermissions: (directory?: string) => ['pending-permissions', directory ?? ''] as const,
  pendingQuestions: (directory?: string) => ['pending-questions', directory ?? ''] as const,
  sessionStatus: (directory?: string) => ['session-status', directory ?? ''] as const,
}

export function fetchSessionQuery(sessionId: string, directory?: string): Promise<ApiSession> {
  return queryClient.fetchQuery({
    queryKey: sessionQueryKeys.session(sessionId),
    queryFn: () => getSession(sessionId, directory),
    staleTime: SESSION_QUERY_STALE_TIME,
  })
}

export function fetchPendingPermissionsQuery(directory?: string): Promise<ApiPermissionRequest[]> {
  return queryClient.fetchQuery({
    queryKey: sessionQueryKeys.pendingPermissions(directory),
    queryFn: () => getPendingPermissions(undefined, directory),
    staleTime: SESSION_QUERY_STALE_TIME,
  })
}

export function fetchPendingQuestionsQuery(directory?: string): Promise<ApiQuestionRequest[]> {
  return queryClient.fetchQuery({
    queryKey: sessionQueryKeys.pendingQuestions(directory),
    queryFn: () => getPendingQuestions(undefined, directory),
    staleTime: SESSION_QUERY_STALE_TIME,
  })
}

export function fetchSessionStatusQuery(directory?: string): Promise<SessionStatusMap> {
  return queryClient.fetchQuery({
    queryKey: sessionQueryKeys.sessionStatus(directory),
    queryFn: () => getSessionStatus(directory),
    staleTime: SESSION_QUERY_STALE_TIME,
  })
}

export function useSessionDetailQuery(sessionId: string | null, directory?: string) {
  return useQuery({
    queryKey: sessionId ? sessionQueryKeys.session(sessionId) : ['session', 'idle'],
    queryFn: () => {
      if (!sessionId) throw new Error('sessionId is required')
      return getSession(sessionId, directory)
    },
    enabled: Boolean(sessionId),
    staleTime: SESSION_QUERY_STALE_TIME,
  })
}

export function setSessionQueryData(session: ApiSession) {
  queryClient.setQueryData(sessionQueryKeys.session(session.id), session)
}

export function removePendingPermissionFromCache(requestId: string, directory?: string) {
  queryClient.setQueryData<ApiPermissionRequest[]>(sessionQueryKeys.pendingPermissions(directory), (prev) => {
    const items = prev ?? []
    return items.filter((item) => item.id !== requestId)
  })
}

export function removePendingQuestionFromCache(requestId: string, directory?: string) {
  queryClient.setQueryData<ApiQuestionRequest[]>(sessionQueryKeys.pendingQuestions(directory), (prev) => {
    const items = prev ?? []
    return items.filter((item) => item.id !== requestId)
  })
}

export function setSessionStatusQueryData(directory: string | undefined, statusMap: SessionStatusMap) {
  queryClient.setQueryData<SessionStatusMap>(sessionQueryKeys.sessionStatus(directory), (prev = {}) => ({
    ...prev,
    ...statusMap,
  }))
}
