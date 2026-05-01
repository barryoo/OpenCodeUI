# Server Profile 自动创建修复设计

## 背景

当前前端在进入部分 server-backed 流程时，会调用 `ensureDefaultThinServerProfile(...)`。

该逻辑会先按 `baseUrl` 查询当前用户已有的 `server_profiles`，若未命中，则自动调用 `POST /server-profiles` 创建一条新记录。默认名称为 `Active OpenCode Server`。

这导致两个问题：

1. `server_profiles` 出现了并非用户手动创建的脏数据。
2. 随着使用和 server 切换，库里会持续新增 `Active OpenCode Server` 记录。

根据本次确认的产品边界：

1. `server_profiles` 只能由用户手动创建。
2. `Active OpenCode Server` 这类自动 profile 完全不应该存在。
3. 当当前 active server 没有对应 profile 时，系统不应落库，而应提示用户先手动创建 profile。

## 问题定义

当前实现把“运行时需要知道当前 server 的 baseUrl”与“需要存在一个持久化 server profile”错误地绑定在一起。

实际需要的是：

1. 对于依赖 `server_profile_id` 的服务端能力，只能使用用户已手动创建的 profile。
2. 若当前 active server 没有匹配 profile，前端应进入“未配置 profile”状态。
3. 此时相关 server-backed 功能应停止继续执行，而不是隐式创建 profile 兜底。

## 根因

根因在于 `src/api/thinServer.ts` 中的 `ensureDefaultThinServerProfile`：

1. 它的名字和职责都包含“ensure”，即在缺失时补创建。
2. 它会在查不到 `baseUrl` 对应 profile 时自动 `POST /server-profiles`。
3. 该函数被两个运行时入口调用：
   - `src/store/itemWorkspaceStore.ts` 初始化路径
   - `src/hooks/useChatSession.ts` 的 session 同步路径

因此，任何一次“当前 active server 有 baseUrl，但用户未手动创建 profile”的访问，都会把临时运行时状态误持久化到 `server_profiles` 表中。

## 设计目标

以最小改动修复本次问题：

1. 彻底停止自动创建 `server_profiles`。
2. 保持现有用户手动创建 profile 的主流程不变。
3. 对缺失 profile 的场景给出明确、可识别的前端状态。
4. 让依赖 profile 的 server-backed 功能在缺失时安全短路。
5. 本次只修“停止继续新增”，不扩大到历史脏数据自动清理。

## 方案对比

### 方案 A：移除自动创建，改为未配置态（采用）

做法：

1. 去掉 `ensureDefaultThinServerProfile` 的自动创建能力。
2. 改为只查找当前 `baseUrl` 对应的已存在 profile，查不到则返回空结果或显式未配置错误。
3. `itemWorkspaceStore` 与 `useChatSession` 在缺失 profile 时不再写库，而是进入未配置态并终止相关 server-backed 流程。

优点：

- 与产品边界完全一致。
- 直接消除脏数据继续增长的根因。
- 改动集中，风险可控。

缺点：

- 需要补齐缺失 profile 的前端状态处理。

### 方案 B：保留运行时 server，但只做内存态映射

做法：

1. 当前 active server 仍可被前端使用。
2. 若没有持久化 profile，则构造一个仅存在于内存中的临时 server 引用。
3. 只有用户显式点击创建/保存时才写入 `server_profiles`。

优点：

- 使用链路更顺滑。
- 部分功能可以在不落库前继续运转。

缺点：

- 要区分临时 server 与持久化 profile，状态更复杂。
- 超出本次 bugfix 所需，容易引入额外分支。

### 方案 C：后端拦截自动 profile 名称或来源

做法：

1. 保持前端大体不变。
2. 在 `POST /server-profiles` 增加保护，拒绝 `Active OpenCode Server` 等自动来源。

优点：

- 可以阻止新脏数据入库。

缺点：

- 只是在后端拦截症状，没有消除前端错误流程。
- 前端仍会继续走错误分支并触发失败处理。

## 采用方案

采用方案 A。

核心原则：

1. 运行时 active server 不等于持久化 server profile。
2. 持久化 profile 只能来自用户显式创建。
3. 任何 server-backed 能力在缺失 profile 时都必须显式失败或短路，不能隐式补写。

## 目标行为

### 场景 1：当前 active server 已有用户创建的 profile

1. 前端按 `baseUrl` 查找匹配 profile。
2. 若命中，则继续后续 item / session summary / 绑定等 server-backed 流程。
3. 全程不产生任何新的 `server_profiles` 记录。

### 场景 2：当前 active server 没有用户创建的 profile

