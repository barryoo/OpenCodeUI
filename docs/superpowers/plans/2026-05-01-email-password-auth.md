# Email Password Auth Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在保留 GitHub OAuth 的前提下，为 OpenCodeUI 增加邮箱注册与邮箱密码登录，并支持 GitHub 邮箱自动合并到同一账号。

**Architecture:** 继续复用现有 thin server 的 cookie session 体系，在 `users` 表增加 `email` 和 `password_hash` 字段，并在服务端新增注册/登录路由。前端保持现有 `authStore` 驱动方式，只扩展认证 API 与登录弹窗，让 GitHub 与邮箱密码双入口并存。

**Tech Stack:** Bun runtime、bun:sqlite、React 19、TypeScript、现有 thin server、`bun test`、`Bun.password`

---

## File Structure

### Modify
- `.gitignore` — 忽略 `.worktrees/`
- `server/domain.ts` — 扩展 `UserRecord` 与新增邮箱认证相关输入类型
- `server/repositories.ts` — users 表迁移、邮箱查找/创建、GitHub 合并、密码字段读写
- `server/auth.ts` — 增加密码哈希与比对、邮箱规范化、GitHub 资料到本地用户的统一落库
- `server/app.ts` — 新增 `/auth/register`、`/auth/login` 路由并返回统一错误语义
- `src/api/auth.ts` — 新增邮箱注册/登录 API 与更完整的用户类型
- `src/store/authStore.ts` — 增加邮箱注册/登录动作，保留 GitHub 登录动作
- `src/features/auth/LoginPromptDialog.tsx` — 从单按钮升级为登录/注册双态表单 + GitHub 按钮
- `src/App.tsx` — 适配新弹窗回调参数
- `src/features/settings/SettingsDialog.tsx` — 账号区保留 GitHub 登录按钮文案并兼容新用户字段
- `docs/features/auth-and-login.md` — 更新功能说明，反映双登录体系

### Create
- `server/auth.test.ts` — 认证辅助逻辑单测
- `server/repositories.auth.test.ts` — repository 邮箱用户与 GitHub 合并单测
- `server/app.auth.test.ts` — auth 路由单测
- `src/api/auth.test.ts` — 前端 auth API 单测
- `src/store/authStore.test.ts` — auth store 单测

## Task 1: Extend user model and repository migration

**Files:**
- Modify: `server/domain.ts`
- Modify: `server/repositories.ts`
- Test: `server/repositories.auth.test.ts`

- [ ] **Step 1: Write the failing repository tests**

```ts
import { beforeEach, describe, expect, test } from 'bun:test'
import { Database } from 'bun:sqlite'
import { createDatabaseContext } from './db'
import { ThinServerRepository } from './repositories'

describe('ThinServerRepository auth users', () => {
  let repository: ThinServerRepository

  beforeEach(() => {
    const database = createDatabaseContext(new Database(':memory:'))
    repository = new ThinServerRepository(database)
    repository.migrate()
  })

  test('creates email user with normalized email', () => {
    const user = repository.createEmailUser({
      email: '  USER@Example.com ',
      passwordHash: 'hash',
    })

    expect(user.email).toBe('user@example.com')
    expect(user.passwordHash).toBe('hash')
  })

  test('finds user by normalized email', () => {
    repository.createEmailUser({ email: 'user@example.com', passwordHash: 'hash' })
    const user = repository.findUserByEmail('USER@example.com')
    expect(user?.email).toBe('user@example.com')
  })

  test('merges github profile into existing email user', () => {
    const existing = repository.createEmailUser({ email: 'user@example.com', passwordHash: 'hash' })
    const merged = repository.upsertUserByGithubProfile({
      id: 1,
      login: 'octocat',
      name: 'Octo Cat',
      avatarUrl: 'https://example.com/avatar.png',
      email: 'user@example.com',
    })

    expect(merged.id).toBe(existing.id)
    expect(merged.githubId).toBe('1')
    expect(merged.email).toBe('user@example.com')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test server/repositories.auth.test.ts`
Expected: FAIL with missing `createEmailUser` / `findUserByEmail` / `email` fields.

- [ ] **Step 3: Extend domain and repository implementation minimally**

```ts
// server/domain.ts
export interface UserRecord {
  id: string
  githubId: string | null
  login: string
  email: string | null
  passwordHash: string | null
  name: string | null
  avatarUrl: string | null
  createdAt: string
  updatedAt: string
}

export interface CreateEmailUserInput {
  email: string
  passwordHash: string
}
```

