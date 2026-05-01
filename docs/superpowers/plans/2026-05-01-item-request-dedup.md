# Item Request Dedup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 降低事项管理页面的重复请求，把页面首次加载请求数从当前约 199 次降到 60~90 次，并把点击事项后的新增请求从 6 次降到 1~3 次。

**Architecture:** 先修正 `MultiProjectSidePanel` 的重复触发链，再为项目目录与 session summary 引入轻量共享缓存/差量同步，最后收紧事项详情面板与路由恢复链路，避免同一批项目、会话、summary 被多个组件反复独立拉取。整个方案保持现有页面结构不变，只在加载编排、缓存复用、diff 同步三个层面做局部重构。

**Tech Stack:** React 19、TypeScript、Zustand、Bun test、Vite、ESLint、Playwright CLI

---

## File Structure

- Modify: `src/features/chat/sidebar/MultiProjectSidePanel.tsx`
  - 删除 `loadItemProject()` 双重触发。
  - 把“项目元数据加载”和“项目会话加载”改成单一路径编排。
- Create: `src/features/chat/sidebar/projectLoadPlan.ts`
  - 纯函数：根据 `expanded/loading/loadedLimit/targetLimit` 计算本轮项目需要加载什么。
- Create: `src/features/chat/sidebar/projectLoadPlan.test.ts`
  - 覆盖“仅加载项目数据”“仅加载会话”“同时加载但不重复”的回归测试。
- Create: `src/api/projectCatalog.ts`
  - 为 `getProjects()` 提供内存缓存、in-flight dedupe、按路径查找 helper。
- Create: `src/api/projectCatalog.test.ts`
  - 覆盖并发调用只打一次底层 loader、缓存失效后重新请求。
- Modify: `src/contexts/DirectoryContext.tsx`
  - 用共享 `projectCatalog` 读取项目列表，避免单独请求 `/api/project`。
- Modify: `src/hooks/useProject.ts`
  - 改为走共享 `projectCatalog`，不再直接 `getProjects()`。
- Modify: `src/api/thinServer.ts`
  - `getLegacyProjectIdByPathMap()` / `findProjectByPath()` 复用 `projectCatalog`。
- Create: `src/store/sessionSummarySync.ts`
  - 纯函数：根据已有 summaries 与 sessions 计算需要 upsert 的 summary 输入。
- Create: `src/store/sessionSummarySync.test.ts`
  - 覆盖“不变不发请求”“新增发请求”“标题/状态/时间变化才发请求”。
- Modify: `src/store/itemWorkspaceStore.ts`
  - `ensureProjectSummaryForSessions()` 改为差量同步，不再对每个 session 无脑 POST。
- Modify: `src/features/items/ItemDetailPanel.tsx`
  - 优先复用已加载的项目 session 列表，减少挂载与打开绑定菜单时的额外请求。
- Modify: `src/App.tsx`
  - 收紧 `route item -> loadProject()` 恢复逻辑，已加载时直接短路。

## Task 1: 创建隔离 worktree

**Files:**
- Modify: none

- [ ] **Step 1: 基于 master 创建 worktree**

```bash
git worktree add ../OpenCodeUI-feat/item-request-dedup -b feat/item-request-dedup
```

- [ ] **Step 2: 确认当前目录与分支**

```bash
pwd
git branch --show-current
```

Expected:
- `pwd` 指向 `../OpenCodeUI-feat/item-request-dedup`
- 分支名为 `feat/item-request-dedup`

## Task 2: 先用纯函数固定 Sidebar 加载编排，砍掉双重请求

**Files:**
- Create: `src/features/chat/sidebar/projectLoadPlan.ts`
- Create: `src/features/chat/sidebar/projectLoadPlan.test.ts`
- Modify: `src/features/chat/sidebar/MultiProjectSidePanel.tsx:693-739`
- Test: `src/features/chat/sidebar/projectLoadPlan.test.ts`

- [ ] **Step 1: 写 failing test，描述项目展开时的加载计划**

