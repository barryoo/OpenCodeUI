// ============================================
// Server Store - 多后端服务器配置管理（薄后端真源）
// ============================================

import { API_BASE_URL } from '../constants'
import {
  createThinServerProfile,
  deleteThinServerProfile,
  listThinServerProfiles,
  setDefaultThinServerProfile,
  updateThinServerProfile,
} from '../api/thinServer'
import { ensureThinAuth } from '../api/auth'
import { authStore } from './authStore'
import { isTauri } from '../utils/tauri'

let _tauriFetch: typeof globalThis.fetch | null = null
let _tauriFetchLoading: Promise<typeof globalThis.fetch> | null = null

async function getUnifiedFetch(): Promise<typeof globalThis.fetch> {
  if (!isTauri()) return globalThis.fetch
  if (_tauriFetch) return _tauriFetch
  if (_tauriFetchLoading) return _tauriFetchLoading
  _tauriFetchLoading = import('@tauri-apps/plugin-http').then(mod => {
    _tauriFetch = mod.fetch as unknown as typeof globalThis.fetch
    return _tauriFetch
  })
  return _tauriFetchLoading
}

export interface ServerAuth {
  username: string
  password: string
}

export interface ServerConfig {
  id: string
  name: string
  url: string
  isDefault?: boolean
  auth?: ServerAuth
}

export interface ServerHealth {
  status: 'checking' | 'online' | 'offline' | 'error' | 'unauthorized'
  latency?: number
  lastCheck?: number
  error?: string
  version?: string
}

type Listener = () => void

const ACTIVE_SERVER_KEY = 'opencode-active-server'
const LEGACY_STORAGE_KEY = 'opencode-servers'

class ServerStore {
  private servers: ServerConfig[] = []
  private activeServerId: string | null = null
  private healthMap = new Map<string, ServerHealth>()
  private listeners: Set<Listener> = new Set()
  private serverChangeListeners: Set<(newServerId: string) => void> = new Set()
  private _serversSnapshot: ServerConfig[] = []
  private _activeServerSnapshot: ServerConfig | null = null
  private _healthMapSnapshot: Map<string, ServerHealth> = new Map()
  private isInitialized = false
  private initializePromise: Promise<void> | null = null
  private readonly DEFAULT_SERVER_ID = 'local'

  constructor() {
    this.loadInitialLocalFallback()
    this.updateSnapshots()
    void this.initialize()
  }

  private loadInitialLocalFallback(): void {
    this.servers = [{
      id: this.DEFAULT_SERVER_ID,
      name: 'Local',
      url: API_BASE_URL,
      isDefault: true,
    }]

    const activeId = sessionStorage.getItem(ACTIVE_SERVER_KEY) ?? localStorage.getItem(ACTIVE_SERVER_KEY)
    this.activeServerId = activeId || this.DEFAULT_SERVER_ID
  }

  private saveActiveServerPreference(): void {
    try {
      if (this.activeServerId) {
        sessionStorage.setItem(ACTIVE_SERVER_KEY, this.activeServerId)
        localStorage.setItem(ACTIVE_SERVER_KEY, this.activeServerId)
      }
    } catch {
      // ignore
    }
  }

  private async migrateLegacyStorageIfNeeded(): Promise<void> {
    try {
      const stored = localStorage.getItem(LEGACY_STORAGE_KEY)
      if (!stored) return
      const parsed = JSON.parse(stored) as ServerConfig[]
      if (!Array.isArray(parsed) || parsed.length === 0) return

      const remote = await listThinServerProfiles()
      if (remote.length > 0) return

      for (const server of parsed) {
        await createThinServerProfile({
          name: server.name,
          baseUrl: server.url.replace(/\/+$/, ''),
          authType: server.auth?.password ? 'basic' : 'none',
          authSecretEncrypted: server.auth?.password ? JSON.stringify(server.auth) : null,
          isDefault: !!server.isDefault,
        })
      }
    } catch {
      // ignore legacy migration errors
    }
  }

  async initialize(): Promise<void> {
    if (this.isInitialized) return
    if (this.initializePromise) return this.initializePromise

    this.initializePromise = (async () => {
      await authStore.ensureAuthenticated().catch(async () => {
        await ensureThinAuth()
      })
      await this.migrateLegacyStorageIfNeeded()
      await this.reloadFromBackend()
      this.isInitialized = true
      this.initializePromise = null
    })()

    return this.initializePromise
  }

  async refresh(): Promise<void> {
    await this.reloadFromBackend()
  }