```ts
// server/repositories.ts
interface UserRow {
  id: string
  github_id: string | null
  login: string
  email: string | null
  password_hash: string | null
  name: string | null
  avatar_url: string | null
  created_at: string
  updated_at: string
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase()
}

mapUser(row: UserRow): UserRecord {
  return {
    id: row.id,
    githubId: row.github_id,
    login: row.login,
    email: row.email,
    passwordHash: row.password_hash,
    name: row.name,
    avatarUrl: row.avatar_url,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}
```

```sql
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  github_id TEXT UNIQUE,
  login TEXT NOT NULL,
  email TEXT UNIQUE,
  password_hash TEXT,
  name TEXT,
  avatar_url TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
```

```ts
// migration compatibility for old dbs
this.ensureUserColumn('email', 'TEXT')
this.ensureUserColumn('password_hash', 'TEXT')
this.database.db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email ON users(email) WHERE email IS NOT NULL')
```

```ts
createEmailUser(input: CreateEmailUserInput): UserRecord {
  const email = normalizeEmail(input.email)
  const now = nowIsoString()
  const id = createId('user')
  runStatement(this.database.db.query(`
    INSERT INTO users (id, github_id, login, email, password_hash, name, avatar_url, created_at, updated_at)
    VALUES (?, NULL, ?, ?, ?, NULL, NULL, ?, ?)
  `), [id, email, email, input.passwordHash, now, now])
  return this.findUserById(id)!
}

findUserByEmail(email: string): UserRecord | null {
  const row = this.database.db.query('SELECT * FROM users WHERE email = ?').get(normalizeEmail(email)) as UserRow | null
  return row ? mapUser(row) : null
}
```

- [ ] **Step 4: Update GitHub upsert logic to support email merge**

```ts
upsertUserByGithubProfile(profile: GithubUserProfile): UserRecord {
  const githubId = String(profile.id)
  const normalizedEmail = profile.email ? normalizeEmail(profile.email) : null
  const existingByGithub = this.findUserByGithubId(githubId)
  if (existingByGithub) {
    return this.updateGithubLinkedUser(existingByGithub.id, profile, normalizedEmail)
  }

  const existingByEmail = normalizedEmail ? this.findUserByEmail(normalizedEmail) : null
  if (existingByEmail) {
    return this.attachGithubToExistingUser(existingByEmail.id, profile, normalizedEmail)
  }

  return this.createGithubUser(profile, normalizedEmail)
}
```

- [ ] **Step 5: Run repository tests to verify they pass**

Run: `bun test server/repositories.auth.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add server/domain.ts server/repositories.ts server/repositories.auth.test.ts
git commit -m "feat: extend auth user repository"
```

## Task 2: Add auth helpers for email normalization and password verification

**Files:**
- Modify: `server/auth.ts`
- Test: `server/auth.test.ts`

- [ ] **Step 1: Write the failing auth helper tests**

```ts
import { describe, expect, test } from 'bun:test'
import { hashPassword, normalizeEmail, validatePassword, verifyPassword } from './auth'

describe('auth helpers', () => {
  test('normalizes email', () => {
    expect(normalizeEmail('  USER@Example.com ')).toBe('user@example.com')
  })

  test('validates password policy', () => {
    expect(validatePassword('abc12345')).toEqual({ ok: true })
    expect(validatePassword('abcdefg')).toEqual({ ok: false, message: '密码至少 8 位且包含字母和数字' })
  })

  test('hashes and verifies password', async () => {
    const hash = await hashPassword('abc12345')
    expect(await verifyPassword('abc12345', hash)).toBe(true)
    expect(await verifyPassword('wrongpass1', hash)).toBe(false)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test server/auth.test.ts`
Expected: FAIL with missing exports.

- [ ] **Step 3: Implement auth helpers with Bun.password**

```ts
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase()
}

export function validatePassword(password: string): { ok: true } | { ok: false; message: string } {
  const hasLetter = /[A-Za-z]/.test(password)
  const hasNumber = /\d/.test(password)
  if (password.length < 8 || !hasLetter || !hasNumber) {
    return { ok: false, message: '密码至少 8 位且包含字母和数字' }
  }
  return { ok: true }
}

export async function hashPassword(password: string): Promise<string> {
  return Bun.password.hash(password)
}

export async function verifyPassword(password: string, passwordHash: string): Promise<boolean> {
  return Bun.password.verify(password, passwordHash)
}
```

