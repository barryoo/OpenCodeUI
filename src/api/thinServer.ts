import { createSession, getProjects, type ApiProject } from './client'
import { ThinAuthError } from './auth'
import { authStore } from '../store/authStore'

export type ThinWorkflowStatus = 'not_started' | 'in_progress' | 'completed' | 'abandoned'
export type ThinItemType = 'requirement' | 'bug' | 'research' | 'code_review'

export interface ThinServerProfile {
  id: string
  userId: string
  name: string
  baseUrl: string
  isDefault: boolean
  authType?: string
  authSecretEncrypted?: string | null
}

export interface ThinItem {
  id: string
  projectId: string
  serverProfileId: string
  title: string
  type: ThinItemType
  status: ThinWorkflowStatus
  description: string
  activityAt: string
  updatedAt: string
}

export interface ThinSessionSummary {
  id: string
  projectId: string
  externalSessionId: string
  itemId: string | null
  titleSnapshot: string
  statusSnapshot: ThinWorkflowStatus
  activityAt: string
  updatedAt: string
}

interface ThinResponse<T> {
  data?: T
  items?: T
  sessions?: T
}

const THIN_SERVER_BASE_URL = (import.meta.env.VITE_THIN_SERVER_URL || '').replace(/\/$/, '')

async function thinRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${THIN_SERVER_BASE_URL}${path}`, {
    credentials: 'include',
    headers: {
      'content-type': 'application/json',
      ...(init?.headers ?? {}),
    },
    ...init,
  })

  if (!response.ok) {
    if (response.status === 401) {
      const unauthorized = new ThinAuthError('Thin server session expired', 401, 'UNAUTHORIZED')
      void authStore.handleUnauthorized(unauthorized)
      throw unauthorized
    }

    let message = `Thin server request failed: ${response.status}`
    try {
      const data = await response.json() as { error?: { message?: string } }
      if (data.error?.message) message = data.error.message
    } catch {
      // ignore
    }
    throw new Error(message)
  }

  return response.json() as Promise<T>
}

export async function ensureDefaultThinServerProfile(baseUrl: string, name = 'Active OpenCode Server'): Promise<ThinServerProfile> {
  const profilesResponse = await thinRequest<ThinResponse<ThinServerProfile[]>>('/api/server-profiles')
  const profiles = profilesResponse.data ?? []
  const matched = profiles.find((profile) => profile.baseUrl === baseUrl)
  if (matched) return matched

  const created = await thinRequest<ThinResponse<ThinServerProfile>>('/api/server-profiles', {
    method: 'POST',
    body: JSON.stringify({ name, baseUrl, isDefault: profiles.length === 0 }),
  })

  if (!created.data) throw new Error('Failed to create thin server profile')
  return created.data
}

export async function listThinServerProfiles(): Promise<ThinServerProfile[]> {
  const profilesResponse = await thinRequest<ThinResponse<ThinServerProfile[]>>('/api/server-profiles')
  return profilesResponse.data ?? []
}

export async function createThinServerProfile(input: {
  name: string
  baseUrl: string
  authType?: string
  authSecretEncrypted?: string | null
  isDefault?: boolean
}): Promise<ThinServerProfile> {
  const response = await thinRequest<ThinResponse<ThinServerProfile>>('/api/server-profiles', {
    method: 'POST',
    body: JSON.stringify(input),
  })
  if (!response.data) throw new Error('Failed to create server profile')
  return response.data
}

export async function updateThinServerProfile(id: string, input: {
  name?: string
  baseUrl?: string
  authType?: string
  authSecretEncrypted?: string | null
  isDefault?: boolean
}): Promise<ThinServerProfile> {
  const response = await thinRequest<ThinResponse<ThinServerProfile>>(`/api/server-profiles/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  })
  if (!response.data) throw new Error('Failed to update server profile')
  return response.data
}

