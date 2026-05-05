/// <reference types="bun" />

import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test'
import { rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { handleRequest } from './app'
import { createDatabaseContext } from './db'
import { ThinServerRepository } from './repositories'

describe('auth callback conflict handling', () => {
  const originalFetch = globalThis.fetch
  let databasePath: string
  let repository: ThinServerRepository

  beforeEach(() => {
    databasePath = join(tmpdir(), `opencodeui-auth-app-${Date.now()}-${Math.random()}.sqlite`)
    repository = new ThinServerRepository(createDatabaseContext(databasePath))
    repository.migrate()

    let call = 0
    globalThis.fetch = mock(() => {
      call += 1
      if (call === 1) {
        return Promise.resolve(new Response(JSON.stringify({ access_token: 'token-1' }), { status: 200 }))
      }
      if (call === 2) {
        return Promise.resolve(new Response(JSON.stringify({
          id: 1,
          login: 'octocat',
          name: 'Octo Cat',
          avatar_url: 'https://example.com/avatar.png',
        }), { status: 200 }))
      }
      return Promise.resolve(new Response(JSON.stringify([
        { email: 'owner@example.com', primary: true, verified: true },
      ]), { status: 200 }))
    }) as typeof fetch
  })

  afterEach(() => {
    mock.restore()
    globalThis.fetch = originalFetch
    rmSync(databasePath, { force: true })
  })

  test('returns auth conflict instead of 500 when github email belongs to another user', async () => {
    repository.createEmailUser({ email: 'owner@example.com', passwordHash: 'hash-1' })
    repository.upsertUserByGithubProfile({ githubId: '1', login: 'octocat', email: 'user@example.com' })
    repository.createOAuthState({ state: 'state-1', provider: 'github', expiresAt: new Date(Date.now() + 60_000).toISOString() })

    const response = await handleRequest(new Request('http://localhost/admin/auth/github/callback?code=code-1&state=state-1'), {
      database: createDatabaseContext(databasePath),
      repository,
      config: {
        host: '127.0.0.1',
        port: 4097,
        databasePath,
        sessionCookieName: 'opencodeui_session',
        sessionTtlSeconds: 3600,
        oauthStateTtlSeconds: 600,
        secureCookies: false,
        githubClientId: 'client',
        githubClientSecret: 'secret',
      },
    })

    expect(response.status).toBe(409)
  })
})

describe('auth me descriptor', () => {
  let databasePath: string
  let repository: ThinServerRepository

  beforeEach(() => {
    databasePath = join(tmpdir(), `opencodeui-auth-me-${Date.now()}-${Math.random()}.sqlite`)
    repository = new ThinServerRepository(createDatabaseContext(databasePath))
    repository.migrate()
  })

  afterEach(() => {
    rmSync(databasePath, { force: true })
  })

  test('returns password auth descriptor for email user session', async () => {
    const user = repository.createEmailUser({ email: 'user@example.com', passwordHash: 'hash-1' })
    repository.createAuthSession({
      token: 'token-1',
      userId: user.id,
      login: user.login,
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
    })

    const response = await handleRequest(new Request('http://localhost/admin/auth/me', {
      headers: { cookie: 'opencodeui_session=token-1' },
    }), {
      database: createDatabaseContext(databasePath),
      repository,
      config: {
        host: '127.0.0.1',
        port: 4097,
        databasePath,
        sessionCookieName: 'opencodeui_session',
        sessionTtlSeconds: 3600,
        oauthStateTtlSeconds: 600,
        secureCookies: false,
      },
    })

    const body = await response.json() as { auth: { provider: string; mode: string } }
    expect(body.auth).toEqual({ provider: 'password', mode: 'password' })
  })
})

describe('email auth routes', () => {
  let databasePath: string
  let repository: ThinServerRepository

  beforeEach(() => {
    databasePath = join(tmpdir(), `opencodeui-email-auth-${Date.now()}-${Math.random()}.sqlite`)
    repository = new ThinServerRepository(createDatabaseContext(databasePath))
    repository.migrate()
  })

  afterEach(() => {
    rmSync(databasePath, { force: true })
  })

  test('registers email user and creates session', async () => {
    const response = await handleRequest(new Request('http://localhost/admin/auth/register', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'user@example.com', password: 'abc12345' }),
    }), {
      database: createDatabaseContext(databasePath),
      repository,
      config: {
        host: '127.0.0.1',
        port: 4097,
        databasePath,
        sessionCookieName: 'opencodeui_session',
        sessionTtlSeconds: 3600,
        oauthStateTtlSeconds: 600,
        secureCookies: false,
      },
    })

    expect(response.status).toBe(201)
    expect(response.headers.get('set-cookie')).toContain('opencodeui_session=')
    const body = await response.json() as { user: { email: string | null; passwordHash?: string | null }, auth: { provider: string; mode: string } }
    expect(body.user.email).toBe('user@example.com')
    expect(body.user.passwordHash).toBeUndefined()
    expect(body.auth).toEqual({ provider: 'password', mode: 'password' })
  })

  test('rejects duplicate registration', async () => {
    repository.createEmailUser({ email: 'user@example.com', passwordHash: await Bun.password.hash('abc12345') })

    const response = await handleRequest(new Request('http://localhost/admin/auth/register', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'user@example.com', password: 'abc12345' }),
    }), {
      database: createDatabaseContext(databasePath),
      repository,
      config: {
        host: '127.0.0.1',
        port: 4097,
        databasePath,
        sessionCookieName: 'opencodeui_session',
        sessionTtlSeconds: 3600,
        oauthStateTtlSeconds: 600,
        secureCookies: false,
      },
    })

    expect(response.status).toBe(409)
  })

  test('rejects invalid email during registration', async () => {
    const response = await handleRequest(new Request('http://localhost/admin/auth/register', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'invalid-email', password: 'abc12345' }),
    }), {
      database: createDatabaseContext(databasePath),
      repository,
      config: {
        host: '127.0.0.1',
        port: 4097,
        databasePath,
        sessionCookieName: 'opencodeui_session',
        sessionTtlSeconds: 3600,
        oauthStateTtlSeconds: 600,
        secureCookies: false,
      },
    })

    expect(response.status).toBe(400)
  })

  test('rejects weak password during registration', async () => {
    const response = await handleRequest(new Request('http://localhost/admin/auth/register', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'user@example.com', password: '12345678' }),
    }), {
      database: createDatabaseContext(databasePath),
      repository,
      config: {
        host: '127.0.0.1',
        port: 4097,
        databasePath,
        sessionCookieName: 'opencodeui_session',
        sessionTtlSeconds: 3600,
        oauthStateTtlSeconds: 600,
        secureCookies: false,
      },
    })

    expect(response.status).toBe(400)
  })

  test('rejects missing login fields', async () => {
    const response = await handleRequest(new Request('http://localhost/admin/auth/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'user@example.com' }),
    }), {
      database: createDatabaseContext(databasePath),
      repository,
      config: {
        host: '127.0.0.1',
        port: 4097,
        databasePath,
        sessionCookieName: 'opencodeui_session',
        sessionTtlSeconds: 3600,
        oauthStateTtlSeconds: 600,
        secureCookies: false,
      },
    })

    expect(response.status).toBe(400)
  })

  test('auth me does not expose password hash', async () => {
    const user = repository.createEmailUser({ email: 'user@example.com', passwordHash: 'hash-1' })
    repository.createAuthSession({
      token: 'token-auth-me',
      userId: user.id,
      login: user.login,
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
    })

    const response = await handleRequest(new Request('http://localhost/admin/auth/me', {
      headers: { cookie: 'opencodeui_session=token-auth-me' },
    }), {
      database: createDatabaseContext(databasePath),
      repository,
      config: {
        host: '127.0.0.1',
        port: 4097,
        databasePath,
        sessionCookieName: 'opencodeui_session',
        sessionTtlSeconds: 3600,
        oauthStateTtlSeconds: 600,
        secureCookies: false,
      },
    })

    const body = await response.json() as { user: { passwordHash?: string | null } }
    expect(body.user.passwordHash).toBeUndefined()
  })

  test('logs in email user', async () => {
    repository.createEmailUser({ email: 'user@example.com', passwordHash: await Bun.password.hash('abc12345') })

    const response = await handleRequest(new Request('http://localhost/admin/auth/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'USER@example.com', password: 'abc12345' }),
    }), {
      database: createDatabaseContext(databasePath),
      repository,
      config: {
        host: '127.0.0.1',
        port: 4097,
        databasePath,
        sessionCookieName: 'opencodeui_session',
        sessionTtlSeconds: 3600,
        oauthStateTtlSeconds: 600,
        secureCookies: false,
      },
    })

    expect(response.status).toBe(200)
    expect(response.headers.get('set-cookie')).toContain('opencodeui_session=')
  })

  test('rejects wrong password with generic error', async () => {
    repository.createEmailUser({ email: 'user@example.com', passwordHash: await Bun.password.hash('abc12345') })

    const response = await handleRequest(new Request('http://localhost/admin/auth/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'user@example.com', password: 'wrongpass1' }),
    }), {
      database: createDatabaseContext(databasePath),
      repository,
      config: {
        host: '127.0.0.1',
        port: 4097,
        databasePath,
        sessionCookieName: 'opencodeui_session',
        sessionTtlSeconds: 3600,
        oauthStateTtlSeconds: 600,
        secureCookies: false,
      },
    })

    expect(response.status).toBe(401)
    const body = await response.json() as { error: { message: string } }
    expect(body.error.message).toBe('邮箱或密码错误')
  })

  test('returns anonymous auth payload when no session exists', async () => {
    const response = await handleRequest(new Request('http://localhost/admin/auth/me'), {
      database: createDatabaseContext(databasePath),
      repository,
      config: {
        host: '127.0.0.1',
        port: 4097,
        databasePath,
        sessionCookieName: 'opencodeui_session',
        sessionTtlSeconds: 3600,
        oauthStateTtlSeconds: 600,
        secureCookies: false,
      },
    })

    const body = await response.json() as { user: null; auth: null }
    expect(response.status).toBe(200)
    expect(body).toEqual({ user: null, auth: null })
  })

  test('logout clears cookie and removes session', async () => {
    const user = repository.createEmailUser({ email: 'user@example.com', passwordHash: 'hash-1' })
    repository.createAuthSession({
      token: 'logout-token',
      userId: user.id,
      login: user.login,
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
    })

    const response = await handleRequest(new Request('http://localhost/admin/auth/logout', {
      method: 'POST',
      headers: { cookie: 'opencodeui_session=logout-token' },
    }), {
      database: createDatabaseContext(databasePath),
      repository,
      config: {
        host: '127.0.0.1',
        port: 4097,
        databasePath,
        sessionCookieName: 'opencodeui_session',
        sessionTtlSeconds: 3600,
        oauthStateTtlSeconds: 600,
        secureCookies: false,
      },
    })

    expect(response.status).toBe(200)
    expect(response.headers.get('set-cookie')).toContain('Max-Age=0')
    expect(repository.findAuthSessionByToken('logout-token')).toBeNull()
  })
})