- [ ] **Step 4: Run auth helper tests to verify they pass**

Run: `bun test server/auth.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add server/auth.ts server/auth.test.ts
git commit -m "feat: add email auth helpers"
```

## Task 3: Add register/login routes on thin server

**Files:**
- Modify: `server/app.ts`
- Modify: `server/auth.ts`
- Modify: `server/repositories.ts`
- Test: `server/app.auth.test.ts`

- [ ] **Step 1: Write the failing auth route tests**

```ts
import { beforeEach, describe, expect, test } from 'bun:test'
import { Database } from 'bun:sqlite'
import { createDatabaseContext } from './db'
import { ThinServerRepository } from './repositories'
import { handleRequest } from './app'
import { loadServerConfig } from './config'

describe('auth routes', () => {
  let repository: ThinServerRepository

  beforeEach(() => {
    const database = createDatabaseContext(new Database(':memory:'))
    repository = new ThinServerRepository(database)
    repository.migrate()
  })

  test('registers and creates session', async () => {
    const response = await handleRequest(new Request('http://localhost/admin/auth/register', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'user@example.com', password: 'abc12345' }),
    }), { database: repository['database'], repository, config: loadServerConfig() })

    expect(response.status).toBe(201)
    expect(response.headers.get('set-cookie')).toContain('opencodeui_session=')
  })

  test('rejects duplicate email registration', async () => {
    repository.createEmailUser({ email: 'user@example.com', passwordHash: await Bun.password.hash('abc12345') })
    const response = await handleRequest(new Request('http://localhost/admin/auth/register', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'user@example.com', password: 'abc12345' }),
    }), { database: repository['database'], repository, config: loadServerConfig() })

    expect(response.status).toBe(409)
  })

  test('logs in email user', async () => {
    repository.createEmailUser({ email: 'user@example.com', passwordHash: await Bun.password.hash('abc12345') })
    const response = await handleRequest(new Request('http://localhost/admin/auth/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'user@example.com', password: 'abc12345' }),
    }), { database: repository['database'], repository, config: loadServerConfig() })

    expect(response.status).toBe(200)
    expect(response.headers.get('set-cookie')).toContain('opencodeui_session=')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test server/app.auth.test.ts`
Expected: FAIL because `/auth/register` and `/auth/login` do not exist.

- [ ] **Step 3: Implement register/login route handlers**

```ts
if (thinPathname === '/auth/register' && method === 'POST') {
  const body = await parseJsonBody<Record<string, unknown>>(request)
  const email = asString(body?.email)
  const password = asString(body?.password)
  if (!email || !password) return withCors(errorResponse(400, 'VALIDATION_ERROR', 'email and password are required'), request)

  const normalizedEmail = normalizeEmail(email)
  if (!isValidEmail(normalizedEmail)) return withCors(errorResponse(400, 'INVALID_EMAIL', '邮箱格式不正确'), request)
  const passwordCheck = validatePassword(password)
  if (!passwordCheck.ok) return withCors(errorResponse(400, 'INVALID_PASSWORD', passwordCheck.message), request)
  if (context.repository.findUserByEmail(normalizedEmail)) {
    return withCors(errorResponse(409, 'EMAIL_EXISTS', '邮箱已注册'), request)
  }

  const passwordHash = await hashPassword(password)
  const user = context.repository.createEmailUser({ email: normalizedEmail, passwordHash })
  const headers = new Headers()
  createAuthSessionForUser(headers, context.repository, context.config, user)
  return withCors(json({ user, auth: { provider: 'password', mode: 'password' } }, { status: 201, headers }), request)
}
```

```ts
if (thinPathname === '/auth/login' && method === 'POST') {
  const body = await parseJsonBody<Record<string, unknown>>(request)
  const email = asString(body?.email)
  const password = asString(body?.password)
  if (!email || !password) return withCors(errorResponse(400, 'VALIDATION_ERROR', 'email and password are required'), request)

  const user = context.repository.findUserByEmail(email)
  const ok = user?.passwordHash ? await verifyPassword(password, user.passwordHash) : false
  if (!user || !ok) {
    return withCors(errorResponse(401, 'INVALID_CREDENTIALS', '邮箱或密码错误'), request)
  }

  const headers = new Headers()
  createAuthSessionForUser(headers, context.repository, context.config, user)
  return withCors(json({ user, auth: { provider: user.githubId ? 'github+password' : 'password', mode: 'password' } }, { headers }), request)
}
```

