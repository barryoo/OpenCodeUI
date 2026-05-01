/// <reference types="bun" />

import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test'

// Polyfill browser globals needed by events.ts (document.addEventListener etc.)
const docListeners = new Map<string, Set<EventListener>>()
const fakeDocument = {
  addEventListener: (event: string, handler: EventListener) => {
    if (!docListeners.has(event)) docListeners.set(event, new Set())
    docListeners.get(event)!.add(handler)
  },
  removeEventListener: (event: string, handler: EventListener) => {
    docListeners.get(event)?.delete(handler)
  },
  visibilityState: 'visible' as const,
}
;(globalThis as Record<string, unknown>).document = fakeDocument
;(globalThis as Record<string, unknown>).window = {
  addEventListener: fakeDocument.addEventListener,
  removeEventListener: fakeDocument.removeEventListener,
}

// Polyfill sessionStorage & localStorage (needed by store constructors)
const storageMap = new Map<string, string>()
const storage: Storage = {
  getItem: (key: string) => storageMap.get(key) ?? null,
  setItem: (key: string, value: string) => { storageMap.set(key, value) },
  removeItem: (key: string) => { storageMap.delete(key) },
  clear: () => { storageMap.clear() },
  get length() { return storageMap.size },
  key: (index: number) => Array.from(storageMap.keys())[index] ?? null,
}
;(globalThis as Record<string, unknown>).sessionStorage = storage
;(globalThis as Record<string, unknown>).localStorage = storage

const originalFetch = globalThis.fetch

describe('subscribeToEvents - startup order', () => {
  let fetchCalls: Array<{ url: string }> = []
  let initResolve: (() => void) | null = null
  let cleanups: Array<() => void> = []

  beforeEach(() => {
    fetchCalls = []
    initResolve = null
    cleanups = []
    mock.restore()
  })

  afterEach(() => {
    mock.restore()
    globalThis.fetch = originalFetch
    cleanups.forEach(fn => fn())
    cleanups = []
  })

  // ---- shared mock helpers ----

  const baseMocks = () => {
    mock.module('../store/startupChoiceStore', () => ({
      startupChoiceStore: {
        isResolved: () => true,
        waitUntilResolved: () => Promise.resolve(),
      },
    }))
    mock.module('../utils/tauri', () => ({
      isTauri: () => false,
    }))
    globalThis.fetch = ((url: string | URL, _init?: RequestInit) => {
      fetchCalls.push({ url: typeof url === 'string' ? url : url.toString() })
      return Promise.resolve(new Response(
        new ReadableStream({
          start() { /* never push data – simulates open SSE connection */ }
        }),
        { status: 200 }
      ))
    }) as typeof fetch
  }

  /** Flush the microtask queue so any pending async continuations run */
  async function flushMicrotasks(): Promise<void> {
    await Promise.resolve()
  }

  // ---- existing tests ----

  test('does NOT fetch /global/event before serverStore.initialize() resolves', async () => {
    mock.module('../store/serverStore', () => ({
      serverStore: {
        initialize: () => {
          return new Promise<void>((resolve) => {
            initResolve = resolve
          })
        },
        getActiveBaseUrl: () => 'https://test.example.com',
        getActiveAuth: () => null,
      },
      makeBasicAuthHeader: () => '',
    }))
    baseMocks()

    const { subscribeToEvents } = await import('./events')

    cleanups.push(subscribeToEvents({}))

    // Sync: no fetch dispatched
    expect(fetchCalls).toHaveLength(0)

    // Flush microtasks – still no fetch because initialize() pending
    await flushMicrotasks()
    expect(fetchCalls).toHaveLength(0)

    // Resolve initialize – queues connectSingleton continuation as microtask
    initResolve?.()
    await flushMicrotasks()

    expect(fetchCalls).toHaveLength(1)
    expect(fetchCalls[0].url).toContain('/global/event')
  })

  test('does not double-fetch when subscribing again before initialize() resolves', async () => {
    mock.module('../store/serverStore', () => ({
      serverStore: {
        initialize: () => {
          return new Promise<void>((resolve) => {
            initResolve = resolve
          })
        },
        getActiveBaseUrl: () => 'https://test.example.com',
        getActiveAuth: () => null,
      },
      makeBasicAuthHeader: () => '',
    }))
    baseMocks()

    const { subscribeToEvents } = await import('./events')

    cleanups.push(subscribeToEvents({}))
    cleanups.push(subscribeToEvents({}))

    initResolve?.()
    await flushMicrotasks()

    expect(fetchCalls).toHaveLength(1)
  })

  // ---- review gap 1: initialize failure ----

  test('calls onError and sets error state when serverStore.initialize() fails', async () => {
    mock.module('../store/serverStore', () => ({
      serverStore: {
        initialize: () => Promise.reject(new Error('BOOT_FAIL')),
        getActiveBaseUrl: () => 'https://fallback.example.com',
        getActiveAuth: () => null,
      },
      makeBasicAuthHeader: () => '',
    }))
    baseMocks()

    const { subscribeToEvents, subscribeToConnectionState } = await import('./events')

    // Track errors via EventCallbacks.onError
    const errors: Error[] = []
    cleanups.push(subscribeToEvents({ onError: (e) => errors.push(e) }))

    // Track connection state changes
    const states: string[] = []
    const unsubState = subscribeToConnectionState((info) => {
      states.push(info.state)
    })
    cleanups.push(unsubState)

    // Wait for the rejected promise to propagate through microtask queue
    await flushMicrotasks()

    // Assert: onError was called with the initialization failure message
    expect(errors).toHaveLength(1)
    expect(errors[0].message).toContain('BOOT_FAIL')

    // Assert: connection state moved to 'error'
    // (initial snapshot is 'disconnected', then error handler sets 'error')
    expect(states).toContain('error')

    // Assert: no fetch to /global/event was dispatched
    expect(fetchCalls).toHaveLength(0)
  })

  // ---- review gap 2: baseUrl correctness ----

  test('uses initialized baseUrl, not fallback, for /global/event fetch', async () => {
    const INIT_URL = 'https://initialized-server.example.com'

    mock.module('../store/serverStore', () => ({
      serverStore: {
        initialize: () => {
          return new Promise<void>((resolve) => {
            initResolve = resolve
          })
        },
        getActiveBaseUrl: () => INIT_URL,
        getActiveAuth: () => null,
      },
      makeBasicAuthHeader: () => '',
    }))
    baseMocks()

    const { subscribeToEvents } = await import('./events')

    cleanups.push(subscribeToEvents({}))

    // Resolve initialize
    initResolve?.()
    await flushMicrotasks()

    expect(fetchCalls).toHaveLength(1)
    // Exact URL from the initialized server store
    expect(fetchCalls[0].url).toBe(`${INIT_URL}/global/event`)
    // Must NOT be the localhost fallback from constants
    expect(fetchCalls[0].url).not.toContain('127.0.0.1')
  })
})
