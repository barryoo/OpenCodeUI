/// <reference types="bun" />

import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test'

// ---------------------------------------------------------------------------
// Polyfill browser storage APIs before any dynamic import that depends on them.
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

// Dynamic imports (after polyfills are in place)
let handleNewSessionBinding: typeof import('./useChatSession').handleNewSessionBinding
let useItemWorkspaceStore: typeof import('../store/itemWorkspaceStore').useItemWorkspaceStore

beforeAll(async () => {
  const [hookMod, storeMod] = await Promise.all([
    import('./useChatSession'),
    import('../store/itemWorkspaceStore'),
  ])
  handleNewSessionBinding = hookMod.handleNewSessionBinding
  useItemWorkspaceStore = storeMod.useItemWorkspaceStore
})

afterAll(() => {
  delete (globalThis as Record<string, unknown>).sessionStorage
  delete (globalThis as Record<string, unknown>).localStorage
})

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

const projectPath = '/tmp/proj'
const itemId = 'item-99'

describe('handleNewSessionBinding', () => {
  beforeEach(() => {
    useItemWorkspaceStore.getState().reset()
    useItemWorkspaceStore.setState({
      pendingItemSessionBinding: { projectPath, itemId },
    })
  })

  test('keeps pending binding visible during sync execution', async () => {
    let bindingDuringSync: unknown = undefined

    await handleNewSessionBinding(async (binding) => {
      expect(binding).toEqual({ projectPath, itemId })
      bindingDuringSync = useItemWorkspaceStore.getState().pendingItemSessionBinding
    })

    expect(bindingDuringSync).toEqual({ projectPath, itemId })
  })

  test('clears pending binding after sync completes', async () => {
    await handleNewSessionBinding(async () => {
      // sync succeeds
    })

    expect(useItemWorkspaceStore.getState().pendingItemSessionBinding).toBeNull()
  })

  test('retains pending binding when sync throws', async () => {
    const syncError = new Error('sync failed')

    await handleNewSessionBinding(async () => {
      throw syncError
    }).catch(() => {
      // Expected error – verify binding is preserved despite failure
    })

    expect(useItemWorkspaceStore.getState().pendingItemSessionBinding).toEqual({ projectPath, itemId })
  })

  test('does not consume binding when it was replaced by a different one during sync', async () => {
    const originalBinding = { projectPath: '/tmp/original', itemId: 'item-original' }
    const newBinding = { projectPath: '/tmp/replaced', itemId: 'item-replaced' }

    useItemWorkspaceStore.setState({ pendingItemSessionBinding: originalBinding })

    await handleNewSessionBinding(async (binding) => {
      expect(binding).toEqual(originalBinding)
      // Simulate a concurrent operation that replaces the pending binding
      useItemWorkspaceStore.setState({ pendingItemSessionBinding: newBinding })
    })

    // Original was NOT consumed (it was replaced), new binding is preserved
    expect(useItemWorkspaceStore.getState().pendingItemSessionBinding).toEqual(newBinding)
  })
})
