const THIN_SERVER_BASE_URL = (import.meta.env.VITE_THIN_SERVER_URL || '/admin').replace(/\/$/, '')

export class ThinAuthError extends Error {
  status: number
  code?: string

  constructor(message: string, status: number, code?: string) {
    super(message)
    this.name = 'ThinAuthError'
    this.status = status
    this.code = code
  }
}

export interface ThinAuthUser {
  id: string
  githubId: string | null
  login: string
  email?: string | null
  name?: string | null
  avatarUrl?: string | null
}

interface ThinAuthResponse {
  user: ThinAuthUser | null
  auth: { provider: string; mode: string } | null
}

export interface EmailAuthInput {
  email: string
  password: string
}

async function parseError(response: Response, fallback: string): Promise<ThinAuthError> {
  try {
    const data = await response.json() as { error?: { code?: string; message?: string } }
    return new ThinAuthError(data.error?.message || fallback, response.status, data.error?.code)
  } catch {
    return new ThinAuthError(fallback, response.status)
  }
}

export async function getThinAuthMe(): Promise<ThinAuthResponse> {
  const response = await fetch(`${THIN_SERVER_BASE_URL}/auth/me`, {
    credentials: 'include',
  })
  if (!response.ok) throw await parseError(response, `Auth me failed: ${response.status}`)
  return response.json() as Promise<ThinAuthResponse>
}

export async function loginWithGithub(): Promise<void> {
  const response = await fetch(`${THIN_SERVER_BASE_URL}/auth/github/login`, {
    credentials: 'include',
  })
  if (!response.ok) throw await parseError(response, `GitHub login failed: ${response.status}`)
  const data = await response.json() as { mode?: string; authorizeUrl?: string }
  if (data.mode === 'oauth' && data.authorizeUrl) {
    window.location.href = data.authorizeUrl
    return
  }
  throw new ThinAuthError('GitHub OAuth login is unavailable', 503, 'OAUTH_UNAVAILABLE')
}

async function postEmailAuth(path: string, input: EmailAuthInput): Promise<ThinAuthResponse> {
  const response = await fetch(`${THIN_SERVER_BASE_URL}${path}`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input),
  })
  if (!response.ok) throw await parseError(response, `Auth request failed: ${response.status}`)
  return response.json() as Promise<ThinAuthResponse>
}

export function registerWithEmail(input: EmailAuthInput): Promise<ThinAuthResponse> {
  return postEmailAuth('/auth/register', input)
}

export function loginWithEmail(input: EmailAuthInput): Promise<ThinAuthResponse> {
  return postEmailAuth('/auth/login', input)
}

let ensureAuthPromise: Promise<void> | null = null

export async function ensureThinAuth(): Promise<void> {
  if (ensureAuthPromise) return ensureAuthPromise

  ensureAuthPromise = (async () => {
    const current = await getThinAuthMe().catch(() => ({ user: null, auth: null }))
    if (current.user) return
    throw new ThinAuthError('Not signed in', 401, 'UNAUTHORIZED')
  })().finally(() => {
    ensureAuthPromise = null
  })

  return ensureAuthPromise
}

export async function logoutThinAuth(): Promise<void> {
  const response = await fetch(`${THIN_SERVER_BASE_URL}/auth/logout`, {
    method: 'POST',
    credentials: 'include',
  })
  if (!response.ok) throw await parseError(response, `Logout failed: ${response.status}`)
}
