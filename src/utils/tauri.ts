// ============================================
// Tauri 平台检测与窗口工具
// ============================================

let windowApiPromise: Promise<typeof import('@tauri-apps/api/window')> | null = null

/**
 * 检测当前是否运行在 Tauri 环境中
 * 通过检查 window.__TAURI_INTERNALS__ 来判断
 */
export function isTauri(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window
}

export function isTauriMacOS(): boolean {
  if (!isTauri() || typeof navigator === 'undefined') {
    return false
  }

  const platform = (navigator as Navigator & { userAgentData?: { platform?: string } }).userAgentData?.platform || navigator.platform || ''
  return platform.toLowerCase().includes('mac')
}

async function getWindowApi() {
  if (!windowApiPromise) {
    windowApiPromise = import('@tauri-apps/api/window')
  }

  return windowApiPromise
}

function shouldIgnoreWindowDrag(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) {
    return true
  }

  return Boolean(
    target.closest([
      '[data-no-window-drag="true"]',
      'button',
      'a',
      'input',
      'textarea',
      'select',
      'summary',
      '[role="button"]',
      '[contenteditable="true"]',
    ].join(','))
  )
}

export async function handleWindowTitlebarMouseDown(
  target: EventTarget | null,
  button = 0,
  detail = 1,
): Promise<void> {
  if (!isTauri() || button !== 0 || shouldIgnoreWindowDrag(target)) {
    return
  }

  const { getCurrentWindow } = await getWindowApi()
  const currentWindow = getCurrentWindow()

  if (detail === 2) {
    await currentWindow.toggleMaximize()
    return
  }

  await currentWindow.startDragging()
}

export async function withCurrentWindow<T>(handler: (window: ReturnType<(typeof import('@tauri-apps/api/window'))['getCurrentWindow']>) => Promise<T>) {
  if (!isTauri()) {
    return undefined
  }

  const { getCurrentWindow } = await getWindowApi()
  return handler(getCurrentWindow())
}
