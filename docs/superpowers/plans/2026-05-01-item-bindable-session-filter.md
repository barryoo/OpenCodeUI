# 事项绑定会话过滤修复 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 修复事项面板右上角“绑定会话”弹窗，让它只显示当前未绑定的会话，并允许已解绑会话重新绑定。

**Architecture:** 先把“哪些会话可绑定”的判断从组件副作用中提取为纯函数并补测试，再给 store 增加“当前项目全部去重 summaries” selector，最后让 `App` 向 `ItemDetailPanel` 传入完整项目 summaries，由组件基于纯函数过滤会话并复用未绑定 summary。这样可以排除“已绑定到当前事项”和“已绑定到其他事项”的会话，同时保留“解绑后可再绑定”的行为。

**Tech Stack:** React 19、TypeScript、Zustand、Bun test、Vite

---

## File Structure

- Create: `src/features/items/bindableSessions.ts`
  - 纯函数：根据原生会话列表、项目 summaries、当前事项 id，返回“可显示的会话列表”和“可复用的未绑定 summary map”。
- Create: `src/features/items/bindableSessions.test.ts`
  - `bun:test` 纯逻辑测试，覆盖当前事项已绑定、其他事项已绑定、未绑定、曾解绑可再绑这 4 类行为。
- Modify: `src/store/itemWorkspaceStore.ts`
  - 新增 `getProjectSummaries(projectPath)` selector，返回当前项目按 `externalSessionId` 去重后的完整 summaries。
- Modify: `src/store/itemWorkspaceStore.test.ts`
  - 给新 selector 补测试，确认会优先保留绑定中的 summary。
- Modify: `src/App.tsx`
  - 读取 `getProjectSummaries(...)`，并把 `projectSummaries` 传给 `ItemDetailPanel`。
- Modify: `src/features/items/ItemDetailPanel.tsx`
  - 移除 `unboundSessions` 过滤拼装，改用纯函数结果过滤绑定弹窗。

## Task 1: 给 store 暴露当前项目完整 summaries

**Files:**
- Modify: `src/store/itemWorkspaceStore.ts`
- Modify: `src/store/itemWorkspaceStore.test.ts`

- [ ] **Step 1: 先给 selector 写失败测试**

在 `src/store/itemWorkspaceStore.test.ts` 追加下面这个用例，验证同一 `externalSessionId` 同时存在未绑定和已绑定 summary 时，selector 只返回一条，并优先保留已绑定版本：

```ts
test('getProjectSummaries deduplicates by externalSessionId and keeps the bound summary', () => {
  useItemWorkspaceStore.getState().reset()
  useItemWorkspaceStore.setState({
    projectStates: {
      [projectPath]: {
        items: [makeItem()],
        summaries: [
          makeSummary({ id: summaryId, itemId: null }),
          makeSummary({
            id: summaryId2,
            itemId,
            activityAt: '2026-05-01T10:02:00.000Z',
            updatedAt: '2026-05-01T10:02:00.000Z',
          }),
        ],
        error: undefined,
      },
    },
    allSummaries: [
      makeSummary({ id: summaryId, itemId: null }),
      makeSummary({
        id: summaryId2,
        itemId,
        activityAt: '2026-05-01T10:02:00.000Z',
        updatedAt: '2026-05-01T10:02:00.000Z',
      }),
    ],
  })

  const summaries = useItemWorkspaceStore.getState().getProjectSummaries(projectPath)

  expect(summaries).toHaveLength(1)
  expect(summaries[0].externalSessionId).toBe(sessionId)
  expect(summaries[0].itemId).toBe(itemId)
  expect(summaries[0].id).toBe(summaryId2)
})
```

- [ ] **Step 2: 运行单测并确认先失败**

Run:

```bash
bun test src/store/itemWorkspaceStore.test.ts
```

Expected:

```text
FAIL
Property 'getProjectSummaries' does not exist on type 'ItemWorkspaceState'
```

- [ ] **Step 3: 在 store 接口和实现里补 selector 最小实现**

先在 `src/store/itemWorkspaceStore.ts` 的 `ItemWorkspaceState` 接口中，紧跟 `getProjectItems` 后面加入：

```ts
getProjectSummaries: (projectPath: string) => ThinSessionSummary[]
```

再在 selector 实现区，放在 `getProjectItems` 后、`getItemById` 前，加入：

```ts
getProjectSummaries: (projectPath: string) => dedupeSummariesByExternalSessionId(
  get().projectStates[projectPath]?.summaries ?? [],
),
```

- [ ] **Step 4: 重新运行 store 单测并确认通过**

Run:

```bash
bun test src/store/itemWorkspaceStore.test.ts
```

Expected:

```text
PASS
```

## Task 2: 提取“可绑定会话”纯函数并用 TDD 锁定规则

