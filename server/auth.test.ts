/// <reference types="bun" />

import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test'

describe('auth helpers', () => {
  test('normalizes email', async () => {
    const { normalizeEmail } = await import('./auth')

    expect(normalizeEmail('  USER@Example.com ')).toBe('user@example.com')
  })

  test('validates password policy', async () => {
    const { validatePassword } = await import('./auth')

    expect(validatePassword('abc12345')).toEqual({ ok: true })
    expect(validatePassword('abcdefg')).toEqual({ ok: false, message: '密码至少 8 位且包含字母和数字' })
    expect(validatePassword('12345678')).toEqual({ ok: false, message: '密码至少 8 位且包含字母和数字' })
  })

  test('hashes and verifies password', async () => {
    const { hashPassword, verifyPassword } = await import('./auth')

    const hash = await hashPassword('abc12345')

    expect(await verifyPassword('abc12345', hash)).toBe(true)
    expect(await verifyPassword('wrongpass1', hash)).toBe(false)
  })
})

describe('exchangeGithubCodeForUser', () => {
  const originalFetch = globalThis.fetch

  beforeEach(() => {
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
        { email: 'user@example.com', primary: true, verified: true },
      ]), { status: 200 }))
    }) as typeof fetch
  })

  afterEach(() => {
    mock.restore()
    globalThis.fetch = originalFetch
  })

  test('loads primary verified email from github emails api', async () => {
    const { exchangeGithubCodeForUser } = await import('./auth')

    const user = await exchangeGithubCodeForUser('code-1', {
      githubClientId: 'client',
      githubClientSecret: 'secret',
      sessionCookieName: 'session',
      sessionTtlSeconds: 3600,
      oauthStateTtlSeconds: 600,
      secureCookies: false,
    })

    expect(user).toEqual({
      githubId: '1',
      login: 'octocat',
      email: 'user@example.com',
      name: 'Octo Cat',
      avatarUrl: 'https://example.com/avatar.png',
    })
  })
})
