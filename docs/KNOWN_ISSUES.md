# Known Issues

## macOS 通知图标和点击处理

**问题描述：**
- macOS 原生通知显示的图标不正确（显示默认图标而非应用图标）
- 点击通知无法打开或恢复应用窗口

**尝试过的解决方案：**

1. **官方 Tauri 通知插件** (`@tauri-apps/plugin-notification`)
   - 结果：图标不正确，点击不工作
   - 原因：插件功能有限，不支持自定义图标和点击处理

2. **第三方原生通知插件** (`tauri-plugin-notifications` by Choochmeque)
   - 使用原生 macOS API (Swift/UNUserNotificationCenter)
   - 结果：问题依然存在
   - 说明：不是插件实现的问题

3. **各种代码调整**
   - 添加 `onAction` 监听器
   - 添加 `RunEvent::Reopen` 处理
   - 修改 bundle identifier
   - 结果：均无效

**根本原因：**
macOS 通知系统对未签名应用的限制。通知图标和点击处理可能需要：
- 正式的 Apple Developer 代码签名
- 特定的 entitlements 配置
- 应用需要正确的 bundle 配置

**当前状态：**
- 通知功能正常工作（能显示通知）
- 图标显示不正确（已知限制）
- 点击通知不能打开应用（已知限制）

**可能的解决方案：**
1. 获取 Apple Developer 账号并对应用进行代码签名
2. 接受当前限制，通知仍然可用但功能受限

**相关资源：**
- Tauri 通知插件 issue: https://github.com/tauri-apps/plugins-workspace/issues/2150
- 第三方插件: https://github.com/Choochmeque/tauri-plugin-notifications

**日期：** 2026-03-09