```ts
/// <reference types="bun" />

import { describe, expect, test } from 'bun:test'
import { buildProjectLoadPlan } from './projectLoadPlan'

describe('buildProjectLoadPlan', () => {
  test('loads project metadata once before sessions', () => {
    expect(buildProjectLoadPlan({
      expanded: true,
      loading: false,
      hasProjectState: false,
      loadedLimit: 0,
      targetLimit: 20,
    })).toEqual({
      shouldLoadProject: true,
      shouldLoadSessions: true,
      nextSessionLimit: 20,
    })
  })

  test('does not request sessions again when current loaded limit already covers target', () => {
    expect(buildProjectLoadPlan({
      expanded: true,
      loading: false,
      hasProjectState: true,
      loadedLimit: 40,
      targetLimit: 20,
    })).toEqual({
      shouldLoadProject: false,
      shouldLoadSessions: false,
      nextSessionLimit: null,
    })
  })

  test('does nothing for collapsed projects', () => {
    expect(buildProjectLoadPlan({
      expanded: false,
      loading: false,
      hasProjectState: false,
      loadedLimit: 0,
      targetLimit: 20,
    })).toEqual({
      shouldLoadProject: false,
      shouldLoadSessions: false,
      nextSessionLimit: null,
    })
  })
})
```

- [ ] **Step 2: 运行测试，确认当前失败**

Run:

```bash
bun test src/features/chat/sidebar/projectLoadPlan.test.ts
```

Expected: FAIL，原因是 `projectLoadPlan.ts` 还不存在。

- [ ] **Step 3: 实现加载计划纯函数**

创建 `src/features/chat/sidebar/projectLoadPlan.ts`：

```ts
export interface ProjectLoadPlanInput {
  expanded: boolean
  loading: boolean
  hasProjectState: boolean
  loadedLimit: number
  targetLimit: number
}

export interface ProjectLoadPlan {
  shouldLoadProject: boolean
  shouldLoadSessions: boolean
  nextSessionLimit: number | null
}

export function buildProjectLoadPlan(input: ProjectLoadPlanInput): ProjectLoadPlan {
  if (!input.expanded || input.loading) {
    return {
      shouldLoadProject: false,
      shouldLoadSessions: false,
      nextSessionLimit: null,
    }
  }

  const shouldLoadProject = !input.hasProjectState
  const shouldLoadSessions = input.loadedLimit < input.targetLimit

  return {
    shouldLoadProject,
    shouldLoadSessions,
    nextSessionLimit: shouldLoadSessions ? input.targetLimit : null,
  }
}
```

- [ ] **Step 4: 把 `MultiProjectSidePanel` 改成只走单一路径**

在 `src/features/chat/sidebar/MultiProjectSidePanel.tsx` 中做两处关键修改：

1. 删除 `loadProjectSessions()` 内部的重复项目加载：

```ts
const loadProjectSessions = useCallback(async (projectPath: string, limit: number) => {
  setLoadingByProject((prev) => ({ ...prev, [projectPath]: true }))

  try {
    const data = await getSessionsForDirectory({
      roots: true,
      directory: projectPath,
      limit,
    })

    setSessionsByProject((prev) => ({ ...prev, [projectPath]: sortSessionsByRecent(data) }))
    setHasMoreByProject((prev) => ({ ...prev, [projectPath]: data.length >= limit }))
    setLoadedLimitByProject((prev) => ({ ...prev, [projectPath]: limit }))
    syncPinnedEntriesWithSessions(projectPath, data)
    void ensureProjectSummaryForSessions(projectPath, data)
  } catch {
    setSessionsByProject((prev) => ({ ...prev, [projectPath]: [] }))
    setHasMoreByProject((prev) => ({ ...prev, [projectPath]: false }))
    setLoadedLimitByProject((prev) => ({ ...prev, [projectPath]: limit }))
  } finally {
    setLoadingByProject((prev) => ({ ...prev, [projectPath]: false }))
  }
}, [ensureProjectSummaryForSessions, sortSessionsByRecent, syncPinnedEntriesWithSessions])
```

2. `useEffect` 中统一通过 `buildProjectLoadPlan()` 决定本轮动作：

