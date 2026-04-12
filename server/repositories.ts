import type { Statement } from 'bun:sqlite'
import type { DatabaseContext } from './db'
import type {
  AuthSessionRecord,
  CreateItemInput,
  CreateServerProfileInput,
  ItemDocumentRefRecord,
  OAuthStateRecord,
  ItemRecord,
  ServerProfileRecord,
  SessionSummaryRecord,
  UpdateItemInput,
  UpdateServerProfileInput,
  UpsertSessionSummaryInput,
  UserRecord,
  WorkflowStatus,
} from './domain'
import { createId, isOlderThanDays, normalizeWorkflowStatus, nowIsoString } from './utils'

type RowValue = string | number | null

interface UserRow {
  id: string
  github_id: string
  login: string
  name: string | null
  avatar_url: string | null
  created_at: string
  updated_at: string
}

interface ServerProfileRow {
  id: string
  user_id: string
  name: string
  base_url: string
  auth_type: string
  auth_secret_encrypted: string | null
  is_default: number
  created_at: string
  updated_at: string
}

interface AuthSessionRow {
  id: string
  token: string
  user_id: string
  login: string
  expires_at: string
  created_at: string
  updated_at: string
}

interface OAuthStateRow {
  id: string
  state: string
  provider: string
  expires_at: string
  created_at: string
}

interface ItemRow {
  id: string
  user_id: string
  server_profile_id: string
  project_id: string
  title: string
  type: string
  status: string
  description: string
  activity_at: string
  created_at: string
  updated_at: string
}

interface SessionSummaryRow {
  id: string
  user_id: string
  server_profile_id: string
  project_id: string
  external_session_id: string
  item_id: string | null
  title_snapshot: string
  status_snapshot: string
  last_message_at: string | null
  activity_at: string
  created_at: string
  updated_at: string
}

interface ItemDocumentRefRow {
  id: string
  item_id: string
  file_path: string
  display_name: string
  created_at: string
}