export async function deleteThinServerProfile(id: string): Promise<void> {
  await thinRequest<{ ok: boolean }>(`/api/server-profiles/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  })
}

export async function setDefaultThinServerProfile(id: string): Promise<ThinServerProfile> {
  const response = await thinRequest<ThinResponse<ThinServerProfile>>(`/api/server-profiles/${encodeURIComponent(id)}/default`, {
    method: 'POST',
    body: JSON.stringify({}),
  })
  if (!response.data) throw new Error('Failed to set default server profile')
  return response.data
}

export async function getProjectIdByPathMap(): Promise<Map<string, string>> {
  const projects = await getProjects()
  const map = new Map<string, string>()
  for (const project of projects) {
    if (project.worktree) map.set(normalizePath(project.worktree), project.id)
  }
  return map
}

function normalizePath(value: string): string {
  return value.replace(/\\/g, '/')
}

export function getProjectIdForPath(projects: Map<string, string>, path: string): string | null {
  return projects.get(normalizePath(path)) ?? null
}

export async function listThinItems(projectId: string): Promise<ThinItem[]> {
  const response = await thinRequest<ThinResponse<ThinItem[]>>(`/api/projects/${encodeURIComponent(projectId)}/items`)
  return response.items ?? response.data ?? []
}

export async function createThinItem(input: { serverProfileId: string; projectId: string; title: string; type: ThinItemType; description?: string }): Promise<ThinItem> {
  const response = await thinRequest<ThinResponse<ThinItem>>('/api/items', {
    method: 'POST',
    body: JSON.stringify(input),
  })
  if (!response.data) throw new Error('Failed to create item')
  return response.data
}

export async function updateThinItem(itemId: string, input: Partial<Pick<ThinItem, 'title' | 'type' | 'description' | 'status'>>): Promise<ThinItem> {
  const response = await thinRequest<ThinResponse<ThinItem>>(`/api/items/${encodeURIComponent(itemId)}`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  })
  if (!response.data) throw new Error('Failed to update item')
  return response.data
}

export async function deleteThinItem(itemId: string): Promise<void> {
  await thinRequest<{ ok: boolean }>(`/api/items/${encodeURIComponent(itemId)}`, {
    method: 'DELETE',
  })
}

export async function listThinSessionSummaries(projectId: string): Promise<ThinSessionSummary[]> {
  const response = await thinRequest<ThinResponse<ThinSessionSummary[]>>(`/api/projects/${encodeURIComponent(projectId)}/session-summaries`)
  return response.sessions ?? response.data ?? []
}

export async function listAllThinSessionSummaries(): Promise<ThinSessionSummary[]> {
  const response = await thinRequest<ThinResponse<ThinSessionSummary[]>>('/api/session-summaries')
  return response.sessions ?? response.data ?? []
}

export async function listThinItemSessionSummaries(itemId: string): Promise<ThinSessionSummary[]> {
  const response = await thinRequest<ThinResponse<ThinSessionSummary[]>>(`/api/items/${encodeURIComponent(itemId)}/session-summaries`)
  return response.sessions ?? response.data ?? []
}

export async function upsertThinSessionSummary(input: {
  serverProfileId: string
  projectId: string
  externalSessionId: string
  itemId?: string | null
  titleSnapshot: string
  statusSnapshot: ThinWorkflowStatus
  activityAt: string
}): Promise<ThinSessionSummary> {
  const response = await thinRequest<ThinResponse<ThinSessionSummary>>('/api/session-summaries', {
    method: 'POST',
    body: JSON.stringify(input),
  })
  if (!response.data) throw new Error('Failed to upsert session summary')
  return response.data
}

export async function bindThinSessionSummary(summaryId: string, itemId: string): Promise<ThinSessionSummary> {
  const response = await thinRequest<ThinResponse<ThinSessionSummary>>(`/api/session-summaries/${encodeURIComponent(summaryId)}/bind-item`, {
    method: 'POST',
    body: JSON.stringify({ itemId }),
  })
  if (!response.data) throw new Error('Failed to bind session summary')
  return response.data
}

export async function unbindThinSessionSummary(summaryId: string): Promise<ThinSessionSummary> {
  const response = await thinRequest<ThinResponse<ThinSessionSummary>>(`/api/session-summaries/${encodeURIComponent(summaryId)}/unbind-item`, {
    method: 'POST',
    body: JSON.stringify({}),
  })
  if (!response.data) throw new Error('Failed to unbind session summary')
  return response.data
}

export async function searchThinProjectFiles(projectId: string, query: string): Promise<string[]> {
  const response = await thinRequest<{ data?: string[] }>(`/api/projects/${encodeURIComponent(projectId)}/files/search?q=${encodeURIComponent(query)}`)
  return response.data ?? []
}

export async function createBoundSession(input: { project: ApiProject; serverProfileId: string; itemId: string; title?: string }) {
  const session = await createSession({ directory: input.project.worktree, title: input.title })
  await upsertThinSessionSummary({
    serverProfileId: input.serverProfileId,
    projectId: input.project.id,
    externalSessionId: session.id,
    itemId: input.itemId,
    titleSnapshot: session.title,
    statusSnapshot: 'in_progress',
    activityAt: new Date(session.time.updated ?? session.time.created).toISOString(),
  })
  return session
}
