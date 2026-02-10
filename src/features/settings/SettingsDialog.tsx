import { useState, useEffect, useCallback, useRef } from 'react'
import { Dialog } from '../../components/ui/Dialog'
import { Button } from '../../components/ui/Button'
import { 
  SunIcon, MoonIcon, SystemIcon, MaximizeIcon, MinimizeIcon, 
  PathAutoIcon, PathUnixIcon, PathWindowsIcon,
  GlobeIcon, PlusIcon, TrashIcon, CheckIcon, WifiIcon, WifiOffIcon, SpinnerIcon, KeyIcon,
  SettingsIcon, KeyboardIcon, CloseIcon, BellIcon
} from '../../components/Icons'
import { usePathMode, useServerStore, useIsMobile, useNotification } from '../../hooks'
import { autoApproveStore } from '../../store'
import { KeybindingsSection } from './KeybindingsSection'
import type { ThemeMode } from '../../hooks'
import type { PathMode } from '../../utils/directoryUtils'
import type { ServerConfig, ServerHealth, ServerAuth } from '../../store/serverStore'

// ============================================
// Types
// ============================================

type SettingsTab = 'general' | 'keybindings'

interface SettingsDialogProps {
  isOpen: boolean
  onClose: () => void
  themeMode: ThemeMode
  onThemeChange: (mode: ThemeMode, event?: React.MouseEvent) => void
  isWideMode?: boolean
  onToggleWideMode?: () => void
  initialTab?: SettingsTab
  // Theme preset
  presetId?: string
  onPresetChange?: (presetId: string, event?: React.MouseEvent) => void
  availablePresets?: { id: string; name: string; description: string }[]
  // Custom CSS
  customCSS?: string
  onCustomCSSChange?: (css: string) => void
}

// ============================================
// Toggle Switch
// ============================================

function Toggle({ enabled, onChange }: { enabled: boolean; onChange: () => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={enabled}
      onClick={(e) => { e.stopPropagation(); onChange() }}
      className={`relative w-11 h-6 rounded-full transition-colors duration-200 
        ${enabled ? 'bg-accent-main-100' : 'bg-bg-300'}`}
    >
      <div className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow-sm transition-transform duration-200 
        ${enabled ? 'translate-x-5' : 'translate-x-0'}`} />
    </button>
  )
}

// ============================================
// SegmentedControl (3-way selector)
// ============================================

interface SegmentedControlProps<T extends string> {
  value: T
  options: { value: T; label: string; icon?: React.ReactNode }[]
  onChange: (value: T, event?: React.MouseEvent) => void
}

function SegmentedControl<T extends string>({ value, options, onChange }: SegmentedControlProps<T>) {
  const activeIndex = options.findIndex(o => o.value === value)
  
  return (
    <div 
      className="bg-bg-100/50 p-0.5 rounded-lg flex border border-border-200/50 relative isolate"
      role="tablist"
      onKeyDown={(e) => {
        if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
          e.preventDefault()
          const dir = e.key === 'ArrowRight' ? 1 : -1
          const next = (activeIndex + dir + options.length) % options.length
          onChange(options[next].value)
        }
      }}
    >
      <div
        className="absolute top-0.5 bottom-0.5 left-0.5 bg-bg-000 rounded-md shadow-sm ring-1 ring-border-200/50 transition-transform duration-300 ease-out -z-10"
        style={{
          width: `calc((100% - 4px) / ${options.length})`,
          transform: `translateX(${activeIndex * 100}%)`
        }}
      />
      {options.map(opt => (
        <button
          key={opt.value}
          role="tab"
          aria-selected={opt.value === value}
          tabIndex={opt.value === value ? 0 : -1}
          onClick={(e) => onChange(opt.value, e)}
          className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-md text-[13px] font-medium transition-colors duration-200
            ${opt.value === value ? 'text-text-100' : 'text-text-400 hover:text-text-200'}`}
        >
          {opt.icon}
          <span className="truncate">{opt.label}</span>
        </button>
      ))}
    </div>
  )
}

// ============================================
// SettingRow - generic setting item
// ============================================

interface SettingRowProps {
  label: string
  description?: string
  icon?: React.ReactNode
  children: React.ReactNode
  onClick?: () => void
}

