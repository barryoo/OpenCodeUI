import type { ThinServerProfile, ThinSessionSummary } from '../api/thinServer'
import { ThinAuthError } from '../api/auth'
import { queryClient, SESSION_QUERY_STALE_TIME } from './client'

const THIN_SERVER_BASE_URL = (import.meta.env.VITE_THIN_SERVER_URL || '/admin').replace(/\/$/, '')

export const adminQueryKeys = {
  serverProfiles: ['admin', 'server-profiles'] as const,
  serverProfileByBaseUrl: (baseUrl: string) => ['admin', 'server-profiles', baseUrl.replace(/\/+$/, '')] as const,
  allSessionSummaries: ['admin', 'session-summaries', 'all'] as const,
}

async function adminReadRequest<T>(path: string): Promise<T> {
  const response = await fetch(`${THIN_SERVER_BASE_URL}${path}`, {
    credentials: 'include',
    headers: { 'content-type': 'application/json' },
  })

  if (!response.ok) {
    if (response.status === 401) {
      throw new ThinAuthError('Thin server session expired', 401, 'UNAUTHORIZED')
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

async function readThinServerProfiles(): Promise<ThinServerProfile[]> {
  const response = await adminReadRequest<{ data?: ThinServerProfile[] }>('/server-profiles')
  return response.data ?? []
}

async function readThinServerProfileByBaseUrl(baseUrl: string): Promise<ThinServerProfile | null> {
  const normalized = baseUrl.replace(/\/+$/, '')
  const profiles = await readThinServerProfiles()
  return profiles.find((profile) => profile.baseUrl.replace(/\/+$/, '') === normalized) ?? null
}

async function readAllThinSessionSummaries(): Promise<ThinSessionSummary[]> {
  const response = await adminReadRequest<{ sessions?: ThinSessionSummary[]; data?: ThinSessionSummary[] }>('/session-summaries')
  return response.sessions ?? response.data ?? []
}

export function fetchThinServerProfilesQuery(): Promise<ThinServerProfile[]> {
  return queryClient.fetchQuery({
    queryKey: adminQueryKeys.serverProfiles,
    queryFn: readThinServerProfiles,
    staleTime: SESSION_QUERY_STALE_TIME,
  })
}

export function fetchThinServerProfileByBaseUrlQuery(baseUrl: string): Promise<ThinServerProfile | null> {
  return queryClient.fetchQuery({
    queryKey: adminQueryKeys.serverProfileByBaseUrl(baseUrl),
    queryFn: () => readThinServerProfileByBaseUrl(baseUrl),
    staleTime: SESSION_QUERY_STALE_TIME,
  })
}

export function fetchAllThinSessionSummariesQuery(): Promise<ThinSessionSummary[]> {
  return queryClient.fetchQuery({
    queryKey: adminQueryKeys.allSessionSummaries,
    queryFn: readAllThinSessionSummaries,
    staleTime: SESSION_QUERY_STALE_TIME,
  })
}

export async function invalidateThinServerProfilesQuery(): Promise<void> {
  await queryClient.invalidateQueries({ queryKey: ['admin', 'server-profiles'] })
}

export async function invalidateAllThinSessionSummariesQuery(): Promise<void> {
  await queryClient.invalidateQueries({ queryKey: adminQueryKeys.allSessionSummaries })
}
