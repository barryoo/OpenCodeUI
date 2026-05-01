import type { ApiProject } from './client'

export interface ProjectCatalog {
  list: () => Promise<ApiProject[]>
  invalidate: () => void
  findByPath: (projectPath: string) => Promise<ApiProject | null>
  getLegacyIdMap: () => Promise<Map<string, string>>
}

/**
 * Normalize a project path for consistent lookups.
 * - Converts backslashes to forward slashes
 * - Strips trailing slashes (preserving root path like `/` or `C:`)
 * - Lowercases for case-insensitive matching (Windows compatibility)
 *
 * Aligned with DirectoryContext.getDirectoryKey() semantics.
 */
export function normalizeProjectPath(value: string): string {
  let result = value.replace(/\\/g, '/').replace(/\/+$/, '')
  // Root path edge case: / → '' was stripped, restore it
  if (!result) {
    const trimmed = value.replace(/\\/g, '/').replace(/\/+$/, '/')
    if (trimmed === '/' || /^[a-z]:\/$/i.test(trimmed)) {
      // slice off trailing slash, fallback to '/' for root
      result = trimmed.slice(0, -1).toLowerCase() || '/'
    }
  } else {
    result = result.toLowerCase()
  }
  return result
}

// ============================================================
// Project object isolation helpers
// ============================================================

/** Deep-clone a single ApiProject so mutations don't leak into cache. */
export function cloneProject(p: ApiProject): ApiProject {
  return {
    id: p.id,
    worktree: p.worktree,
    vcs: p.vcs,
    name: p.name,
    icon: p.icon ? { ...p.icon } : undefined,
    time: { ...p.time },
    sandboxes: [...p.sandboxes],
  }
}

/** Deep-clone an array of ApiProject. */
export function cloneProjects(projects: ApiProject[]): ApiProject[] {
  return projects.map(cloneProject)
}

// ============================================================
// Generation guard helper (used by useProject / DirectoryContext)
// ============================================================

/** Returns true when `requestGen` is no longer the latest generation. */
export function isStaleGeneration(requestGen: number, currentGen: number): boolean {
  return requestGen !== currentGen
}

// ============================================================
// Catalog implementation
// ============================================================

export function createProjectCatalog(loader: () => Promise<ApiProject[]>): ProjectCatalog {
  let cache: ApiProject[] | null = null
  let inflight: Promise<ApiProject[]> | null = null
  let generation = 0

  const list = async () => {
    if (cache) return cloneProjects(cache)
    if (inflight) {
      // Each caller gets its own clone via .then()
      return inflight.then(cloneProjects)
    }

    const genAtStart = generation

    const self = loader().then((projects) => {
      // Only populate cache if no invalidation happened since this request started
      if (genAtStart === generation) {
        cache = cloneProjects(projects)
      }
      // Only clear inflight if we are still the current inflight
      // (prevents an old request from wiping a new inflight)
      if (inflight === self) {
        inflight = null
      }
      return cloneProjects(projects)
    }).catch((error) => {
      // Only clear inflight if we are still the current inflight
      if (inflight === self) {
        inflight = null
      }
      throw error
    })

    inflight = self
    return inflight
  }

  return {
    list,
    invalidate: () => {
      cache = null
      inflight = null
      generation++
    },
    findByPath: async (projectPath: string) => {
      const projects = await list()
      const normalized = normalizeProjectPath(projectPath)
      return projects.find((project) => normalizeProjectPath(project.worktree || '') === normalized) ?? null
    },
    getLegacyIdMap: async () => {
      const projects = await list()
      return new Map(
        projects
          .filter((project) => project.worktree)
          .map((project) => [normalizeProjectPath(project.worktree || ''), project.id])
      )
    },
  }
}

// ---------------------------------------------------------------------------
// Lazy singleton — avoids pulling the full client module at import time,
// which would transitively require browser-only APIs (e.g. sessionStorage).
// ---------------------------------------------------------------------------

let _catalog: ProjectCatalog | null = null

function lazyLoader(): Promise<ApiProject[]> {
  return import('./client').then(({ getProjects }) => getProjects())
}

function getCatalog(): ProjectCatalog {
  if (!_catalog) _catalog = createProjectCatalog(lazyLoader)
  return _catalog
}

export const projectCatalog: ProjectCatalog = {
  list: () => getCatalog().list(),
  invalidate: () => getCatalog().invalidate(),
  findByPath: (projectPath: string) => getCatalog().findByPath(projectPath),
  getLegacyIdMap: () => getCatalog().getLegacyIdMap(),
}
