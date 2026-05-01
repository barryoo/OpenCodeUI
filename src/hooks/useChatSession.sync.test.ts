/// <reference types="bun" />

import { afterAll, beforeAll, beforeEach, describe, expect, mock, test } from 'bun:test'
import type { ApiSession } from '../api'

// ---------------------------------------------------------------------------
// Polyfill browser storage APIs
// ---------------------------------------------------------------------------
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

// ---------------------------------------------------------------------------
// Fetch-level mocks (no mock.module – avoids sticky cross-file pollution)
//
// Instead of mocking thinServer at the module level (which is sticky in Bun
// and cannot be unregistered), we mock globalThis.fetch to control the
// behaviour of findThinServerProfileByBaseUrl and upsertThinSessionSummary
// at the HTTP layer. This avoids polluting thinServer.test.ts when running
// in the same test suite.
// ---------------------------------------------------------------------------
const originalFetch = globalThis.fetch

const fetchCalls: Array<{ url: string; method: string; body?: string }> = []

type FetchScenario =
  | { type: 'empty-profiles' }
  | { type: 'auth-error' }
  | { type: 'throw'; error: Error }

let currentScenario: FetchScenario = { type: 'empty-profiles' }

function setupFetchMock(scenario: FetchScenario) {
  fetchCalls.length = 0
  currentScenario = scenario
  const fm = mock((url: string | URL | Request, init?: RequestInit) => {
    const urlStr = typeof url === 'string' ? url : url instanceof URL ? url.toString() : url.url
    const method = init?.method ?? 'GET'
    fetchCalls.push({ url: urlStr, method, body: init?.body as string | undefined })

    // GET /admin/server-profiles → controlled by scenario
    if (urlStr.includes('/server-profiles') && method === 'GET') {
      if (currentScenario.type === 'throw') throw currentScenario.error
      if (currentScenario.type === 'auth-error') {
        return Promise.resolve(new Response('Unauthorized', { status: 401 }))
      }
      // empty-profiles → returns empty list
      return Promise.resolve(new Response(JSON.stringify({ data: [] }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }))
    }

    // Default: return a generic success response for any other call
    // (getProjects, upsertThinSessionSummary, etc.)
    return Promise.resolve(new Response(JSON.stringify({ data: { id: 'ok' } }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    }))
  })
  globalThis.fetch = fm as unknown as typeof fetch
}

// ---------------------------------------------------------------------------
// Dynamic import (no module mocking needed)
// ---------------------------------------------------------------------------
let syncSessionSummaryToThin: typeof import('./useChatSession').syncSessionSummaryToThin

beforeAll(async () => {
  const mod = await import('./useChatSession')
  syncSessionSummaryToThin = mod.syncSessionSummaryToThin
})

afterAll(() => {
  mock.restore()
  globalThis.fetch = originalFetch
  delete (globalThis as Record<string, unknown>).sessionStorage
  delete (globalThis as Record<string, unknown>).localStorage
})

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------
const projectPath = '/tmp/proj'
const sessionId = 'session-42'

function makeSession(): ApiSession {
  return {
    id: sessionId,
    title: 'Test Chat',
    directory: projectPath,
    projectID: 'proj-1',
    time: {
      created: Date.parse('2026-05-01T10:00:00.000Z'),
      updated: Date.parse('2026-05-01T10:01:00.000Z'),
    },
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe('syncSessionSummaryToThin', () => {
  beforeEach(() => {
    fetchCalls.length = 0
  })

  test('no upsert when findThinServerProfileByBaseUrl returns null', async () => {
    setupFetchMock({ type: 'empty-profiles' })

    await syncSessionSummaryToThin(makeSession(), undefined, projectPath)

    // Verify no POST was made to session-summaries (upsert not called)
    const upsertCalls = fetchCalls.filter(
      (c) => c.url.includes('/session-summaries') && c.method === 'POST',
    )
    expect(upsertCalls).toHaveLength(0)
  })

  test('swallows ThinAuthError (401) and does not throw', async () => {
    setupFetchMock({ type: 'auth-error' })

    // Should not throw
    await syncSessionSummaryToThin(makeSession(), undefined, projectPath)

    // And upsert should not be called (error happened before upsert point)
    const upsertCalls = fetchCalls.filter(
      (c) => c.url.includes('/session-summaries') && c.method === 'POST',
    )
    expect(upsertCalls).toHaveLength(0)
  })

  test('re-throws non-ThinAuth errors', async () => {
    setupFetchMock({ type: 'throw', error: new Error('Network failure') })

    await expect(
      syncSessionSummaryToThin(makeSession(), undefined, projectPath),
    ).rejects.toThrow('Network failure')
  })
})
