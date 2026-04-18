# OpenCodeUI 服务端化与事项管理设计方案

日期：2026-04-11  
状态：待评审  
版本：v1.0

## 1. 设计目标

本方案对应 `docs/server-backed-item-management-prd.md`，目标是给出可直接研发落地的技术与界面设计。

本期设计原则：

1. 在现有 OpenCodeUI 前端基础上做增量改造，不推翻现有会话主流程。
2. 先补轻量服务端数据底座，再补事项模型与三栏 UI。
3. 保持兼容：无事项会话继续可用。
4. 优先实现桌面端清晰结构，同时保持移动端可降级。

## 2. 技术选型

### 2.1 后端

1. Runtime：Bun
2. API：Node/Bun Web Server
3. Auth：GitHub OAuth
4. Storage：SQLite

### 2.2 前端

1. 维持现有 React 19 + Vite + TypeScript
2. 延续现有 store/query 模式
3. 在现有聊天布局上增加“事项中栏”能力

## 3. 目标架构

### 3.1 逻辑架构

前端拆为两层数据源：

1. OpenCode 原生能力接口：继续服务会话正文、消息流、工具调用等。
2. 新增 OpenCodeUI 服务端接口：负责用户、服务器、事项、事项-会话关系、会话摘要。

也就是说，V1 不是把现有 OpenCode 能力整体迁到新后端，而是在其之上增加一层业务后端。

### 3.2 核心边界

1. 项目列表和会话详情仍以 OpenCode 原有接口和现有前端流程为主。
2. 新后端负责“服务器配置、事项、会话摘要绑定”这层薄业务能力。
3. 新后端仅持有会话摘要字段，如 OpenCode 会话 ID、标题摘要、状态摘要、所属项目标识、事项绑定、最近活动时间。

## 4. 数据模型

### 4.1 user

字段建议：

1. `id`
2. `github_id`
3. `login`
4. `name`
5. `avatar_url`
6. `created_at`
7. `updated_at`

### 4.2 server_profiles

字段建议：

1. `id`
2. `user_id`
3. `name`
4. `base_url`
5. `auth_type`
6. `auth_secret_encrypted`
7. `is_default`
8. `created_at`
9. `updated_at`

约束：

1. 每个用户最多一个默认服务器。

### 4.3 projects

V1 不建议在新服务端持久化项目表作为真源。

说明：

1. 项目列表直接来自 OpenCode。
2. 前端在当前服务器上下文中读取 OpenCode 项目，并把 `project_id` 作为事项和会话摘要的外部关联键使用。

### 4.4 items

字段建议：

1. `id`
2. `project_id`
3. `title`
4. `type`
5. `status`
6. `description`
7. `activity_at`
8. `created_at`
9. `updated_at`

### 4.5 session_summaries

字段建议：

1. `id`
2. `server_profile_id`
3. `project_id`
4. `item_id` nullable
5. `external_session_id`
6. `title_snapshot`
7. `status_snapshot`
8. `activity_at`
9. `last_message_at`
10. `created_at`
11. `updated_at`

说明：

1. `external_session_id` 用于映射 OpenCode 侧真实会话 ID。
2. `title_snapshot` 和 `status_snapshot` 仅作为展示与绑定用途，不作为会话真源。
3. `item_id` 允许为空，以支持未绑定事项会话。

### 4.6 item_document_refs

字段建议：

1. `id`
2. `item_id`
3. `file_path`
4. `display_name`
5. `created_at`

说明：

1. 该表用于保存事项描述中 `@` 引用到的文件。

## 5. 状态机设计

### 5.1 会话状态

枚举：

1. `not_started`
2. `in_progress`
3. `completed`
4. `abandoned`

规则：

1. 新建会话初始可为 `not_started`。
2. 首次实际执行或进入有效交互后，自动切为 `in_progress`。
3. 若 `updated_at` 距当前超过 14 天，则自动转为 `completed`。
4. `completed` 与 `abandoned` 可人工恢复到 `in_progress`。

### 5.2 事项状态

枚举：

1. `not_started`
2. `in_progress`
3. `completed`
4. `abandoned`

规则：

1. 新建事项默认 `not_started`。
2. 只要其下存在任一 `in_progress` 会话，事项自动变为 `in_progress`。
3. 事项的 `completed` 与 `abandoned` 仍保留人工控制入口。
4. `completed` 与 `abandoned` 可恢复到 `in_progress`。

