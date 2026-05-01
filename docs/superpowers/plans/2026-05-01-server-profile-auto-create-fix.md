# Server Profile 自动创建修复 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 阻止前端在运行时自动创建 `server_profiles`，当当前 active server 没有用户手动创建的 profile 时进入明确的未配置态并提示用户手动创建。

**Architecture:** 将 `src/api/thinServer.ts` 中的“查不到就创建”逻辑改为“只查找已存在 profile”。`itemWorkspaceStore` 负责把“缺失 profile”建模成明确状态并驱动现有侧边栏错误提示区域；`useChatSession` 在缺失 profile 时安全跳过 session summary 同步。修复只停止新增错误数据，不做历史清理。

**Tech Stack:** React 19、TypeScript、Zustand、Bun test、Vite、ESLint

---

## File Structure

- Modify: `src/api/thinServer.ts`
  - 将 `ensureDefaultThinServerProfile` 替换为只读查找函数，返回 `ThinServerProfile | null`。
- Modify: `src/store/itemWorkspaceStore.ts`
  - 在 `ProjectItemState` 中保留/设置可展示的 `error`。
  - 初始化时不再自动创建 profile；缺失时进入未配置态。
  - `loadProject` / 依赖 profile 的写操作在缺失 profile 时短路。
- Modify: `src/hooks/useChatSession.ts`
  - session summary 同步前只查找已有 profile；缺失时直接返回。
- Modify: `src/store/itemWorkspaceStore.binding.test.ts`
  - 增加“无匹配 profile 不创建、不写库”的回归测试。
- Create: `src/api/thinServer.test.ts`
  - 增加“查不到 profile 返回 null，且不会 POST /server-profiles”的 API 层测试。

## Task 1: 创建隔离 worktree

**Files:**
- Modify: none

- [ ] **Step 1: 基于 master 创建 worktree**

```bash
git worktree add ../OpenCodeUI-feat/server-profile-auto-create-fix -b feat/server-profile-auto-create-fix
```

- [ ] **Step 2: 确认进入新 worktree 后再开始后续任务**

```bash
pwd
git branch --show-current
```

Expected:
- `pwd` 指向 `../OpenCodeUI-feat/server-profile-auto-create-fix`
- 当前分支是 `feat/server-profile-auto-create-fix`

## Task 2: 先用 TDD 锁定 thinServer API 层“不自动创建”行为

**Files:**
- Create: `src/api/thinServer.test.ts`
- Modify: `src/api/thinServer.ts:42-98`
- Test: `src/api/thinServer.test.ts`

- [ ] **Step 1: 写 failing test，描述“无匹配 profile 时返回 null 且不发 POST”**

```ts
/// <reference types="bun" />

import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test'

const fetchMock = mock(async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = String(input)
  if (url.endsWith('/admin/server-profiles') && (!init || !init.method || init.method === 'GET')) {
    return new Response(JSON.stringify({ data: [] }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    })
  }

  throw new Error(`unexpected request: ${String(init?.method ?? 'GET')} ${url}`)
})

describe('findThinServerProfileByBaseUrl', () => {
  beforeEach(() => {
    ;(globalThis as Record<string, unknown>).fetch = fetchMock
    fetchMock.mockClear()
  })

  afterEach(() => {
    delete (globalThis as Record<string, unknown>).fetch
  })

  test('returns null when no existing profile matches baseUrl', async () => {
    const { findThinServerProfileByBaseUrl } = await import('./thinServer')

    const result = await findThinServerProfileByBaseUrl('http://localhost:4096')

    expect(result).toBeNull()
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock.mock.calls[0]?.[0]).toBe('/admin/server-profiles')
    expect(fetchMock.mock.calls.some(([, init]) => init?.method === 'POST')).toBe(false)
  })
})
```

- [ ] **Step 2: 运行测试，确认当前失败**

Run:

```bash
bun test src/api/thinServer.test.ts
```

Expected: FAIL，因为 `findThinServerProfileByBaseUrl` 还不存在，且当前实现仍会自动创建。

- [ ] **Step 3: 在 API 层实现只读查找函数**

将 `src/api/thinServer.ts` 的对应实现改为：

