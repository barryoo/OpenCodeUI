import { useSyncExternalStore } from 'react'
import { childSessionStore } from './childSessionStore'
import { serverStorage } from '../utils/perServerStorage'

interface AutoApproveState {
  autoAccept: Record<string, boolean>
}

function encodeStoragePart(value: string): string {
  try {
    return btoa(unescape(encodeURIComponent(value)))
  } catch {
    return btoa(value)
  }
}

function sessionKey(sessionId: string, directory?: string): string {
  if (!directory) return sessionId
  return `${encodeStoragePart(directory)}/${sessionId}`
}

function directoryKey(directory: string): string {
  return `${encodeStoragePart(directory)}/*`
}

class AutoApproveStore {
  private readonly STORAGE_KEY = 'opencode-auto-approve-state'
  private state: AutoApproveState = { autoAccept: {} }
  private listeners = new Set<() => void>()
  private cachedSnapshot: AutoApproveState | null = null

  constructor() {
    this.reloadFromStorage()
  }

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  private emit() {
    this.cachedSnapshot = null
    this.listeners.forEach(listener => listener())
  }

  private persist() {
    serverStorage.setJSON(this.STORAGE_KEY, this.state)
  }

  private setState(updater: (draft: AutoApproveState) => void) {
    const next: AutoApproveState = {
      autoAccept: { ...this.state.autoAccept },
    }
    updater(next)
    this.state = next
    this.persist()
    this.emit()
  }

  reloadFromStorage(): void {
    const stored = serverStorage.getJSON<AutoApproveState>(this.STORAGE_KEY)
    this.state = {
      autoAccept: stored?.autoAccept && typeof stored.autoAccept === 'object'
        ? { ...stored.autoAccept }
        : {},
    }
    this.emit()
  }

  getSnapshot = (): AutoApproveState => {
    if (!this.cachedSnapshot) {
      this.cachedSnapshot = {
        autoAccept: { ...this.state.autoAccept },
      }
    }
    return this.cachedSnapshot
  }

  get enabled(): boolean {
    return Object.values(this.state.autoAccept).some(Boolean)
  }

  isAutoAccepting(sessionId: string, directory?: string): boolean {
    for (const lineageId of this.getSessionLineage(sessionId)) {
      const accepted = this.getAcceptedValue(lineageId, directory)
      if (accepted !== undefined) return accepted
    }
    return false
  }

  isDirectoryAutoAccepting(directory: string): boolean {
    return this.state.autoAccept[directoryKey(directory)] ?? false
  }

  shouldAutoApprove(sessionId: string, directory?: string): boolean {
    return this.isAutoAccepting(sessionId, directory)
  }

  toggleAutoAccept(sessionId: string, directory: string): boolean {
    if (this.isAutoAccepting(sessionId, directory)) {
      this.disableAutoAccept(sessionId, directory)
      return false
    }
    this.enableAutoAccept(sessionId, directory)
    return true
  }

  toggleAutoAcceptDirectory(directory: string): boolean {
    if (this.isDirectoryAutoAccepting(directory)) {
      this.disableDirectory(directory)
      return false
    }
    this.enableDirectory(directory)
    return true
  }

  enableAutoAccept(sessionId: string, directory: string): void {
    const key = sessionKey(sessionId, directory)
    this.setState((draft) => {
      draft.autoAccept[key] = true
      delete draft.autoAccept[sessionId]
    })
  }

  disableAutoAccept(sessionId: string, directory?: string): void {
    const key = directory ? sessionKey(sessionId, directory) : sessionId
    this.setState((draft) => {
      draft.autoAccept[key] = false
      if (directory) delete draft.autoAccept[sessionId]
    })
  }

  private enableDirectory(directory: string): void {
    const key = directoryKey(directory)
    this.setState((draft) => {
      draft.autoAccept[key] = true
    })
  }

  private disableDirectory(directory: string): void {
    const key = directoryKey(directory)
    this.setState((draft) => {
      draft.autoAccept[key] = false
    })
  }

  clearAllRules(): void {
    this.setState((draft) => {
      draft.autoAccept = {}
    })
  }

  private getAcceptedValue(sessionId: string, directory?: string): boolean | undefined {
    const scopedKey = directory ? sessionKey(sessionId, directory) : undefined
    const dirKey = directory ? directoryKey(directory) : undefined

    if (scopedKey && scopedKey in this.state.autoAccept) return this.state.autoAccept[scopedKey]
    if (sessionId in this.state.autoAccept) return this.state.autoAccept[sessionId]
    if (dirKey && dirKey in this.state.autoAccept) return this.state.autoAccept[dirKey]
    return undefined
  }

  private getSessionLineage(sessionId: string): string[] {
    const ids = [sessionId]
    const seen = new Set(ids)

    for (let index = 0; index < ids.length; index += 1) {
      const currentId = ids[index]
      const parentId = childSessionStore.getSessionInfo(currentId)?.parentID
      if (!parentId || seen.has(parentId)) continue
      seen.add(parentId)
      ids.push(parentId)
    }

    return ids
  }
}

export const autoApproveStore = new AutoApproveStore()

export function useAutoApproveStore() {
  return useSyncExternalStore(autoApproveStore.subscribe, autoApproveStore.getSnapshot, autoApproveStore.getSnapshot)
}
