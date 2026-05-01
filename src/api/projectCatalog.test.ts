/// <reference types="bun" />

import { beforeEach, describe, expect, mock, test } from 'bun:test'
import type { ApiProject } from './client'
import { createProjectCatalog, normalizeProjectPath } from './projectCatalog'

function makeProject(id: string, name: string, worktree: string): ApiProject {
  return { id, name, worktree, sandboxes: [], time: { created: 1, updated: 1 } }
}

describe('projectCatalog', () => {
  beforeEach(() => {
    // no-op
  })

  // ============================================================
  // Existing tests
  // ============================================================

  test('dedupes concurrent list calls', async () => {
    const loader = mock(async (): Promise<ApiProject[]> => [{ id: 'p1', name: 'demo', worktree: '/tmp/demo', sandboxes: [], time: { created: 1, updated: 1 } }])
    const catalog = createProjectCatalog(loader)

    const [a, b, c] = await Promise.all([
      catalog.list(),
      catalog.list(),
      catalog.list(),
    ])

    expect(loader).toHaveBeenCalledTimes(1)
    expect(a).toEqual(b)
    expect(b).toEqual(c)
  })

  test('caches result and only calls loader once across sequential calls', async () => {
    let callCount = 0
    const loader = mock(async (): Promise<ApiProject[]> => {
      callCount++
      return [{ id: 'p2', name: 'seq', worktree: '/tmp/seq', sandboxes: [], time: { created: 1, updated: 1 } }]
    })
    const catalog = createProjectCatalog(loader)

    await catalog.list()
    await catalog.list()
    await catalog.list()

    expect(loader).toHaveBeenCalledTimes(1)
    expect(callCount).toBe(1)
  })

  test('invalidate clears cache and triggers fresh load', async () => {
    let callCount = 0
    const loader = mock(async (): Promise<ApiProject[]> => {
      callCount++
      return [{ id: 'p3', name: `round${callCount}`, worktree: '/tmp/fresh', sandboxes: [], time: { created: 1, updated: 1 } }]
    })
    const catalog = createProjectCatalog(loader)

    const first = await catalog.list()
    catalog.invalidate()
    const second = await catalog.list()

    expect(loader).toHaveBeenCalledTimes(2)
    expect(callCount).toBe(2)
    expect(first).not.toEqual(second)
  })

  test('findByPath locates project by worktree path', async () => {
    const loader = mock(async (): Promise<ApiProject[]> => [
      { id: 'p1', name: 'alpha', worktree: '/tmp/alpha', sandboxes: [], time: { created: 1, updated: 1 } },
      { id: 'p2', name: 'beta', worktree: 'C:\\tmp\\beta', sandboxes: [], time: { created: 2, updated: 2 } },
    ])
    const catalog = createProjectCatalog(loader)

    const found = await catalog.findByPath('/tmp/alpha')
    const notFound = await catalog.findByPath('/tmp/gamma')
    const foundWindows = await catalog.findByPath('C:/tmp/beta')

    expect(found?.id).toBe('p1')
    expect(notFound).toBeNull()
    expect(foundWindows?.id).toBe('p2')
  })

  test('getLegacyIdMap returns path -> id mapping', async () => {
    const loader = mock(async (): Promise<ApiProject[]> => [
      { id: 'p1', name: 'alpha', worktree: '/tmp/alpha', sandboxes: [], time: { created: 1, updated: 1 } },
      { id: 'p2', name: 'beta', worktree: 'C:\\Users\\beta', sandboxes: [], time: { created: 2, updated: 2 } },
    ])
    const catalog = createProjectCatalog(loader)

    const map = await catalog.getLegacyIdMap()

    expect(map.get('/tmp/alpha')).toBe('p1')
    expect(map.get('c:/users/beta')).toBe('p2')
    expect(map.size).toBe(2)
  })

  // ============================================================
  // Round 2 tests
  // ============================================================

  test('invalidate during inflight prevents stale response from populating cache', async () => {
    let resolveFirst: ((value: ApiProject[]) => void) | null = null

    const dataA: ApiProject[] = [makeProject('a', 'stale', '/tmp/a')]
    const dataB: ApiProject[] = [makeProject('b', 'fresh', '/tmp/b')]

    let callCount = 0
    const loader = mock((): Promise<ApiProject[]> => {
      callCount++
      if (callCount === 1) {
        return new Promise((resolve) => {
          resolveFirst = resolve
        })
      }
      return Promise.resolve(dataB)
    })

    const catalog = createProjectCatalog(loader)

    const firstPromise = catalog.list()
    expect(loader).toHaveBeenCalledTimes(1)

    catalog.invalidate()

    const secondPromise = catalog.list()
    expect(loader).toHaveBeenCalledTimes(2)

    resolveFirst!(dataA)
    await firstPromise

    const result = await secondPromise
    expect(result).toEqual(dataB)
    expect(result).not.toEqual(dataA)

    const cached = await catalog.list()
    expect(cached).toEqual(dataB)
    expect(loader).toHaveBeenCalledTimes(2)
  })

  test('refresh via invalidate + list triggers new loader call', async () => {
    const data1: ApiProject[] = [makeProject('r1', 'round1', '/tmp/r1')]
    const data2: ApiProject[] = [makeProject('r2', 'round2', '/tmp/r2')]

    let callCount = 0
    const loader = mock(async (): Promise<ApiProject[]> => {
      callCount++
      return callCount === 1 ? data1 : data2
    })

    const catalog = createProjectCatalog(loader)

    const first = await catalog.list()
    expect(first).toEqual(data1)

    catalog.invalidate()
    const second = await catalog.list()

    expect(second).toEqual(data2)
    expect(loader).toHaveBeenCalledTimes(2)
  })

  test('mutating returned array does not affect subsequent list calls', async () => {
    const data: ApiProject[] = [makeProject('x', 'alpha', '/tmp/x'), makeProject('y', 'beta', '/tmp/y')]
    const loader = mock(async () => data)
    const catalog = createProjectCatalog(loader)

    const result1 = await catalog.list()
    result1.splice(0, 1)

    const result2 = await catalog.list()
    expect(result2).toHaveLength(2)
    expect(result2[0].id).toBe('x')

    result2[0] = makeProject('z', 'mutated', '/tmp/z')
    const result3 = await catalog.list()
    expect(result3[0].id).toBe('x')
  })

  // ============================================================
  // Round 3: inflight race — old request resolve does NOT wipe new inflight
  // ============================================================

  test('old inflight resolve after invalidate does not clear new inflight', async () => {
    let resolve1: ((value: ApiProject[]) => void) | null = null
    let resolve2: ((value: ApiProject[]) => void) | null = null

    const data1: ApiProject[] = [makeProject('old', 'old', '/tmp/old')]
    const data2: ApiProject[] = [makeProject('new', 'new', '/tmp/new')]

    let callCount = 0
    const loader = mock((): Promise<ApiProject[]> => {
      callCount++
      if (callCount === 1) {
        return new Promise((resolve) => { resolve1 = resolve })
      }
      return new Promise((resolve) => { resolve2 = resolve })
    })

    const catalog = createProjectCatalog(loader)

    // Request 1 inflight
    const p1 = catalog.list()
    expect(loader).toHaveBeenCalledTimes(1)

    // Invalidate
    catalog.invalidate()

    // Request 2 inflight (new)
    const p2 = catalog.list()
    expect(loader).toHaveBeenCalledTimes(2)

    // Old request 1 resolves — must NOT clear inflight (which is request 2)
    resolve1!(data1)
    await p1

    // Request 3 should reuse request 2's inflight, NOT trigger a 3rd loader call
    const p3 = catalog.list()
    expect(loader).toHaveBeenCalledTimes(2) // still 2!

    // Resolve request 2
    resolve2!(data2)
    const [r2, r3] = await Promise.all([p2, p3])
    expect(r2).toEqual(data2)
    expect(r3).toEqual(data2)
    expect(loader).toHaveBeenCalledTimes(2)
  })

  test('old inflight reject after invalidate does not clear new inflight', async () => {
    let reject1: ((err: Error) => void) | null = null
    let resolve2: ((value: ApiProject[]) => void) | null = null

    const data2: ApiProject[] = [makeProject('new', 'new', '/tmp/new')]

    let callCount = 0
    const loader = mock((): Promise<ApiProject[]> => {
      callCount++
      if (callCount === 1) {
        return new Promise((_resolve, reject) => { reject1 = reject })
      }
      return new Promise((resolve) => { resolve2 = resolve })
    })

    const catalog = createProjectCatalog(loader)

    // Request 1 inflight
    const p1 = catalog.list()
    expect(loader).toHaveBeenCalledTimes(1)

    // Invalidate
    catalog.invalidate()

    // Request 2 inflight
    const p2 = catalog.list()
    expect(loader).toHaveBeenCalledTimes(2)

    // Old request 1 rejects — must NOT clear inflight
    reject1!(new Error('boom'))
    await p1.catch(() => {})

    // Request 3 should reuse request 2's inflight
    const p3 = catalog.list()
    expect(loader).toHaveBeenCalledTimes(2) // still 2!

    // Resolve request 2
    resolve2!(data2)
    const [r2, r3] = await Promise.all([p2, p3])
    expect(r2).toEqual(data2)
    expect(r3).toEqual(data2)
    expect(loader).toHaveBeenCalledTimes(2)
  })
})

