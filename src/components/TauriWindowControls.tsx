import { useCallback } from 'react'
import { withCurrentWindow, isTauri } from '../utils/tauri'

type WindowAction = 'close' | 'minimize' | 'maximize'

const CONTROL_BUTTONS: Array<{
  action: WindowAction
  label: string
  color: string
}> = [
  { action: 'close', label: 'Close window', color: '#fb5f57' },
  { action: 'minimize', label: 'Minimize window', color: '#fdbc2e' },
  { action: 'maximize', label: 'Toggle maximize', color: '#28c840' },
]

function ControlGlyph({ action }: { action: WindowAction }) {
  if (action === 'minimize') {
    return (
      <svg viewBox="0 0 10 10" className="h-2 w-2 text-black/55" aria-hidden="true">
        <path d="M2 5h6" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
      </svg>
    )
  }

  if (action === 'maximize') {
    return (
      <svg viewBox="0 0 10 10" className="h-2 w-2 text-black/55" aria-hidden="true">
        <rect x="2.2" y="2.2" width="5.6" height="5.6" rx="0.9" fill="none" stroke="currentColor" strokeWidth="1.1" />
      </svg>
    )
  }

  return (
    <svg viewBox="0 0 10 10" className="h-2 w-2 text-black/55" aria-hidden="true">
      <path d="M2.4 2.4 7.6 7.6M7.6 2.4 2.4 7.6" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  )
}

export function TauriWindowControls() {
  const handleAction = useCallback((action: WindowAction) => {
    void withCurrentWindow(async (currentWindow) => {
      if (action === 'close') {
        await currentWindow.close()
        return
      }

      if (action === 'minimize') {
        await currentWindow.minimize()
        return
      }

      await currentWindow.toggleMaximize()
    })
  }, [])

  if (!isTauri()) {
    return null
  }

  return (
    <div className="flex items-center gap-1" data-no-window-drag="true">
      {CONTROL_BUTTONS.map(({ action, label, color }) => (
        <button
          key={action}
          type="button"
          aria-label={label}
          title={label}
          onClick={() => handleAction(action)}
          className="group flex h-3 w-3 items-center justify-center rounded-full shadow-[inset_0_0_0_0.5px_rgba(0,0,0,0.18)] transition-transform hover:scale-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-main-100/70"
          style={{ backgroundColor: color }}
        >
          <span className="opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
            <ControlGlyph action={action} />
          </span>
        </button>
      ))}
    </div>
  )
}