```ts
export async function findThinServerProfileByBaseUrl(baseUrl: string): Promise<ThinServerProfile | null> {
  const profilesResponse = await thinRequest<ThinResponse<ThinServerProfile[]>>('/server-profiles')
  const profiles = profilesResponse.data ?? []
  return profiles.find((profile) => profile.baseUrl === baseUrl) ?? null
}
```

并删除：

```ts
export async function ensureDefaultThinServerProfile(baseUrl: string, name = 'Active OpenCode Server'): Promise<ThinServerProfile> {
  // ... GET + fallback POST create ...
}
```

要求：
- 不保留 `Active OpenCode Server` 默认名。
- 不保留任何自动 `POST /server-profiles` 逻辑。
- 仅返回 `ThinServerProfile | null`。

- [ ] **Step 4: 再加一个命中场景测试**

在同一测试文件追加：

```ts
test('returns the existing matching profile', async () => {
  fetchMock.mockImplementationOnce(async () => new Response(JSON.stringify({
    data: [
      { id: 'profile-1', userId: 'user-1', name: 'Primary', baseUrl: 'http://localhost:4096', isDefault: true },
    ],
  }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  }))

  const { findThinServerProfileByBaseUrl } = await import('./thinServer')
  const result = await findThinServerProfileByBaseUrl('http://localhost:4096')

  expect(result?.id).toBe('profile-1')
})
```

- [ ] **Step 5: 运行测试，确认通过**

Run:

```bash
bun test src/api/thinServer.test.ts
```

Expected: PASS

- [ ] **Step 6: 提交 Task 2**

```bash
git add src/api/thinServer.ts src/api/thinServer.test.ts
git commit -m "test: cover thin server profile lookup"
```

## Task 3: 用回归测试锁定 itemWorkspaceStore 的未配置态

**Files:**
- Modify: `src/store/itemWorkspaceStore.binding.test.ts`
- Modify: `src/store/itemWorkspaceStore.ts:67-113`
- Modify: `src/store/itemWorkspaceStore.ts:177-221`
- Test: `src/store/itemWorkspaceStore.binding.test.ts`

- [ ] **Step 1: 在现有 store 测试中添加 failing case**

在 `src/store/itemWorkspaceStore.binding.test.ts` 中把 thinServer mock 的入口名改成新函数，并增加：

```ts
const findThinServerProfileByBaseUrlMock = mock(async () => null)

mock.module('../api/thinServer', () => ({
  findThinServerProfileByBaseUrl: findThinServerProfileByBaseUrlMock,
  upsertThinSessionSummary: upsertThinSessionSummaryMock,
  findProjectByPath: findProjectByPathMock,
  // ...其余 mock 保持不变
}))

test('initialize leaves profile empty and loadProject exposes a manual-create error when no profile matches', async () => {
  useItemWorkspaceStore.getState().reset()

  await useItemWorkspaceStore.getState().initialize()
  await useItemWorkspaceStore.getState().loadProject(projectPath)

  expect(useItemWorkspaceStore.getState().profile).toBeNull()
  expect(useItemWorkspaceStore.getState().getProjectError(projectPath)).toBe('请先手动创建 Server Profile')
})
```

- [ ] **Step 2: 运行测试，确认当前失败**

Run:

```bash
bun test src/store/itemWorkspaceStore.binding.test.ts
```

Expected: FAIL，因为 `initialize()` 当前仍依赖自动创建逻辑，且 `loadProject()` 不会设置该错误文案。

- [ ] **Step 3: 在 store 中实现未配置态与错误透传**

在 `src/store/itemWorkspaceStore.ts` 中增加常量：

```ts
const MISSING_SERVER_PROFILE_MESSAGE = '请先手动创建 Server Profile'
```

将初始化逻辑改为：

```ts
initialize: async () => {
  if (get().profile) return
  const baseUrl = serverStore.getActiveBaseUrl()
  try {
    const profile = await findThinServerProfileByBaseUrl(baseUrl)
    if (!profile) {
      set({ profile: null, allSummaries: [] })
      return
    }
    const allSummaries = await listAllThinSessionSummaries().catch(() => [])
    set({ profile, allSummaries })
  } catch (error) {
    if (!isThinUnauthorized(error)) throw error
    set({ profile: null, allSummaries: [] })
  }
}
```

