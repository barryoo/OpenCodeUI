import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import {
  AlertCircleIcon,
  CheckIcon,
  CircleIcon,
  CpuIcon,
  GlobeIcon,
  KeyIcon,
  PlugIcon,
  RetryIcon,
  SettingsIcon,
  SpinnerIcon,
} from '../../components/Icons'
import { DropdownMenu, IconButton } from '../../components/ui'
import { getConfig, getLspStatus, getMcpStatus, type LSPStatus } from '../../api'
import { useDirectory, useServerStore } from '../../hooks'
import type { Config } from '../../types/api/config'
import type { MCPStatus } from '../../types/api/mcp'

type StatusTab = 'servers' | 'mcp' | 'lsp' | 'plugins'

interface LoadState {
  loading: boolean
  error: string | null
}

const TAB_LIST: Array<{ id: StatusTab; label: string }> = [
  { id: 'servers', label: '服务器' },
  { id: 'mcp', label: 'MCP' },
  { id: 'lsp', label: 'LSP' },
  { id: 'plugins', label: '插件' },
]

function getServerDotClass(status?: string) {
  switch (status) {
    case 'online':
      return 'bg-success-100'
    case 'checking':
      return 'bg-warning-100 animate-pulse'
    case 'unauthorized':
      return 'bg-warning-100'
    case 'offline':
    case 'error':
      return 'bg-danger-100'
    default:
      return 'bg-border-200'
  }
}

function getMcpTone(status: MCPStatus) {
  switch (status.status) {
    case 'connected':
      return {
        dotClass: 'bg-success-100',
        textClass: 'text-success-100',
        label: 'Connected',
        icon: CheckIcon,
        detail: null,
      }
    case 'disabled':
      return {
        dotClass: 'bg-border-200',
        textClass: 'text-text-400',
        label: 'Disabled',
        icon: CircleIcon,
        detail: null,
      }
    case 'failed':
      return {
        dotClass: 'bg-danger-100',
        textClass: 'text-danger-100',
        label: 'Failed',
        icon: AlertCircleIcon,
        detail: status.error,
      }
    case 'needs_auth':
      return {
        dotClass: 'bg-warning-100',
        textClass: 'text-warning-100',
        label: 'Needs Auth',
        icon: KeyIcon,
        detail: null,
      }
    case 'needs_client_registration':
      return {
        dotClass: 'bg-warning-100',
        textClass: 'text-warning-100',
        label: 'Needs Registration',
        icon: KeyIcon,
        detail: status.error,
      }
    default:
      return {
        dotClass: 'bg-border-200',
        textClass: 'text-text-400',
        label: 'Unknown',
        icon: CircleIcon,
        detail: null,
      }
  }
}

function getLspTone(status: LSPStatus['status']) {
  return status === 'connected'
    ? { dotClass: 'bg-success-100', textClass: 'text-success-100', label: 'Connected' }
    : { dotClass: 'bg-danger-100', textClass: 'text-danger-100', label: 'Error' }
}

function formatLatency(latency?: number) {
  if (latency === undefined) return null
  return `${latency}ms`
}

function basename(path: string) {
  const trimmed = path.replace(/[\\/]+$/, '')
  const parts = trimmed.split(/[\\/]/)
  return parts[parts.length - 1] || path
}