function SettingRow({ label, description, icon, children, onClick }: SettingRowProps) {
  return (
    <div 
      className={`flex items-center justify-between py-3 px-3 -mx-3 rounded-lg transition-colors
        ${onClick ? 'cursor-pointer hover:bg-bg-100/50' : ''}`}
      onClick={onClick}
    >
      <div className="flex items-center gap-3 min-w-0 flex-1">
        {icon && <span className="text-text-400 shrink-0">{icon}</span>}
        <div className="min-w-0">
          <div className="text-[13px] font-medium text-text-100">{label}</div>
          {description && <div className="text-[11px] text-text-400 mt-0.5">{description}</div>}
        </div>
      </div>
      <div className="shrink-0 ml-3">{children}</div>
    </div>
  )
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <div className="text-[11px] font-medium text-text-400 uppercase tracking-wider mb-2 mt-1">{children}</div>
}

function Divider() {
  return <div className="border-t border-border-100/50 my-2" />
}

// ============================================
// Server Item
// ============================================

function ServerItem({ server, health, isActive, onSelect, onDelete, onCheckHealth }: {
  server: ServerConfig
  health: ServerHealth | null
  isActive: boolean
  onSelect: () => void
  onDelete: () => void
  onCheckHealth: () => void
}) {
  const statusIcon = () => {
    if (!health || health.status === 'checking') return <SpinnerIcon size={12} className="animate-spin text-text-400" />
    if (health.status === 'online') return <WifiIcon size={12} className="text-green-500" />
    if (health.status === 'unauthorized') return <KeyIcon size={12} className="text-yellow-500" />
    return <WifiOffIcon size={12} className="text-red-400" />
  }
  
  const statusTitle = () => {
    if (!health) return 'Check health'
    switch (health.status) {
      case 'checking': return 'Checking...'
      case 'online': return `Online (${health.latency}ms)${health.version ? ` v${health.version}` : ''}`
      case 'unauthorized': return 'Invalid credentials'
      case 'offline': return health.error || 'Offline'
      case 'error': return health.error || 'Error'
      default: return 'Unknown'
    }
  }
  
  return (
    <div 
      className={`flex items-center gap-3 p-2.5 rounded-lg border transition-colors cursor-pointer group
        ${isActive 
          ? 'border-accent-main-100/40 bg-accent-main-100/5' 
          : 'border-border-200/40 hover:border-border-300'}`}
      onClick={onSelect}
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect() }}}
    >
      <GlobeIcon size={14} className={isActive ? 'text-accent-main-100' : 'text-text-400'} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <span className="text-[13px] font-medium text-text-100 truncate">{server.name}</span>
          {isActive && <CheckIcon size={12} className="text-accent-main-100 shrink-0" />}
        </div>
        <div className="text-[11px] text-text-400 truncate font-mono">{server.url}</div>
      </div>
      <button 
        className="p-2 rounded hover:bg-bg-200 transition-colors"
        onClick={(e) => { e.stopPropagation(); onCheckHealth() }}
        title={statusTitle()}
      >
        {statusIcon()}
      </button>
      {!server.isDefault && (
        <button 
          className="p-2 rounded text-text-400 hover:text-danger-100 hover:bg-danger-100/10 
                     md:opacity-0 md:group-hover:opacity-100 transition-all"
          onClick={(e) => { e.stopPropagation(); onDelete() }}
          title="Remove"
        >
          <TrashIcon size={12} />
        </button>
      )}
    </div>
  )
}

// ============================================
// Add Server Form
// ============================================

