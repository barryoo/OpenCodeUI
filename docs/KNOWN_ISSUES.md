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

---

## 聊天区滚动记忆导致的上滑抖动（已中止）

**需求背景：**
- 用户反馈：AI 响应后聊天区会突然上跳到上一条回答附近。
- 怀疑来源：此前引入“滚动位置记忆”后出现。

**复现与影响：**
- 初始现象：回答结束后偶发上跳。
- 调整过程中出现更严重问题：同一会话中向上滚动加载历史时，页面持续上下乱滚。
- 影响范围：聊天消息虚拟列表（`ChatArea`）滚动体验显著异常。

**本次尝试过的方向：**
1. 基于 `scrollTop` 的会话滚动记忆修补。
2. 改为锚点消息（`anchorMessageId`）记忆与恢复。
3. 调整会话切换恢复时机、程序滚动标记、底部状态写回门控。
4. 修复了一个并发暴露的问题：`ReasoningPartView` 的嵌套 `<button>` 导致 hydration warning。

**最终结论（本轮）：**
- 该问题链路复杂，包含：
  - 历史 prepend 与虚拟列表索引重算耦合；
  - 自动加载链路与滚动记忆写回时机冲突；
  - 多处自动滚动触发之间的竞态。
- 多轮修复后仍未达到可用状态，用户要求本次改动全部撤回并暂停该需求。

**当前状态：**
- 代码已撤回到本次需求开始前状态（工作分支未保留该需求代码变更）。
- 需求暂不继续开发。

**后续建议（下次重启此需求时）：**
1. 先做最小止血：关闭顶部 auto-chain，统一 `firstItemIndex` 数据源，冻结 prepend 期间记忆写回。
2. 通过可视化调试日志（会话 key、range、anchor、prepend 阶段）确认无抖动后，再恢复增强能力。

**日期：** 2026-04-11
