import type { ServerConfig } from './config'
import type { ThinServerRepository } from './repositories'
import { createId } from './utils'

export interface AuthSession {
  token: string
  userId: string
  login: string
  createdAt: string
}

function parseCookie(cookieHeader: string | null, name: string): string | null {
  if (!cookieHeader) return null
  const parts = cookieHeader.split(';').map((part) => part.trim())
  const hit = parts.find((part) => part.startsWith(`${name}=`))
  if (!hit) return null
  return decodeURIComponent(hit.slice(name.length + 1))
}

function buildCookie(name: string, value: string, config: ServerConfig, maxAgeSeconds?: number): string {
  const parts = [`${name}=${encodeURIComponent(value)}`, 'Path=/', 'HttpOnly', 'SameSite=Lax']
  if (maxAgeSeconds !== undefined) parts.push(`Max-Age=${maxAgeSeconds}`)
  if (config.secureCookies) parts.push('Secure')
  return parts.join('; ')
}

function buildExpiry(seconds: number): string {
  return new Date(Date.now() + seconds * 1000).toISOString()
}

export function getAuthSession(request: Request, repository: ThinServerRepository, config: ServerConfig): AuthSession | null {
  const token = parseCookie(request.headers.get('cookie'), config.sessionCookieName)
  if (!token) return null
  const session = repository.findAuthSessionByToken(token)
  if (!session) return null
  repository.extendAuthSession(token, buildExpiry(config.sessionTtlSeconds))
  return {
    token: session.token,
    userId: session.userId,
    login: session.login,
    createdAt: session.createdAt,
  }
}

export function clearAuthSession(responseHeaders: Headers, config: ServerConfig) {
  responseHeaders.append('set-cookie', buildCookie(config.sessionCookieName, '', config, 0))
}

export function ensureDemoAuthSession(responseHeaders: Headers, repository: ThinServerRepository, config: ServerConfig) {
  const user = repository.upsertUserByGithubProfile({
    githubId: 'demo-github-id',
    login: 'demo-user',
    name: 'Demo User',
    avatarUrl: 'https://avatars.githubusercontent.com/u/0?v=4',
  })
  const token = createId('sess')
  repository.createAuthSession({ token, userId: user.id, login: user.login, expiresAt: buildExpiry(config.sessionTtlSeconds) })
  responseHeaders.append('set-cookie', buildCookie(config.sessionCookieName, token, config, config.sessionTtlSeconds))
  return user
}

export function createGithubState(repository: ThinServerRepository, config: ServerConfig): string {
  const state = createId('ghstate')
  repository.createOAuthState({ state, provider: 'github', expiresAt: buildExpiry(config.oauthStateTtlSeconds) })
  return state
}

export function consumeGithubState(repository: ThinServerRepository, state: string): boolean {
  return repository.consumeOAuthState(state, 'github')
}

export async function exchangeGithubCodeForUser(code: string, config: ServerConfig): Promise<{ githubId: string; login: string; name?: string | null; avatarUrl?: string | null } | null> {
  if (!config.githubClientId || !config.githubClientSecret) return null

  const tokenResponse = await fetch('https://github.com/login/oauth/access_token', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      accept: 'application/json',
    },
    body: JSON.stringify({
      client_id: config.githubClientId,
      client_secret: config.githubClientSecret,
      code,
    }),
  })

  if (!tokenResponse.ok) return null
  const tokenData = await tokenResponse.json() as { access_token?: string }
  if (!tokenData.access_token) return null

  const userResponse = await fetch('https://api.github.com/user', {
    headers: {
      authorization: `Bearer ${tokenData.access_token}`,
      accept: 'application/vnd.github+json',
      'user-agent': 'OpenCodeUI Thin Server',
    },
  })
  if (!userResponse.ok) return null
  const user = await userResponse.json() as { id: number; login: string; name?: string | null; avatar_url?: string | null }
  return {
    githubId: String(user.id),
    login: user.login,
    name: user.name ?? null,
    avatarUrl: user.avatar_url ?? null,
  }
}

export function createAuthSessionForUser(responseHeaders: Headers, repository: ThinServerRepository, config: ServerConfig, user: { id: string; login: string }) {
  const token = createId('sess')
  repository.createAuthSession({ token, userId: user.id, login: user.login, expiresAt: buildExpiry(config.sessionTtlSeconds) })
  responseHeaders.append('set-cookie', buildCookie(config.sessionCookieName, token, config, config.sessionTtlSeconds))
}

export function deleteAuthSession(request: Request, repository: ThinServerRepository, responseHeaders: Headers, config: ServerConfig) {
  const token = parseCookie(request.headers.get('cookie'), config.sessionCookieName)
  if (token) repository.deleteAuthSessionByToken(token)
  clearAuthSession(responseHeaders, config)
}
