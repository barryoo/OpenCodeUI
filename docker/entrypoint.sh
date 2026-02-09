#!/bin/bash
set -e

WORKSPACE="${WORKSPACE:-/workspace}"
mkdir -p "$WORKSPACE"
cd "$WORKSPACE"

echo "[opencode-webui] starting..."
echo "[opencode-webui] opencode $(opencode --version 2>/dev/null || echo 'unknown')"

# ---- 启动 opencode 后端 ----
opencode serve \
    --port 4096 \
    --hostname 0.0.0.0 \
    &
OC_PID=$!

# 等后端就绪
for i in $(seq 1 30); do
    if curl -sf http://127.0.0.1:4096/global/health >/dev/null 2>&1; then
        echo "[opencode-webui] backend ready"
        break
    fi
    sleep 1
done

# ---- 启动 caddy（serve 前端） ----
echo "[opencode-webui] starting caddy..."
caddy run --config /etc/caddy/Caddyfile &
CADDY_PID=$!

# 验证 caddy 启动
sleep 2
if ! kill -0 $CADDY_PID 2>/dev/null; then
    echo "[opencode-webui] ERROR: caddy failed to start"
    # 尝试手动运行看错误
    caddy run --config /etc/caddy/Caddyfile 2>&1 || true
    exit 1
fi

echo "[opencode-webui] running  ui=:3000  api=:4096"

# ---- 优雅退出 ----
cleanup() {
    echo "[opencode-webui] shutting down..."
    kill $CADDY_PID $OC_PID 2>/dev/null || true
    wait
    exit 0
}
trap cleanup TERM INT QUIT

# 保持前台运行，任一进程退出则容器退出
while true; do
    if ! kill -0 $OC_PID 2>/dev/null; then
        echo "[opencode-webui] opencode exited"
        cleanup
    fi
    if ! kill -0 $CADDY_PID 2>/dev/null; then
        echo "[opencode-webui] caddy exited"
        cleanup
    fi
    sleep 5
done
