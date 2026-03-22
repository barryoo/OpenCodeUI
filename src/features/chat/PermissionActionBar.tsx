// ============================================
// PermissionActionBar - 统一的权限操作栏
// 同时用于底部切换区（isSticky=false，默认）
// 和消息区底部吸附版（isSticky=true，保留备用）
// ============================================

import { memo } from 'react'
import { PermissionListIcon, HandIcon, CheckIcon, CloseIcon, ChevronDownIcon } from '../../components/Icons'
import { autoApproveStore } from '../../store'
import { useIsMobile } from '../../hooks'
import { formatToolName } from '../../utils/toolUtils'
import type { ApiPermissionRequest, PermissionReply } from '../../api'

export interface PermissionActionBarProps {
  request: ApiPermissionRequest
  queueLength: number
  isReplying: boolean
  onReply: (reply: PermissionReply) => void
  /** 工具信息（用于显示工具名称和文件路径） */
  toolInfo?: { toolName: string; filePath?: string; intent?: string; callID: string } | null
  /** 是否处于底部吸附状态（保留兼容，当前统一在底部渲染） */
  isSticky?: boolean
  /** Jump to 回调（仅 isSticky 时显示） */
  onScrollTo?: () => void
}

export const PermissionActionBar = memo(function PermissionActionBar({
  request,
  queueLength,
  isReplying,
  onReply,
  toolInfo,
  isSticky = false,
  onScrollTo,
}: PermissionActionBarProps) {
  const isMobile = useIsMobile()
  const metadata = request.metadata as Record<string, unknown> | undefined
  const intent = buildPermissionIntent(request, toolInfo, metadata) || buildPermissionDetail(request)
  const autoAccepting = autoApproveStore.isAutoAccepting(request.sessionID)

  const handleAlwaysAllow = () => {
    onReply('always')
  }

  // 构建显示标题：优先显示工具名称，否则显示 permission 类型
  const displayTitle = toolInfo 
    ? formatToolName(toolInfo.toolName)
    : `Permission: ${request.permission}`

  return (
    <div className="relative rounded-2xl overflow-hidden shadow-float">
      {/* 脉冲边框动画层 */}
      <div className="absolute inset-0 rounded-2xl border border-accent-main-100/60 animate-permission-pulse pointer-events-none z-10" />

      {/* 底色 */}
      <div className="absolute inset-0 rounded-2xl bg-bg-000/95 backdrop-blur-xl pointer-events-none" />

      <div className="relative">
        {/* Header 行 */}
        <div className="flex items-center gap-2 px-4 py-2.5 border-b border-border-200/30">
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <PermissionListIcon size={14} className="text-accent-main-100 shrink-0" />
            <span className="text-xs font-medium text-text-100 truncate">
              {displayTitle}
            </span>
            {intent && (
              <>
                <span className="text-text-500 shrink-0">·</span>
                <span className="text-xs text-text-300 truncate">{intent}</span>
              </>
            )}
            {toolInfo?.filePath && (
              <>
                <span className="text-text-500 shrink-0">→</span>
                <span className="text-xs text-text-400 truncate">{toolInfo.filePath}</span>
              </>
            )}
            {queueLength > 1 && (
              <span className="text-[10px] text-text-400 bg-bg-200 px-1.5 py-0.5 rounded shrink-0">
                +{queueLength - 1}
              </span>
            )}
          </div>

          {/* Jump to：仅吸附态显示 */}
          {isSticky && onScrollTo && (
            <button
              onClick={onScrollTo}
              title="Scroll to permission request"
              className="flex items-center gap-1.5 text-xs text-text-400 hover:text-text-100 transition-colors cursor-pointer shrink-0 ml-2 px-2 py-1 rounded-lg hover:bg-bg-200"
            >
              <ChevronDownIcon size={14} />
              <span>Jump to</span>
            </button>
          )}
        </div>

        {/* 按钮行 */}
        <div className={`px-3 py-2.5 ${isMobile ? 'flex flex-col gap-2' : 'flex items-center gap-2'}`}>
          {/* Allow once */}
          <button
            onClick={() => onReply('once')}
            disabled={isReplying}
            className="flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg bg-text-100 text-bg-000 text-xs font-medium hover:bg-text-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
          >
            <HandIcon size={12} />
            <span>{isReplying ? 'Sending...' : 'Allow once'}</span>
          </button>

          {/* Always allow */}
          <button
            onClick={handleAlwaysAllow}
            disabled={isReplying}
            className="flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg border border-border-200/50 text-text-200 text-xs hover:bg-bg-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
          >
            <CheckIcon size={12} />
            <span>Always allow</span>
            {!isMobile && (
              <span className="text-[10px] text-text-400 ml-0.5">
                ({autoAccepting ? 'Auto' : 'Session'})
              </span>
            )}
          </button>

          {/* Reject */}
          <button
            onClick={() => onReply('reject')}
            disabled={isReplying}
            className="flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg text-text-300 text-xs hover:bg-bg-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
          >
            <CloseIcon size={12} />
            <span>Reject</span>
          </button>
        </div>

        {queueLength > 1 && (
          <div className="px-4 pb-2.5 text-[10px] text-text-500">
            +{queueLength - 1} more permission request{queueLength > 2 ? 's' : ''} pending
          </div>
        )}
      </div>
    </div>
  )
})