**Files:**
- Create: `src/features/items/bindableSessions.ts`
- Create: `src/features/items/bindableSessions.test.ts`

- [ ] **Step 1: 先写纯函数测试**

创建 `src/features/items/bindableSessions.test.ts`：

```ts
/// <reference types="bun" />

import { describe, expect, test } from 'bun:test'
import type { ApiSession } from '../../api'
import type { ThinSessionSummary } from '../../api/thinServer'
import { getBindableSessions } from './bindableSessions'

const currentItemId = 'item-current'

function makeSession(id: string, title = id): ApiSession {
  return {
    id,
    title,
    directory: '/tmp/project-a',
    projectID: 'proj-1',
    time: {
      created: Date.parse('2026-05-01T10:00:00.000Z'),
      updated: Date.parse('2026-05-01T10:01:00.000Z'),
    },
  }
}

function makeSummary(overrides: Partial<ThinSessionSummary> & { externalSessionId: string }): ThinSessionSummary {
  return {
    id: `summary-${overrides.externalSessionId}`,
    projectPath: '/tmp/project-a',
    externalSessionId: overrides.externalSessionId,
    itemId: null,
    variant: null,
    titleSnapshot: overrides.externalSessionId,
    statusSnapshot: 'in_progress',
    activityAt: '2026-05-01T10:01:00.000Z',
    updatedAt: '2026-05-01T10:01:00.000Z',
    ...overrides,
  }
}

describe('getBindableSessions', () => {
  test('hides sessions already bound to the current item', () => {
    const result = getBindableSessions(
      [makeSession('session-1')],
      [makeSummary({ externalSessionId: 'session-1', itemId: currentItemId })],
      currentItemId,
    )

    expect(result.bindableSessions).toHaveLength(0)
    expect(result.reusableSummaryByExternalId.size).toBe(0)
  })

  test('hides sessions bound to a different item', () => {
    const result = getBindableSessions(
      [makeSession('session-2')],
      [makeSummary({ externalSessionId: 'session-2', itemId: 'item-other' })],
      currentItemId,
    )

    expect(result.bindableSessions).toHaveLength(0)
    expect(result.reusableSummaryByExternalId.size).toBe(0)
  })

  test('keeps unbound sessions visible and exposes reusable summaries', () => {
    const result = getBindableSessions(
      [makeSession('session-3')],
      [makeSummary({ externalSessionId: 'session-3', itemId: null })],
      currentItemId,
    )

    expect(result.bindableSessions.map((session) => session.id)).toEqual(['session-3'])
    expect(result.reusableSummaryByExternalId.get('session-3')?.itemId).toBeNull()
  })

  test('keeps brand new sessions visible even when no summary exists yet', () => {
    const result = getBindableSessions(
      [makeSession('session-4')],
      [],
      currentItemId,
    )

    expect(result.bindableSessions.map((session) => session.id)).toEqual(['session-4'])
    expect(result.reusableSummaryByExternalId.has('session-4')).toBe(false)
  })
})
```

- [ ] **Step 2: 运行纯函数测试并确认先失败**

Run:

```bash
bun test src/features/items/bindableSessions.test.ts
```

Expected:

```text
FAIL
Cannot find module './bindableSessions'
```

- [ ] **Step 3: 写最小纯函数实现**

创建 `src/features/items/bindableSessions.ts`：

```ts
import type { ApiSession } from '../../api'
import type { ThinSessionSummary } from '../../api/thinServer'

export interface BindableSessionsResult {
  bindableSessions: ApiSession[]
  reusableSummaryByExternalId: Map<string, ThinSessionSummary>
}

export function getBindableSessions(
  sessions: ApiSession[],
  projectSummaries: ThinSessionSummary[],
  currentItemId: string,
): BindableSessionsResult {
  const summaryByExternalId = new Map(
    projectSummaries.map((summary) => [summary.externalSessionId, summary]),
  )
  const bindableSessions: ApiSession[] = []
  const reusableSummaryByExternalId = new Map<string, ThinSessionSummary>()

  for (const session of sessions) {
    const summary = summaryByExternalId.get(session.id)

    if (summary?.itemId === currentItemId) continue
    if (summary?.itemId && summary.itemId !== currentItemId) continue

    if (summary) {
      reusableSummaryByExternalId.set(session.id, summary)
    }

    bindableSessions.push(session)
  }

  return {
    bindableSessions,
    reusableSummaryByExternalId,
  }
}
```

- [ ] **Step 4: 重新运行纯函数测试并确认通过**

Run:

```bash
bun test src/features/items/bindableSessions.test.ts
```

Expected:

```text
PASS
```

