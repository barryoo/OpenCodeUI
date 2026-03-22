import { memo, useState, useMemo, useEffect } from 'react'
import { ChevronDownIcon, ChevronRightIcon } from '../../../components/Icons'
import type { ToolPart } from '../../../types/message'
import { useDelayedRender } from '../../../hooks'
import { useTheme } from '../../../hooks/useTheme'
import { useCurrentDirectory } from '../../../contexts/DirectoryContext'
import { usePermissionContext } from '../../../contexts/PermissionContext'
import type { ToolOutputExpansionLevel } from '../../../store/themeStore'
import { 
  getToolIcon, 
  extractToolData, 
  getToolConfig,
  DefaultRenderer,
  TodoRenderer,
  TaskRenderer,
  hasTodos,
} from '../tools'

// ============================================
// 将绝对路径转为相对于 cwd 的相对路径
// ============================================

function toRelativePath(absPath: string, cwd: string | undefined): string {
  if (!cwd) return absPath
  const normalize = (p: string) => p.replace(/\\/g, '/')
  const normAbs = normalize(absPath)
  const normCwd = normalize(cwd).replace(/\/$/, '')
  if (normAbs.startsWith(normCwd + '/')) {
    return normAbs.slice(normCwd.length + 1)
  }
  return absPath
}

function isProbablyPath(value: string): boolean {
  if (!value) return false
  if (value.startsWith('file://')) return true
  if (value.startsWith('/') || value.startsWith('./') || value.startsWith('../')) return true
  if (/^[a-zA-Z]:[\\/]/.test(value)) return true
  if (value.includes(' ')) return false
  return value.includes('/') || value.includes('\\')
}