```ts
useEffect(() => {
  for (const project of projects) {
    const projectState = getProjectState(project.path)
    const targetLimit = visibleCountByProject[project.path] ?? DEFAULT_VISIBLE_COUNT
    const loadedLimit = loadedLimitByProject[project.path] ?? 0

    const plan = buildProjectLoadPlan({
      expanded: !!expandedProjects[project.path],
      loading: !!loadingByProject[project.path],
      hasProjectState: !!projectState,
      loadedLimit,
      targetLimit,
    })

    if (plan.shouldLoadProject) {
      void loadItemProject(project.path)
    }

    if (plan.shouldLoadSessions && plan.nextSessionLimit) {
      void loadProjectSessions(project.path, plan.nextSessionLimit)
    }
  }
}, [
  projects,
  expandedProjects,
  visibleCountByProject,
  loadedLimitByProject,
  loadingByProject,
  loadItemProject,
  loadProjectSessions,
  getProjectState,
])
```

要求：
- `loadProjectSessions()` 内 **不再** 调 `loadItemProject()`。
- `onReconnected` 中仍可复用 `loadProjectSessions()`，但不能重新引入双调。

- [ ] **Step 5: 运行测试、构建、lint**

Run:

```bash
bun test src/features/chat/sidebar/projectLoadPlan.test.ts && bun run build && npm run lint
```

Expected: 全部 PASS

- [ ] **Step 6: 提交 Task 2**

```bash
git add src/features/chat/sidebar/projectLoadPlan.ts src/features/chat/sidebar/projectLoadPlan.test.ts src/features/chat/sidebar/MultiProjectSidePanel.tsx
git commit -m "fix: dedupe sidebar project loading"
```

## Task 3: 为 `/api/project` 加共享目录缓存，合并多点拉取

**Files:**
- Create: `src/api/projectCatalog.ts`
- Create: `src/api/projectCatalog.test.ts`
- Modify: `src/contexts/DirectoryContext.tsx:145-153`
- Modify: `src/hooks/useProject.ts:1-71`
- Modify: `src/api/thinServer.ts:149-166`
- Test: `src/api/projectCatalog.test.ts`

- [ ] **Step 1: 写 failing test，锁定并发只打一轮底层 loader**

```ts
/// <reference types="bun" />

import { beforeEach, describe, expect, mock, test } from 'bun:test'
import { createProjectCatalog } from './projectCatalog'

describe('projectCatalog', () => {
  beforeEach(() => {
    // no-op
  })

  test('dedupes concurrent list calls', async () => {
    const loader = mock(async () => [{ id: 'p1', name: 'demo', worktree: '/tmp/demo' }])
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
})
```

- [ ] **Step 2: 运行测试，确认当前失败**

Run:

```bash
bun test src/api/projectCatalog.test.ts
```

Expected: FAIL，原因是 `projectCatalog.ts` 还不存在。

- [ ] **Step 3: 实现共享项目目录缓存**

创建 `src/api/projectCatalog.ts`：

```ts
import { getProjects, type ApiProject } from './client'

export interface ProjectCatalog {
  list: () => Promise<ApiProject[]>
  invalidate: () => void
  findByPath: (projectPath: string) => Promise<ApiProject | null>
  getLegacyIdMap: () => Promise<Map<string, string>>
}

export function normalizeProjectPath(value: string): string {
  return value.replace(/\\/g, '/')
}

export function createProjectCatalog(loader: typeof getProjects = getProjects): ProjectCatalog {
  let cache: ApiProject[] | null = null
  let inflight: Promise<ApiProject[]> | null = null

  const list = async () => {
    if (cache) return cache
    if (inflight) return inflight

    inflight = loader().then((projects) => {
      cache = projects
      inflight = null
      return projects
    }).catch((error) => {
      inflight = null
      throw error
    })

    return inflight
  }

  return {
    list,
    invalidate: () => {
      cache = null
      inflight = null
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

export const projectCatalog = createProjectCatalog()
```

- [ ] **Step 4: 接入 `DirectoryContext`、`useProject`、`thinServer`**

改动要点：

1. `DirectoryContext.tsx`

```ts
import { projectCatalog } from '../api/projectCatalog'

const [apiProjects, globalSessions] = await Promise.all([
  projectCatalog.list().catch(() => []),
  getGlobalSessions({ roots: true, limit: GLOBAL_DIRECTORY_SESSION_SCAN_LIMIT }).catch(() => []),
])
```

