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

- [ ] **Step 2: 运行测试，确认当前失败**

- [ ] **Step 3: 在 API 层实现只读查找函数**

- [ ] **Step 4: 再加一个命中场景测试**

- [ ] **Step 5: 运行测试，确认通过**

## Task 3: 用回归测试锁定 itemWorkspaceStore 的未配置态

**Files:**
- Modify: `src/store/itemWorkspaceStore.binding.test.ts`
- Modify: `src/store/itemWorkspaceStore.ts:67-113`
- Modify: `src/store/itemWorkspaceStore.ts:177-221`
- Test: `src/store/itemWorkspaceStore.binding.test.ts`

- [ ] **Step 1: 在现有 store 测试中添加 failing case**

- [ ] **Step 2: 运行测试，确认当前失败**

- [ ] **Step 3: 在 store 中实现未配置态与错误透传**

- [ ] **Step 4: 跑测试确认通过**

## Task 4: 修复 useChatSession 的自动创建链路并补测试

**Files:**
- Modify: `src/hooks/useChatSession.ts:131-163`
- Modify: `src/store/itemWorkspaceStore.binding.test.ts`
- Test: `src/store/itemWorkspaceStore.binding.test.ts`

- [ ] **Step 1: 添加 failing test，锁定缺失 profile 时不做 session summary upsert**

- [ ] **Step 2: 将 hook 改为只查已有 profile，缺失则直接返回**

- [ ] **Step 3: 运行相关测试与构建**

## Task 5: 完整验证与收尾

**Files:**
- Modify: none

- [ ] **Step 1: 运行完整验证**

- [ ] **Step 2: 启动预览供用户验收**

- [ ] **Step 3: 向用户回报验收地址并等待确认**

- [ ] **Step 4: 仅在用户明确要求后再提交代码**