## 6. API 设计

### 6.1 认证

1. `GET /api/auth/github/start`
2. `GET /api/auth/github/callback`
3. `POST /api/auth/logout`
4. `GET /api/auth/me`

### 6.2 服务器

1. `GET /api/server-profiles`
2. `POST /api/server-profiles`
3. `PATCH /api/server-profiles/:id`
4. `DELETE /api/server-profiles/:id`
5. `POST /api/server-profiles/:id/default`

### 6.3 项目

1. 项目接口优先直接复用 OpenCode 原有 `/project` 能力。
2. 新服务端不提供项目 CRUD。

### 6.4 事项

1. `GET /api/projects/:projectId/items`
2. `POST /api/projects/:projectId/items`
3. `GET /api/items/:id`
4. `PATCH /api/items/:id`
5. `POST /api/items/:id/status`

### 6.5 会话摘要

1. `GET /api/projects/:projectId/session-summaries`
2. `POST /api/projects/:projectId/session-summaries/upsert`
3. `GET /api/session-summaries/:id`
4. `PATCH /api/session-summaries/:id`
5. `POST /api/session-summaries/:id/status`

### 6.6 事项-会话关系

1. `GET /api/items/:id/session-summaries`
2. `POST /api/session-summaries/:id/bind-item`
3. `POST /api/session-summaries/:id/unbind-item`

### 6.7 项目文件引用

1. `GET /api/projects/:projectId/files/search?q=`

说明：

1. 当事项描述中输入 `@` 时，调用该接口做候选搜索。

## 7. 前端 UI 设计

## 7.1 总体布局

布局分为三栏：

1. 左栏：项目与混排列表
2. 中栏：事项详情与事项会话列表
3. 右栏：会话详情

宽度建议：

1. 左栏：`280px - 360px`
2. 中栏：`360px - 480px`
3. 右栏：自适应，占剩余最大空间

### 7.2 两种展示模式

#### 模式 A：事项上下文模式

触发条件：

1. 用户点击左栏中的事项。

界面表现：

1. 显示左栏 + 中栏 + 右栏。
2. 中栏上半区为事项详情。
3. 中栏下半区为事项关联会话列表。
4. 右栏为当前选中的会话详情。

#### 模式 B：独立会话模式

触发条件：

1. 用户点击左栏中的未绑定事项会话。

界面表现：

1. 显示左栏 + 右栏。
2. 中栏隐藏。
3. 右栏直接展示该会话详情。

### 7.3 左栏设计

左栏包含两部分：

1. 服务器/项目切换区
2. 项目下混排列表区

混排列表渲染规则：

1. 未绑定事项的会话摘要，直接显示会话行。
2. 已绑定事项的会话摘要不单独显示。
3. 已绑定事项的会话摘要统一汇总在对应事项内部，通过点击事项进入中栏查看。
4. 列表统一按 `activityAt desc` 排序。

列表项建议字段：

1. 标题
2. 类型标识（仅弱提示，不做明显分区）
3. 状态 Badge
4. 最近活动时间

### 7.4 中栏设计

中栏分上下两区：

1. 上区：事项详情
2. 下区：事项关联会话列表

高度建议：

1. 默认 `上 58% / 下 42%`
2. 中间支持拖拽调节

#### 上区：事项详情

内容包括：

1. 标题输入框
2. 类型选择器
3. 状态按钮组或下拉
4. 更新时间展示
5. 描述编辑器

编辑方式：

1. 就地编辑
2. 支持自动保存或显式保存按钮
3. 保存中、保存成功、保存失败要有明确反馈

#### 下区：事项关联会话列表

每一行展示：

1. 会话标题
2. 状态
3. 最近活动时间

区头动作：

1. 新建会话
2. 绑定已有会话

说明：

1. 不提供顶部“返回事项”按钮。

### 7.5 右栏设计

1. 右栏始终用于承载会话详情。
2. 右栏是全页面主工作区。
3. 在事项上下文模式下，右栏展示事项下选中的某条会话。
4. 在独立会话模式下，右栏直接展示左栏点开的会话。

## 8. 组件拆分建议

### 8.1 新组件

1. `ServerSwitcher`
2. `ProjectScopedList`
3. `ItemListRow`
4. `SessionListRow`
5. `ItemPane`
6. `ItemEditor`
7. `ItemSessionList`
8. `SessionPaneShell`
9. `MentionFilePicker`