// ============================================================
// normalizeProjectPath tests
// ============================================================

describe('normalizeProjectPath', () => {
  test('converts backslashes to forward slashes', () => {
    expect(normalizeProjectPath('C:\\Foo\\Bar')).toBe('c:/foo/bar')
    expect(normalizeProjectPath('\\tmp\\project')).toBe('/tmp/project')
  })

  test('strips trailing slashes', () => {
    expect(normalizeProjectPath('C:\\Foo\\Bar\\')).toBe('c:/foo/bar')
    expect(normalizeProjectPath('c:/foo/bar/')).toBe('c:/foo/bar')
    expect(normalizeProjectPath('/tmp/alpha/')).toBe('/tmp/alpha')
  })

  test('lowercases for case-insensitive matching', () => {
    expect(normalizeProjectPath('C:\\FOO\\BAR')).toBe('c:/foo/bar')
    expect(normalizeProjectPath('/TMP/Alpha')).toBe('/tmp/alpha')
  })

  test('preserves root path identity', () => {
    expect(normalizeProjectPath('/')).toBe('/')
    expect(normalizeProjectPath('C:\\')).toBe('c:')
    expect(normalizeProjectPath('C:/')).toBe('c:')
  })

  test('handles empty / edge cases gracefully', () => {
    expect(normalizeProjectPath('')).toBe('')
    expect(normalizeProjectPath('.')).toBe('.')
  })
})

