import { createSession, type ApiProject } from './client'
import { projectCatalog, normalizeProjectPath } from './projectCatalog'
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
  projectPath: string
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
  projectPath: string
  externalSessionId: string
  itemId: string | null
  variant: string | null
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

const THIN_SERVER_BASE_URL = (import.meta.env.VITE_THIN_SERVER_URL || '/admin').replace(/\/$/, '')

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

/** @deprecated Use {@link findThinServerProfileByBaseUrl} instead. This compat wrapper throws on miss instead of returning null. */
export async function ensureDefaultThinServerProfile(baseUrl: string): Promise<ThinServerProfile> {
  const profile = await findThinServerProfileByBaseUrl(baseUrl)
  if (!profile) throw new Error(`No server profile found for ${baseUrl}`)
  return profile
}

function normalizeBaseUrl(value: string): string {
  return value.replace(/\/+$/, '')
}

/** Read-only lookup: returns the existing profile matching `baseUrl`, or `null` if none found. Never auto-creates. */
export async function findThinServerProfileByBaseUrl(baseUrl: string): Promise<ThinServerProfile | null> {
  const normalized = normalizeBaseUrl(baseUrl)
  const profilesResponse = await thinRequest<ThinResponse<ThinServerProfile[]>>('/server-profiles')
  const profiles = profilesResponse.data ?? []
  const matched = profiles.find((profile) => normalizeBaseUrl(profile.baseUrl) === normalized)
  return matched ?? null
}

export async function listThinServerProfiles(): Promise<ThinServerProfile[]> {
  const profilesResponse = await thinRequest<ThinResponse<ThinServerProfile[]>>('/server-profiles')
  return profilesResponse.data ?? []
}

export async function createThinServerProfile(input: {
  name: string
  baseUrl: string
  authType?: string
  authSecretEncrypted?: string | null
  isDefault?: boolean
}): Promise<ThinServerProfile> {
  const response = await thinRequest<ThinResponse<ThinServerProfile>>('/server-profiles', {
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
  const response = await thinRequest<ThinResponse<ThinServerProfile>>(`/server-profiles/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  })
  if (!response.data) throw new Error('Failed to update server profile')
  return response.data
}

export async function deleteThinServerProfile(id: string): Promise<void> {
  await thinRequest<{ ok: boolean }>(`/server-profiles/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  })
}

export async function setDefaultThinServerProfile(id: string): Promise<ThinServerProfile> {
  const response = await thinRequest<ThinResponse<ThinServerProfile>>(`/server-profiles/${encodeURIComponent(id)}/default`, {
    method: 'POST',
    body: JSON.stringify({}),
  })
  if (!response.data) throw new Error('Failed to set default server profile')
  return response.data
}

export async function getLegacyProjectIdByPathMap(): Promise<Map<string, string>> {
  return projectCatalog.getLegacyIdMap()
}

export function getLegacyProjectIdForPath(projects: Map<string, string>, path: string): string | null {
  return projects.get(normalizeProjectPath(path)) ?? null
}

export async function findProjectByPath(projectPath: string): Promise<ApiProject | null> {
  return projectCatalog.findByPath(projectPath)
}

export async function listThinItems(projectPath: string, legacyProjectId?: string | null): Promise<ThinItem[]> {
  const suffix = legacyProjectId ? `?legacyProjectId=${encodeURIComponent(legacyProjectId)}` : ''
  const response = await thinRequest<ThinResponse<ThinItem[]>>(`/projects/${encodeURIComponent(projectPath)}/items${suffix}`)
  return response.items ?? response.data ?? []
}

export async function createThinItem(input: { serverProfileId: string; projectPath: string; legacyProjectId?: string | null; title: string; type: ThinItemType; description?: string }): Promise<ThinItem> {
  const response = await thinRequest<ThinResponse<ThinItem>>('/items', {
    method: 'POST',
    body: JSON.stringify(input),
  })
  if (!response.data) throw new Error('Failed to create item')
  return response.data
}

export async function updateThinItem(itemId: string, input: Partial<Pick<ThinItem, 'title' | 'type' | 'description' | 'status'>>): Promise<ThinItem> {
  const response = await thinRequest<ThinResponse<ThinItem>>(`/items/${encodeURIComponent(itemId)}`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  })
  if (!response.data) throw new Error('Failed to update item')
  return response.data
}

