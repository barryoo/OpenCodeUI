# Item Session UI Sync Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 修复事项面板发起的新会话在首条消息后已绑定事项、但前端两个列表未同步的问题。

**Architecture:** 保持现有“点击新建会话仅进入空白态、首条消息后才真正创建会话”的流程不变。在 `useChatSession` 拿到服务端返回的最新 `ThinSessionSummary` 后，立即通过 `itemWorkspaceStore` 的本地 summary 写回入口更新 `projectStates` 与 `allSummaries`，让项目管理面板和事项面板同时基于最新 summary 重渲染。

**Tech Stack:** React 19、TypeScript、Zustand、Bun test、Vite、ESLint

---

## File Structure

- Modify: `src/store/itemWorkspaceStore.ts`
  - 新增一个明确的本地 summary 合并入口，例如 `upsertLocalSummary(summary)`。
  - 该入口负责同时更新 `projectStates[projectPath].summaries` 和 `allSummaries`。
- Modify: `src/hooks/useChatSession.ts`
  - 在 `syncThinSessionVariant()` 中接收 `upsertThinSessionSummary()` 的返回值，并调用 store 的本地合并入口。
- Create: `src/store/itemWorkspaceStore.test.ts`
  - 添加回归测试，覆盖“bound summary 写回后，项目管理面板不再显示该会话、事项面板能查到该会话”的行为。

## Task 1: 创建隔离 worktree

**Files:**
- Modify: none

- [ ] **Step 1: 基于 master 创建 worktree**

```bash
git worktree add ../OpenCodeUI-feat/item-session-ui-sync -b feat/item-session-ui-sync
```

- [ ] **Step 2: 确认进入新 worktree 后再开始后续任务**

```bash
pwd
git branch --show-current
```

Expected:
- `pwd` 指向 `../OpenCodeUI-feat/item-session-ui-sync`
- 当前分支是 `feat/item-session-ui-sync`

## Task 2: 为本地 summary 同步补回归测试与 store 写回入口

**Files:**
- Create: `src/store/itemWorkspaceStore.test.ts`
- Modify: `src/store/itemWorkspaceStore.ts:73-111`
- Modify: `src/store/itemWorkspaceStore.ts:125-158`
- Modify: `src/store/itemWorkspaceStore.ts:407-462`
- Test: `src/store/itemWorkspaceStore.test.ts`

- [ ] **Step 1: 写 failing regression test**

```ts
import { beforeEach, describe, expect, test } from 'bun:test'
import type { ApiSession } from '../api'
import type { ThinItem, ThinSessionSummary } from '../api/thinServer'
import { useItemWorkspaceStore } from './itemWorkspaceStore'

const projectPath = '/tmp/project-a'
const itemId = 'item-1'
const sessionId = 'session-1'
const summaryId = 'summary-1'

function makeItem(): ThinItem {
  return {
    id: itemId,
    projectPath,
    serverProfileId: 'profile-1',
    title: 'Bug item',
    type: 'bug',
    status: 'in_progress',
    description: 'desc',
    activityAt: '2026-05-01T10:00:00.000Z',
    updatedAt: '2026-05-01T10:00:00.000Z',
  }
}

function makeSummary(overrides: Partial<ThinSessionSummary> = {}): ThinSessionSummary {
  return {
    id: summaryId,
    projectPath,
    externalSessionId: sessionId,
    itemId: null,
    variant: null,
    titleSnapshot: 'New Chat',
    statusSnapshot: 'in_progress',
    activityAt: '2026-05-01T10:01:00.000Z',
    updatedAt: '2026-05-01T10:01:00.000Z',
    ...overrides,
  }
}

function makeSession(): ApiSession {
  return {
    id: sessionId,
    title: 'New Chat',
    directory: projectPath,
    version: '1',
    time: {
      created: '2026-05-01T10:00:00.000Z',
      updated: '2026-05-01T10:01:00.000Z',
    },
  } as ApiSession
}

describe('itemWorkspaceStore local summary sync', () => {
  beforeEach(() => {
    useItemWorkspaceStore.getState().reset()
    useItemWorkspaceStore.setState({
      projectStates: {
        [projectPath]: {
          items: [makeItem()],
          summaries: [makeSummary()],
          error: undefined,
        },
      },
      allSummaries: [makeSummary()],
      selectedItemId: itemId,
      selectedItemProjectPath: projectPath,
    })
  })

  test('moves a newly bound session out of project entries and into linked summaries', () => {
    useItemWorkspaceStore.getState().upsertLocalSummary(
      makeSummary({ itemId })
    )

    const entries = useItemWorkspaceStore.getState().getProjectEntries(projectPath, [makeSession()])
    const linked = useItemWorkspaceStore.getState().getLinkedSummaries(itemId)

    expect(entries.some((entry) => entry.kind === 'session' && entry.id === sessionId)).toBe(false)
    expect(linked.map((summary) => summary.externalSessionId)).toEqual([sessionId])
  })
})
```

- [ ] **Step 2: 运行测试，确认当前失败**

Run:

```bash
bun test src/store/itemWorkspaceStore.test.ts
```

Expected: FAIL，原因是 `upsertLocalSummary` 尚不存在，或断言无法成立。