### 8.2 Store / Query

建议新增：

1. `serverProfileStore`
2. `projectStore` 或 `projectQuery`
3. `itemQuery`
4. `itemSessionQuery`
5. `workspaceLayoutStore`

`workspaceLayoutStore` 负责：

1. 当前服务器
2. 当前项目
3. 当前选中事项
4. 当前选中会话
5. 当前布局模式（两栏/三栏）

## 9. 数据同步策略

### 9.1 服务器与项目

1. 登录后先拉取服务器列表。
2. 选定默认服务器。
3. 拉取该服务器下项目列表。
4. 如需要，可调用一次项目同步，把 OpenCode `/project` 结果回填业务库。

### 9.2 会话元数据

1. 项目与会话详情仍按现有逻辑向 OpenCode 读取。
2. 会话标题摘要、状态摘要、事项绑定等轻量元数据从业务后端读取。
3. 若业务后端不存在某会话摘要，可在首次访问或会话列表拉取时补建。

## 10. 自动完成任务

需要有一个后台任务负责自动关闭超时会话摘要。

方案建议：

1. 在后端启动一个定时任务，每小时扫描一次会话摘要。
2. 找出 `updated_at < now - 14 days` 且状态不是 `completed`/`abandoned` 的会话摘要。
3. 自动更新为 `completed`。
4. 对受影响事项重新计算状态。

## 11. 实施分期

### Phase 1：服务端底座

1. GitHub 登录
2. SQLite 数据库
3. 服务器 CRUD
4. GitHub 登录态与服务器配置接口

### Phase 2：事项模型与元数据

1. 事项 CRUD
2. 会话摘要表
3. 事项绑定/改绑
4. 状态流转

### Phase 3：前端三栏 UI

1. 左栏混排列表
2. 中栏事项详情 + 事项会话列表
3. 右栏会话详情接入
4. 两栏/三栏切换

### Phase 4：文档引用

1. `@` 文件搜索
2. 引用插入
3. 事项引用持久化

## 12. 风险与注意事项

1. 当前仓库现有会话流依赖 OpenCode 接口，新增业务后端时要避免把“会话真源”和“会话摘要”混淆。
2. 会话标题和状态的展示如果同时存在 OpenCode 原始值与摘要快照，需要明确以 OpenCode 原始值为主、摘要仅作缓存与绑定使用。
3. GitHub OAuth 在本地开发和生产部署时都需要单独配置回调地址。
4. SQLite 适合 V1，但如果未来多实例部署，需要考虑迁移到 PostgreSQL。

## 13. 本期建议实现顺序

1. 先补后端与数据库模型。
2. 再打通服务器、事项、会话摘要接口。
3. 然后改左栏数据源与布局模式。
4. 最后补中栏事项编辑与 `@` 文件引用。

## 14. 当前开发缺口与待完成项

以下内容是相对本设计方案仍未完全完成的部分，用于后续开发跟踪：

### 14.1 后端

1. GitHub OAuth 已有最小实现骨架，但仍需补全生产级配置、异常处理、回调验证与完整联调。
2. demo 登录兜底仍存在，正式多用户认证方案尚未彻底收口。
3. 会话摘要自动完成目前主要是请求期触发，后台定时任务机制未完整落地。

### 14.2 前端 - Servers

1. Settings > Servers 已改为薄后端真源，但仍需完整手工验证。
2. 多端同步场景尚未验收。
3. server 切换对事项与会话摘要刷新行为仍需继续验证。

### 14.3 前端 - 事项三栏主界面

1. 主界面已开始并入事项能力，但尚未达到完全可验收状态。
2. 左栏混排列表仍需继续校验：
   - 排序
   - 选中高亮
   - 状态展示
   - 空态/报错态
3. 中栏事项详情与事项会话列表虽已接入，但仍需继续打磨保存反馈、默认联动和异常处理。
4. 两栏/三栏切换逻辑需完成最终稳定性验证。

### 14.4 文档引用

1. 当前已改为调用 OpenCode 项目文件搜索，但 `item_document_refs` 持久化链路未完整收口。
2. 富文本引用展示与引用管理未实现。

### 14.5 联调与验收

1. 尚未完成“登录 -> server 配置 -> 项目 -> 事项 -> 会话”的一体化全链路验收。
2. 尚未完成正式预览验收前的最终功能回归。