1. 前端按 `baseUrl` 查找匹配 profile。
2. 若未命中，则不调用 `POST /server-profiles`。
3. 前端进入“未配置 server profile”状态。
4. 依赖 `server_profile_id` 的流程直接停止。
5. UI 明确提示用户先手动创建 Server Profile。

## 目标数据流

1. 运行时代码读取当前 active server 的 `baseUrl`。
2. 调用 thin-server API 层查找与该 `baseUrl` 对应的现有 profile。
3. 若找到 profile，则返回 profile，后续逻辑继续。
4. 若找不到 profile，则返回空结果或显式未配置状态。
5. 上层 store / hook 根据该状态决定：
   - 不发起依赖 `server_profile_id` 的请求
   - 更新本地状态供 UI 提示
   - 不执行任何自动创建

## 改动范围

### 1. `src/api/thinServer.ts`

职责调整：

1. 移除 `ensureDefaultThinServerProfile` 的自动创建语义。
2. 改为只读查找能力，例如“按 baseUrl 查 profile”。
3. 若未命中，不发 `POST /server-profiles`。

实现要求：

1. 不保留 `Active OpenCode Server` 默认创建名。
2. 返回值必须允许上层区分“查到 profile”和“未配置 profile”。

### 2. `src/store/itemWorkspaceStore.ts`

职责调整：

1. 初始化时只接受已存在 profile。
2. 若缺失 profile，不再自动创建。
3. 进入可识别的未配置态，阻止后续依赖 `server_profile_id` 的项目/事项/摘要逻辑继续执行。

实现要求：

1. 不要用静默成功掩盖缺失 profile。
2. store 状态需能驱动 UI 做明确提示。

### 3. `src/hooks/useChatSession.ts`

职责调整：

1. session 同步链路只接受已存在 profile。
2. 若缺失 profile，直接跳过 server-backed session summary 同步。
3. 不再走自动创建 profile 分支。

实现要求：

1. 缺失 profile 时行为应稳定可预期。
2. 不得因为 profile 不存在而写入脏数据。

## UI / 交互要求

当 active server 没有对应的用户 profile 时：

1. 展示明确提示：`请先手动创建 Server Profile`。
2. 依赖该 profile 的 server-backed 功能禁用或短路。
3. 不使用隐式 fallback 冒充成功。

本次设计不要求重做完整交互，只要求把“未配置 profile”状态明确暴露到现有 UI。

## 数据兼容与迁移

本次不做自动清理历史脏数据。

原因：

1. 当前目标是停止继续新增错误数据。
2. 自动删除历史记录可能误伤用户手工创建但命名接近的数据。
3. 历史数据清理可以单独作为后续一次受控操作处理。

因此本次范围仅包括：

1. 停止新增 `Active OpenCode Server` 类记录。
2. 保持已有历史数据不变。

## 错误处理

### 1. 未配置 profile

这是预期业务状态，不应被当作异常崩溃处理。

要求：

1. 上层能识别并展示提示。
2. 不触发自动重试创建。

### 2. 查询 profile 请求失败

这是实际错误。

要求：

1. 保持现有错误传播方式或按现有模式提示。
2. 不因为请求失败而回退到自动创建。

## 验收标准

### 场景 1：无匹配 profile 的 item workspace 初始化

1. 当前 active server 存在，但用户未创建对应 profile。
2. 触发 `itemWorkspaceStore.initialize()`。
3. 系统不会新增任何 `server_profiles` 记录。
4. 前端进入未配置态。
5. UI 提示用户先手动创建 Server Profile。

### 场景 2：无匹配 profile 的 chat session 同步

1. 当前 active server 存在，但用户未创建对应 profile。
2. 触发 `useChatSession` 中的 server-backed 同步逻辑。
3. 系统不会新增任何 `server_profiles` 记录。
4. session summary 同步被安全跳过。

### 场景 3：已有匹配 profile 的正常流程

1. 用户已手动创建与当前 `baseUrl` 匹配的 profile。
2. 初始化与 session 同步仍可正常工作。
3. 系统不会为同一流程额外新增 profile。

## 测试要求

至少覆盖以下回归测试：

1. 无匹配 profile 时，thin-server API 层不会调用创建接口。
2. `itemWorkspaceStore` 初始化在缺失 profile 时不会自动插库。
3. `useChatSession` 在缺失 profile 时不会自动插库。
4. 有匹配 profile 时，现有 server-backed 流程继续可用。

## 非目标

1. 不在本次修复中自动删除历史脏数据。
2. 不重构整个 server/profile 领域模型。
3. 不引入“临时 profile”或“内存态 profile”新抽象。