// ============================================================
// Integration: findByPath / getLegacyIdMap with normalized paths
// ============================================================

describe('projectCatalog path normalization integration', () => {
  test('findByPath matches with trailing slash and different case', async () => {
    const loader = mock(async (): Promise<ApiProject[]> => [
      { id: 'p1', name: 'alpha', worktree: 'C:\\Projects\\Alpha', sandboxes: [], time: { created: 1, updated: 1 } },
    ])
    const catalog = createProjectCatalog(loader)

    const found = await catalog.findByPath('c:/projects/alpha/')
    expect(found?.id).toBe('p1')
  })

  test('getLegacyIdMap keys are normalized', async () => {
    const loader = mock(async (): Promise<ApiProject[]> => [
      { id: 'p1', name: 'alpha', worktree: 'C:\\Projects\\Alpha\\', sandboxes: [], time: { created: 1, updated: 1 } },
    ])
    const catalog = createProjectCatalog(loader)

    const map = await catalog.getLegacyIdMap()
    // Key should be normalized: lowercase, backslashes→forward, no trailing slash
    expect(map.get('c:/projects/alpha')).toBe('p1')
    // The raw server path should NOT be a key
    expect(map.get('C:\\Projects\\Alpha\\')).toBeUndefined()
  })

  // ============================================================
  // Contract: getLegacyIdMap keys are compatible with
  // normalizeProjectPath for lookups (used by getLegacyProjectIdForPath)
  // ============================================================

  test('normalizeProjectPath is idempotent and compatible with getLegacyIdMap keys', async () => {
    const loader = mock(async (): Promise<ApiProject[]> => [
      { id: 'p1', name: 'alpha', worktree: 'C:\\Projects\\Alpha\\', sandboxes: [], time: { created: 1, updated: 1 } },
      { id: 'p2', name: 'root', worktree: '/', sandboxes: [], time: { created: 2, updated: 2 } },
    ])
    const catalog = createProjectCatalog(loader)

    const map = await catalog.getLegacyIdMap()

    // Keys are normalized: passing a raw path through normalizeProjectPath
    // should match the corresponding map key
    expect(map.get(normalizeProjectPath('C:\\Projects\\Alpha\\'))).toBe('p1')
    expect(map.get(normalizeProjectPath('C:/Projects/Alpha'))).toBe('p1')
    expect(map.get(normalizeProjectPath('c:/projects/alpha/'))).toBe('p1')
    expect(map.get(normalizeProjectPath('/'))).toBe('p2')

    // normalizeProjectPath is idempotent
    const once = normalizeProjectPath('C:\\Foo\\Bar\\')
    expect(normalizeProjectPath(once)).toBe(once)
  })
})