function AddServerForm({ onAdd, onCancel }: { 
  onAdd: (name: string, url: string, auth?: ServerAuth) => void
  onCancel: () => void 
}) {
  const [name, setName] = useState('')
  const [url, setUrl] = useState('')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [showAuth, setShowAuth] = useState(false)
  
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) { setError('Name required'); return }
    if (!url.trim()) { setError('URL required'); return }
    try { new URL(url) } catch { setError('Invalid URL'); return }
    
    const auth: ServerAuth | undefined = (username.trim() && password.trim())
      ? { username: username.trim(), password: password.trim() }
      : undefined
    onAdd(name.trim(), url.trim(), auth)
  }

  const inputCls = "w-full h-8 px-3 text-[13px] bg-bg-000 border border-border-200 rounded-md focus:outline-none focus:border-accent-main-100/50 text-text-100 placeholder:text-text-400"
  
  return (
    <form onSubmit={handleSubmit} className="p-3 rounded-lg border border-border-200 bg-bg-050 space-y-2.5">
      <div>
        <label className="block text-[11px] font-medium text-text-300 mb-1">Name</label>
        <input type="text" value={name} onChange={e => { setName(e.target.value); setError('') }}
          placeholder="My Server" className={inputCls} autoFocus />
      </div>
      <div>
        <label className="block text-[11px] font-medium text-text-300 mb-1">URL</label>
        <input type="text" value={url} onChange={e => { setUrl(e.target.value); setError('') }}
          placeholder="http://192.168.1.100:4096" className={`${inputCls} font-mono`} />
      </div>
      <button type="button" onClick={() => setShowAuth(!showAuth)}
        className="flex items-center gap-1 text-[11px] text-text-400 hover:text-text-200">
        <KeyIcon size={10} /> {showAuth ? 'Hide' : 'Show'} Auth
      </button>
      {showAuth && (
        <div className="space-y-2 pl-3 border-l-2 border-border-200/50">
          <input type="text" value={username} onChange={e => { setUsername(e.target.value); setError('') }}
            placeholder="Username" className={inputCls} />
          <input type="password" value={password} onChange={e => { setPassword(e.target.value); setError('') }}
            placeholder="Password" className={inputCls} />
        </div>
      )}
      {error && <p className="text-[11px] text-danger-100">{error}</p>}
      <div className="flex justify-end gap-2 pt-1">
        <Button type="button" variant="ghost" size="sm" onClick={onCancel}>Cancel</Button>
        <Button type="submit" size="sm">Add</Button>
      </div>
    </form>
  )
}

// ============================================
// General Settings
// ============================================

// ============================================
// Theme Preset Card
// ============================================

const PRESET_PREVIEW_COLORS: Record<string, { bg: string; accent: string; text: string }> = {
  claude: { bg: '#f3f0eb', accent: '#e87c2a', text: '#2d2a26' },
  breeze: { bg: '#f3f5f7', accent: '#2ba5a5', text: '#212d36' },
  custom: { bg: '#f0f0f0', accent: '#888888', text: '#333333' },
}

function PresetCard({ id, name, description, isActive, onClick }: {
  id: string; name: string; description: string; isActive: boolean
  onClick: (e: React.MouseEvent) => void
}) {
  const colors = PRESET_PREVIEW_COLORS[id] || PRESET_PREVIEW_COLORS.custom
  return (
    <button
      onClick={onClick}
      className={`flex items-start gap-3 p-3 rounded-lg border transition-all text-left w-full
        ${isActive
          ? 'border-accent-main-100/60 bg-accent-main-100/5 ring-1 ring-accent-main-100/20'
          : 'border-border-200/50 hover:border-border-300 hover:bg-bg-100/50'
        }`}
    >
      {/* Color preview swatch */}
      <div
        className="shrink-0 w-8 h-8 rounded-md border border-border-200/30 overflow-hidden relative mt-0.5"
        style={{ backgroundColor: colors.bg }}
      >
        <div className="absolute bottom-0 left-0 right-0 h-2" style={{ backgroundColor: colors.accent }} />
        <div className="absolute top-1.5 left-1.5 w-3 h-0.5 rounded-full" style={{ backgroundColor: colors.text, opacity: 0.6 }} />
        <div className="absolute top-3 left-1.5 w-2 h-0.5 rounded-full" style={{ backgroundColor: colors.text, opacity: 0.3 }} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className="text-[13px] font-medium text-text-100">{name}</span>
          {isActive && <CheckIcon size={12} className="text-accent-main-100 shrink-0" />}
        </div>
        <div className="text-[11px] text-text-400 mt-0.5">{description}</div>
      </div>
    </button>
  )
}

// ============================================
// Custom CSS Editor
// ============================================