2. `useProject.ts`

```ts
import { getCurrentProject, type ApiProject } from '../api'
import { projectCatalog } from '../api/projectCatalog'

const [current, all] = await Promise.all([
  getCurrentProject(),
  projectCatalog.list(),
])
```

3. `thinServer.ts`

```ts
import { projectCatalog, normalizeProjectPath } from './projectCatalog'

export async function getLegacyProjectIdByPathMap(): Promise<Map<string, string>> {
  return projectCatalog.getLegacyIdMap()
}

export async function findProjectByPath(projectPath: string): Promise<ApiProject | null> {
  return projectCatalog.findByPath(projectPath)
}
```

要求：
- 不改接口签名。
- 只改调用源，不改上层业务逻辑。

- [ ] **Step 5: 运行测试、构建、lint**

Run:

```bash
bun test src/api/projectCatalog.test.ts && bun run build && npm run lint
```

Expected: 全部 PASS

- [ ] **Step 6: 提交 Task 3**

```bash
git add src/api/projectCatalog.ts src/api/projectCatalog.test.ts src/contexts/DirectoryContext.tsx src/hooks/useProject.ts src/api/thinServer.ts
git commit -m "refactor: share project catalog requests"
```

## Task 4: 把 `session-summaries` 改成差量同步，压缩 POST 风暴

**Files:**
- Create: `src/store/sessionSummarySync.ts`
- Create: `src/store/sessionSummarySync.test.ts`
- Modify: `src/store/itemWorkspaceStore.ts:223-262`
- Test: `src/store/sessionSummarySync.test.ts`

- [ ] **Step 1: 写 failing test，锁定 summary diff 行为**

```ts
/// <reference types="bun" />

import { describe, expect, test } from 'bun:test'
import type { ApiSession } from '../api'
import type { ThinSessionSummary } from '../api/thinServer'
import { buildSummaryUpsertInputs } from './sessionSummarySync'

const projectPath = '/tmp/project-a'

function makeSession(id: string, title = 'Chat', updated = 1714557600000): ApiSession {
  return {
    id,
    title,
    directory: projectPath,
    projectID: 'proj-1',
    version: '1',
    time: {
      created: updated,
      updated,
    },
  }
}

function makeSummary(id: string, externalSessionId: string, overrides: Partial<ThinSessionSummary> = {}): ThinSessionSummary {
  return {
    id,
    projectPath,
    externalSessionId,
    itemId: null,
    variant: null,
    titleSnapshot: 'Chat',
    statusSnapshot: 'in_progress',
    activityAt: '2024-05-01T10:00:00.000Z',
    updatedAt: '2024-05-01T10:00:00.000Z',
    ...overrides,
  }
}

describe('buildSummaryUpsertInputs', () => {
  test('returns empty array when nothing changed', () => {
    const sessions = [makeSession('s1')]
    const existing = [makeSummary('sum-1', 's1')]

    expect(buildSummaryUpsertInputs({
      projectPath,
      sessions,
      existing,
    })).toEqual([])
  })

  test('returns new session when summary missing', () => {
    const sessions = [makeSession('s2')]

    expect(buildSummaryUpsertInputs({
      projectPath,
      sessions,
      existing: [],
    })).toHaveLength(1)
  })
})
```

- [ ] **Step 2: 运行测试，确认当前失败**

Run:

```bash
bun test src/store/sessionSummarySync.test.ts
```

Expected: FAIL，原因是 `sessionSummarySync.ts` 还不存在。

- [ ] **Step 3: 实现 summary diff helper**

创建 `src/store/sessionSummarySync.ts`：

