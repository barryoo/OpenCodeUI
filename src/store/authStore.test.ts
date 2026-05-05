/// <reference types="bun" />

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, mock, test } from 'bun:test'

const storageMap = new Map<string, string>()
const polyfill: Storage = {
  getItem: (key: string) => storageMap.get(key) ?? null,
  setItem: (key: string, value: string) => { storageMap.set(key, value) },
  removeItem: (key: string) => { storageMap.delete(key) },
  clear: () => { storageMap.clear() },
  get length() { return storageMap.size },
  key: (index: number) => Array.from(storageMap.keys())[index] ?? null,
}

;(globalThis as Record<string, unknown>).sessionStorage = polyfill
;(globalThis as Record<string, unknown>).localStorage = polyfill

let authStore: typeof import('./authStore').authStore

const loginWithEmailMock = mock(() => Promise.resolve({
  user: { id: 'u1', githubId: null, login: 'user@example.com', email: 'user@example.com', name: null, avatarUrl: null },
  auth: { provider: 'password', mode: 'password' },
}))

const registerWithEmailMock = mock(() => Promise.resolve({
  user: { id: 'u1', githubId: null, login: 'user@example.com', email: 'user@example.com', name: null, avatarUrl: null },
  auth: { provider: 'password', mode: 'password' },
}))
const resetWorkspaceMock = mock(() => undefined)
const clearMessageStoreMock = mock(() => undefined)
const clearChildSessionStoreMock = mock(() => undefined)
const clearTodoStoreMock = mock(() => undefined)
const clearNotificationStoreMock = mock(() => undefined)
const clearMessageCacheMock = mock(() => Promise.resolve())
const getThinAuthMeMock = mock(() => Promise.resolve({ user: null, auth: null }))

beforeAll(async () => {
  mock.module('./messageCacheStore', () => ({
    messageCacheStore: { clearAll: clearMessageCacheMock },
  }))
  mock.module('./messageStore', () => ({
    messageStore: { clearAll: clearMessageStoreMock },
  }))
  mock.module('./childSessionStore', () => ({
    childSessionStore: { clearAll: clearChildSessionStoreMock },
  }))
  mock.module('./todoStore', () => ({
    todoStore: { clearAll: clearTodoStoreMock },
  }))
  mock.module('./notificationStore', () => ({
    notificationStore: { clearAll: clearNotificationStoreMock },
  }))
  mock.module('./itemWorkspaceStore', () => ({
    useItemWorkspaceStore: { getState: () => ({ reset: resetWorkspaceMock }) },
  }))

  mock.module('../api/auth', () => ({
    ThinAuthError: class ThinAuthError extends Error {
      status: number
      code?: string
      constructor(message: string, status: number, code?: string) {
        super(message)
        this.status = status
        this.code = code
      }
    },
    getThinAuthMe: getThinAuthMeMock,
    ensureThinAuth: mock(() => Promise.resolve()),
    loginWithGithub: mock(() => Promise.resolve()),
    logoutThinAuth: mock(() => Promise.resolve()),
    loginWithEmail: loginWithEmailMock,
    registerWithEmail: registerWithEmailMock,
  }))

  const mod = await import('./authStore')
  authStore = mod.authStore
})

beforeEach(() => {
  storageMap.clear()
  loginWithEmailMock.mockClear()
  registerWithEmailMock.mockClear()
  getThinAuthMeMock.mockClear()
  resetWorkspaceMock.mockClear()
  clearMessageStoreMock.mockClear()
  clearChildSessionStoreMock.mockClear()
  clearTodoStoreMock.mockClear()
  clearNotificationStoreMock.mockClear()
  clearMessageCacheMock.mockClear()
})

afterEach(() => {
  mock.restore()
})

afterAll(() => {
  delete (globalThis as Record<string, unknown>).sessionStorage
  delete (globalThis as Record<string, unknown>).localStorage
})

