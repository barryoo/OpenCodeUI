# OpenCodeUI Thin Server

这是给 OpenCodeUI 增加的轻量服务端骨架。

当前已经包含：

1. Bun 启动入口
2. SQLite 连接
3. 健康检查接口
4. GitHub OAuth 登录
5. 持久化 session / OAuth state
6. server profiles / items / session summaries 接口

## GitHub OAuth 本地配置

至少配置以下环境变量：

```env
OPENCODEUI_SERVER_PUBLIC_URL=http://127.0.0.1:4097
OPENCODEUI_FRONTEND_URL=http://127.0.0.1:5173
GITHUB_CLIENT_ID=your-client-id
GITHUB_CLIENT_SECRET=your-client-secret
```

GitHub OAuth App 的 callback URL 应设置为：

```text
http://127.0.0.1:4097/api/auth/github/callback
```

如果生产环境使用 HTTPS，请同时：

1. 将 `OPENCODEUI_SERVER_PUBLIC_URL` 改为线上薄后端地址
2. 将 `OPENCODEUI_FRONTEND_URL` 改为线上前端地址
3. 设置 `OPENCODEUI_SECURE_COOKIES=true`
4. 在 GitHub OAuth App 中增加对应生产 callback URL