```ts
import type { ApiSession } from '../api'
import type { ThinSessionSummary, ThinWorkflowStatus } from '../api/thinServer'

export interface SummaryUpsertInput {
  projectPath: string
  externalSessionId: string
  itemId: string | null
  variant: string | null
  titleSnapshot: string
  statusSnapshot: ThinWorkflowStatus
  activityAt: string
}

export function buildSummaryUpsertInputs(input: {
  projectPath: string
  sessions: ApiSession[]
  existing: ThinSessionSummary[]
}): SummaryUpsertInput[] {
  const existingByExternalId = new Map(input.existing.map((summary) => [summary.externalSessionId, summary]))

  return input.sessions.flatMap((session) => {
    const existing = existingByExternalId.get(session.id)
    const activityAt = new Date(session.time.updated ?? session.time.created).toISOString()
    const titleSnapshot = session.title || 'Untitled Chat'
    const statusSnapshot = existing?.statusSnapshot ?? 'in_progress'

    if (
      existing
      && existing.titleSnapshot === titleSnapshot
      && existing.activityAt === activityAt
      && existing.statusSnapshot === statusSnapshot
    ) {
      return []
    }

    return [{
      projectPath: input.projectPath,
      externalSessionId: session.id,
      itemId: existing?.itemId ?? null,
      variant: existing?.variant ?? null,
      titleSnapshot,
      statusSnapshot,
      activityAt,
    }]
  })
}
```

- [ ] **Step 4: 在 `itemWorkspaceStore` 中接入差量同步**

将 `ensureProjectSummaryForSessions()` 核心逻辑改成：

```ts
const existing = dedupeSummariesByExternalSessionId([
  ...(state?.summaries ?? []),
  ...get().allSummaries.filter((summary) => summary.projectPath === projectPath),
])

const inputs = buildSummaryUpsertInputs({
  projectPath,
  sessions,
  existing,
})

if (inputs.length === 0) return

const touched = await Promise.all(inputs.map((input) => upsertThinSessionSummary({
  serverProfileId: activeProfile.id,
  projectPath: input.projectPath,
  legacyProjectId,
  externalSessionId: input.externalSessionId,
  itemId: input.itemId,
  variant: input.variant,
  titleSnapshot: input.titleSnapshot,
  statusSnapshot: input.statusSnapshot,
  activityAt: input.activityAt,
})))
```

要求：
- 不改变当前 summary 合并方式。
- 如果 `inputs.length === 0`，必须直接返回，不发任何 POST。

- [ ] **Step 5: 运行测试、构建、lint**

Run:

```bash
bun test src/store/sessionSummarySync.test.ts src/store/itemWorkspaceStore.test.ts && bun run build && npm run lint
```

Expected: 全部 PASS

- [ ] **Step 6: 提交 Task 4**

```bash
git add src/store/sessionSummarySync.ts src/store/sessionSummarySync.test.ts src/store/itemWorkspaceStore.ts src/store/itemWorkspaceStore.test.ts
git commit -m "fix: sync session summaries incrementally"
```

## Task 5: 收紧事项面板与路由恢复的补拉逻辑

**Files:**
- Modify: `src/features/items/ItemDetailPanel.tsx:239-286`
- Modify: `src/App.tsx:361-392`
- Modify: `src/store/itemWorkspaceStore.ts:191-221`
- Test: manual verification + existing build/lint

- [ ] **Step 1: 先给 `loadProject()` 增加短路保护**

在 `src/store/itemWorkspaceStore.ts` 中，`loadProject()` 开头加入：

```ts
loadProject: async (projectPath: string) => {
  const current = get().projectStates[projectPath]
  if (current?.items && current?.summaries && !get().loadingProjects[projectPath]) {
    return
  }

  set((state) => ({ loadingProjects: { ...state.loadingProjects, [projectPath]: true } }))
  // existing logic...
}
```

要求：
- 只在“已有完整 project state 且当前不在 loading”时短路。
- 不要阻断初次加载。

- [ ] **Step 2: `ItemDetailPanel` 优先复用已存在 session 列表**

在 `src/features/items/ItemDetailPanel.tsx` 中，把两处 `getSessionsForDirectory()` 读取合并为一个 `loadAvailableSessions()` helper：

```ts
const loadAvailableSessions = useCallback(async () => {
  if (!projectDirectory) return []
  return getSessionsForDirectory({ directory: projectDirectory, roots: true, limit: 200 })
}, [projectDirectory])
```

然后两处 effect 都改成复用它：

```ts
void loadAvailableSessions().then((sessions) => {
  if (cancelled) return
  // existing filtering logic...
})
```

