# OpenCodeUI 个人维护记录

这份文档记录我在本仓库（OpenCodeUI）上的本地维护/部署约定，避免每次重复踩坑。

## 环境约定

- Node 版本以 `.nvmrc` 为准（当前为 20.19.x）；构建/打包时请确保 `node -v` 满足项目要求（Vite 需要 20.19+ 或 22.12+）。
- 本地有 nginx 反代：直接通过根路径访问本服务。

## 静态资源路径约定

- 默认使用根路径（`/assets/...`）。
- 如需子路径部署，可按需设置 `VITE_BASE_PATH`。

## SRM 进程管理（启动/停止/日志）

目标：用 SRM 托管进程，统一 start/stop/restart/status/logs。

当前服务启动方式（由 SRM 托管）：
- 运行命令：`npm run preview -- --host 0.0.0.0 --port 4173`
- SRM 进程名：`ocui`
- 启动命令示例：
  - `srm start "npm run preview -- --host 0.0.0.0 --port 4173" --name ocui --restart`

常用管理命令：
srm start "npm --prefix /Users/chen/workspace/OpenCodeUI run preview -- --host 0.0.0.0 --port 4173" --name ocui --restart
srm stop ocui
srm restart ocui
srm logs ocui

## 本地一键脚本（更新/安装/构建/启动）

- `scripts/local.sh build --allow-dirty`：更新代码 + 安装依赖 + 构建（默认不注入 `VITE_BASE_PATH`）
- `scripts/local.sh preview`：更新代码 + 安装依赖 + 构建 + `npm run preview`

注意：
- `scripts/local.sh preview` 默认不带 `--host/--port` 参数；线上常驻运行请走 SRM（`--host 0.0.0.0 --port 4173`）。