- [ ] **Step 4: Update `/auth/me` auth payload to reflect password users**

```ts
if (thinPathname === '/auth/me' && method === 'GET') {
  const user = getEffectiveUser(request, context)
  if (!user) return withCors(json({ user: null, auth: null }), request)

  return withCors(json({
    user,
    auth: {
      provider: user.githubId && user.passwordHash ? 'github+password' : user.githubId ? 'github' : 'password',
      mode: user.passwordHash ? 'password' : 'oauth',
    },
  }), request)
}
```

- [ ] **Step 5: Run route tests to verify they pass**

Run: `bun test server/app.auth.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add server/app.ts server/auth.ts server/repositories.ts server/app.auth.test.ts
git commit -m "feat: add email auth routes"
```

## Task 4: Extend frontend auth API and store

**Files:**
- Modify: `src/api/auth.ts`
- Modify: `src/store/authStore.ts`
- Test: `src/api/auth.test.ts`
- Test: `src/store/authStore.test.ts`

- [ ] **Step 1: Write the failing frontend auth API tests**

```ts
import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test'
import { loginWithEmail, registerWithEmail } from './auth'

describe('auth api', () => {
  const originalFetch = globalThis.fetch

  beforeEach(() => {
    globalThis.fetch = mock(() => Promise.resolve(new Response(JSON.stringify({ user: null, auth: null }), { status: 200 }))) as typeof fetch
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
  })

  test('posts register payload', async () => {
    await registerWithEmail({ email: 'user@example.com', password: 'abc12345' })
    expect(globalThis.fetch).toHaveBeenCalledWith('/admin/auth/register', expect.objectContaining({ method: 'POST' }))
  })

  test('posts login payload', async () => {
    await loginWithEmail({ email: 'user@example.com', password: 'abc12345' })
    expect(globalThis.fetch).toHaveBeenCalledWith('/admin/auth/login', expect.objectContaining({ method: 'POST' }))
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test src/api/auth.test.ts`
Expected: FAIL with missing exports.

- [ ] **Step 3: Add API functions and store actions**

```ts
export interface EmailAuthInput {
  email: string
  password: string
}

async function postAuth(path: string, input: EmailAuthInput): Promise<ThinAuthResponse> {
  const response = await fetch(`${THIN_SERVER_BASE_URL}${path}`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input),
  })
  if (!response.ok) throw await parseError(response, `Auth request failed: ${response.status}`)
  return response.json() as Promise<ThinAuthResponse>
}

export function registerWithEmail(input: EmailAuthInput) {
  return postAuth('/auth/register', input)
}

export function loginWithEmail(input: EmailAuthInput) {
  return postAuth('/auth/login', input)
}
```

```ts
async loginWithEmail(email: string, password: string): Promise<void> {
  this.setState({ status: 'checking', error: null })
  try {
    const result = await loginWithEmail({ email, password })
    this.setState({ status: 'authenticated', user: result.user, mode: result.auth?.mode ?? 'password', error: null })
  } catch (error) {
    this.setState({ status: 'anonymous', user: null, mode: null, error: error instanceof Error ? error.message : '邮箱登录失败' })
    throw error
  }
}

async registerWithEmail(email: string, password: string): Promise<void> {
  this.setState({ status: 'checking', error: null })
  try {
    const result = await registerWithEmail({ email, password })
    this.setState({ status: 'authenticated', user: result.user, mode: result.auth?.mode ?? 'password', error: null })
  } catch (error) {
    this.setState({ status: 'anonymous', user: null, mode: null, error: error instanceof Error ? error.message : '邮箱注册失败' })
    throw error
  }
}
```

- [ ] **Step 4: Add failing auth store tests and make them pass**

```ts
test('loginWithEmail sets authenticated state', async () => {
  mock.module('../api/auth', () => ({
    getThinAuthMe: mock(() => Promise.resolve({ user: null, auth: null })),
    logoutThinAuth: mock(() => Promise.resolve()),
    loginWithGithub: mock(() => Promise.resolve()),
    loginWithEmail: mock(() => Promise.resolve({ user: { id: 'u1', githubId: null, login: 'user@example.com', email: 'user@example.com', name: null, avatarUrl: null }, auth: { provider: 'password', mode: 'password' } })),
    registerWithEmail: mock(() => Promise.resolve({ user: { id: 'u1', githubId: null, login: 'user@example.com', email: 'user@example.com', name: null, avatarUrl: null }, auth: { provider: 'password', mode: 'password' } })),
  }))
})
```

