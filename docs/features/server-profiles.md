# Server Profiles 能力说明

## 1. 这是什么

Server Profile 表示一个可连接的 OpenCode 服务配置。

它大致描述：

1. 连接哪个 OpenCode 服务
2. 用什么地址连接
3. 哪个 profile 是默认的
4. 当前 active server 是哪个

## 2. 它解决什么问题

在本次需求之前，这些配置主要依赖前端本地存储。

现在切到薄后端后，可以解决：

1. 多端同步
2. 用户隔离
3. 当前 active server 的统一管理

## 3. 当前支持的能力

1. 列出 profiles
2. 新增
3. 编辑
4. 删除
5. 设置默认
6. 切换 active server
7. 健康检查

## 4. active server 的作用

active server 会影响：

1. 当前项目请求打到哪个 OpenCode 服务
2. 当前会话请求打到哪个 OpenCode 服务
3. Thin Server 默认关联哪个 OpenCode 基础地址

## 5. 为什么启动流程很重要

当前前端启动时，必须先确认：

1. 当前登录态
2. 当前 active server

再去拉 OpenCode 项目和会话数据。

否则就会误打到默认 fallback 地址。
