# Thin Server 能力说明

## 1. 定位

Thin Server 是加在 OpenCode 之上的一层轻业务后端。

它的目标不是替代 OpenCode，而是补足 OpenCodeUI 需要长期持久化的那部分数据。

## 2. 当前承载的数据

当前薄后端存储：

1. users
2. auth_sessions
3. oauth_states
4. server_profiles
5. items
6. session_summaries
7. item_document_refs

## 3. 当前不存的数据

薄后端不存：

1. 会话正文
2. 消息内容
3. 项目完整结构
4. OpenCode 工具调用详情

这些依然来自 OpenCode。

## 4. 当前 API 大类

### 4.1 认证

1. `/api/auth/me`
2. `/api/auth/github/login`
3. `/api/auth/github/callback`
4. `/api/auth/logout`

### 4.2 Server Profiles

1. `/api/server-profiles`
2. 默认 server 设置

### 4.3 Items

1. 项目下事项列表
2. 创建事项
3. 更新事项
4. 删除事项

### 4.4 Session Summaries

1. 项目下摘要列表
2. upsert 摘要
3. 绑定事项
4. 解绑事项

## 5. 当前角色

Thin Server 在前端里承担两个关键职责：

1. 作为用户态业务数据真源
2. 作为 OpenCode 原始数据和事项系统之间的桥梁

## 6. 为什么需要 Session Summary

因为事项系统不能直接以 OpenCode 会话正文为管理对象。

所以会抽出一层摘要，用来表示：

1. 这个会话属于哪个项目
2. 最近活动如何
3. 当前有没有绑定事项
4. 当前标题/状态快照是什么

## 7. 当前实现特征

### 7.1 轻量

这层后端不追求大而全，而是只补业务管理能力。

### 7.2 可持久化

用户登录态和业务数据都持久化在 SQLite 中，服务重启后可恢复。

### 7.3 依赖 OpenCode 原始服务

Thin Server 自己不生产项目和会话内容，它依赖前端把 OpenCode 侧的项目/会话上下文接进来。