function CustomCSSEditor({ value, onChange }: { value: string; onChange: (css: string) => void }) {
  const [localValue, setLocalValue] = useState(value)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  
  // Sync external changes
  useEffect(() => { setLocalValue(value) }, [value])
  
  const handleChange = (newVal: string) => {
    setLocalValue(newVal)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => onChange(newVal), 400)
  }
  
  const placeholder = `/* Override CSS variables to create your theme */
:root:root {
  /* Backgrounds */
  --bg-000: 220 20% 98%;
  --bg-100: 220 15% 95%;
  --bg-200: 220 12% 92%;
  --bg-300: 220 10% 88%;
  --bg-400: 220 8% 84%;

  /* Text */
  --text-100: 220 15% 15%;
  --text-200: 220 10% 35%;

  /* Accent */
  --accent-brand: 260 70% 55%;
  --accent-main-100: 260 70% 55%;
}`

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div className="text-[11px] text-text-400">
          Custom CSS applied globally. Use <code className="text-[10px] px-1 py-0.5 bg-bg-200 rounded font-mono">:root:root</code> to override theme variables.
        </div>
      </div>
      <textarea
        value={localValue}
        onChange={(e) => handleChange(e.target.value)}
        placeholder={placeholder}
        spellCheck={false}
        className="w-full h-48 px-3 py-2 text-[12px] font-mono bg-bg-200/50 border border-border-200 rounded-lg 
          focus:outline-none focus:border-accent-main-100/50 text-text-100 placeholder:text-text-500 
          resize-y custom-scrollbar leading-relaxed"
      />
      {localValue.trim() && (
        <div className="flex justify-end">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => { setLocalValue(''); onChange('') }}
          >
            Clear
          </Button>
        </div>
      )}
    </div>
  )
}

// ============================================
// General Settings
// ============================================