## Task 3: 接入 App 与 ItemDetailPanel

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/features/items/ItemDetailPanel.tsx`

- [ ] **Step 1: 先在 `App.tsx` 改成传完整项目 summaries**

把 `src/App.tsx` 中这两行：

```ts
const linkedSummaries = selectedItem ? getLinkedSummaries(selectedItem.id) : []
const unboundSummaries = selectedItemProjectPath ? getProjectUnboundSummaries(selectedItemProjectPath) : []
```

改成：

```ts
const linkedSummaries = selectedItem ? getLinkedSummaries(selectedItem.id) : []
const projectSummaries = selectedItemProjectPath ? getProjectSummaries(selectedItemProjectPath) : []
```

并把组件传参：

```tsx
linkedSessions={linkedSummaries}
projectSummaries={projectSummaries}
```

同时把 `getProjectUnboundSummaries` 的解构替换成 `getProjectSummaries`。

- [ ] **Step 2: 更新 `ItemDetailPanel` props 与本地状态**

在 `src/features/items/ItemDetailPanel.tsx`：

1. 新增导入：

```ts
import { getBindableSessions } from './bindableSessions'
```

2. 把 props 里的 `unboundSessions?: ThinSessionSummary[]` 改成：

```ts
projectSummaries?: ThinSessionSummary[]
```

3. 解构默认值从：

```ts
unboundSessions = [],
```

改成：

```ts
projectSummaries = [],
```

4. 在 state 区新增可复用 summary map：

```ts
const [reusableSummaryByExternalId, setReusableSummaryByExternalId] = useState<Map<string, ThinSessionSummary>>(new Map())
```

- [ ] **Step 3: 用纯函数替换绑定弹窗过滤逻辑**

把当前 effect 里的这段：

```ts
const boundIds = new Set(linkedSessions.map((session) => session.externalSessionId))
const summariesByExternalId = new Map(unboundSessions.map((summary) => [summary.externalSessionId, summary]))
setBindableSessions(sessions.filter((session) => !boundIds.has(session.id) || summariesByExternalId.has(session.id)))
```

替换成：

```ts
const result = getBindableSessions(sessions, projectSummaries, item.id)
setBindableSessions(result.bindableSessions)
setReusableSummaryByExternalId(result.reusableSummaryByExternalId)
```

并把 `catch` 分支改成：

```ts
if (!cancelled) {
  setBindableSessions([])
  setReusableSummaryByExternalId(new Map())
}
```

同时把这个 effect 的依赖项从：

```ts
[bindMenuOpen, isCreateMode, linkedSessions, projectDirectory, unboundSessions]
```

改成：

```ts
[bindMenuOpen, isCreateMode, item.id, projectDirectory, projectSummaries]
```

- [ ] **Step 4: 让点击绑定时复用新的 summary map**

把渲染列表时的这行：

```ts
const existingSummary = unboundSessions.find((summary) => summary.externalSessionId === session.id)
```

改成：

```ts
const existingSummary = reusableSummaryByExternalId.get(session.id)
```

保留原来的绑定分支：

```ts
if (existingSummary?.id) {
  void onBindSession?.(existingSummary.id, item.id)
  return
}
void onBindProjectSession?.(session, item.id)
```

- [ ] **Step 5: 运行聚焦测试，确认新增逻辑保持全绿**

Run:

```bash
bun test src/store/itemWorkspaceStore.test.ts src/features/items/bindableSessions.test.ts
```

Expected:

```text
PASS
```

## Task 4: 全量校验与手工验收

**Files:**
- Verify only

- [ ] **Step 1: 运行 lint**

Run:

```bash
npm run lint
```

Expected:

```text
0 errors
```

- [ ] **Step 2: 运行构建**

Run:

```bash
bun run build
```

Expected:

```text
vite build completed successfully
```

- [ ] **Step 3: 启动 worktree 内预览服务，供用户验收**

Run:

```bash
npx vite --port 5174
```

Expected:

```text
Local:   http://localhost:5174/
```

- [ ] **Step 4: 按验收场景手工验证**

在浏览器中验证这 4 个场景：

1. 当前事项已绑定的会话，不出现在“绑定会话”弹窗里。
2. 已绑定到其他事项的会话，不出现在当前事项的“绑定会话”弹窗里。
3. 当前未绑定的新会话，会出现在弹窗里。
4. 曾绑定后解绑的会话，会重新出现在弹窗里，并能再次绑定。

若 4 个场景都通过，再把 `http://localhost:5174` 发给用户验收。

## Self-Review

- Spec coverage：已覆盖“当前事项已绑定不可见”“其他事项已绑定不可见”“未绑定可见”“解绑后可再绑”四个要求。
- Placeholder scan：计划内没有 `TODO` / `TBD` / “自行处理” 之类占位描述。
- Type consistency：统一使用 `getProjectSummaries`、`projectSummaries`、`getBindableSessions`、`reusableSummaryByExternalId` 这组命名。