function normalizeIntent(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const compact = value.replace(/\s+/g, ' ').trim()
  if (!compact) return undefined
  return compact.length > 140 ? `${compact.slice(0, 137)}...` : compact
}

function buildPermissionIntent(
  request: ApiPermissionRequest,
  toolInfo: PermissionActionBarProps['toolInfo'],
  metadata?: Record<string, unknown>,
): string | undefined {
  return firstNonEmpty(
    normalizeIntent(toolInfo?.intent),
    extractIntentFromMetadata(metadata),
    inferIntentFromToolInfo(toolInfo),
    inferIntentFromPermission(request.permission, request.patterns),
  )
}

function extractIntentFromMetadata(metadata?: Record<string, unknown>): string | undefined {
  if (!metadata) return undefined

  const direct = firstNonEmpty(
    normalizeIntent(metadata.intent),
    normalizeIntent(metadata.operation),
    normalizeIntent(metadata.action),
    normalizeIntent(metadata.summary),
    normalizeIntent(metadata.description),
    normalizeIntent(metadata.reason),
  )
  if (direct) return direct

  const command = normalizeIntent(metadata.command)
  if (command) return `Run: ${command}`

  const query = firstNonEmpty(
    normalizeIntent(metadata.query),
    normalizeIntent(metadata.pattern),
    normalizeIntent(metadata.prompt),
  )
  if (query) return `Query: ${query}`

  const location = firstNonEmpty(
    normalizeIntent(metadata.filePath),
    normalizeIntent(metadata.filepath),
    normalizeIntent(metadata.path),
    normalizeIntent(metadata.url),
  )
  if (location) return `Target: ${location}`

  return undefined
}

function inferIntentFromToolInfo(toolInfo: PermissionActionBarProps['toolInfo']): string | undefined {
  if (!toolInfo) return undefined
  const filePath = normalizeIntent(toolInfo.filePath)
  if (!filePath) return undefined

  const toolName = toolInfo.toolName.toLowerCase()
  if (toolName.includes('read')) return `Read ${filePath}`
  if (toolName.includes('write') || toolName.includes('edit') || toolName.includes('patch')) return `Modify ${filePath}`
  if (toolName.includes('delete') || toolName.includes('remove')) return `Delete ${filePath}`
  if (toolName.includes('list') || toolName.includes('glob')) return `Inspect ${filePath}`
  return `Access ${filePath}`
}

function inferIntentFromPermission(permission: string, patterns: string[] | undefined): string | undefined {
  const normalizedPermission = permission.toLowerCase()
  const firstPattern = normalizeIntent(patterns?.[0])

  if (firstPattern && firstPattern !== '*') {
    if (normalizedPermission.includes('read')) return `Read ${firstPattern}`
    if (
      normalizedPermission.includes('write') ||
      normalizedPermission.includes('edit') ||
      normalizedPermission.includes('patch')
    ) {
      return `Modify ${firstPattern}`
    }
    if (normalizedPermission.includes('delete') || normalizedPermission.includes('remove')) {
      return `Delete ${firstPattern}`
    }
    if (
      normalizedPermission.includes('bash') ||
      normalizedPermission.includes('shell') ||
      normalizedPermission.includes('command')
    ) {
      return `Run command matching ${firstPattern}`
    }
    if (normalizedPermission.includes('web') || normalizedPermission.includes('http')) {
      return `Fetch ${firstPattern}`
    }
    return `${formatToolName(permission)} on ${firstPattern}`
  }

  if (normalizedPermission.includes('read')) return 'Read files'
  if (normalizedPermission.includes('write') || normalizedPermission.includes('edit') || normalizedPermission.includes('patch')) return 'Modify files'
  if (normalizedPermission.includes('delete') || normalizedPermission.includes('remove')) return 'Delete files'
  if (normalizedPermission.includes('bash') || normalizedPermission.includes('shell') || normalizedPermission.includes('command')) return 'Run shell command'
  if (normalizedPermission.includes('web') || normalizedPermission.includes('http')) return 'Fetch web content'
  return `Use ${formatToolName(permission)}`
}

function firstNonEmpty(...values: Array<string | undefined>): string | undefined {
  for (const value of values) {
    if (value) return value
  }
  return undefined
}

function buildPermissionDetail(request: ApiPermissionRequest): string {
  const pattern = normalizeIntent(request.patterns?.[0])
  if (pattern && pattern !== '*') {
    return `${request.permission} -> ${pattern}`
  }
  return request.permission || 'Permission request'
}
