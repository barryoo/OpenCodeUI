import { ContentBlock } from '../../../../components'
import { AlertCircleIcon } from '../../../../components/Icons'
import { detectLanguage } from '../../../../utils/languageUtils'
import type { ToolRendererProps, ExtractedToolData } from '../types'

// ============================================
// Default Tool Renderer
// 通用的 Input/Output 渲染逻辑
// ============================================

export function DefaultRenderer({ part, data }: ToolRendererProps) {
  const { state, tool } = part
  const isActive = state.status === 'running' || state.status === 'pending'

  const hasError = !!data.error
  const hasOutput = !!(data.files || data.diff || data.output?.trim() || data.exitCode !== undefined)
  const hasDiagnostics = !!data.diagnostics?.length

  // Output 不再依赖 hasInput
  const showOutput = hasOutput || hasError || (isActive && !hasOutput)

  return (
    <div className="flex flex-col gap-2">
      {/* Output */}
      {showOutput && (
        <OutputBlock
          tool={tool}
          data={data}
          isActive={isActive}
          hasError={hasError}
          hasOutput={hasOutput}
        />
      )}
      
      {/* Diagnostics */}
      {hasDiagnostics && (
        <DiagnosticsBlock diagnostics={data.diagnostics!} />
      )}
    </div>
  )
}

// ============================================
// Output Block
// ============================================

interface OutputBlockProps {
  tool: string
  data: ExtractedToolData
  isActive: boolean
  hasError: boolean
  hasOutput: boolean
}

function OutputBlock({ tool, data, isActive, hasError, hasOutput }: OutputBlockProps) {
  const patchTool = isPatchToolName(tool)
  const outputHeaderMeta = patchTool ? undefined : data.subtitle || summarizeInputForHeader(data.input)

  // 1. Error 优先
  if (hasError) {
    return (
      <ContentBlock
        label="Error"
        content={data.error || ''}
        variant="error"
      />
    )
  }
  
  // 2. 工具活跃时（running/pending）：
  //    - patch 类工具（edit/write）如果已有 diff，优先展示 diff，让用户在授权前能看到变更内容
  //    - 其他工具统一显示 loading
  if (isActive) {
    if (patchTool && (data.diff || data.files)) {
      // fall through 到下面的 hasOutput 分支展示 diff
    } else {
      return (
        <ContentBlock
          label={patchTool ? 'Patch' : 'Output'}
          filePath={data.filePath}
          hideLabel={patchTool && !!data.filePath}
          headerMeta={outputHeaderMeta}
          isLoading={true}
          loadingText="Running..."
        />
      )
    }
  }
  
  // 3. 完成后或 patch 工具已有 diff 时显示结果
  if (hasOutput) {
    // Multiple files with diff
    if (data.files) {
      return (
        <div className="flex flex-col gap-2">
          {data.files.map((file, idx) => (
            <ContentBlock
              key={idx}
              label={patchTool ? '' : formatLabel(tool)}
              filePath={file.filePath}
              hideLabel={patchTool}
              diff={file.diff || (file.before !== undefined && file.after !== undefined 
                ? { before: file.before, after: file.after } 
                : undefined)}
              language={detectLanguage(file.filePath)}
              headerMeta={outputHeaderMeta}
            />
          ))}
        </div>
      )
    }
    
    // Single diff
    if (data.diff) {
      return (
        <ContentBlock
          label={patchTool ? '' : 'Output'}
          filePath={data.filePath}
          hideLabel={patchTool}
          diff={data.diff}
          diffStats={data.diffStats}
          language={data.outputLang}
          headerMeta={outputHeaderMeta}
        />
      )
    }

    // Regular output
    const content = patchTool ? sanitizePatchOutput(data.output) : data.output

    return (
      <ContentBlock
        label={patchTool ? 'Patch' : 'Output'}
        content={content}
        language={data.outputLang}
        filePath={data.filePath}
        stats={data.exitCode !== undefined ? { exit: data.exitCode } : undefined}
        hideLabel={patchTool && !!data.filePath}
        headerMeta={outputHeaderMeta}
      />
    )
  }

  // 4. 无输出
  return (
    <ContentBlock
      label={patchTool ? 'Patch' : 'Output'}
      filePath={data.filePath}
      hideLabel={patchTool && !!data.filePath}
      headerMeta={outputHeaderMeta}
    />
  )
}

