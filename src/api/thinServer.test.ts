/// <reference types="bun" />

import { afterAll, afterEach, describe, expect, mock, test } from 'bun:test'
import type { ThinServerProfile } from '../api/thinServer'

// Polyfill sessionStorage & localStorage for module side-effects
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

const originalFetch = globalThis.fetch

let fetchMockCalls: Array<[url: string | URL | Request, init?: RequestInit]> = []

function createFetchMock(profiles: ThinServerProfile[]) {
  fetchMockCalls = []
  const fm = mock((url: string | URL | Request, init?: RequestInit) => {
    fetchMockCalls.push([url, init])
    const urlStr = typeof url === 'string' ? url : url instanceof URL ? url.toString() : url.url
    if (urlStr.includes('/server-profiles') && (!init || init.method === undefined || init.method === 'GET')) {
      return Promise.resolve(new Response(JSON.stringify({ data: profiles }), { status: 200 }))
    }
    if (urlStr.includes('/server-profiles') && init?.method === 'POST') {
      return Promise.resolve(new Response(JSON.stringify({ data: null, error: { message: 'POST not expected' } }), { status: 400 }))
    }
    return Promise.resolve(new Response(JSON.stringify({}), { status: 500 }))
  })
  globalThis.fetch = fm as unknown as typeof fetch
  return fm
}

afterEach(() => {
  mock.restore()
  globalThis.fetch = originalFetch
  storageMap.clear()
})

describe('findThinServerProfileByBaseUrl', () => {
  afterAll(() => {
    delete (globalThis as Record<string, unknown>).sessionStorage
    delete (globalThis as Record<string, unknown>).localStorage
  })
  test('returns null when no profile matches baseUrl, and does not send POST', async () => {
    createFetchMock([])

    const { findThinServerProfileByBaseUrl } = await import('../api/thinServer')

    const result = await findThinServerProfileByBaseUrl('https://unknown.example.com')

    expect(result).toBeNull()

    // Verify no POST request was made
    const postCalls = fetchMockCalls.filter(
      ([, init]) => init?.method === 'POST',
    )
    expect(postCalls).toHaveLength(0)
  })

  test('returns existing profile when baseUrl matches', async () => {
    const existingProfile: ThinServerProfile = {
      id: 'profile-1',
      userId: 'user-1',
      name: 'My Server',
      baseUrl: 'https://match.example.com',
      isDefault: true,
    }
    createFetchMock([existingProfile])

    const { findThinServerProfileByBaseUrl } = await import('../api/thinServer')

    const result = await findThinServerProfileByBaseUrl('https://match.example.com')

    expect(result).toEqual(existingProfile)
    expect(result).not.toBeNull()
  })

  test('matches profile when baseUrl differs only by trailing slash', async () => {
    const storedProfile: ThinServerProfile = {
      id: 'profile-2',
      userId: 'user-1',
      name: 'Trailing Slash Server',
      baseUrl: 'https://example.com/',
      isDefault: false,
    }
    createFetchMock([storedProfile])

    const { findThinServerProfileByBaseUrl } = await import('../api/thinServer')

    const result = await findThinServerProfileByBaseUrl('https://example.com')

    expect(result).toEqual(storedProfile)
    expect(result).not.toBeNull()
  })
})