  private async reloadFromBackend(): Promise<void> {
    const profiles = await listThinServerProfiles()
    this.servers = profiles.length > 0
      ? profiles.map((profile) => ({
          id: profile.id,
          name: profile.name,
          url: profile.baseUrl,
          isDefault: profile.isDefault,
          auth: profile.authSecretEncrypted ? parseStoredAuth(profile.authSecretEncrypted) : undefined,
        }))
      : [{
          id: this.DEFAULT_SERVER_ID,
          name: 'Local',
          url: API_BASE_URL,
          isDefault: true,
        }]

    const preferredId = sessionStorage.getItem(ACTIVE_SERVER_KEY) ?? localStorage.getItem(ACTIVE_SERVER_KEY)
    const matched = preferredId && this.servers.some((server) => server.id === preferredId)
    this.activeServerId = matched
      ? preferredId
      : this.servers.find((server) => server.isDefault)?.id ?? this.servers[0]?.id ?? null

    this.saveActiveServerPreference()
    this.notify()
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  onServerChange(fn: (newServerId: string) => void): () => void {
    this.serverChangeListeners.add(fn)
    return () => this.serverChangeListeners.delete(fn)
  }

  private notify(): void {
    this.updateSnapshots()
    this.listeners.forEach(l => l())
  }

  private updateSnapshots(): void {
    this._serversSnapshot = [...this.servers]
    this._activeServerSnapshot = this.servers.find(s => s.id === this.activeServerId) ?? null
    this._healthMapSnapshot = new Map(this.healthMap)
  }

  getServers(): ServerConfig[] {
    return this._serversSnapshot
  }

  getActiveServer(): ServerConfig | null {
    return this._activeServerSnapshot
  }

  getActiveServerId(): string {
    return this.activeServerId ?? this.DEFAULT_SERVER_ID
  }

  getActiveBaseUrl(): string {
    const server = this.getActiveServer()
    return server?.url ?? API_BASE_URL
  }

  getActiveAuth(): ServerAuth | null {
    const server = this.getActiveServer()
    return server?.auth ?? null
  }

  getServerAuth(serverId: string): ServerAuth | null {
    const server = this.servers.find(s => s.id === serverId)
    return server?.auth ?? null
  }

  getHealth(serverId: string): ServerHealth | null {
    return this.healthMap.get(serverId) ?? null
  }

  getAllHealth(): Map<string, ServerHealth> {
    return this._healthMapSnapshot
  }

  async addServer(config: Omit<ServerConfig, 'id'>): Promise<ServerConfig> {
    await this.initialize()
    const created = await createThinServerProfile({
      name: config.name,
      baseUrl: config.url.replace(/\/+$/, ''),
      authType: config.auth?.password ? 'basic' : 'none',
      authSecretEncrypted: config.auth?.password ? JSON.stringify(config.auth) : null,
      isDefault: !!config.isDefault,
    })
    await this.reloadFromBackend()
    return this.servers.find((server) => server.id === created.id) ?? {
      id: created.id,
      name: created.name,
      url: created.baseUrl,
      isDefault: created.isDefault,
      auth: created.authSecretEncrypted ? parseStoredAuth(created.authSecretEncrypted) : undefined,
    }
  }

  async updateServer(id: string, updates: Partial<Omit<ServerConfig, 'id'>>): Promise<boolean> {
    await this.initialize()
    await updateThinServerProfile(id, {
      name: updates.name,
      baseUrl: updates.url?.replace(/\/+$/, ''),
      authType: updates.auth?.password ? 'basic' : updates.auth ? 'basic' : undefined,
      authSecretEncrypted: updates.auth ? JSON.stringify(updates.auth) : undefined,
      isDefault: updates.isDefault,
    })
    await this.reloadFromBackend()
    return true
  }

  async removeServer(id: string): Promise<boolean> {
    await this.initialize()
    const server = this.servers.find(s => s.id === id)
    if (!server || server.isDefault) return false
    await deleteThinServerProfile(id)
    this.healthMap.delete(id)
    await this.reloadFromBackend()
    return true
  }

  async setActiveServer(id: string): Promise<boolean> {
    await this.initialize()
    if (!this.servers.some(s => s.id === id)) return false
    const changed = this.activeServerId !== id
    this.activeServerId = id
    this.saveActiveServerPreference()
    this.notify()
    if (changed) {
      this.serverChangeListeners.forEach(fn => fn(id))
    }
    return true
  }

  async setDefaultServer(id: string): Promise<boolean> {
    await this.initialize()
    await setDefaultThinServerProfile(id)
    await this.reloadFromBackend()
    return true
  }

  async checkHealth(serverId: string): Promise<ServerHealth> {
    await this.initialize()
    const server = this.servers.find(s => s.id === serverId)
    if (!server) {
      return { status: 'error', error: 'Server not found' }
    }

    this.healthMap.set(serverId, { status: 'checking' })
    this.notify()

    const startTime = Date.now()

    try {
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 5000)

      const headers: Record<string, string> = {}
      if (server.auth?.password) {
        headers.Authorization = makeBasicAuthHeader(server.auth)
      }

      const f = await getUnifiedFetch()
      const response = await f(`${server.url}/global/health`, {
        method: 'GET',
        signal: controller.signal,
        headers,
      })

      clearTimeout(timeoutId)
      const latency = Date.now() - startTime

      if (response.ok) {
        let version: string | undefined
        try {
          const data = await response.json() as { version?: string }
          version = data.version
        } catch {
          // ignore parse error
        }

        const health: ServerHealth = { status: 'online', latency, lastCheck: Date.now(), version }
        this.healthMap.set(serverId, health)
        this.notify()
        return health
      }

      if (response.status === 401) {
        const health: ServerHealth = { status: 'unauthorized', latency, lastCheck: Date.now(), error: 'Invalid credentials' }
        this.healthMap.set(serverId, health)
        this.notify()
        return health
      }

      const health: ServerHealth = { status: 'error', latency, lastCheck: Date.now(), error: `HTTP ${response.status}` }
      this.healthMap.set(serverId, health)
      this.notify()
      return health
    } catch (err) {
      const health: ServerHealth = {
        status: 'offline',
        lastCheck: Date.now(),
        error: err instanceof Error ? err.message : 'Connection failed',
      }
      this.healthMap.set(serverId, health)
      this.notify()
      return health
    }
  }

  async checkAllHealth(): Promise<void> {
    await this.initialize()
    await Promise.all(this.servers.map(s => this.checkHealth(s.id)))
  }
}

function parseStoredAuth(raw: string): ServerAuth | undefined {
  try {
    const parsed = JSON.parse(raw) as Partial<ServerAuth>
    if (typeof parsed.username === 'string' && typeof parsed.password === 'string') {
      return { username: parsed.username, password: parsed.password }
    }
  } catch {
    // ignore
  }
  return undefined
}

export const serverStore = new ServerStore()

export function makeBasicAuthHeader(auth: ServerAuth): string {
  return 'Basic ' + btoa(`${auth.username}:${auth.password}`)
}
