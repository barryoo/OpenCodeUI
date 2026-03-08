# OpenCodeUI

中文 | [English](./README_EN.md)

[![CI](https://github.com/barryoo/OpenCodeUI/actions/workflows/ci.yml/badge.svg)](https://github.com/barryoo/OpenCodeUI/actions/workflows/ci.yml)
[![Release](https://img.shields.io/github/v/release/barryoo/OpenCodeUI)](https://github.com/barryoo/OpenCodeUI/releases)
[![License](https://img.shields.io/github/license/barryoo/OpenCodeUI)](./LICENSE)

一个面向 [OpenCode](https://github.com/anomalyco/opencode) 的第三方 Web / Desktop UI，强调多项目会话管理、移动端体验、原生桌面能力和容器化部署。

> 本仓库基于 [lehhair/OpenCodeUI](https://github.com/lehhair/OpenCodeUI) 做二次开发。当前版本在保持原有 OpenCode 使用方式和原项目既有部署能力的基础上，结合现有提交历史，重点加强了桌面端体验、会话管理、消息呈现和移动端交互。

> 免责声明：本项目仅供学习交流使用，不对因使用本项目导致的任何问题承担责任。项目仍在持续迭代中，可能存在 bug 或行为调整。

## 项目亮点

- 多项目、多会话、多窗口协作，适合同时管理多个工作目录和上下文
- 支持浏览器端、Tauri 桌面端和 Docker 部署
- 保留 OpenCode 工具链特性，补强消息流、权限提示、Diff、附件和文件操作体验
- 对移动端、安全区域、通知、输入区交互做了大量细节优化

## 主要功能

| 模块 | 能力 |
|------|------|
| 对话体验 | 流式消息、Markdown 渲染、Shiki 代码高亮、推理/工具过程展示 |
| 工作区协作 | 文件浏览、文件预览、多文件 Diff、@ 提及、/ 斜杠命令 |
| 会话管理 | 多项目切换、最近会话、置顶、通知状态、快捷新建会话 |
| 终端与工具 | 内置 xterm.js 终端、工具调用可视化、上下文/附件细节查看 |
| 个性化 | 主题系统、自定义 CSS、快捷键、设置项细分 |
| 运行形态 | Web、PWA、Tauri 桌面应用、纯前端 Docker、完整 Docker 网关部署 |

## 基于原项目的优化

以下内容依据当前仓库的提交历史和现有实现整理，尽量把这次二次开发中可感知的体验优化逐项说明清楚。

### 通知与授权体验

| 优化点 | 说明 |
|--------|------|
| 前台应用内通知 | 当前应用内统一使用右上角 Toast 展示权限请求、提问、完成、异常等事件，减少切换会话前的信息遗漏 |
| 后台系统通知 | 浏览器 / Tauri 桌面端支持系统级通知，应用不在前台时也能提醒用户某个会话需要处理或已经完成 |
| 前台通知可直接授权 | 对于权限请求，Toast 内可直接执行 `Allow`、`Always allow`、`Later`，不必先切回会话再操作 |
| 会话未读提醒 | 会话列表左侧显示未读通知圆点，明确提示该会话有新的权限、提问、完成或异常消息 |
| 通知与会话联动 | 点击 Toast 或切入对应会话后会自动标记已读，提醒状态不会长期残留 |
| 活跃会话状态跟踪 | 会话状态会结合 SSE、权限请求、问题请求一起维护，避免只看列表却不知道会话是否仍在运行 |

### 项目与会话管理

| 优化点 | 说明 |
|--------|------|
| 多项目侧边栏模式 | 将项目和会话组织到同一侧边栏里，适合同时管理多个工作目录 |
| 会话列表运行状态 | 会话项直接显示运行中的动态状态点，帮助用户判断哪个会话还在执行 |
| 会话等待状态可见 | 当会话在等权限或问题回复时，列表可以显式体现“正在等待用户操作”而不是看起来像卡住 |
| 新建会话可指定项目 | 可以直接在某个项目下创建新会话，避免先切项目再开会话的额外步骤 |
| 最近会话与置顶会话 | 常用会话可置顶，最近活跃会话也会集中展示，减少反复翻找 |
| 项目排序支持拖拽 | 项目列表支持拖拽调整顺序，把常用项目放在更顺手的位置 |
| 支持拖拽外部文件夹建项目 | 在 Tauri 桌面端可直接把系统里的文件夹拖进应用，快速创建新项目 |
| 项目空白态提示更明确 | 新会话空白页会显式显示当前项目名，降低多项目场景下发错会话的概率 |

### 聊天消息与工具反馈

| 优化点 | 说明 |
|--------|------|
| 用户长消息可折叠 | 用户输入过长时支持展开 / 收起，避免大段提示词把聊天区完全撑满 |
| 系统上下文单独折叠 | 附加到用户消息里的系统上下文可独立展开，既保留信息又不干扰主消息阅读 |
| 连续工具调用自动分组 | 多个连续工具调用会按步骤聚合显示，减少消息流被碎片化工具输出打断 |
| 工具意图提前展示 | 工具还没执行完成时，也会先显示工具名称、目标路径、搜索词或操作意图，方便及时判断 |
| 待授权工具自动高亮 | 当前正在等待授权的工具调用会自动展开并高亮，便于先看清 diff / 参数再决定是否放行 |
| 单回合文件改动汇总 | 每轮回答结束后会在消息末尾汇总本轮改动的文件、增删行数，并支持继续展开看 diff |
| 路径与链接可直接打开 | 消息里的文件路径和链接交互做了优化，更符合“点击即打开 / 定位”的直觉 |
| 附件详情查看更完整 | 附件支持详情查看、复制、保存，桌面端还接入了更自然的原生保存对话框 |
| 错误直接显示在消息流 | 会话错误会直接渲染在聊天流中，不再默默失败或让用户自己猜测发生了什么 |
| 元信息展示更统一 | 消息底部统一整理时间、token、单条耗时、回合总耗时，减少重复和噪音 |

### 移动端与桌面端体验

| 优化点 | 说明 |
|--------|------|
| 移动端输入区持续优化 | 围绕输入框折叠、展开、回到底部、流式输出时滚动等场景做了多轮稳定性优化 |
| 安全区域与键盘处理 | 对手机安全区、虚拟键盘顶起、底部栏遮挡等问题做了专项处理 |
| 移动端选择器更易用 | 模型、Agent、@ 提及、/ 命令等菜单在手机上更贴近输入区，也更容易点中 |
| 侧边栏移动端交互优化 | 侧边栏支持移动端手势、长按、操作按钮显隐优化，更适合触摸操作 |
| Tauri 桌面体验增强 | 在原项目已支持 Tauri 的基础上，继续补强 macOS 自定义 Titlebar、窗口交互和文件夹拖放 |
| 桌面端快速打开项目 | 聊天头部支持一键用本地编辑器打开当前项目，方便在 AI 与 IDE 之间来回切换 |

## 界面预览

### 桌面端

![桌面端界面 1](./docs/images/opencodeui-desktop-1.png)
![桌面端界面 2](./docs/images/opencodeui-desktop-2.png)

### 移动端

![移动端界面 1](./docs/images/opencodeui-mobile-1.jpg)
![移动端界面 2](./docs/images/opencodeui-mobile-2.jpg)

## 快速开始

### 方式选择

| 场景 | 推荐方式 |
|------|----------|
| 想快速体验界面 | 本地启动前端并连接 `opencode serve` |
| 已经有 OpenCode 后端 | `docker-compose.standalone.yml` |
| 想一并部署前后端与预览网关 | `docker-compose.yml` |
| 想安装桌面端 | 下载 Releases 或本地构建 Tauri |

### 本地开发

```bash
git clone https://github.com/barryoo/OpenCodeUI.git
cd OpenCodeUI
npm ci

# 先启动 OpenCode 后端
opencode serve

# 再启动前端
npm run dev
```

默认开发地址为 `http://localhost:5173`。

> 当前仓库的开发代理配置位于 `vite.config.ts`，如果你的 OpenCode 后端地址不是默认环境，请按实际地址调整 `/api` 代理目标。

### 桌面应用

从 [Releases](https://github.com/barryoo/OpenCodeUI/releases) 下载构建产物，或本地执行：

```bash
npm ci
npm run build:macos
```

常见桌面产物位置：

- macOS `.app`：`src-tauri/target/release/bundle/macos/`
- 其他平台安装包：详见 GitHub Release 附件

## Docker 部署

### 纯前端模式

适用于你已经有一个可访问的 `opencode serve`，只需要前端 UI：

```bash
git clone https://github.com/barryoo/OpenCodeUI.git
cd OpenCodeUI
docker compose -f docker-compose.standalone.yml up -d
```

默认访问 `http://localhost:3000`。

连接远程后端时可这样启动：

```bash
BACKEND_URL=your-server.com:4096 PORT=8080 docker compose -f docker-compose.standalone.yml up -d
```

| 环境变量 | 默认值 | 说明 |
|---------|--------|------|
| `BACKEND_URL` | `host.docker.internal:4096` | OpenCode 后端地址（不带协议） |
| `PORT` | `3000` | 前端容器对外端口 |

### 完整部署模式

完整部署包含三个服务：

| 服务 | 端口 | 说明 |
|------|------|------|
| Gateway | `6658` | 应用统一入口，反代前端与 OpenCode API |
| Gateway | `6659` | 预览端口，供容器内开发服务映射使用 |
| Frontend | `3000` | 前端静态资源服务 |
| Backend | `4096` | OpenCode API |
| Router | `7070` | 动态路由扫描与预览管理 |

启动方式：

```bash
git clone https://github.com/barryoo/OpenCodeUI.git
cd OpenCodeUI
cp .env.example .env
docker compose up -d
```

默认访问 `http://localhost:6658`。

关键环境变量示例：

```env
ANTHROPIC_API_KEY=
OPENAI_API_KEY=
GATEWAY_PORT=6658
PREVIEW_PORT=6659
WORKSPACE=./workspace
OPENCODE_SERVER_USERNAME=opencode
OPENCODE_SERVER_PASSWORD=your-strong-password
ROUTER_SCAN_INTERVAL=5
ROUTER_PORT_RANGE=3000-9999
ROUTER_EXCLUDE_PORTS=4096
```

持久化要点：

- `opencode-home`：保留 OpenCode 配置、会话缓存、mise 运行时和用户态缓存
- `opencode-router-data`：保留 Gateway 路由状态
- 容器重建后，常见 Node / Python 运行时和缓存仍可复用

### 反向代理

公网部署时，建议在 `6658` / `6659` 前放置反向代理，并确保 SSE 不被缓冲。

Nginx 示例：

```nginx
server {
    listen 443 ssl;
    server_name opencode.example.com;

    ssl_certificate     /path/to/cert.pem;
    ssl_certificate_key /path/to/key.pem;

    location / {
        proxy_pass http://127.0.0.1:6658;
        proxy_http_version 1.1;
        proxy_set_header Connection '';
        proxy_buffering off;
        proxy_cache off;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 86400s;
    }
}
```

Caddy 示例：

```caddyfile
opencode.example.com {
    reverse_proxy 127.0.0.1:6658 {
        flush_interval -1
    }
}

preview.example.com {
    reverse_proxy 127.0.0.1:6659
}
```

## 自动化工作流

当前仓库包含以下 GitHub Actions：

| 工作流 | 触发条件 | 用途 |
|--------|----------|------|
| `CI` | `push` / `pull_request` 到 `master` | 执行 `npm ci`、`npm run lint`、`npm run build` |
| `Build & Push * Docker Image` | `master` 分支相关文件变更 | 将前端、网关、后端镜像发布到 GHCR |
| `Release` | 推送 `v*` Tag | 构建桌面端与 Android 安装包，并发布 Release |

这意味着你可以把仓库同时作为：

- Web 端源码仓库
- Docker 镜像来源仓库
- Tauri 多平台发布仓库

## 项目结构

```text
src/
├── api/                 # API 封装
├── components/          # 通用组件（Terminal、Diff、Dialog 等）
├── features/            # 业务模块（chat / sessions / settings / mention / slash-command）
├── hooks/               # 自定义 Hooks
├── store/               # 状态管理
├── themes/              # 主题与自定义样式
└── utils/               # 工具函数

src-tauri/               # Tauri 桌面端工程
docker/                  # Docker / Gateway / Router 配置
.github/workflows/       # CI、Docker、Release 自动化
```

## 上游与致谢

- 原始 UI 项目：[`lehhair/OpenCodeUI`](https://github.com/lehhair/OpenCodeUI)
- 后端项目：[`anomalyco/opencode`](https://github.com/anomalyco/opencode)
- 本项目延续了原项目的整体方向，并在当前仓库中继续围绕桌面端、移动端、会话组织和部署体验做增强

## 许可证

[GPL-3.0](./LICENSE)

## Star History

<a href="https://www.star-history.com/#barryoo/OpenCodeUI&Date">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="https://api.star-history.com/svg?repos=barryoo/OpenCodeUI&type=Date&theme=dark" />
    <source media="(prefers-color-scheme: light)" srcset="https://api.star-history.com/svg?repos=barryoo/OpenCodeUI&type=Date" />
    <img alt="Star History Chart" src="https://api.star-history.com/svg?repos=barryoo/OpenCodeUI&type=Date" />
  </picture>
</a>

---

欢迎继续补充截图、功能对比表、部署 FAQ，或通过 Issue / PR 分享你的使用场景。
