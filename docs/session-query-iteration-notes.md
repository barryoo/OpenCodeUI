# Session Query 迭代说明

## 背景

这次调整的直接目标不是全面重构数据层，而是先解决一批高频的重复请求问题，尤其是：

- 点击打开会话时，`/session/{sessionId}` 在短时间内被多个组件重复请求
- `permission`、`question`、`status` 在同一轮交互中被不同入口重复拉取
- 这些请求很多不是“完全同时”，而是前后只差几百毫秒

为了解决这类问题，项目已引入 `TanStack Query`，但目前只收口了最核心的一小批 session 相关读取。

## 本次落地范围

本次已经接入 Query 的读取对象只有这几类：

- `getSession(sessionId, directory)`
- `getPendingPermissions(directory)`
- `getPendingQuestions(directory)`
- `getSessionStatus(directory)`

对应入口主要集中在：

- `src/query/client.ts`
- `src/query/session.ts`
- `src/hooks/useSessionManager.ts`
- `src/hooks/usePermissionHandler.ts`
- `src/hooks/useGlobalEvents.ts`
- `src/hooks/useChatSession.ts`
- `src/features/chat/Header.tsx`
- `src/features/chat/sidebar/MultiProjectSidePanel.tsx`
- `src/features/chat/sidebar/SidePanel.tsx`

## 当前策略

### 1. 缓存时间

当前统一使用：

- `staleTime = 1000ms`

这意味着：

- 1 秒内再次读取同一个 query key，会优先复用缓存，不再重新请求
- 超过 1 秒，再次读取时允许重新拉取

这个值是刻意设得比较短的。目标不是长期缓存，而是只拦住“同一轮 UI 交互里、前后几百毫秒”的重复请求。

### 2. 不依赖 SSE 清缓存

当前方案里：

- Query 缓存正确性不依赖 SSE 主动失效
- SSE 仍然保留，用来驱动现有交互和实时 UI 更新
- 但不把 “必须等 SSE 才能恢复正确状态” 当成前提

### 3. 写操作后的处理方式

对于已经接入 Query 的数据，当前优先使用两种方式保持 UI 正常：

- 直接写回 cache，例如 `setSessionQueryData(...)`
- 或在必要时手动更新对应 query 数据

例如：

- 重命名 session 后，直接更新 session cache
- fork / archive 后，同步 session cache
- 回复 permission / question 后，立即从 pending cache 中移除对应项

## 当前 query key 设计

目前只定义了最小集合：

```ts
['session', sessionId]
['pending-permissions', directory]
['pending-questions', directory]
['session-status', directory]
```

注意点：

- `session detail` 当前 key 只按 `sessionId` 做唯一标识，没有把 `directory` 放进 key
- 这样做是为了先消除同一 session 在不同组件里重复拉取的问题
- 这个前提是：同一个 `sessionId` 在当前系统里可以视为全局唯一，且读取结果应一致

如果后面发现同一个 `sessionId` 在不同目录上下文下会返回不一致结果，再考虑把 `directory` 收回到 key 里。

## 为什么现在只收这一批

因为这批接口有几个特点：

- 已经有明确的重复请求现象
- 被多个组件重复读取
- 读取后结果基本可共享
- 改造收益高，风险相对可控

相比之下，`messages` 相关读取虽然也很重要，但目前还和这些逻辑强耦合：

- `messageStore`
- 流式消息合并
- SSE 增量更新
- 本地 streaming 状态
- 历史分页和 undo/redo

所以 `messages` 不适合在这一轮直接整体迁移。

## 这次没有动的层

以下内容目前仍然保留原方案，没有并入 Query：

- `messageStore`
- `activeSessionStore`
- `childSessionStore`
- `SessionContext` 的完整列表体系
- `DirectoryContext` 的本地项目状态
- 布局、主题、快捷键等纯前端 store

这是刻意的。当前是“先收共享读取层”，不是“一次性改完所有状态管理”。

## 后续迭代建议

后面如果继续推进 Query，建议按下面顺序来，而不是到处零散替换。

### 第一优先级

继续收 `session list` 相关读取：

- `getSessions(...)`
- `getGlobalSessions(...)`

因为现在列表相关逻辑仍然分散在：

- `SessionContext`
- `MultiProjectSidePanel`
- 其他局部补拉逻辑

这里仍然有重复读取和状态分散的问题。

### 第二优先级

再评估是否把 `session children` 和 `session todos` 也纳入 Query：

- `getSessionChildren(...)`
- `getSessionTodos(...)`

这两类都更像服务端快照，适合渐进式纳入。

### 第三优先级

最后再处理 `messages`：

- `getSessionMessages(...)`

这一步要非常谨慎。建议保持原则：

- Query 负责首屏快照和历史分页
- `messageStore` 继续负责本地 streaming / merge / UI 派生状态

不要在还没理顺 streaming 之前，直接把整套 message 流强行挪到 Query。

## 后续开发时的注意事项

### 1. 新增读取时，先判断是否属于“共享服务端状态”

如果一个接口满足下面几个条件，就优先考虑放进 Query：

- 多个组件会读
- 结果可以共享
- 允许短时间缓存
- 有明显重复请求风险

如果只是本地 UI 状态，或者强依赖临时交互过程，就不要硬塞进 Query。

### 2. 不要绕开 Query 直接重新调同一个接口

如果后面某个新组件又直接 `getSession(...)`、`getPendingPermissions(...)`、`getPendingQuestions(...)`、`getSessionStatus(...)`，就很容易把这次的去重效果打回去。

对于已经收口的接口，优先使用：

- `fetchSessionQuery(...)`
- `fetchPendingPermissionsQuery(...)`
- `fetchPendingQuestionsQuery(...)`
- `fetchSessionStatusQuery(...)`
- `useSessionDetailQuery(...)`

### 3. 写操作后优先更新 cache，不要只等自动过期

虽然当前 `staleTime` 只有 1 秒，但写操作完成后仍然建议立刻同步 cache。

原因很简单：

- 1 秒虽然不长，但对用户来说依然可能看到闪一下旧状态
- 写操作后的 UI 正确性，不应该寄希望于“等缓存过期后再拉一次”

### 4. 切换 server 时要记得清 Query cache

这次已经在 `src/main.tsx` 里处理了：

- server 切换时会 `queryClient.clear()`

如果后面继续扩展 Query，这条规则必须保留，否则容易把旧 server 的数据带到新 server。

## 一句话总结

当前这套方案的定位是：

- 用 1 秒 Query 缓存，先压掉 session 相关的瞬时重复请求
- 保留现有 store 和 SSE 作为业务行为层
- 后续再按优先级逐步把更多“共享服务端读取”迁到 Query

它不是最终形态，但已经是后续继续演进的基线。