export async function deleteThinItem(itemId: string): Promise<void> {
  await thinRequest<{ ok: boolean }>(`/items/${encodeURIComponent(itemId)}`, {
    method: 'DELETE',
  })
}

export async function listThinSessionSummaries(projectPath: string, legacyProjectId?: string | null): Promise<ThinSessionSummary[]> {
  const suffix = legacyProjectId ? `?legacyProjectId=${encodeURIComponent(legacyProjectId)}` : ''
  const response = await thinRequest<ThinResponse<ThinSessionSummary[]>>(`/projects/${encodeURIComponent(projectPath)}/session-summaries${suffix}`)
  return response.sessions ?? response.data ?? []
}

export async function listAllThinSessionSummaries(): Promise<ThinSessionSummary[]> {
  const response = await thinRequest<ThinResponse<ThinSessionSummary[]>>('/session-summaries')
  return response.sessions ?? response.data ?? []
}

export async function listThinItemSessionSummaries(itemId: string): Promise<ThinSessionSummary[]> {
  const response = await thinRequest<ThinResponse<ThinSessionSummary[]>>(`/items/${encodeURIComponent(itemId)}/session-summaries`)
  return response.sessions ?? response.data ?? []
}

export async function upsertThinSessionSummary(input: {
  serverProfileId: string
  projectPath: string
  legacyProjectId?: string | null
  externalSessionId: string
  itemId?: string | null
  variant?: string | null
  titleSnapshot: string
  statusSnapshot: ThinWorkflowStatus
  lastMessageAt?: string | null
  activityAt: string
}): Promise<ThinSessionSummary> {
  const response = await thinRequest<ThinResponse<ThinSessionSummary>>('/session-summaries', {
    method: 'POST',
    body: JSON.stringify(input),
  })
  if (!response.data) throw new Error('Failed to upsert session summary')
  return response.data
}

export async function bindThinSessionSummary(summaryId: string, itemId: string): Promise<ThinSessionSummary> {
  const response = await thinRequest<ThinResponse<ThinSessionSummary>>(`/session-summaries/${encodeURIComponent(summaryId)}/bind-item`, {
    method: 'POST',
    body: JSON.stringify({ itemId }),
  })
  if (!response.data) throw new Error('Failed to bind session summary')
  return response.data
}

export async function unbindThinSessionSummary(summaryId: string): Promise<ThinSessionSummary> {
  const response = await thinRequest<ThinResponse<ThinSessionSummary>>(`/session-summaries/${encodeURIComponent(summaryId)}/unbind-item`, {
    method: 'POST',
    body: JSON.stringify({}),
  })
  if (!response.data) throw new Error('Failed to unbind session summary')
  return response.data
}

export async function searchThinProjectFiles(projectPath: string, query: string, legacyProjectId?: string | null): Promise<string[]> {
  const legacyQuery = legacyProjectId ? `&legacyProjectId=${encodeURIComponent(legacyProjectId)}` : ''
  const response = await thinRequest<{ data?: string[] }>(`/projects/${encodeURIComponent(projectPath)}/files/search?q=${encodeURIComponent(query)}${legacyQuery}`)
  return response.data ?? []
}

export async function createBoundSession(input: { projectPath: string; legacyProjectId?: string | null; serverProfileId: string; itemId: string; title?: string }) {
  const session = await createSession({ directory: input.projectPath, title: input.title })
  await upsertThinSessionSummary({
    serverProfileId: input.serverProfileId,
    projectPath: input.projectPath,
    legacyProjectId: input.legacyProjectId,
    externalSessionId: session.id,
    itemId: input.itemId,
    variant: null,
    titleSnapshot: session.title,
    statusSnapshot: 'in_progress',
    activityAt: new Date(session.time.updated ?? session.time.created).toISOString(),
  })
  return session
}
