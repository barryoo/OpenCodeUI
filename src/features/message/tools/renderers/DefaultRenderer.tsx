import { ContentBlock } from '../../../../components'
import { detectLanguage } from '../../../../utils/languageUtils'
import type { ToolRendererProps, ExtractedToolData } from '../types'

// ============================================
// Default Tool Renderer
// 通用的 Input/Output 渲染逻辑
// ============================================

export function DefaultRenderer({ part, data }: ToolRendererProps) {
  const { state, tool } = part
  const isActive = state.status === 'running' || state.status === 'pending'
  
  const hasInput = !!data.input
  const hasError = !!data.error
  const hasOutput = !!(data.files || data.diff || data.output || data.exitCode !== undefined)
  const hasDiagnostics = !!data.diagnostics?.length
  
  // 是否显示 Input block
  const showInput = hasInput || isActive
  // 是否显示 Output block
  const showOutput = hasInput && (hasOutput || hasError || isActive)
  
  return (
    <div className="flex flex-col gap-3">
      {/* Input */}
      {showInput && (
        <ContentBlock 
          label="Input"
          content={data.input || ''}
          language={data.inputLang}
          isLoading={isActive && !hasInput}
          loadingText=""
          defaultCollapsed={(data.input?.length || 0) > 1000}
        />
      )}
      
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
  // Error
  if (hasError) {
    return (
      <ContentBlock 
        label="Error"
        content={data.error || ''}
        variant="error"
      />
    )
  }
  
  // Has output
  if (hasOutput) {
    // Multiple files with diff
    if (data.files) {
      return (
        <div className="space-y-3">
          {data.files.map((file, idx) => (
            <ContentBlock 
              key={idx}
              label={formatToolName(tool) + ' Result'}
              filePath={file.filePath}
              diff={file.diff || (file.before !== undefined && file.after !== undefined 
                ? { before: file.before, after: file.after } 
                : undefined)}
              language={detectLanguage(file.filePath)}
            />
          ))}
        </div>
      )
    }
    
    // Single diff
    if (data.diff) {
      return (
        <ContentBlock 
          label="Output"
          filePath={data.filePath}
          diff={data.diff}
          diffStats={data.diffStats}
          language={data.outputLang}
        />
      )
    }
    
    // Regular output
    return (
      <ContentBlock 
        label="Output"
        content={data.output}
        language={data.outputLang}
        filePath={data.filePath}
        stats={data.exitCode !== undefined ? { exit: data.exitCode } : undefined}
      />
    )
  }
  
  // Loading
  return (
    <ContentBlock 
      label="Output"
      isLoading={isActive}
      loadingText="Running..."
    />
  )
}

// ============================================
// Diagnostics Block - 显示 LSP 诊断信息
// ============================================

interface DiagnosticsBlockProps {
  diagnostics: NonNullable<ExtractedToolData['diagnostics']>
}

function DiagnosticsBlock({ diagnostics }: DiagnosticsBlockProps) {
  const errors = diagnostics.filter(d => d.severity === 'error')
  const warnings = diagnostics.filter(d => d.severity === 'warning')
  
  if (errors.length === 0 && warnings.length === 0) return null
  
  return (
    <div className="rounded-lg border border-border-200/50 bg-bg-100 overflow-hidden text-xs">
      <div className="px-3 py-1.5 bg-bg-200/50 flex items-center gap-2">
        <DiagnosticIcon className="w-3.5 h-3.5 text-text-400" />
        <span className="font-medium text-text-300">Diagnostics</span>
        <div className="flex items-center gap-2 ml-auto font-mono">
          {errors.length > 0 && (
            <span className="text-danger-100">{errors.length} error{errors.length > 1 ? 's' : ''}</span>
          )}
          {warnings.length > 0 && (
            <span className="text-warning-100">{warnings.length} warning{warnings.length > 1 ? 's' : ''}</span>
          )}
        </div>
      </div>
      <div className="px-3 py-2 space-y-1 max-h-32 overflow-auto custom-scrollbar">
        {diagnostics.map((d, idx) => (
          <div key={idx} className="flex items-start gap-2">
            <span className={`flex-shrink-0 mt-0.5 w-1.5 h-1.5 rounded-full ${
              d.severity === 'error' ? 'bg-danger-100' : 'bg-warning-100'
            }`} />
            <span className="text-text-400 font-mono flex-shrink-0">
              {d.file}:{d.line + 1}
            </span>
            <span className="text-text-300 break-words">{d.message}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function DiagnosticIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <line x1="12" y1="8" x2="12" y2="12" />
      <line x1="12" y1="16" x2="12.01" y2="16" />
    </svg>
  )
}

// ============================================
// Helpers
// ============================================

function formatToolName(name: string): string {
  if (!name) return 'Tool'
  return name
    .split(/[_-]/)
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ')
}