并将 `loadProject()` 中的 `!activeProfile` 分支改为：

```ts
if (!activeProfile) {
  set((state) => ({
    projectStates: mergeProjectState(state.projectStates, projectPath, {
      items: [],
      summaries: [],
      error: MISSING_SERVER_PROFILE_MESSAGE,
    }),
    loadingProjects: { ...state.loadingProjects, [projectPath]: false },
  }))
  return
}
```

要求：
- 未配置 profile 不是异常抛错，而是明确业务状态。
- 不能在 `initialize()` 或 `loadProject()` 中做任何自动创建。
- 只复用现有 `getProjectError()` 渲染通道，不新增 UI 组件。

- [ ] **Step 4: 跑测试确认通过**

Run:

```bash
bun test src/store/itemWorkspaceStore.binding.test.ts
```

Expected: PASS

- [ ] **Step 5: 提交 Task 3**

```bash
git add src/store/itemWorkspaceStore.ts src/store/itemWorkspaceStore.binding.test.ts
git commit -m "fix: require manual server profiles for item workspace"
```

## Task 4: 修复 useChatSession 的自动创建链路并补测试

**Files:**
- Modify: `src/hooks/useChatSession.ts:131-163`
- Modify: `src/store/itemWorkspaceStore.binding.test.ts`
- Test: `src/store/itemWorkspaceStore.binding.test.ts`

- [ ] **Step 1: 添加 failing test，锁定缺失 profile 时不做 session summary upsert**

在 `src/store/itemWorkspaceStore.binding.test.ts` 中追加一个只验证 store 层 side effect 的回归测试，利用现有 mocks 保证 `upsertThinSessionSummaryMock` 计数可见：

```ts
test('initialize without a matching profile never triggers session summary writes', async () => {
  findThinServerProfileByBaseUrlMock.mockResolvedValueOnce(null)

  await useItemWorkspaceStore.getState().initialize()

  expect(upsertThinSessionSummaryMock).not.toHaveBeenCalled()
})
```

然后在 hook 文件保存一个最小编译改动前，先确认测试基线不受影响。

- [ ] **Step 2: 将 hook 改为只查已有 profile，缺失则直接返回**

把 `src/hooks/useChatSession.ts` 的导入与实现更新为：

```ts
import { findThinServerProfileByBaseUrl, upsertThinSessionSummary } from '../api/thinServer'
```

```ts
const profile = await findThinServerProfileByBaseUrl(serverStore.getActiveBaseUrl())
if (!profile) return
```

保持其余 `upsertThinSessionSummary(...)` 与 `upsertLocalSummary(updated)` 流程不变。

要求：
- 缺失 profile 时直接短路。
- 仍保留 `ThinAuthError` 的 401 特殊处理。
- 不新增任何 `POST /server-profiles` 或 fallback 名称。

- [ ] **Step 3: 运行相关测试与构建**

Run:

```bash
bun test src/api/thinServer.test.ts src/store/itemWorkspaceStore.binding.test.ts && bun run build
```

Expected: PASS

- [ ] **Step 4: 提交 Task 4**

```bash
git add src/hooks/useChatSession.ts src/store/itemWorkspaceStore.binding.test.ts
git commit -m "fix: skip thin sync when server profile is missing"
```

## Task 5: 完整验证与收尾

**Files:**
- Modify: none

- [ ] **Step 1: 运行完整验证**

Run:

```bash
bun test src/api/thinServer.test.ts src/store/itemWorkspaceStore.binding.test.ts && bun run build && npm run lint
```

Expected:
- tests PASS
- `bun run build` PASS
- `npm run lint` PASS

- [ ] **Step 2: 启动预览供用户验收**

Run:

```bash
npx vite --port 5174
```

Expected: 本地预览地址可访问，例如 `http://localhost:5174`

- [ ] **Step 3: 向用户回报验收地址并等待确认**

回复用户：

```text
已可预览： http://localhost:5174
请你验证：未手动创建 Server Profile 时不再新增 `Active OpenCode Server`，并会提示先手动创建 Server Profile。
```

- [ ] **Step 4: 仅在用户明确要求后再提交代码**

```bash
git status
git add .
git commit -m "fix: stop auto-creating thin server profiles"
git push origin feat/server-profile-auto-create-fix
```