export function StatusPopover() {
  const { currentDirectory } = useDirectory()
  const { servers, activeServer, healthMap, checkAllHealth } = useServerStore()
  const [isOpen, setIsOpen] = useState(false)
  const [activeTab, setActiveTab] = useState<StatusTab>('servers')
  const [mcpState, setMcpState] = useState<LoadState>({ loading: false, error: null })
  const [lspState, setLspState] = useState<LoadState>({ loading: false, error: null })
  const [pluginState, setPluginState] = useState<LoadState>({ loading: false, error: null })
  const [mcpStatus, setMcpStatus] = useState<Record<string, MCPStatus>>({})
  const [lspItems, setLspItems] = useState<LSPStatus[]>([])
  const [config, setConfig] = useState<Config | null>(null)

  const triggerRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  const serverEntries = useMemo(() => {
    return [...servers].sort((a, b) => {
      if (a.id === activeServer?.id) return -1
      if (b.id === activeServer?.id) return 1
      return a.name.localeCompare(b.name)
    })
  }, [activeServer?.id, servers])

  const mcpEntries = useMemo(() => {
    return Object.entries(mcpStatus).sort(([a], [b]) => a.localeCompare(b))
  }, [mcpStatus])

  const pluginItems = config?.plugin ?? []
  const connectedMcpCount = mcpEntries.filter(([, value]) => value.status === 'connected').length
  const hasServerIssue = serverEntries.some((server) => {
    const status = healthMap.get(server.id)?.status
    return status === 'offline' || status === 'error' || status === 'unauthorized'
  })
  const hasMcpIssue = mcpEntries.some(([, value]) => value.status !== 'connected' && value.status !== 'disabled')
  const overallHealthy = !hasServerIssue && !hasMcpIssue

  useEffect(() => {
    if (!isOpen) return

    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node
      if (menuRef.current?.contains(target)) return
      if (triggerRef.current?.contains(target)) return
      setIsOpen(false)
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setIsOpen(false)
    }

    document.addEventListener('mousedown', handleClickOutside)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [isOpen])

  const loadServers = useCallback(async () => {
    await checkAllHealth()
  }, [checkAllHealth])

  const loadMcp = useCallback(async () => {
    setMcpState({ loading: true, error: null })
    try {
      const next = await getMcpStatus(currentDirectory)
      setMcpStatus(next)
      setMcpState({ loading: false, error: null })
    } catch (error) {
      setMcpState({ loading: false, error: error instanceof Error ? error.message : '加载 MCP 状态失败' })
    }
  }, [currentDirectory])

  const loadLsp = useCallback(async () => {
    setLspState({ loading: true, error: null })
    try {
      const next = await getLspStatus(currentDirectory)
      setLspItems(next)
      setLspState({ loading: false, error: null })
    } catch (error) {
      setLspState({ loading: false, error: error instanceof Error ? error.message : '加载 LSP 状态失败' })
    }
  }, [currentDirectory])

  const loadPlugins = useCallback(async () => {
    setPluginState({ loading: true, error: null })
    try {
      const next = await getConfig(currentDirectory)
      setConfig(next)
      setPluginState({ loading: false, error: null })
    } catch (error) {
      setPluginState({ loading: false, error: error instanceof Error ? error.message : '加载插件配置失败' })
    }
  }, [currentDirectory])

  const refreshAll = useCallback(async () => {
    await Promise.all([loadServers(), loadMcp(), loadLsp(), loadPlugins()])
  }, [loadLsp, loadMcp, loadPlugins, loadServers])

  useEffect(() => {
    if (!isOpen) return
    void refreshAll()
  }, [isOpen, refreshAll])

  const tabCounts = useMemo<Record<StatusTab, number>>(() => ({
    servers: serverEntries.length,
    mcp: connectedMcpCount,
    lsp: lspItems.length,
    plugins: pluginItems.length,
  }), [connectedMcpCount, lspItems.length, pluginItems.length, serverEntries.length])

  return (
    <div className="relative hidden md:block">
      <IconButton
        ref={triggerRef}
        aria-label="Open system status"
        onClick={() => setIsOpen((value) => !value)}
        className={`relative transition-colors ${isOpen ? 'text-accent-main-100 bg-bg-200/50' : 'text-text-400 hover:text-text-100 hover:bg-bg-200/50'}`}
        title="服务器 / MCP / LSP / 插件"
      >
        <CpuIcon size={18} />
        <span
          className={`absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full ${overallHealthy ? 'bg-success-100' : 'bg-warning-100'}`}
        />
      </IconButton>

      <DropdownMenu
        triggerRef={triggerRef}
        isOpen={isOpen}
        align="right"
        minWidth="360px"
        maxWidth="min(360px, calc(100vw - 24px))"
        className="!p-0 overflow-hidden"
      >
        <div ref={menuRef} className="w-[360px] max-w-[calc(100vw-24px)] bg-bg-000/98">
          <div className="flex items-center justify-between border-b border-border-200/50 px-3 py-2.5">
            <div className="flex items-center gap-2 text-sm font-medium text-text-100">
              <CpuIcon size={14} />
              <span>运行状态</span>
            </div>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => void refreshAll()}
                className="rounded-md p-1 text-text-400 transition-colors hover:bg-bg-200/60 hover:text-text-100"
                title="刷新"
              >
                <RetryIcon size={14} className={mcpState.loading || lspState.loading || pluginState.loading ? 'animate-spin' : ''} />
              </button>
              <div className={`flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] ${overallHealthy ? 'bg-success-100/10 text-success-100' : 'bg-warning-bg text-warning-100'}`}>
                <span className={`h-1.5 w-1.5 rounded-full ${overallHealthy ? 'bg-success-100' : 'bg-warning-100'}`} />
                {overallHealthy ? '正常' : '需关注'}
              </div>
            </div>
          </div>

          <div className="flex gap-1 border-b border-border-200/50 px-2 py-2">
            {TAB_LIST.map((tab) => {
              const selected = activeTab === tab.id
              const count = tabCounts[tab.id]
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex min-w-0 items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs transition-colors ${selected ? 'bg-bg-200 text-text-100' : 'text-text-400 hover:bg-bg-200/50 hover:text-text-100'}`}
                >
                  {count > 0 && <span className="text-[11px] text-text-500">{count}</span>}
                  <span>{tab.label}</span>
                </button>
              )
            })}
          </div>

          <div className="max-h-[420px] overflow-y-auto px-2 pb-2 pt-2">
            {activeTab === 'servers' && (
              <div className="rounded-xl border border-border-200/40 bg-bg-100/80 p-2">
                {serverEntries.length === 0 ? (
                  <EmptyState label="暂无服务器配置" />
                ) : (
                  <div className="space-y-1">
                    {serverEntries.map((server) => {
                      const health = healthMap.get(server.id)
                      const isActive = server.id === activeServer?.id
                      return (
                        <div key={server.id} className="rounded-lg px-2.5 py-2 transition-colors hover:bg-bg-200/40">
                          <div className="flex items-start gap-2">
                            <span className={`mt-1 h-2 w-2 shrink-0 rounded-full ${getServerDotClass(health?.status)}`} />
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2">
                                <span className="truncate text-sm font-medium text-text-100">{server.name}</span>
                                {isActive && <span className="rounded-md bg-accent-main-100/10 px-1.5 py-0.5 text-[10px] text-accent-main-100">当前</span>}
                              </div>
                              <div className="mt-1 truncate text-xs text-text-400">{server.url}</div>
                              <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-text-500">
                                <span>{health?.version ? `v${health.version}` : '未获取版本'}</span>
                                {formatLatency(health?.latency) && <span>{formatLatency(health?.latency)}</span>}
                                <span>{health?.status === 'unauthorized' ? '需要认证' : health?.status ?? '未检查'}</span>
                              </div>
                            </div>
                            <GlobeIcon size={14} className="mt-0.5 shrink-0 text-text-500" />
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )}

            {activeTab === 'mcp' && (
              <StatusCard loading={mcpState.loading} error={mcpState.error} emptyLabel="未配置 MCP 服务器" empty={!mcpEntries.length}>
                <div className="space-y-1">
                  {mcpEntries.map(([name, status]) => {
                    const tone = getMcpTone(status)
                    const StatusIcon = tone.icon
                    return (
                      <div key={name} className="rounded-lg px-2.5 py-2 transition-colors hover:bg-bg-200/40">
                        <div className="flex items-start gap-2">
                          <span className={`mt-1 h-2 w-2 shrink-0 rounded-full ${tone.dotClass}`} />
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <span className="truncate text-sm font-medium text-text-100">{name}</span>
                              <span className={`text-[11px] ${tone.textClass}`}>{tone.label}</span>
                            </div>
                            {tone.detail && <div className="mt-1 break-words text-xs text-text-400">{tone.detail}</div>}
                          </div>
                          <StatusIcon size={14} className={`mt-0.5 shrink-0 ${tone.textClass}`} />
                        </div>
                      </div>
                    )
                  })}
                </div>
              </StatusCard>
            )}

            {activeTab === 'lsp' && (
              <StatusCard loading={lspState.loading} error={lspState.error} emptyLabel="当前目录还没有激活的 LSP" empty={!lspItems.length}>
                <div className="space-y-1">
                  {lspItems.map((item) => {
                    const tone = getLspTone(item.status)
                    return (
                      <div key={`${item.id}:${item.root}`} className="rounded-lg px-2.5 py-2 transition-colors hover:bg-bg-200/40">
                        <div className="flex items-start gap-2">
                          <span className={`mt-1 h-2 w-2 shrink-0 rounded-full ${tone.dotClass}`} />
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <span className="truncate text-sm font-medium text-text-100">{item.name || item.id}</span>
                              <span className={`text-[11px] ${tone.textClass}`}>{tone.label}</span>
                            </div>
                            <div className="mt-1 truncate text-xs text-text-400">{basename(item.root)}</div>
                            <div className="mt-1 truncate text-[11px] text-text-500">{item.root}</div>
                          </div>
                          <PlugIcon size={14} className={`mt-0.5 shrink-0 ${tone.textClass}`} />
                        </div>
                      </div>
                    )
                  })}
                </div>
              </StatusCard>
            )}

            {activeTab === 'plugins' && (
              <StatusCard loading={pluginState.loading} error={pluginState.error} emptyLabel="opencode.json 中未配置插件" empty={!pluginItems.length}>
                <div className="space-y-1">
                  {pluginItems.map((plugin) => (
                    <div key={plugin} className="rounded-lg px-2.5 py-2 transition-colors hover:bg-bg-200/40">
                      <div className="flex items-start gap-2">
                        <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-success-100" />
                        <div className="min-w-0 flex-1">
                          <div className="break-all text-sm font-medium text-text-100">{plugin}</div>
                          <div className="mt-1 text-[11px] text-text-500">已从当前配置加载</div>
                        </div>
                        <SettingsIcon size={14} className="mt-0.5 shrink-0 text-text-500" />
                      </div>
                    </div>
                  ))}
                </div>
              </StatusCard>
            )}
          </div>
        </div>
      </DropdownMenu>
    </div>
  )
}

function StatusCard({
  loading,
  error,
  empty,
  emptyLabel,
  children,
}: {
  loading: boolean
  error: string | null
  empty: boolean
  emptyLabel: string
  children: ReactNode
}) {
  return (
    <div className="rounded-xl border border-border-200/40 bg-bg-100/80 p-2">
      {loading ? (
        <div className="flex min-h-24 items-center justify-center gap-2 text-sm text-text-400">
          <SpinnerIcon size={16} className="animate-spin" />
          <span>加载中...</span>
        </div>
      ) : error ? (
        <div className="flex min-h-24 items-center justify-center gap-2 px-4 text-center text-sm text-danger-100">
          <AlertCircleIcon size={16} />
          <span>{error}</span>
        </div>
      ) : empty ? (
        <EmptyState label={emptyLabel} />
      ) : (
        children
      )}
    </div>
  )
}

function EmptyState({ label }: { label: string }) {
  return (
    <div className="flex min-h-24 items-center justify-center px-4 text-center text-sm text-text-400">
      {label}
    </div>
  )
}
