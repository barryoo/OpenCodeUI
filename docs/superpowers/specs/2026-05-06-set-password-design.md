# 设置/修改密码功能设计

## 背景

GitHub SSO 登录用户没有 `passwordHash`，无法用邮箱密码登录。需要支持：
1. **设置密码**：无密码用户首次设密码
2. **修改密码**：有密码用户换新密码

## 需求

| 场景 | 条件 | 输入 | 验证 |
|------|------|------|------|
| 设置密码 | 已登录 + `passwordHash === null` | 新密码 + 确认密码 | 新密码规则校验 |
| 修改密码 | 已登录 + `passwordHash !== null` | 当前密码 + 新密码 + 确认密码 | 验证当前密码 + 新密码规则校验 |

## 服务端

### 新增 `updateUserPassword`

`server/repositories.ts`：
```ts
updateUserPassword(userId: string, newPasswordHash: string): UserRecord | null
```
- UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?

### 新增路由 `POST /auth/set-password`

`server/app.ts`：

- 必须已登录（校验 session）
- Body: `{ password?: string, newPassword: string }`
- 无密码用户：`password` 字段忽略，直接设新密码
- 有密码用户：先 `verifyPassword(password, user.passwordHash)` 验证旧密码，不通过返回 401
- 密码规则复用 `validatePassword(newPassword)`
- 更新 `updated_at`，成功返回 200 + `{ user: PublicUser, auth: AuthDescriptor }`

### 错误码

| 场景 | Status | Body |
|------|--------|------|
| 未登录 | 401 | `{ error: 'Not authenticated' }` |
| 有密码但未提供当前密码 | 400 | `{ error: 'Current password required' }` |
| 当前密码错误 | 401 | `{ error: 'Current password incorrect' }` |
| 新密码规则不满足 | 400 | `{ error: '<validatePassword message>' }` |

## 前端

### API

`src/api/auth.ts`：
```ts
setPassword(params: { password?: string; newPassword: string }): Promise<ThinAuthResponse>
```

### Store

`src/store/authStore.ts`：
```ts
setPassword(password: string | undefined, newPassword: string): Promise<void>
```
- 成功后 refresh user 信息
- 失败时设置 error，不降级匿名

### UI：新增 `SetPasswordDialog`

`src/features/auth/SetPasswordDialog.tsx`：

Props: `{ isOpen, hasPassword, onClose }`

两种模式由 `hasPassword` 区分：
- `hasPassword=false`：标题"设置密码"，只有新密码 + 确认密码字段
- `hasPassword=true`：标题"修改密码"，有当前密码 + 新密码 + 确认密码字段

确认密码仅前端校验，不传服务端。

### SettingsDialog 改动

账号区域新增按钮：
- `hasPassword=false` → "设置密码"按钮
- `hasPassword=true` → "修改密码"按钮
- 点击打开 `SetPasswordDialog`

### 数据流

```
用户点击"设置密码/修改密码" → SetPasswordDialog 弹出
→ 填写表单 → authStore.setPassword()
→ POST /auth/set-password
→ 成功：关闭对话框，refresh user（auth descriptor 会变）
→ 失败：显示错误（当前密码错误 / 密码规则不满足 / 两次密码不一致）
```

## 不做的事

- 忘记密码/重置密码（需邮箱验证码）
- 确认密码字段不传服务端
- 不改 LoginPromptDialog
