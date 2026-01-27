import { Dialog } from '../../components/ui/Dialog'
import { SunIcon, MoonIcon, SystemIcon, MaximizeIcon, MinimizeIcon } from '../../components/Icons'
import type { ThemeMode } from '../../hooks'

interface SettingsDialogProps {
  isOpen: boolean
  onClose: () => void
  themeMode: ThemeMode
  onThemeChange: (mode: ThemeMode) => void
  isWideMode?: boolean
  onToggleWideMode?: () => void
}

export function SettingsDialog({
  isOpen,
  onClose,
  themeMode,
  onThemeChange,
  isWideMode,
  onToggleWideMode,
}: SettingsDialogProps) {
  return (
    <Dialog
      isOpen={isOpen}
      onClose={onClose}
      title="Settings"
      width={500}
    >
      <div className="space-y-6">
        {/* Appearance Section */}
        <div>
          <h3 className="text-xs font-semibold text-text-400 mb-3 uppercase tracking-wider">Appearance</h3>
          <div className="bg-bg-100/50 p-1 rounded-xl flex border border-border-200/50">
            <button
              onClick={() => onThemeChange('system')}
              className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-sm font-medium transition-all ${
                themeMode === 'system'
                  ? 'bg-bg-000 text-text-100 shadow-sm ring-1 ring-border-200/50'
                  : 'text-text-400 hover:text-text-200 hover:bg-bg-200/50'
              }`}
            >
              <SystemIcon />
              <span>Auto</span>
            </button>
            <button
              onClick={() => onThemeChange('light')}
              className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-sm font-medium transition-all ${
                themeMode === 'light'
                  ? 'bg-bg-000 text-text-100 shadow-sm ring-1 ring-border-200/50'
                  : 'text-text-400 hover:text-text-200 hover:bg-bg-200/50'
              }`}
            >
              <SunIcon />
              <span>Light</span>
            </button>
            <button
              onClick={() => onThemeChange('dark')}
              className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-sm font-medium transition-all ${
                themeMode === 'dark'
                  ? 'bg-bg-000 text-text-100 shadow-sm ring-1 ring-border-200/50'
                  : 'text-text-400 hover:text-text-200 hover:bg-bg-200/50'
              }`}
            >
              <MoonIcon />
              <span>Dark</span>
            </button>
          </div>
        </div>

        {/* Layout Section */}
        {onToggleWideMode && (
          <div>
            <h3 className="text-xs font-semibold text-text-400 mb-3 uppercase tracking-wider">Layout</h3>
            <div 
              className="flex items-center justify-between p-3 rounded-xl border border-border-200/50 bg-bg-000 hover:border-border-300 transition-all cursor-pointer group"
              onClick={onToggleWideMode}
            >
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-bg-100 text-text-300 group-hover:text-text-100 transition-colors">
                   {isWideMode ? <MinimizeIcon /> : <MaximizeIcon />}
                </div>
                <div>
                  <div className="text-sm font-medium text-text-100">Wide Mode</div>
                  <div className="text-xs text-text-400">Expand chat to full width</div>
                </div>
              </div>
              <div className={`w-11 h-6 rounded-full p-1 transition-colors duration-200 ease-in-out ${isWideMode ? 'bg-accent-main-100' : 'bg-bg-200'}`}>
                <div className={`w-4 h-4 bg-white rounded-full shadow-sm transition-transform duration-200 ease-in-out ${isWideMode ? 'translate-x-5' : 'translate-x-0'}`} />
              </div>
            </div>
          </div>
        )}
        
        <div className="pt-6 border-t border-border-100/50 text-center">
           <p className="text-xs text-text-400">Claude Chat UI • v0.1.0</p>
        </div>
      </div>
    </Dialog>
  )
}
