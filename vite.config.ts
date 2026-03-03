import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// https://vite.dev/config/
export default defineConfig(() => {
  const rawBase = process.env.VITE_BASE_PATH || "/";
  const base =
    rawBase === "/" ? "/" : rawBase.endsWith("/") ? rawBase : `${rawBase}/`;

  return {
    base,
    plugins: [react(), tailwindcss()],

    // Tauri CLI 兼容：不清屏，让 Tauri 的日志能保留在终端
    clearScreen: false,

    server: {
      // 监听所有网络接口，允许局域网访问
      host: "0.0.0.0",
      // 允许的 host
      // 注意：Vite 的 server.allowedHosts 不能同时既是数组又是 true
      allowedHosts: ["ocui.barry1.top", "mac.tail4e16fd.ts.net"],
      // 避免端口冲突
      strictPort: true,

      proxy: {
        // 开发环境代理 - 将 /api 前缀的请求转发到 OpenCode 后端
        // 注意：Tauri 模式下前端直接请求后端（通过 plugin-http），不走此代理
        "/api": {
          target: "http://100.66.48.126:4097", // OpenCode 后端（Tailscale IP）
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/api/, ""),
        },
      },
    },
  };
});
