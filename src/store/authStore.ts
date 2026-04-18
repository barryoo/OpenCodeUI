import { useSyncExternalStore } from 'react'
import { getThinAuthMe, loginWithGithub, logoutThinAuth, type ThinAuthUser } from '../api/auth'
import { messageCacheStore } from './messageCacheStore'
import { messageStore } from './messageStore'
import { childSessionStore } from './childSessionStore'
import { todoStore } from './todoStore'
import { notificationStore } from './notificationStore'
import { useItemWorkspaceStore } from './itemWorkspaceStore'

type AuthStatus = 'idle' | 'checking' | 'authenticated' | 'anonymous' | 'redirecting' | 'error'

interface AuthState {
  status: AuthStatus
  user: ThinAuthUser | null
  mode: string | null
  error: string | null
}

type Listener = () => void

class AuthStore {
  private state: AuthState = {
    status: 'idle',
    user: null,
    mode: null,
    error: null,
  }

  private listeners = new Set<Listener>()
  private ensurePromise: Promise<void> | null = null
  private refreshPromise: Promise<void> | null = null

  subscribe = (listener: Listener) => {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  getSnapshot = () => this.state

  private notify() {
    this.listeners.forEach((listener) => listener())
  }

  private setState(next: Partial<AuthState>) {
    this.state = { ...this.state, ...next }
    this.notify()
  }

  private async resetUserBoundState() {
    messageStore.clearAll()
    childSessionStore.clearAll()
    todoStore.clearAll()
    notificationStore.clearAll()
    useItemWorkspaceStore.getState().reset()
    await messageCacheStore.clearAll()
  }

  async refresh(): Promise<void> {
    if (this.refreshPromise) return this.refreshPromise

    this.setState({ status: this.state.user ? 'checking' : 'idle', error: null })
    this.refreshPromise = getThinAuthMe()
      .then((result) => {
        if (result.user) {
          this.setState({
            status: 'authenticated',
            user: result.user,
            mode: result.auth?.mode ?? null,
            error: null,
          })
          return
        }

        this.setState({
          status: 'anonymous',
          user: null,
          mode: null,
          error: null,
        })
      })
      .catch((error) => {
        this.setState({
          status: 'error',
          user: null,
          mode: null,
          error: error instanceof Error ? error.message : 'Failed to load auth state',
        })
      })
      .finally(() => {
        this.refreshPromise = null
      })

    return this.refreshPromise
  }

  async ensureAuthenticated(): Promise<void> {
    if (this.ensurePromise) return this.ensurePromise

    this.ensurePromise = (async () => {
      await this.refresh()
      if (this.state.user) return
      throw new Error('AUTH_REQUIRED')
    })().finally(() => {
      this.ensurePromise = null
    })

    return this.ensurePromise
  }

  async logout(): Promise<void> {
    this.setState({ status: 'checking', error: null })
    await logoutThinAuth()
    await this.resetUserBoundState()
    this.setState({ status: 'anonymous', user: null, mode: null, error: null })
  }

  async handleUnauthorized(error?: unknown): Promise<void> {
    await this.resetUserBoundState()
    this.setState({
      status: 'anonymous',
      user: null,
      mode: null,
      error: error instanceof Error ? error.message : null,
    })
  }

  async beginLogin(): Promise<void> {
    this.setState({ status: 'redirecting', error: null })
    await loginWithGithub()
  }
}

export const authStore = new AuthStore()

export function useAuthStore() {
  return useSyncExternalStore(authStore.subscribe, authStore.getSnapshot, authStore.getSnapshot)
}