要求：
- 至少消除重复拼装请求参数与重复逻辑。
- 如果实现时能直接从 sidebar/store 注入已加载 sessions，则优先复用那份数据；否则保留当前 helper 结构，为后续复用留入口。

- [ ] **Step 3: `App.tsx` 避免点击事项后再次恢复式 `loadProject()`**

把 route effect 收紧为：

```ts
useEffect(() => {
  if (!routeItemProjectId || !routeItemId) return
  if (selectedItemId === routeItemId && selectedItemProjectPath === routeItemProjectId) return

  const state = useItemWorkspaceStore.getState()
  const itemFromStore = state.getItemById(routeItemProjectId, routeItemId)
  if (itemFromStore) {
    state.selectItem(routeItemProjectId, routeItemId)
    return
  }

  if (state.isProjectLoading(routeItemProjectId)) return

  void state.loadProject(routeItemProjectId).then(() => {
    const loaded = useItemWorkspaceStore.getState().getItemById(routeItemProjectId, routeItemId)
    if (loaded) {
      useItemWorkspaceStore.getState().selectItem(routeItemProjectId, routeItemId)
    }
  }).catch(() => {
    // ignore recovery errors to avoid breaking session rendering
  })
}, [getItemById, routeItemId, routeItemProjectId, selectItem, selectedItemId, selectedItemProjectPath])
```

要求：
- 避免同一点击动作里因为 route 变化触发重复加载。
- 不能破坏刷新后 URL 恢复事项的能力。

- [ ] **Step 4: 运行构建、lint，并用 Playwright 复测**

Run:

```bash
bun run build && npm run lint
```

然后在浏览器中复测：

```bash
playwright-cli attach --extension=msedge --session=edge-current
playwright-cli --session=edge-current run-code "async page => { const requests = []; let lastAt = Date.now(); const onReq = req => { const type = req.resourceType(); if (type === 'fetch' || type === 'xhr') { requests.push({ url: req.url(), method: req.method(), type }); lastAt = Date.now(); } }; page.on('request', onReq); const waitForQuiet = async () => { const start = Date.now(); while (Date.now() - start < 12000) { if (Date.now() - lastAt >= 1500) return; await page.waitForTimeout(200); } }; await page.reload({ waitUntil: 'domcontentloaded' }); await waitForQuiet(); const loadCount = requests.length; await page.getByRole('button', { name: /会话模型管理|事项管理：mobile端适配|重构：事项管理/ }).first().click(); await waitForQuiet(); return JSON.stringify({ loadCount, clickCount: requests.length - loadCount, totalCount: requests.length }, null, 2); }"
```

Expected:
- `loadCount` 明显低于原始的 `199`
- `clickCount` 低于原始的 `6`

- [ ] **Step 5: 提交 Task 5**

```bash
git add src/features/items/ItemDetailPanel.tsx src/App.tsx src/store/itemWorkspaceStore.ts
git commit -m "fix: avoid redundant item panel reloads"
```

## Task 6: 全量验证与交付前检查

**Files:**
- Modify: none

- [ ] **Step 1: 运行全部相关测试与静态检查**

```bash
bun test src/features/chat/sidebar/projectLoadPlan.test.ts src/api/projectCatalog.test.ts src/store/sessionSummarySync.test.ts src/store/itemWorkspaceStore.test.ts && bun run build && npm run lint
```

Expected: 全部 PASS

- [ ] **Step 2: 手动记录修复前后数据**

在 PR 描述或验收记录中填写：

```md
## Request Count Before / After

- Before reload: 199
- After reload: <fill actual>
- Before item click delta: 6
- After item click delta: <fill actual>

## Key endpoints

- POST /admin/session-summaries: 40 -> <fill actual>
- GET /api/project: 28 -> <fill actual>
- GET /api/experimental/session?limit=1000: 33 -> <fill actual>
```

- [ ] **Step 3: 等待用户验收后再决定是否提交/合并**

```bash
npx vite --port 5174
```

Expected:
- 启动预览地址后，把 `http://localhost:5174` 发给用户验收。
- **不要自动 commit / merge / push**，除非用户明确要求。