function GeneralSettings({ themeMode, onThemeChange, isWideMode, onToggleWideMode, presetId, onPresetChange, availablePresets, customCSS, onCustomCSSChange }: {
  themeMode: ThemeMode
  onThemeChange: (mode: ThemeMode, event?: React.MouseEvent) => void
  isWideMode?: boolean
  onToggleWideMode?: () => void
  presetId?: string
  onPresetChange?: (presetId: string, event?: React.MouseEvent) => void
  availablePresets?: { id: string; name: string; description: string }[]
  customCSS?: string
  onCustomCSSChange?: (css: string) => void
}) {
  const { pathMode, setPathMode, effectiveStyle, detectedStyle, isAutoMode } = usePathMode()
  const [autoApprove, setAutoApprove] = useState(autoApproveStore.enabled)
  const [addingServer, setAddingServer] = useState(false)
  const { servers, activeServer, addServer, removeServer, setActiveServer, checkHealth, checkAllHealth, getHealth } = useServerStore()
  const { enabled: notificationsEnabled, setEnabled: setNotificationsEnabled, supported: notificationsSupported, permission: notificationPermission } = useNotification()
  
  useEffect(() => { checkAllHealth() }, [checkAllHealth])

  const handleAutoApprove = () => {
    const v = !autoApprove
    setAutoApprove(v)
    autoApproveStore.setEnabled(v)
    if (!v) autoApproveStore.clearAllRules()
  }

  return (
    <div>
      {/* Theme Preset */}
      {availablePresets && availablePresets.length > 0 && (
        <>
          <SectionLabel>Theme</SectionLabel>
          <div className="space-y-1.5 mb-3">
            {availablePresets.map(p => (
              <PresetCard
                key={p.id}
                id={p.id}
                name={p.name}
                description={p.description}
                isActive={presetId === p.id}
                onClick={(e) => onPresetChange?.(p.id, e)}
              />
            ))}
          </div>
          
          {/* Custom CSS Editor - only show when custom preset is selected */}
          {presetId === 'custom' && onCustomCSSChange && (
            <CustomCSSEditor value={customCSS || ''} onChange={onCustomCSSChange} />
          )}
        </>
      )}

      {/* Color Mode (Light/Dark/Auto) */}
      <SectionLabel>Appearance</SectionLabel>
      <SegmentedControl
        value={themeMode}
        options={[
          { value: 'system', label: 'Auto', icon: <SystemIcon size={14} /> },
          { value: 'light', label: 'Light', icon: <SunIcon size={14} /> },
          { value: 'dark', label: 'Dark', icon: <MoonIcon size={14} /> },
        ]}
        onChange={(v, e) => onThemeChange(v, e)}
      />
      
      <Divider />

      {/* Path Style */}
      <SectionLabel>Path Style</SectionLabel>
      <SegmentedControl
        value={pathMode}
        options={[
          { value: 'auto', label: 'Auto', icon: <PathAutoIcon size={14} /> },
          { value: 'unix', label: 'Unix /', icon: <PathUnixIcon size={14} /> },
          { value: 'windows', label: 'Win \\', icon: <PathWindowsIcon size={14} /> },
        ]}
        onChange={(v) => setPathMode(v as PathMode)}
      />
      {isAutoMode && (
        <div className="text-[11px] text-text-400 mt-1.5 px-1">
          Using <span className="font-mono text-text-300">{effectiveStyle === 'windows' ? '\\' : '/'}</span>
          {detectedStyle && <>, detected <span className="font-mono text-text-300">{detectedStyle === 'windows' ? 'Windows' : 'Unix'}</span></>}
        </div>
      )}

      <Divider />
      
      {/* Layout & Features */}
      <SectionLabel>Preferences</SectionLabel>
      {onToggleWideMode && (
        <SettingRow 
          label="Wide Mode" 
          description="Expand chat to full width"
          icon={isWideMode ? <MinimizeIcon size={14} /> : <MaximizeIcon size={14} />}
          onClick={onToggleWideMode}
        >
          <Toggle enabled={!!isWideMode} onChange={onToggleWideMode} />
        </SettingRow>
      )}
      <SettingRow
        label="Auto-Approve"
        description="Use local rules for always, send once to server"
        onClick={handleAutoApprove}
      >
        <Toggle enabled={autoApprove} onChange={handleAutoApprove} />
      </SettingRow>
      {notificationsSupported && (
        <SettingRow
          label="Notifications"
          description={notificationPermission === 'denied' ? 'Blocked by browser' : 'Notify when AI completes a response'}
          icon={<BellIcon size={14} />}
          onClick={() => notificationPermission !== 'denied' && setNotificationsEnabled(!notificationsEnabled)}
        >
          <Toggle 
            enabled={notificationsEnabled && notificationPermission !== 'denied'} 
            onChange={() => notificationPermission !== 'denied' && setNotificationsEnabled(!notificationsEnabled)} 
          />
        </SettingRow>
      )}

      <Divider />

      {/* Servers */}
      <div className="flex items-center justify-between mb-2 mt-1">
        <SectionLabel>Servers</SectionLabel>
        {!addingServer && (
          <button onClick={() => setAddingServer(true)}
            className="flex items-center gap-1 text-[11px] text-accent-main-100 hover:text-accent-main-200">
            <PlusIcon size={10} /> Add
          </button>
        )}
      </div>
      <div className="space-y-1.5">
        {servers.map(s => (
          <ServerItem key={s.id} server={s} health={getHealth(s.id)} isActive={activeServer?.id === s.id}
            onSelect={() => setActiveServer(s.id)} onDelete={() => removeServer(s.id)} onCheckHealth={() => checkHealth(s.id)} />
        ))}
        {addingServer && (
          <AddServerForm
            onAdd={(n, u, a) => { const s = addServer({ name: n, url: u, auth: a }); setAddingServer(false); checkHealth(s.id) }}
            onCancel={() => setAddingServer(false)}
          />
        )}
      </div>
    </div>
  )
}

// ============================================
// Nav Tabs
// ============================================

const TABS: { id: SettingsTab; label: string; icon: React.ReactNode }[] = [
  { id: 'general', label: 'General', icon: <SettingsIcon size={15} /> },
  { id: 'keybindings', label: 'Shortcuts', icon: <KeyboardIcon size={15} /> },
]

// ============================================
// Main Settings Dialog
// ============================================

