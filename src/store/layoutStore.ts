// ============================================
// LayoutStore - 全局 UI 布局状态
// 目前这个 store 暂时保留，以后可能需要管理其他布局状态
// ============================================

type Subscriber = () => void

class LayoutStore {
  private subscribers = new Set<Subscriber>()

  // ============================================
  // Subscription
  // ============================================

  subscribe(fn: Subscriber): () => void {
    this.subscribers.add(fn)
    return () => this.subscribers.delete(fn)
  }

  // @ts-ignore - 保留以备将来使用
  private notify() {
    this.subscribers.forEach(fn => fn())
  }
}

export const layoutStore = new LayoutStore()

// ============================================
// React Hook（保留接口，以后可能需要）
// ============================================

import { useSyncExternalStore } from 'react'

interface LayoutSnapshot {
  // 暂时为空
}

let cachedSnapshot: LayoutSnapshot = {}

function getSnapshot(): LayoutSnapshot {
  return cachedSnapshot
}

export function useLayoutStore() {
  return useSyncExternalStore(
    (cb) => layoutStore.subscribe(cb),
    getSnapshot,
    getSnapshot
  )
}