function mapUser(row: UserRow): UserRecord {
  return {
    id: row.id,
    githubId: row.github_id,
    login: row.login,
    name: row.name,
    avatarUrl: row.avatar_url,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function mapServerProfile(row: ServerProfileRow): ServerProfileRecord {
  return {
    id: row.id,
    userId: row.user_id,
    name: row.name,
    baseUrl: row.base_url,
    authType: row.auth_type,
    authSecretEncrypted: row.auth_secret_encrypted,
    isDefault: row.is_default === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function mapAuthSession(row: AuthSessionRow): AuthSessionRecord {
  return {
    id: row.id,
    token: row.token,
    userId: row.user_id,
    login: row.login,
    expiresAt: row.expires_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function mapOAuthState(row: OAuthStateRow): OAuthStateRecord {
  return {
    id: row.id,
    state: row.state,
    provider: row.provider,
    expiresAt: row.expires_at,
    createdAt: row.created_at,
  }
}

function mapItem(row: ItemRow): ItemRecord {
  return {
    id: row.id,
    userId: row.user_id,
    serverProfileId: row.server_profile_id,
    projectId: row.project_id,
    title: row.title,
    type: row.type as ItemRecord['type'],
    status: normalizeWorkflowStatus(row.status),
    description: row.description,
    activityAt: row.activity_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function mapSessionSummary(row: SessionSummaryRow): SessionSummaryRecord {
  return {
    id: row.id,
    userId: row.user_id,
    serverProfileId: row.server_profile_id,
    projectId: row.project_id,
    externalSessionId: row.external_session_id,
    itemId: row.item_id,
    titleSnapshot: row.title_snapshot,
    statusSnapshot: normalizeWorkflowStatus(row.status_snapshot),
    lastMessageAt: row.last_message_at,
    activityAt: row.activity_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function mapItemDocumentRef(row: ItemDocumentRefRow): ItemDocumentRefRecord {
  return {
    id: row.id,
    itemId: row.item_id,
    filePath: row.file_path,
    displayName: row.display_name,
    createdAt: row.created_at,
  }
}

function runStatement(statement: Statement<unknown>, values: RowValue[]) {
  statement.run(...values)
}

export class ThinServerRepository {
  private readonly database: DatabaseContext

  constructor(database: DatabaseContext) {
    this.database = database
  }

  migrate() {
    this.database.db.exec(`
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        github_id TEXT NOT NULL UNIQUE,
        login TEXT NOT NULL,
        name TEXT,
        avatar_url TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS server_profiles (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        name TEXT NOT NULL,
        base_url TEXT NOT NULL,
        auth_type TEXT NOT NULL DEFAULT 'none',
        auth_secret_encrypted TEXT,
        is_default INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS auth_sessions (
        id TEXT PRIMARY KEY,
        token TEXT NOT NULL UNIQUE,
        user_id TEXT NOT NULL,
        login TEXT NOT NULL,
        expires_at TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS oauth_states (
        id TEXT PRIMARY KEY,
        state TEXT NOT NULL UNIQUE,
        provider TEXT NOT NULL,
        expires_at TEXT NOT NULL,
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS items (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        server_profile_id TEXT NOT NULL,
        project_id TEXT NOT NULL,
        title TEXT NOT NULL,
        type TEXT NOT NULL,
        status TEXT NOT NULL,
        description TEXT NOT NULL DEFAULT '',
        activity_at TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (server_profile_id) REFERENCES server_profiles(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS session_summaries (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        server_profile_id TEXT NOT NULL,
        project_id TEXT NOT NULL,
        external_session_id TEXT NOT NULL,
        item_id TEXT,
        title_snapshot TEXT NOT NULL,
        status_snapshot TEXT NOT NULL,
        last_message_at TEXT,
        activity_at TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (server_profile_id) REFERENCES server_profiles(id) ON DELETE CASCADE,
        FOREIGN KEY (item_id) REFERENCES items(id) ON DELETE SET NULL,
        UNIQUE(user_id, server_profile_id, external_session_id)
      );

      CREATE TABLE IF NOT EXISTS item_document_refs (
        id TEXT PRIMARY KEY,
        item_id TEXT NOT NULL,
        file_path TEXT NOT NULL,
        display_name TEXT NOT NULL,
        created_at TEXT NOT NULL,
        FOREIGN KEY (item_id) REFERENCES items(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_server_profiles_user_id ON server_profiles(user_id);
      CREATE INDEX IF NOT EXISTS idx_auth_sessions_user_id ON auth_sessions(user_id);
      CREATE INDEX IF NOT EXISTS idx_auth_sessions_expires_at ON auth_sessions(expires_at);
      CREATE INDEX IF NOT EXISTS idx_oauth_states_expires_at ON oauth_states(expires_at);
      CREATE INDEX IF NOT EXISTS idx_items_project_id ON items(project_id);
      CREATE INDEX IF NOT EXISTS idx_items_user_id ON items(user_id);
      CREATE INDEX IF NOT EXISTS idx_session_summaries_project_id ON session_summaries(project_id);
      CREATE INDEX IF NOT EXISTS idx_session_summaries_item_id ON session_summaries(item_id);
      CREATE INDEX IF NOT EXISTS idx_session_summaries_external_session_id ON session_summaries(external_session_id);
    `)
  }

  upsertUserByGithubProfile(input: { githubId: string; login: string; name?: string | null; avatarUrl?: string | null }): UserRecord {
    const existing = this.database.db.query('SELECT * FROM users WHERE github_id = ?').get(input.githubId) as UserRow | null
    const now = nowIsoString()

    if (existing) {
      const statement = this.database.db.query(`
        UPDATE users
        SET login = ?, name = ?, avatar_url = ?, updated_at = ?
        WHERE id = ?
      `)
      runStatement(statement, [input.login, input.name ?? null, input.avatarUrl ?? null, now, existing.id])
      return mapUser({ ...existing, login: input.login, name: input.name ?? null, avatar_url: input.avatarUrl ?? null, updated_at: now })
    }

    const row: UserRow = {
      id: createId('usr'),
      github_id: input.githubId,
      login: input.login,
      name: input.name ?? null,
      avatar_url: input.avatarUrl ?? null,
      created_at: now,
      updated_at: now,
    }
    const statement = this.database.db.query(`
      INSERT INTO users (id, github_id, login, name, avatar_url, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `)
    runStatement(statement, [row.id, row.github_id, row.login, row.name, row.avatar_url, row.created_at, row.updated_at])
    return mapUser(row)
  }

  findUserById(id: string): UserRecord | null {
    const row = this.database.db.query('SELECT * FROM users WHERE id = ?').get(id) as UserRow | null
    return row ? mapUser(row) : null
  }

  createAuthSession(input: { token: string; userId: string; login: string; expiresAt: string }): AuthSessionRecord {
    const now = nowIsoString()
    const row: AuthSessionRow = {
      id: createId('as'),
      token: input.token,
      user_id: input.userId,
      login: input.login,
      expires_at: input.expiresAt,
      created_at: now,
      updated_at: now,
    }
    const statement = this.database.db.query(`
      INSERT INTO auth_sessions (id, token, user_id, login, expires_at, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `)
    runStatement(statement, [row.id, row.token, row.user_id, row.login, row.expires_at, row.created_at, row.updated_at])
    return mapAuthSession(row)
  }

  findAuthSessionByToken(token: string): AuthSessionRecord | null {
    this.cleanupExpiredAuthSessions()
    const row = this.database.db.query('SELECT * FROM auth_sessions WHERE token = ?').get(token) as AuthSessionRow | null
    if (!row) return null
    if (new Date(row.expires_at).getTime() <= Date.now()) {
      this.deleteAuthSessionByToken(token)
      return null
    }
    return mapAuthSession(row)
  }

  extendAuthSession(token: string, expiresAt: string): AuthSessionRecord | null {
    const existing = this.database.db.query('SELECT * FROM auth_sessions WHERE token = ?').get(token) as AuthSessionRow | null
    if (!existing) return null
    const updatedAt = nowIsoString()
    this.database.db.query('UPDATE auth_sessions SET expires_at = ?, updated_at = ? WHERE token = ?').run(expiresAt, updatedAt, token)
    return mapAuthSession({ ...existing, expires_at: expiresAt, updated_at: updatedAt })
  }

  deleteAuthSessionByToken(token: string): boolean {
    const result = this.database.db.query('DELETE FROM auth_sessions WHERE token = ?').run(token)
    return result.changes > 0
  }

  cleanupExpiredAuthSessions() {
    this.database.db.query('DELETE FROM auth_sessions WHERE expires_at <= ?').run(nowIsoString())
  }

  createOAuthState(input: { state: string; provider: string; expiresAt: string }): OAuthStateRecord {
    this.cleanupExpiredOAuthStates()
    const row: OAuthStateRow = {
      id: createId('oas'),
      state: input.state,
      provider: input.provider,
      expires_at: input.expiresAt,
      created_at: nowIsoString(),
    }
    const statement = this.database.db.query(`
      INSERT INTO oauth_states (id, state, provider, expires_at, created_at)
      VALUES (?, ?, ?, ?, ?)
    `)
    runStatement(statement, [row.id, row.state, row.provider, row.expires_at, row.created_at])
    return mapOAuthState(row)
  }

  consumeOAuthState(state: string, provider: string): boolean {
    this.cleanupExpiredOAuthStates()
    const row = this.database.db.query('SELECT * FROM oauth_states WHERE state = ? AND provider = ?').get(state, provider) as OAuthStateRow | null
    if (!row) return false
    this.database.db.query('DELETE FROM oauth_states WHERE state = ?').run(state)
    return new Date(row.expires_at).getTime() > Date.now()
  }

  cleanupExpiredOAuthStates() {
    this.database.db.query('DELETE FROM oauth_states WHERE expires_at <= ?').run(nowIsoString())
  }

  listServerProfiles(userId: string): ServerProfileRecord[] {
    const rows = this.database.db.query('SELECT * FROM server_profiles WHERE user_id = ? ORDER BY is_default DESC, updated_at DESC').all(userId) as ServerProfileRow[]
    return rows.map(mapServerProfile)
  }

  createServerProfile(input: CreateServerProfileInput): ServerProfileRecord {
    const now = nowIsoString()
    const row: ServerProfileRow = {
      id: createId('srv'),
      user_id: input.userId,
      name: input.name,
      base_url: input.baseUrl,
      auth_type: input.authType ?? 'none',
      auth_secret_encrypted: input.authSecretEncrypted ?? null,
      is_default: input.isDefault ? 1 : 0,
      created_at: now,
      updated_at: now,
    }

    if (row.is_default === 1) {
      this.clearDefaultServerProfile(input.userId)
    }

    const statement = this.database.db.query(`
      INSERT INTO server_profiles (id, user_id, name, base_url, auth_type, auth_secret_encrypted, is_default, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)
    runStatement(statement, [row.id, row.user_id, row.name, row.base_url, row.auth_type, row.auth_secret_encrypted, row.is_default, row.created_at, row.updated_at])
    return mapServerProfile(row)
  }

  updateServerProfile(id: string, userId: string, input: UpdateServerProfileInput): ServerProfileRecord | null {
    const existing = this.database.db.query('SELECT * FROM server_profiles WHERE id = ? AND user_id = ?').get(id, userId) as ServerProfileRow | null
    if (!existing) return null

    const next: ServerProfileRow = {
      ...existing,
      name: input.name ?? existing.name,
      base_url: input.baseUrl ?? existing.base_url,
      auth_type: input.authType ?? existing.auth_type,
      auth_secret_encrypted: input.authSecretEncrypted ?? existing.auth_secret_encrypted,
      is_default: input.isDefault === undefined ? existing.is_default : input.isDefault ? 1 : 0,
      updated_at: nowIsoString(),
    }

    if (next.is_default === 1) {
      this.clearDefaultServerProfile(userId)
    }

    const statement = this.database.db.query(`
      UPDATE server_profiles
      SET name = ?, base_url = ?, auth_type = ?, auth_secret_encrypted = ?, is_default = ?, updated_at = ?
      WHERE id = ? AND user_id = ?
    `)
    runStatement(statement, [next.name, next.base_url, next.auth_type, next.auth_secret_encrypted, next.is_default, next.updated_at, id, userId])
    return mapServerProfile(next)
  }

  deleteServerProfile(id: string, userId: string): boolean {
    const statement = this.database.db.query('DELETE FROM server_profiles WHERE id = ? AND user_id = ?')
    const result = statement.run(id, userId)
    return result.changes > 0
  }

  setDefaultServerProfile(id: string, userId: string): ServerProfileRecord | null {
    const existing = this.database.db.query('SELECT * FROM server_profiles WHERE id = ? AND user_id = ?').get(id, userId) as ServerProfileRow | null
    if (!existing) return null
    this.clearDefaultServerProfile(userId)
    const updatedAt = nowIsoString()
    this.database.db.query('UPDATE server_profiles SET is_default = 1, updated_at = ? WHERE id = ? AND user_id = ?').run(updatedAt, id, userId)
    return mapServerProfile({ ...existing, is_default: 1, updated_at: updatedAt })
  }

  private clearDefaultServerProfile(userId: string) {
    this.database.db.query('UPDATE server_profiles SET is_default = 0 WHERE user_id = ?').run(userId)
  }

  listItems(userId: string, projectId: string): ItemRecord[] {
    const rows = this.database.db.query('SELECT * FROM items WHERE user_id = ? AND project_id = ? ORDER BY activity_at DESC, updated_at DESC').all(userId, projectId) as ItemRow[]
    return rows.map(mapItem)
  }

  listItemsByUser(userId: string): ItemRecord[] {
    const rows = this.database.db.query('SELECT * FROM items WHERE user_id = ? ORDER BY activity_at DESC, updated_at DESC').all(userId) as ItemRow[]
    return rows.map(mapItem)
  }

  getItem(id: string, userId: string): ItemRecord | null {
    const row = this.database.db.query('SELECT * FROM items WHERE id = ? AND user_id = ?').get(id, userId) as ItemRow | null
    return row ? mapItem(row) : null
  }

  createItem(input: CreateItemInput): ItemRecord {
    const now = nowIsoString()
    const row: ItemRow = {
      id: createId('itm'),
      user_id: input.userId,
      server_profile_id: input.serverProfileId,
      project_id: input.projectId,
      title: input.title,
      type: input.type,
      status: 'not_started',
      description: input.description ?? '',
      activity_at: now,
      created_at: now,
      updated_at: now,
    }
    const statement = this.database.db.query(`
      INSERT INTO items (id, user_id, server_profile_id, project_id, title, type, status, description, activity_at, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)
    runStatement(statement, [row.id, row.user_id, row.server_profile_id, row.project_id, row.title, row.type, row.status, row.description, row.activity_at, row.created_at, row.updated_at])
    return mapItem(row)
  }

  updateItem(id: string, userId: string, input: UpdateItemInput): ItemRecord | null {
    const existing = this.database.db.query('SELECT * FROM items WHERE id = ? AND user_id = ?').get(id, userId) as ItemRow | null
    if (!existing) return null
    const updatedAt = nowIsoString()
    const next: ItemRow = {
      ...existing,
      title: input.title ?? existing.title,
      type: input.type ?? existing.type,
      status: input.status ?? existing.status,
      description: input.description ?? existing.description,
      activity_at: input.activityAt ?? updatedAt,
      updated_at: updatedAt,
    }
    const statement = this.database.db.query(`
      UPDATE items
      SET title = ?, type = ?, status = ?, description = ?, activity_at = ?, updated_at = ?
      WHERE id = ? AND user_id = ?
    `)
    runStatement(statement, [next.title, next.type, next.status, next.description, next.activity_at, next.updated_at, id, userId])
    return mapItem(next)
  }

  deleteItem(id: string, userId: string): boolean {
    const result = this.database.db.query('DELETE FROM items WHERE id = ? AND user_id = ?').run(id, userId)
    return result.changes > 0
  }

  listSessionSummaries(userId: string, projectId: string): SessionSummaryRecord[] {
    this.autoCompleteStaleSessionSummaries(userId)
    const rows = this.database.db.query('SELECT * FROM session_summaries WHERE user_id = ? AND project_id = ? ORDER BY activity_at DESC, updated_at DESC').all(userId, projectId) as SessionSummaryRow[]
    return rows.map(mapSessionSummary)
  }

  listSessionSummariesByUser(userId: string): SessionSummaryRecord[] {
    this.autoCompleteStaleSessionSummaries(userId)
    const rows = this.database.db.query('SELECT * FROM session_summaries WHERE user_id = ? ORDER BY activity_at DESC, updated_at DESC').all(userId) as SessionSummaryRow[]
    return rows.map(mapSessionSummary)
  }

  getSessionSummary(id: string, userId: string): SessionSummaryRecord | null {
    this.autoCompleteStaleSessionSummaries(userId)
    const row = this.database.db.query('SELECT * FROM session_summaries WHERE id = ? AND user_id = ?').get(id, userId) as SessionSummaryRow | null
    return row ? mapSessionSummary(row) : null
  }

  listItemSessionSummaries(userId: string, itemId: string): SessionSummaryRecord[] {
    this.autoCompleteStaleSessionSummaries(userId)
    const rows = this.database.db.query('SELECT * FROM session_summaries WHERE user_id = ? AND item_id = ? ORDER BY activity_at DESC, updated_at DESC').all(userId, itemId) as SessionSummaryRow[]
    return rows.map(mapSessionSummary)
  }

  upsertSessionSummary(input: UpsertSessionSummaryInput): SessionSummaryRecord {
    const existing = this.database.db.query('SELECT * FROM session_summaries WHERE user_id = ? AND server_profile_id = ? AND external_session_id = ?').get(input.userId, input.serverProfileId, input.externalSessionId) as SessionSummaryRow | null
    const nextStatus = isOlderThanDays(input.activityAt, 14) ? 'completed' : input.statusSnapshot
    const now = nowIsoString()

    if (existing) {
      const next: SessionSummaryRow = {
        ...existing,
        project_id: input.projectId,
        item_id: input.itemId === undefined ? existing.item_id : input.itemId,
        title_snapshot: input.titleSnapshot,
        status_snapshot: nextStatus,
        last_message_at: input.lastMessageAt ?? existing.last_message_at,
        activity_at: input.activityAt,
        updated_at: now,
      }
      const statement = this.database.db.query(`
        UPDATE session_summaries
        SET project_id = ?, item_id = ?, title_snapshot = ?, status_snapshot = ?, last_message_at = ?, activity_at = ?, updated_at = ?
        WHERE id = ?
      `)
      runStatement(statement, [next.project_id, next.item_id, next.title_snapshot, next.status_snapshot, next.last_message_at, next.activity_at, next.updated_at, existing.id])
      this.syncItemStatusFromSession(next.item_id, input.userId)
      return mapSessionSummary(next)
    }

    const row: SessionSummaryRow = {
      id: createId('ssn'),
      user_id: input.userId,
      server_profile_id: input.serverProfileId,
      project_id: input.projectId,
      external_session_id: input.externalSessionId,
      item_id: input.itemId ?? null,
      title_snapshot: input.titleSnapshot,
      status_snapshot: nextStatus,
      last_message_at: input.lastMessageAt ?? null,
      activity_at: input.activityAt,
      created_at: now,
      updated_at: now,
    }
    const statement = this.database.db.query(`
      INSERT INTO session_summaries (id, user_id, server_profile_id, project_id, external_session_id, item_id, title_snapshot, status_snapshot, last_message_at, activity_at, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)
    runStatement(statement, [row.id, row.user_id, row.server_profile_id, row.project_id, row.external_session_id, row.item_id, row.title_snapshot, row.status_snapshot, row.last_message_at, row.activity_at, row.created_at, row.updated_at])
    this.syncItemStatusFromSession(row.item_id, input.userId)
    return mapSessionSummary(row)
  }

  updateSessionSummaryStatus(id: string, userId: string, status: WorkflowStatus): SessionSummaryRecord | null {
    const existing = this.database.db.query('SELECT * FROM session_summaries WHERE id = ? AND user_id = ?').get(id, userId) as SessionSummaryRow | null
    if (!existing) return null
    const updatedAt = nowIsoString()
    this.database.db.query('UPDATE session_summaries SET status_snapshot = ?, updated_at = ? WHERE id = ? AND user_id = ?').run(status, updatedAt, id, userId)
    this.syncItemStatusFromSession(existing.item_id, userId)
    return mapSessionSummary({ ...existing, status_snapshot: status, updated_at: updatedAt })
  }

  bindSessionSummaryToItem(id: string, userId: string, itemId: string | null): SessionSummaryRecord | null {
    const existing = this.database.db.query('SELECT * FROM session_summaries WHERE id = ? AND user_id = ?').get(id, userId) as SessionSummaryRow | null
    if (!existing) return null
    const updatedAt = nowIsoString()
    this.database.db.query('UPDATE session_summaries SET item_id = ?, updated_at = ? WHERE id = ? AND user_id = ?').run(itemId, updatedAt, id, userId)
    if (existing.item_id && existing.item_id !== itemId) this.syncItemStatusFromSession(existing.item_id, userId)
    if (itemId) this.syncItemStatusFromSession(itemId, userId)
    return mapSessionSummary({ ...existing, item_id: itemId, updated_at: updatedAt })
  }

  replaceItemDocumentRefs(itemId: string, refs: Array<{ filePath: string; displayName: string }>): ItemDocumentRefRecord[] {
    this.database.db.query('DELETE FROM item_document_refs WHERE item_id = ?').run(itemId)
    const statement = this.database.db.query(`
      INSERT INTO item_document_refs (id, item_id, file_path, display_name, created_at)
      VALUES (?, ?, ?, ?, ?)
    `)
    const createdAt = nowIsoString()
    const rows: ItemDocumentRefRow[] = refs.map((ref) => ({
      id: createId('ref'),
      item_id: itemId,
      file_path: ref.filePath,
      display_name: ref.displayName,
      created_at: createdAt,
    }))
    for (const row of rows) {
      runStatement(statement, [row.id, row.item_id, row.file_path, row.display_name, row.created_at])
    }
    return rows.map(mapItemDocumentRef)
  }

  listItemDocumentRefs(itemId: string): ItemDocumentRefRecord[] {
    const rows = this.database.db.query('SELECT * FROM item_document_refs WHERE item_id = ? ORDER BY created_at ASC').all(itemId) as ItemDocumentRefRow[]
    return rows.map(mapItemDocumentRef)
  }

  searchProjectFiles(userId: string, projectId: string, query: string): Array<{ filePath: string; displayName: string; itemId: string }> {
    const rows = this.database.db.query(`
      SELECT DISTINCT r.file_path, r.display_name, i.id AS item_id
      FROM item_document_refs r
      INNER JOIN items i ON i.id = r.item_id
      WHERE i.user_id = ?
        AND i.project_id = ?
        AND (LOWER(r.file_path) LIKE ? OR LOWER(r.display_name) LIKE ?)
      ORDER BY r.created_at DESC
      LIMIT 100
    `).all(userId, projectId, `%${query.toLowerCase()}%`, `%${query.toLowerCase()}%`) as Array<{ file_path: string; display_name: string; item_id: string }>

    return rows.map((row) => ({
      filePath: row.file_path,
      displayName: row.display_name,
      itemId: row.item_id,
    }))
  }

  private autoCompleteStaleSessionSummaries(userId: string) {
    const rows = this.database.db.query(`
      SELECT * FROM session_summaries
      WHERE user_id = ?
        AND status_snapshot NOT IN ('completed', 'abandoned')
    `).all(userId) as SessionSummaryRow[]

    for (const row of rows) {
      if (!isOlderThanDays(row.activity_at, 14)) continue
      const updatedAt = nowIsoString()
      this.database.db.query('UPDATE session_summaries SET status_snapshot = ?, updated_at = ? WHERE id = ?').run('completed', updatedAt, row.id)
      this.syncItemStatusFromSession(row.item_id, userId)
    }
  }

  private syncItemStatusFromSession(itemId: string | null, userId: string) {
    if (!itemId) return
    const sessions = this.database.db.query('SELECT status_snapshot FROM session_summaries WHERE item_id = ? AND user_id = ?').all(itemId, userId) as Array<{ status_snapshot: string }>
    if (sessions.length === 0) return

    const nextStatus: WorkflowStatus = sessions.some((row) => row.status_snapshot === 'in_progress') ? 'in_progress' : 'not_started'
    const updatedAt = nowIsoString()
    this.database.db.query('UPDATE items SET status = ?, updated_at = ?, activity_at = ? WHERE id = ? AND user_id = ?').run(nextStatus, updatedAt, updatedAt, itemId, userId)
  }
}