// ============================================================
// Object mutation isolation tests
// ============================================================

describe('projectCatalog object isolation', () => {
  test('mutating a returned project object does not affect cached result', async () => {
    const data: ApiProject[] = [makeProject('x', 'alpha', '/tmp/x')]
    const loader = mock(async () => data)
    const catalog = createProjectCatalog(loader)

    const result1 = await catalog.list()
    // Mutate a field on the returned object
    result1[0].name = 'hacked'

    const result2 = await catalog.list()
    expect(result2[0].name).toBe('alpha')
    expect(loader).toHaveBeenCalledTimes(1)
  })

  test('mutating a returned sub-field (sandboxes) does not affect cached result', async () => {
    const data: ApiProject[] = [{ ...makeProject('x', 'alpha', '/tmp/x'), sandboxes: ['box1'] }]
    const loader = mock(async () => data)
    const catalog = createProjectCatalog(loader)

    const result1 = await catalog.list()
    // Mutate sandboxes array
    result1[0].sandboxes.push('box2')

    const result2 = await catalog.list()
    expect(result2[0].sandboxes).toEqual(['box1'])
  })

  test('mutating a returned sub-object (icon) does not affect cached result', async () => {
    const data: ApiProject[] = [{ ...makeProject('x', 'alpha', '/tmp/x'), icon: { color: 'red' } }]
    const loader = mock(async () => data)
    const catalog = createProjectCatalog(loader)

    const result1 = await catalog.list()
    // Mutate icon
    result1[0].icon!.color = 'blue'

    const result2 = await catalog.list()
    expect(result2[0].icon!.color).toBe('red')
  })

  test('mutating a returned sub-object (time) does not affect cached result', async () => {
    const data: ApiProject[] = [{ ...makeProject('x', 'alpha', '/tmp/x'), time: { created: 100, updated: 200 } }]
    const loader = mock(async () => data)
    const catalog = createProjectCatalog(loader)

    const result1 = await catalog.list()
    // Mutate time
    result1[0].time.updated = 999

    const result2 = await catalog.list()
    expect(result2[0].time.updated).toBe(200)
  })

  test('concurrent callers via inflight do not share the same array/object instances', async () => {
    const data: ApiProject[] = [makeProject('p1', 'demo', '/tmp/demo')]
    const loader = mock(async () => data)
    const catalog = createProjectCatalog(loader)

    const [a, b, c] = await Promise.all([
      catalog.list(),
      catalog.list(),
      catalog.list(),
    ])

    // Different callers should get different array instances
    a[0].name = 'hacked-by-a'

    // b and c should be unaffected
    expect(b[0].name).toBe('demo')
    expect(c[0].name).toBe('demo')
    expect(loader).toHaveBeenCalledTimes(1)
  })

  test('findByPath returns isolated object', async () => {
    const data: ApiProject[] = [makeProject('p1', 'alpha', '/tmp/alpha')]
    const loader = mock(async () => data)
    const catalog = createProjectCatalog(loader)

    const found = await catalog.findByPath('/tmp/alpha')
    found!.name = 'hacked'

    const foundAgain = await catalog.findByPath('/tmp/alpha')
    expect(foundAgain!.name).toBe('alpha')
  })
})

// ============================================================
// isStaleGeneration tests (pure helper for generation guards)
// ============================================================

import { isStaleGeneration } from './projectCatalog'

describe('isStaleGeneration', () => {
  test('returns true when request generation is older than current', () => {
    expect(isStaleGeneration(1, 2)).toBe(true)
    expect(isStaleGeneration(1, 3)).toBe(true)
  })

  test('returns false when request generation equals current', () => {
    expect(isStaleGeneration(1, 1)).toBe(false)
    expect(isStaleGeneration(2, 2)).toBe(false)
    expect(isStaleGeneration(0, 0)).toBe(false)
  })

  test('newer generation is still considered stale because it does not match current', () => {
    // requestGen > currentGen shouldn't happen in practice (gen only goes up),
    // but the pure comparison treats any mismatch as stale
    expect(isStaleGeneration(3, 2)).toBe(true)
  })
})