export function SettingsDialog({
  isOpen, onClose, themeMode, onThemeChange, isWideMode, onToggleWideMode, initialTab = 'general',
  presetId, onPresetChange, availablePresets, customCSS, onCustomCSSChange,
}: SettingsDialogProps) {
  const [tab, setTab] = useState<SettingsTab>(initialTab)
  const isMobile = useIsMobile()
  
  useEffect(() => { if (isOpen) setTab(initialTab) }, [isOpen, initialTab])

  // Tab keyboard navigation
  const handleTabKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      const dir = e.key === 'ArrowDown' ? 1 : -1
      const ids = TABS.map(t => t.id)
      const next = (ids.indexOf(tab) + dir + ids.length) % ids.length
      setTab(ids[next])
    }
  }, [tab])

  // 移动端：顶部 tab 切换 + 全屏内容
  if (isMobile) {
    return (
      <Dialog isOpen={isOpen} onClose={onClose} title="" width="100%" showCloseButton={false}>
        <div className="flex flex-col -m-5" style={{ height: '80vh' }}>
          {/* Top: Title + Close */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-border-100/50 shrink-0">
            <div className="text-sm font-semibold text-text-100">Settings</div>
            <button
              onClick={onClose}
              className="p-2 text-text-400 hover:text-text-200 hover:bg-bg-100 rounded-md transition-colors -mr-1"
            >
              <CloseIcon size={18} />
            </button>
          </div>

          {/* Tab Bar - 横向排列 */}
          <div className="flex items-center gap-1 px-3 py-2 border-b border-border-100/50 shrink-0">
            {TABS.map(t => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`flex items-center gap-2 px-3 py-2 rounded-lg text-[13px] font-medium transition-colors
                  ${t.id === tab
                    ? 'bg-bg-100 text-text-100'
                    : 'text-text-400 active:bg-bg-100/50'}`}
              >
                {t.icon}
                {t.label}
              </button>
            ))}
          </div>

          {/* Content */}
          <div className="flex-1 min-h-0 py-4 px-4 overflow-y-auto custom-scrollbar">
            {tab === 'general' && (
              <GeneralSettings
                themeMode={themeMode}
                onThemeChange={onThemeChange}
                isWideMode={isWideMode}
                onToggleWideMode={onToggleWideMode}
                presetId={presetId}
                onPresetChange={onPresetChange}
                availablePresets={availablePresets}
                customCSS={customCSS}
                onCustomCSSChange={onCustomCSSChange}
              />
            )}
            {tab === 'keybindings' && <KeybindingsSection />}
          </div>
        </div>
      </Dialog>
    )
  }

  // 桌面端：左侧导航 + 右侧内容
  return (
    <Dialog isOpen={isOpen} onClose={onClose} title="" width={680} showCloseButton={false}>
      <div className="flex h-[520px] -m-5">
        {/* Left Nav */}
        <nav className="w-[180px] shrink-0 border-r border-border-100/50 py-3 px-2 flex flex-col" onKeyDown={handleTabKeyDown}>
          <div className="text-sm font-semibold text-text-100 px-3 mb-4">Settings</div>
          <div className="space-y-0.5">
            {TABS.map(t => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                tabIndex={t.id === tab ? 0 : -1}
                className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-[13px] font-medium transition-colors
                  ${t.id === tab
                    ? 'bg-bg-100 text-text-100'
                    : 'text-text-400 hover:text-text-200 hover:bg-bg-100/50'}`}
              >
                {t.icon}
                {t.label}
              </button>
            ))}
          </div>
          
          <div className="mt-auto pt-3 px-3 text-[10px] text-text-400">v0.1.0</div>
        </nav>

        {/* Right Content */}
        <div className="flex-1 min-w-0 py-4 px-5 overflow-y-auto custom-scrollbar">
          {tab === 'general' && (
            <GeneralSettings
              themeMode={themeMode}
              onThemeChange={onThemeChange}
              isWideMode={isWideMode}
              onToggleWideMode={onToggleWideMode}
              presetId={presetId}
              onPresetChange={onPresetChange}
              availablePresets={availablePresets}
              customCSS={customCSS}
              onCustomCSSChange={onCustomCSSChange}
            />
          )}
          {tab === 'keybindings' && <KeybindingsSection />}
        </div>
      </div>
    </Dialog>
  )
}
