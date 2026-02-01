// ============================================
// LayoutStore - 全局 UI 布局状态
// ============================================

export type RightPanelTab = 'changes' | 'terminal' | 'preview'

interface LayoutState {
  rightPanelOpen: boolean
  activeTab: RightPanelTab
}

type Subscriber = () => void

class LayoutStore {
  private state: LayoutState = {
    rightPanelOpen: false,
    activeTab: 'changes'
  }
  private subscribers = new Set<Subscriber>()

  // ============================================
  // Subscription
  // ============================================

  subscribe(fn: Subscriber): () => void {
    this.subscribers.add(fn)
    return () => this.subscribers.delete(fn)
  }

  private notify() {
    this.subscribers.forEach(fn => fn())
  }

  // ============================================
  // Actions
  // ============================================

  toggleRightPanel(tab?: RightPanelTab) {
    if (tab && tab !== this.state.activeTab) {
      this.state.activeTab = tab
      this.state.rightPanelOpen = true
    } else {
      this.state.rightPanelOpen = !this.state.rightPanelOpen
    }
    this.notify()
  }

  openRightPanel(tab: RightPanelTab) {
    this.state.rightPanelOpen = true
    this.state.activeTab = tab
    this.notify()
  }

  closeRightPanel() {
    this.state.rightPanelOpen = false
    this.notify()
  }

  getState() {
    return this.state
  }
}

export const layoutStore = new LayoutStore()

// ============================================
// React Hook
// ============================================

import { useSyncExternalStore } from 'react'

let cachedSnapshot: LayoutState | null = null

function getSnapshot(): LayoutState {
  if (!cachedSnapshot) {
    cachedSnapshot = { ...layoutStore.getState() }
  }
  return cachedSnapshot
}

// 订阅更新时清除缓存
layoutStore.subscribe(() => {
  cachedSnapshot = null
})

export function useLayoutStore() {
  return useSyncExternalStore(
    (cb) => layoutStore.subscribe(cb),
    getSnapshot,
    getSnapshot
  )
}