// ============================================
// Diagnostics Block
// ============================================

interface DiagnosticsBlockProps {
  diagnostics: NonNullable<ExtractedToolData['diagnostics']>
}

function DiagnosticsBlock({ diagnostics }: DiagnosticsBlockProps) {
  const errors = diagnostics.filter(d => d.severity === 'error')
  const warnings = diagnostics.filter(d => d.severity === 'warning')
  
  if (errors.length === 0 && warnings.length === 0) return null
  
  return (
    <div className="rounded-lg border border-border-200/40 bg-bg-100/80 overflow-hidden text-xs">
      <div className="px-3 h-8 bg-bg-200/40 flex items-center gap-2">
        <AlertCircleIcon className="w-3.5 h-3.5 text-text-300" />
        <span className="font-medium text-text-200">Diagnostics</span>
        <div className="flex items-center gap-2 ml-auto font-mono text-[10px]">
          {errors.length > 0 && (
            <span className="text-danger-100">{errors.length} error{errors.length > 1 ? 's' : ''}</span>
          )}
          {warnings.length > 0 && (
            <span className="text-warning-100">{warnings.length} warning{warnings.length > 1 ? 's' : ''}</span>
          )}
        </div>
      </div>
      <div className="px-3 py-2 space-y-1.5 max-h-40 overflow-auto custom-scrollbar">
        {diagnostics.map((d, idx) => (
          <div key={idx} className="flex items-start gap-2 text-[11px]">
            <span className={`flex-shrink-0 mt-1 w-1.5 h-1.5 rounded-full ${
              d.severity === 'error' ? 'bg-danger-100' : 'bg-warning-100'
            }`} />
            <span className="text-text-300 font-mono flex-shrink-0">
              {d.file}:{d.line + 1}
            </span>
            <span className="text-text-300 break-words">{d.message}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ============================================
// Helpers
// ============================================

function formatLabel(name: string): string {
  if (!name) return 'Result'
  return name
    .split(/[_-]/)
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ') + ' Result'
}

function isPatchToolName(name: string): boolean {
  const lower = name.toLowerCase()
  return lower === 'write' || lower === 'edit' || lower === 'patch' || lower === 'apply_patch' || lower === 'apply-patch'
}

function sanitizePatchOutput(output?: string): string | undefined {
  if (!output) return output

  const cleaned = output
    .split('\n')
    .filter(line => {
      const trimmed = line.trim()
      if (!trimmed) return true
      if (/^success\.?$/i.test(trimmed)) return false
      if (/^updated the following files?:?$/i.test(trimmed)) return false
      return true
    })
    .join('\n')
    .trim()

  return cleaned || undefined
}

function summarizeInputForHeader(input?: string): string | undefined {
  if (!input?.trim()) return undefined

  try {
    const parsed = JSON.parse(input) as Record<string, unknown>
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return undefined

    const ignoredKeys = new Set([
      'content',
      'oldString',
      'newString',
      'patchText',
      'todos',
      'command',
      'filePath',
      'filepath',
    ])

    const parts: string[] = []

    for (const [key, value] of Object.entries(parsed)) {
      if (ignoredKeys.has(key)) continue

      const formatted = formatHeaderValue(value)
      if (!formatted) continue

      parts.push(`${key}=${formatted}`)
      if (parts.length >= 2) break
    }

    return parts.join('  ') || undefined
  } catch {
    return undefined
  }
}

function formatHeaderValue(value: unknown): string | undefined {
  if (typeof value === 'string') {
    const trimmed = value.trim()
    if (!trimmed) return undefined
    return trimmed.length > 40 ? `${trimmed.slice(0, 37)}...` : trimmed
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value)
  }

  if (Array.isArray(value)) {
    if (value.length === 0) return undefined
    const first = formatHeaderValue(value[0])
    if (!first) return `${value.length} items`
    return value.length > 1 ? `${first}, +${value.length - 1}` : first
  }

  return undefined
}