describe('authStore email auth', () => {
  test('loginWithEmail sets authenticated state', async () => {
    await authStore.loginWithEmail('user@example.com', 'abc12345')

    const state = authStore.getSnapshot()
    expect(state.status).toBe('authenticated')
    expect(state.user?.email).toBe('user@example.com')
    expect(state.mode).toBe('password')
  })

  test('registerWithEmail sets authenticated state', async () => {
    await authStore.registerWithEmail('user@example.com', 'abc12345')

    const state = authStore.getSnapshot()
    expect(state.status).toBe('authenticated')
    expect(state.user?.email).toBe('user@example.com')
    expect(state.mode).toBe('password')
  })

  test('loginWithEmail clears user-bound state before switching users', async () => {
    await authStore.registerWithEmail('old@example.com', 'abc12345')

    loginWithEmailMock.mockResolvedValueOnce({
      user: { id: 'u2', githubId: null, login: 'next@example.com', email: 'next@example.com', name: null, avatarUrl: null },
      auth: { provider: 'password', mode: 'password' },
    })

    await authStore.loginWithEmail('next@example.com', 'abc12345')

    expect(clearMessageStoreMock).toHaveBeenCalled()
    expect(clearChildSessionStoreMock).toHaveBeenCalled()
    expect(clearTodoStoreMock).toHaveBeenCalled()
    expect(clearNotificationStoreMock).toHaveBeenCalled()
    expect(resetWorkspaceMock).toHaveBeenCalled()
    expect(clearMessageCacheMock).toHaveBeenCalled()
  })

  test('loginWithEmail writes anonymous error state on failure and rethrows', async () => {
    await authStore.handleUnauthorized()
    loginWithEmailMock.mockRejectedValueOnce(new Error('邮箱或密码错误'))

    await expect(authStore.loginWithEmail('user@example.com', 'badpass1')).rejects.toThrow('邮箱或密码错误')

    const state = authStore.getSnapshot()
    expect(state.status).toBe('anonymous')
    expect(state.error).toBe('邮箱或密码错误')
  })

  test('registerWithEmail writes anonymous error state on failure and rethrows', async () => {
    await authStore.handleUnauthorized()
    registerWithEmailMock.mockRejectedValueOnce(new Error('邮箱已注册'))

    await expect(authStore.registerWithEmail('user@example.com', 'abc12345')).rejects.toThrow('邮箱已注册')

    const state = authStore.getSnapshot()
    expect(state.status).toBe('anonymous')
    expect(state.error).toBe('邮箱已注册')
  })

  test('loginWithEmail keeps previous authenticated user on failure', async () => {
    await authStore.registerWithEmail('user@example.com', 'abc12345')
    loginWithEmailMock.mockRejectedValueOnce(new Error('邮箱或密码错误'))

    await expect(authStore.loginWithEmail('next@example.com', 'badpass1')).rejects.toThrow('邮箱或密码错误')

    const state = authStore.getSnapshot()
    expect(state.status).toBe('authenticated')
    expect(state.user?.email).toBe('user@example.com')
    expect(state.error).toBe('邮箱或密码错误')
  })

  test('refresh clears user-bound state when session becomes anonymous', async () => {
    await authStore.registerWithEmail('user@example.com', 'abc12345')
    getThinAuthMeMock.mockResolvedValueOnce({ user: null, auth: null })

    await authStore.refresh()

    const state = authStore.getSnapshot()
    expect(state.status).toBe('anonymous')
    expect(clearMessageStoreMock).toHaveBeenCalled()
    expect(clearChildSessionStoreMock).toHaveBeenCalled()
    expect(clearTodoStoreMock).toHaveBeenCalled()
    expect(clearNotificationStoreMock).toHaveBeenCalled()
    expect(resetWorkspaceMock).toHaveBeenCalled()
    expect(clearMessageCacheMock).toHaveBeenCalled()
  })
})
