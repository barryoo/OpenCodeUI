/// <reference types="bun" />

import { afterAll, beforeEach, describe, expect, mock, test } from 'bun:test'

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

const fetchCalls: Array<{ url: string; method: string }> = []

function installFetchMock() {
  fetchCalls.length = 0
  globalThis.fetch = mock((url: string | URL | Request, init?: RequestInit) => {
    const urlStr = typeof url === 'string' ? url : url instanceof URL ? url.toString() : url.url
    const method = init?.method ?? 'GET'
    fetchCalls.push({ url: urlStr, method })

    if (urlStr.includes('/server-profiles')) {
      return Promise.resolve(new Response(JSON.stringify({ data: [{
        id: 'profile-1',
        userId: 'user-1',
        name: 'Test Server',
        baseUrl: 'http://localhost:3000',
        isDefault: true,
      }] }), { status: 200, headers: { 'content-type': 'application/json' } }))
    }

    if (urlStr.includes('/session-summaries')) {
      return Promise.resolve(new Response(JSON.stringify({ sessions: [] }), { status: 200, headers: { 'content-type': 'application/json' } }))
    }

    return Promise.resolve(new Response(JSON.stringify({ data: null }), { status: 200, headers: { 'content-type': 'application/json' } }))
  }) as unknown as typeof fetch
}

beforeEach(async () => {
  installFetchMock()
  const { queryClient } = await import('./client')
  queryClient.clear()
})

describe('admin query dedupe', () => {
  test('dedupes concurrent server profile reads', async () => {
    const { fetchThinServerProfilesQuery } = await import('./admin')

    await Promise.all([
      fetchThinServerProfilesQuery(),
      fetchThinServerProfilesQuery(),
    ])

    expect(fetchCalls.filter((call) => call.url.includes('/server-profiles') && call.method === 'GET')).toHaveLength(1)
  })

  test('dedupes concurrent global session summaries reads', async () => {
    const { fetchAllThinSessionSummariesQuery } = await import('./admin')

    await Promise.all([
      fetchAllThinSessionSummariesQuery(),
      fetchAllThinSessionSummariesQuery(),
    ])

    expect(fetchCalls.filter((call) => call.url.includes('/session-summaries') && call.method === 'GET')).toHaveLength(1)
  })
})

afterAll(() => {
  globalThis.fetch = originalFetch
  delete (globalThis as Record<string, unknown>).sessionStorage
  delete (globalThis as Record<string, unknown>).localStorage
})
