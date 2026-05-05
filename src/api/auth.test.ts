/// <reference types="bun" />

import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test'

const originalFetch = globalThis.fetch

describe('auth api', () => {
  beforeEach(() => {
    globalThis.fetch = mock((url: string | URL | Request, _init?: RequestInit) => {
      const urlString = typeof url === 'string' ? url : url instanceof URL ? url.toString() : url.url
      if (urlString.endsWith('/auth/register')) {
        return Promise.resolve(new Response(JSON.stringify({
          user: { id: 'u1', githubId: null, login: 'user@example.com', email: 'user@example.com', name: null, avatarUrl: null },
          auth: { provider: 'password', mode: 'password' },
        }), { status: 201 }))
      }
      if (urlString.endsWith('/auth/login')) {
        return Promise.resolve(new Response(JSON.stringify({
          user: { id: 'u1', githubId: null, login: 'user@example.com', email: 'user@example.com', name: null, avatarUrl: null },
          auth: { provider: 'password', mode: 'password' },
        }), { status: 200 }))
      }
      return Promise.resolve(new Response(JSON.stringify({ user: null, auth: null }), { status: 200 }))
    }) as unknown as typeof fetch
  })

  afterEach(() => {
    mock.restore()
    globalThis.fetch = originalFetch
  })

  test('posts register payload', async () => {
    const { registerWithEmail } = await import('./auth')

    await registerWithEmail({ email: 'user@example.com', password: 'abc12345' })

    expect(globalThis.fetch).toHaveBeenCalledWith('/admin/auth/register', expect.objectContaining({
      method: 'POST',
      credentials: 'include',
      body: JSON.stringify({ email: 'user@example.com', password: 'abc12345' }),
    }))
  })

  test('posts login payload', async () => {
    const { loginWithEmail } = await import('./auth')

    await loginWithEmail({ email: 'user@example.com', password: 'abc12345' })

    expect(globalThis.fetch).toHaveBeenCalledWith('/admin/auth/login', expect.objectContaining({
      method: 'POST',
      credentials: 'include',
      body: JSON.stringify({ email: 'user@example.com', password: 'abc12345' }),
    }))
  })

  test('parses register error response', async () => {
    globalThis.fetch = mock(() => Promise.resolve(new Response(JSON.stringify({
      error: { code: 'EMAIL_EXISTS', message: '邮箱已注册' },
    }), { status: 409 }))) as unknown as typeof fetch

    const { registerWithEmail, ThinAuthError } = await import('./auth')

    await expect(registerWithEmail({ email: 'user@example.com', password: 'abc12345' })).rejects.toBeInstanceOf(ThinAuthError)
    await expect(registerWithEmail({ email: 'user@example.com', password: 'abc12345' })).rejects.toMatchObject({ code: 'EMAIL_EXISTS', message: '邮箱已注册' })
  })

  test('parses login error response', async () => {
    globalThis.fetch = mock(() => Promise.resolve(new Response(JSON.stringify({
      error: { code: 'INVALID_CREDENTIALS', message: '邮箱或密码错误' },
    }), { status: 401 }))) as unknown as typeof fetch

    const { loginWithEmail, ThinAuthError } = await import('./auth')

    await expect(loginWithEmail({ email: 'user@example.com', password: 'wrongpass1' })).rejects.toBeInstanceOf(ThinAuthError)
    await expect(loginWithEmail({ email: 'user@example.com', password: 'wrongpass1' })).rejects.toMatchObject({ code: 'INVALID_CREDENTIALS', message: '邮箱或密码错误' })
  })
})