function formatPathLikeTitle(title: string, cwd: string | undefined): string {
  const trimmed = title.trim()
  if (!trimmed) return title
  if (!isProbablyPath(trimmed)) return title

  const normalized = trimmed.replace(/^file:\/\//i, '').replace(/\\/g, '/')
  return toRelativePath(normalized, cwd)
}

function normalizePathForCompare(value: string): string {
  return value
    .replace(/^file:\/\//i, '')
    .replace(/\\/g, '/')
    .replace(/\/+?/g, '/')
    .trim()
}

function titleIncludesPath(title: string, absPath?: string, relPath?: string): boolean {
  if (!title) return false
  const normalizedTitle = normalizePathForCompare(title)
  if (!normalizedTitle) return false
  const normalizedAbs = absPath ? normalizePathForCompare(absPath) : ''
  const normalizedRel = relPath ? normalizePathForCompare(relPath) : ''
  return (
    (!!normalizedAbs && normalizedTitle.includes(normalizedAbs)) ||
    (!!normalizedRel && normalizedTitle.includes(normalizedRel))
  )
}

function replaceTitlePathWithRelative(title: string, absPath?: string, relPath?: string): string {
  if (!title || !absPath || !relPath || absPath === relPath) return title
  let result = title
  const candidates = new Set<string>()
  candidates.add(absPath)
  const normalizedAbs = absPath.replace(/\\/g, '/')
  if (normalizedAbs !== absPath) candidates.add(normalizedAbs)
  if (absPath.startsWith('/')) {
    candidates.add(`file://${absPath}`)
    candidates.add(`file:///${absPath.slice(1)}`)
  }
  for (const candidate of candidates) {
    if (candidate && result.includes(candidate)) {
      result = result.split(candidate).join(relPath)
    }
  }
  return result
}

function normalizeHeaderText(value?: string): string {
  if (!value) return ''
  return value.replace(/\s+/g, ' ').trim().toLowerCase()
}

function isDuplicateHeaderText(primary?: string, secondary?: string): boolean {
  const left = normalizeHeaderText(primary)
  const right = normalizeHeaderText(secondary)
  if (!left || !right) return false
  return left === right || left.includes(right) || right.includes(left)
}

const READ_ONLY_TOOL_KEYWORDS = [
  'read',
  'grep',
  'glob',
  'search',
  'lsp',
  'hover',
  'definition',
  'reference',
  'symbol',
  'diagnostic',
  'webfetch',
  'websearch',
  'codesearch',
  'context7',
]

const NON_READ_ONLY_TOOL_KEYWORDS = [
  'write',
  'edit',
  'patch',
  'replace',
  'rename',
  'bash',
  'shell',
  'terminal',
  'cmd',
]

const READ_ONLY_BASH_COMMAND_GLOBS = [
  'git status',
  'git diff*',
  'git log*',
  'git show*',
  'git branch',
  'git branch --show-current',
  'git remote*',
  'git rev-parse*',
  'git stash list*',
  'git ls-files*',
  'git symbolic-ref*',
  'ls*',
  'pwd',
  'which *',
  'type *',
  'env',
  'printenv*',
]

function getToolInitialExpanded(
  part: ToolPart,
  level: ToolOutputExpansionLevel,
  commandGlobs: string[],
): boolean {
  const isActive = part.state.status === 'running' || part.state.status === 'pending'

  if (level === 1) return isActive
  if (level === 4) return false
  if (isActive) return true

  if (level === 2) {
    return !isReadOnlyToolPart(part, false, commandGlobs)
  }

  return !isReadOnlyToolPart(part, true, commandGlobs)
}

function isReadOnlyToolPart(
  part: ToolPart,
  inspectBashCommand: boolean,
  commandGlobs: string[],
): boolean {
  const tool = part.tool.toLowerCase()

  if (NON_READ_ONLY_TOOL_KEYWORDS.some(keyword => tool.includes(keyword))) {
    if (inspectBashCommand && isBashLikeTool(tool)) {
      return isReadOnlyBashCommand(part, commandGlobs)
    }
    return false
  }

  if (READ_ONLY_TOOL_KEYWORDS.some(keyword => tool.includes(keyword))) {
    return true
  }

  return false
}

function isBashLikeTool(tool: string): boolean {
  return tool.includes('bash') || tool.includes('shell') || tool.includes('terminal') || tool === 'sh' || tool === 'cmd'
}

function isReadOnlyBashCommand(part: ToolPart, commandGlobs: string[]): boolean {
  const command = extractSimpleCommand(part)
  if (!command) return false
  const normalized = normalizeCommand(command)
  const patterns = [...READ_ONLY_BASH_COMMAND_GLOBS, ...commandGlobs]
  return patterns.some(pattern => wildcardMatch(normalized, pattern))
}

function extractSimpleCommand(part: ToolPart): string | undefined {
  const inputObj = part.state.input as Record<string, unknown> | undefined
  const raw = typeof inputObj?.command === 'string'
    ? inputObj.command
    : typeof part.state.raw === 'string'
      ? part.state.raw
      : undefined
  if (!raw) return undefined
  if (/[\n;&|><`$()]/.test(raw)) return undefined
  return raw
}

function normalizeCommand(command: string): string {
  return command.trim().replace(/\s+/g, ' ').toLowerCase()
}

function wildcardMatch(value: string, pattern: string): boolean {
  const normalizedPattern = normalizeCommand(pattern)
  if (!normalizedPattern) return false
  const escaped = normalizedPattern.replace(/[.+^${}()|[\]\\]/g, '\\$&')
  const regex = new RegExp(`^${escaped.replace(/\*/g, '.*').replace(/\?/g, '.')}$`)
  return regex.test(value)
}

// ============================================
// ToolPartView - 单个工具调用
// ============================================

interface ToolPartViewProps {
  part: ToolPart
  isFirst?: boolean
  isLast?: boolean
  /** Compact layout: icon inline with text (14px column), no timeline connectors.
   *  Used for single-tool groups to align with ReasoningPartView. */
  compact?: boolean
}

export const ToolPartView = memo(function ToolPartView({ part, isFirst = false, isLast = false, compact = false }: ToolPartViewProps) {
  const cwd = useCurrentDirectory()
  const permission = usePermissionContext()
  const { toolOutputExpansionLevel, toolOutputReadOnlyCommandGlobs } = useTheme()
  const commandSignature = extractSimpleCommand(part) || ''

  // 判断当前 tool 是否有待处理的 permission 请求（用于强制展开，按钮在底部）
  const hasPendingPermission = !!(
    permission.pendingPermission?.tool?.callID &&
    permission.pendingPermission.tool.callID === part.callID
  )

  const autoExpanded = useMemo(() => {
    if (hasPendingPermission) return true
    return getToolInitialExpanded(part, toolOutputExpansionLevel, toolOutputReadOnlyCommandGlobs)
  }, [hasPendingPermission, part.tool, part.state.status, commandSignature, toolOutputExpansionLevel, toolOutputReadOnlyCommandGlobs])

  const [expanded, setExpanded] = useState(autoExpanded)

  // 有 pending permission 时自动展开，让用户看到 diff 内容再决策
  useEffect(() => {
    if (hasPendingPermission) {
      setExpanded(true)
      return
    }
    setExpanded(autoExpanded)
  }, [autoExpanded, hasPendingPermission])

  const shouldRenderBody = useDelayedRender(expanded)

  const { state, tool: toolName } = part
  const title = state.title || ''
  const data = useMemo(() => extractToolData(part), [part])
  const path = data.filePath || (data.files?.length === 1 ? data.files[0].filePath : undefined)
  const relativePath = path ? toRelativePath(path, cwd) : undefined
  const isPatchTool = isPatchToolName(toolName)
  const displayToolName = isPatchTool ? 'Patch' : formatToolName(toolName)
  const rawTitle = isPatchTool ? '' : title
  const displayTitle = useMemo(() => {
    if (!rawTitle) return ''
    if (path && relativePath) {
      return replaceTitlePathWithRelative(rawTitle, path, relativePath)
    }
    return formatPathLikeTitle(rawTitle, cwd)
  }, [rawTitle, path, relativePath, cwd])
  
  const duration = state.time?.start && state.time?.end 
    ? state.time.end - state.time.start 
    : undefined

  const isActive = state.status === 'running' || state.status === 'pending'
  const isError = state.status === 'error'

  const titleHasPath = useMemo(() => {
    if (!displayTitle) return false
    if (isProbablyPath(displayTitle)) return true
    return titleIncludesPath(displayTitle, path, relativePath)
  }, [displayTitle, path, relativePath])
  const headerMeta = useMemo(() => {
    const parts: string[] = []
    if (relativePath && !titleHasPath) parts.push(relativePath)
    const subtitle = data.subtitle
    if (subtitle && !isDuplicateHeaderText(displayTitle, subtitle)) {
      parts.push(subtitle)
    }
    return parts.join('  ')
  }, [relativePath, titleHasPath, data.subtitle, displayTitle])

  const toolIcon = (
    <div className={`
      relative flex items-center justify-center transition-colors duration-200
      ${isActive ? 'text-accent-main-100' : ''}
      ${isError ? 'text-danger-100' : ''}
      ${state.status === 'completed' ? 'text-text-300 group-hover:text-text-200' : ''}
    `}>
      {isActive && (
        <span className="absolute inset-0 rounded-full bg-accent-main-100/20 animate-ping" style={{ animationDuration: '1.5s' }} />
      )}
      {getToolIcon(toolName)}
    </div>
  )

  // ── Compact layout (single-tool, no timeline) ──
  if (compact) {
    return (
      <div className={`group relative grid grid-cols-[14px_minmax(0,1fr)] gap-x-1.5 items-start py-1 ${
        hasPendingPermission ? 'px-2 -mx-2 rounded-lg border border-accent-main-100/60 animate-permission-pulse' : ''
      }`}>
        <span className="inline-flex h-[34px] w-[14px] items-center justify-center shrink-0">
          {toolIcon}
        </span>

        <div className="min-w-0">
          <button
            className="flex items-center gap-2 w-full h-[34px] text-left px-2 -ml-2 hover:bg-bg-200/40 rounded-lg transition-colors group/header"
            onClick={() => setExpanded(!expanded)}
          >
            <div className="flex items-baseline gap-2 overflow-hidden flex-1 min-w-0">
              <span className={`font-medium text-[13px] leading-tight transition-colors duration-300 shrink-0 ${
                isActive ? 'text-accent-main-100' :
                isError ? 'text-danger-100' :
                'text-text-200 group-hover/header:text-text-100'
              }`}>
                {displayToolName}
              </span>
              {displayTitle && (
                <span className="text-xs text-text-300 truncate">{displayTitle}</span>
              )}
              {headerMeta && (
                <span className="text-xs text-text-400 truncate">{headerMeta}</span>
              )}
            </div>
            <div className="flex items-center gap-2 ml-auto shrink-0">
              {duration !== undefined && state.status === 'completed' && (
                <span className="text-[10px] text-text-400 tabular-nums">{formatDuration(duration)}</span>
              )}
              <span className={`text-[10px] font-medium transition-all duration-300 ${
                isActive ? 'opacity-100 text-accent-main-100' : 'opacity-0 w-0 overflow-hidden'
              }`}>Running</span>
              <span className={`text-[10px] font-medium transition-all duration-300 ${
                isError ? 'opacity-100 text-danger-100' : 'opacity-0 w-0 overflow-hidden'
              }`}>Failed</span>
              <span className="text-text-400">
                {expanded ? <ChevronDownIcon size={12} /> : <ChevronRightIcon size={12} />}
              </span>
            </div>
          </button>

          <div className={`grid transition-[grid-template-rows] duration-300 ease-in-out ${
            expanded ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'
          }`}>
            <div className="overflow-hidden">
              {shouldRenderBody && (
                <div className="pr-2.5 pb-2 pt-1">
                  <ToolBody part={part} />
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    )
  }

  // ── Timeline layout (multi-tool groups) ──
  return (
    <div className={`group relative flex ${
      hasPendingPermission ? 'px-2 -mx-2 rounded-lg border border-accent-main-100/60 animate-permission-pulse' : ''
    }`}>
      <div className="w-8 shrink-0 relative">
        {!isFirst && (
          <div className="absolute left-1/2 -translate-x-1/2 top-0 h-[7px] w-px bg-border-300/40" />
        )}
        <div className="h-9 flex items-center justify-center relative z-10">
          {toolIcon}
        </div>
        {!isLast && (
          <div className="absolute left-1/2 -translate-x-1/2 top-[29px] bottom-0 w-px bg-border-300/40" />
        )}
      </div>

      <div className="flex-1 min-w-0">
        <button
          className="flex items-center gap-2.5 w-full h-9 text-left px-2 hover:bg-bg-200/40 rounded-lg transition-colors group/header"
          onClick={() => setExpanded(!expanded)}
        >
          <div className="flex items-baseline gap-2 overflow-hidden flex-1 min-w-0">
            <span className={`font-medium text-[13px] leading-tight transition-colors duration-300 shrink-0 ${
              isActive ? 'text-accent-main-100' :
              isError ? 'text-danger-100' :
              'text-text-200 group-hover/header:text-text-100'
            }`}>
              {displayToolName}
            </span>
            {displayTitle && (
              <span className="text-xs text-text-300 truncate">{displayTitle}</span>
            )}
            {headerMeta && (
              <span className="text-xs text-text-400 truncate">{headerMeta}</span>
            )}
          </div>
          <div className="flex items-center gap-2 ml-auto shrink-0">
            {duration !== undefined && state.status === 'completed' && (
              <span className="text-[10px] text-text-400 tabular-nums transition-opacity duration-300">{formatDuration(duration)}</span>
            )}
            <span className={`text-[10px] font-medium transition-all duration-300 ${
              isActive ? 'opacity-100 text-accent-main-100' : 'opacity-0 w-0 overflow-hidden'
            }`}>Running</span>
            <span className={`text-[10px] font-medium transition-all duration-300 ${
              isError ? 'opacity-100 text-danger-100' : 'opacity-0 w-0 overflow-hidden'
            }`}>Failed</span>
            <span className="text-text-400">
              {expanded ? <ChevronDownIcon size={12} /> : <ChevronRightIcon size={12} />}
            </span>
          </div>
        </button>

        <div className={`grid transition-[grid-template-rows] duration-300 ease-in-out ${
          expanded ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'
        }`}>
          <div className="overflow-hidden">
            {shouldRenderBody && (
              <div className="pl-2.5 pr-2.5 pb-2 pt-1">
                <ToolBody part={part} />
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
})

// ============================================
// ToolBody - 根据工具类型选择渲染器
// ============================================

function ToolBody({ part }: { part: ToolPart }) {
  const { tool } = part
  const lowerTool = tool.toLowerCase()
  const data = extractToolData(part)
  
  if (lowerTool === 'task') {
    return <TaskRenderer part={part} data={data} />
  }
  if (lowerTool.includes('todo') && hasTodos(part)) {
    return <TodoRenderer part={part} data={data} />
  }
  const config = getToolConfig(tool)
  if (config?.renderer) {
    const CustomRenderer = config.renderer
    return <CustomRenderer part={part} data={data} />
  }
  return <DefaultRenderer part={part} data={data} />
}

// ============================================
// Helpers
// ============================================

function formatToolName(name: string): string {
  return name
    .replace(/[-_]/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase())
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`
  return `${(ms / 1000).toFixed(1)}s`
}

function isPatchToolName(name: string): boolean {
  const lower = name.toLowerCase()
  return lower === 'write' || lower === 'edit' || lower === 'patch' || lower === 'apply_patch' || lower === 'apply-patch'
}