- [ ] **Step 3: 在 store 中实现本地 summary 合并入口**

在 `ItemWorkspaceState` 接口中加入方法签名：

```ts
upsertLocalSummary: (summary: ThinSessionSummary) => void
```

在 store 实现中加入：

```ts
upsertLocalSummary: (summary: ThinSessionSummary) => {
  const projectPath = summary.projectPath
  set((state: ItemWorkspaceState) => ({
    projectStates: mergeProjectState(state.projectStates, projectPath, {
      summaries: mergeSummaries(state.projectStates[projectPath]?.summaries ?? [], [summary]),
    }),
    allSummaries: mergeSummaries(state.allSummaries, [summary]),
  }))
},
```

要求：
- 只合并一条 summary。
- 不引入 `loadProject`。
- 复用现有 `mergeProjectState` 与 `mergeSummaries`。

- [ ] **Step 4: 运行测试，确认通过**

Run:

```bash
bun test src/store/itemWorkspaceStore.test.ts
```

Expected: PASS

- [ ] **Step 5: 提交 Task 2**

```bash
git add src/store/itemWorkspaceStore.ts src/store/itemWorkspaceStore.test.ts
git commit -m "test: cover local item session summary sync"
```

## Task 3: 在会话创建绑定路径中写回最新 summary

**Files:**
- Modify: `src/hooks/useChatSession.ts:131-160`
- Modify: `src/store/itemWorkspaceStore.ts:104-109` 
- Test: `src/store/itemWorkspaceStore.test.ts`

- [ ] **Step 1: 先让 hook 级别的编译约束失败**

将 `syncThinSessionVariant()` 的关键片段改成下面形式，但先不要补 store 调用，保存后运行构建：

```ts
const updated = await upsertThinSessionSummary({
  serverProfileId: profile.id,
  projectPath,
  legacyProjectId: project?.id ?? null,
  externalSessionId: session.id,
  itemId: itemBinding?.itemId ?? existing?.itemId ?? null,
  variant: variant ?? existing?.variant ?? null,
  titleSnapshot: session.title,
  statusSnapshot: existing?.statusSnapshot ?? 'in_progress',
  activityAt: new Date(session.time.updated ?? session.time.created).toISOString(),
  lastMessageAt: new Date().toISOString(),
})
```

Run:

```bash
bun run build
```

Expected: PASS（这一步只是把返回值显式接住，为下一步做准备）。

- [ ] **Step 2: 在 hook 中把服务端返回 summary 写回本地 store**

将 `syncThinSessionVariant()` 更新为：

```ts
const updated = await upsertThinSessionSummary({
  serverProfileId: profile.id,
  projectPath,
  legacyProjectId: project?.id ?? null,
  externalSessionId: session.id,
  itemId: itemBinding?.itemId ?? existing?.itemId ?? null,
  variant: variant ?? existing?.variant ?? null,
  titleSnapshot: session.title,
  statusSnapshot: existing?.statusSnapshot ?? 'in_progress',
  activityAt: new Date(session.time.updated ?? session.time.created).toISOString(),
  lastMessageAt: new Date().toISOString(),
})

useItemWorkspaceStore.getState().upsertLocalSummary(updated)
```

要求：
- 保持现有异常处理逻辑不变。
- 不改 `handleSend()` 的流程顺序。
- 不新增额外请求。

- [ ] **Step 3: 跑回归测试、构建、lint**

Run:

```bash
bun test src/store/itemWorkspaceStore.test.ts && bun run build && npm run lint
```

Expected:
- `bun test ...` PASS
- `bun run build` PASS
- `npm run lint` PASS

- [ ] **Step 4: 提交 Task 3**

```bash
git add src/hooks/useChatSession.ts src/store/itemWorkspaceStore.ts src/store/itemWorkspaceStore.test.ts
git commit -m "fix: sync bound item sessions into local workspace store"
```

## Task 4: 本地预览并人工验收

**Files:**
- Modify: none

- [ ] **Step 1: 启动 dev server 供验收**

```bash
npx vite --port 5174
```

Expected: 本地可访问 `http://localhost:5174`

- [ ] **Step 2: 按回归路径手工验证**

验证步骤：

1. 打开一个已有事项的项目。
2. 进入事项面板，点击“新建会话”。
3. 页面进入空白态后发送首条消息。
4. 确认该会话**没有**出现在项目管理面板的未绑定会话列表中。
5. 确认该会话**立即**出现在当前事项的事项会话列表中。
6. 不刷新页面重复验证一次，确认行为稳定。

- [ ] **Step 3: 将预览地址发给用户，等待验收反馈**

向用户发送：

```text
预览已启动： http://localhost:5174
请按“事项面板 -> 新建会话 -> 首条消息”路径验收；确认无误后我再继续提交阶段。
```

## Self-Review Checklist

- 规格覆盖：计划覆盖了本次 spec 的三个核心要求——保留现有交互模型、补本地 summary 同步、避免全量刷新。
- 无占位符：没有 `TODO/TBD/implement later`。
- 类型一致：统一使用 `ThinSessionSummary`、`upsertLocalSummary()`、`projectStates[projectPath].summaries`、`allSummaries`。