Run: `bun test src/api/auth.test.ts src/store/authStore.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/api/auth.ts src/api/auth.test.ts src/store/authStore.ts src/store/authStore.test.ts
git commit -m "feat: add email auth client flows"
```

## Task 5: Build login/register dialog UI

**Files:**
- Modify: `src/features/auth/LoginPromptDialog.tsx`
- Modify: `src/App.tsx`
- Modify: `src/features/settings/SettingsDialog.tsx`

- [ ] **Step 1: Implement dialog props and local form state**

```tsx
interface LoginPromptDialogProps {
  isOpen: boolean
  isLoading?: boolean
  error?: string | null
  onGithubLogin: () => void
  onEmailLogin: (email: string, password: string) => void
  onEmailRegister: (email: string, password: string) => void
  onContinueWithoutLogin: () => void
}

const [mode, setMode] = useState<'login' | 'register'>('login')
const [email, setEmail] = useState('')
const [password, setPassword] = useState('')
```

- [ ] **Step 2: Replace single-button content with login/register form**

```tsx
<form
  className="space-y-3"
  onSubmit={(event) => {
    event.preventDefault()
    if (mode === 'login') onEmailLogin(email, password)
    else onEmailRegister(email, password)
  }}
>
  <input value={email} onChange={(event) => setEmail(event.target.value)} placeholder="邮箱" />
  <input value={password} onChange={(event) => setPassword(event.target.value)} type="password" placeholder="密码" />
  {error ? <p className="text-sm text-red-400">{error}</p> : null}
  <Button type="submit" isLoading={isLoading}>{mode === 'login' ? '邮箱登录' : '注册并登录'}</Button>
</form>
<Button variant="secondary" onClick={onGithubLogin} isLoading={isLoading}>使用 GitHub 登录</Button>
<button type="button" onClick={() => setMode(mode === 'login' ? 'register' : 'login')}>
  {mode === 'login' ? '没有账号？去注册' : '已有账号？去登录'}
</button>
```

- [ ] **Step 3: Wire App and Settings to new store actions**

```tsx
<LoginPromptDialog
  isOpen={loginPromptOpen}
  isLoading={authState.status === 'checking' || authState.status === 'redirecting'}
  error={authState.error}
  onGithubLogin={() => authStore.beginLogin()}
  onEmailLogin={(email, password) => authStore.loginWithEmail(email, password)}
  onEmailRegister={(email, password) => authStore.registerWithEmail(email, password)}
  onContinueWithoutLogin={() => setLoginPromptOpen(false)}
/>
```

- [ ] **Step 4: Run targeted UI smoke checks**

Run: `bun test src/store/authStore.test.ts src/api/auth.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/features/auth/LoginPromptDialog.tsx src/App.tsx src/features/settings/SettingsDialog.tsx
git commit -m "feat: add email auth dialog"
```

## Task 6: Update docs and run full verification

**Files:**
- Modify: `docs/features/auth-and-login.md`

- [ ] **Step 1: Update auth feature doc**

```md
## 1. 当前登录方式

当前支持：

1. GitHub OAuth 登录
2. 邮箱注册
3. 邮箱密码登录

## 2. 账号合并规则

如果 GitHub 返回邮箱，且系统中已存在同邮箱账号，则会自动合并到同一用户。
```

- [ ] **Step 2: Run repository, server, and frontend auth tests**

Run: `bun test server/repositories.auth.test.ts server/auth.test.ts server/app.auth.test.ts src/api/auth.test.ts src/store/authStore.test.ts`
Expected: PASS

- [ ] **Step 3: Run project verification commands**

Run: `bun run build`
Expected: build succeeds without TypeScript errors

Run: `npm run lint`
Expected: lint passes without errors

- [ ] **Step 4: Start preview server for user acceptance**

Run: `npx vite --port 5174`
Expected: dev server starts and prints `http://localhost:5174`

- [ ] **Step 5: Commit**

```bash
git add docs/features/auth-and-login.md
git commit -m "docs: update auth login docs"
```
