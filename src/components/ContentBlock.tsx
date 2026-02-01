/**
 * ContentBlock - 通用内容展示容器
 * 
 * 根据内容类型自动选择渲染器：
 * - 普通代码/文本 -> CodeRenderer
 * - Diff -> DiffRenderer
 * - Loading 状态 -> Skeleton
 * - 后续可扩展更多类型
 */

import { memo, useState, useEffect, useMemo } from 'react'
import { diffLines } from 'diff'
import { ChevronDownIcon, MaximizeIcon } from './Icons'
import { CopyButton } from './ui'
import { useSyntaxHighlight } from '../hooks/useSyntaxHighlight'
import { detectLanguage } from '../utils/languageUtils'
import { DiffModal } from './DiffModal'

// ============================================
// Types
// ============================================

export interface ContentBlockProps {
  /** 标签 */
  label: string
  /** 文件路径 */
  filePath?: string
  /** 语言 */
  language?: string
  /** 样式变体 */
  variant?: 'default' | 'error'
  /** 默认折叠 */
  defaultCollapsed?: boolean
  /** 最大高度 */
  maxHeight?: number
  /** 是否可折叠 */
  collapsible?: boolean
  
  // 内容 - 根据提供的字段自动选择渲染器
  /** 普通文本/代码内容 */
  content?: string
  /** Diff 数据 */
  diff?: { before: string; after: string } | string
  /** Diff 统计（可选，如果提供则直接使用，否则计算） */
  diffStats?: { additions: number; deletions: number }
  /** 统计信息 */
  stats?: { exit?: number }
  
  // Loading 状态
  /** 是否正在加载 */
  isLoading?: boolean
  /** 加载时显示的文字 */
  loadingText?: string
}

// ============================================
// Main Component
// ============================================

export const ContentBlock = memo(function ContentBlock({
  label,
  filePath,
  language,
  variant = 'default',
  defaultCollapsed = false,
  maxHeight = 300,
  collapsible = true,
  content,
  diff,
  diffStats: providedDiffStats,
  stats,
  isLoading = false,
  loadingText = 'Loading...',
}: ContentBlockProps) {
  const [collapsed, setCollapsed] = useState(defaultCollapsed)
  const [diffModalOpen, setDiffModalOpen] = useState(false)
  
  const isError = variant === 'error'
  const isDiff = !!diff
  const hasContent = !!content || isDiff || stats?.exit !== undefined
  const lang = language || (filePath ? detectLanguage(filePath) : 'text')
  const fileName = filePath?.split(/[/\\]/).pop()
  
  // Diff 统计 - 优先使用提供的，否则计算
  const diffStats = useMemo(() => {
    if (!isDiff) return null
    
    // 如果提供了统计，直接使用
    if (providedDiffStats) return providedDiffStats
    
    // 如果是对象格式 (before/after)，计算 diff
    if (typeof diff === 'object') {
      const changes = diffLines(diff.before, diff.after)
      let additions = 0, deletions = 0
      for (const c of changes) {
        if (c.added) additions += c.count || 0
        if (c.removed) deletions += c.count || 0
      }
      return { additions, deletions }
    }
    
    // 如果是 unified diff 字符串
    const lines = (diff as string).split('\n')
    let additions = 0, deletions = 0
    for (const line of lines) {
      if (line.startsWith('+++') || line.startsWith('---') || line.startsWith('Index:') || line.startsWith('===')) continue
      if (line.startsWith('+')) additions++
      if (line.startsWith('-')) deletions++
    }
    return { additions, deletions }
  }, [isDiff, diff, providedDiffStats])

  return (
    <div className={`border rounded-lg overflow-hidden text-xs ${
      isError ? 'border-danger-100/30 bg-danger-100/5' : 'border-border-200/50 bg-bg-100'
    }`}>
      {/* Header */}
      <div
        className={`flex items-center justify-between px-3 py-1.5 select-none transition-colors ${
          collapsible && hasContent ? 'cursor-pointer' : ''
        } ${isError ? 'bg-danger-100/10 hover:bg-danger-100/15' : 'bg-bg-200/50 hover:bg-bg-200'}`}
        onClick={collapsible && hasContent ? () => setCollapsed(!collapsed) : undefined}
      >
        <div className="flex items-center gap-2 min-w-0">
          {collapsible && hasContent && (
            <span className={`transition-transform duration-200 ${collapsed ? '' : 'rotate-180'} ${
              isError ? 'text-danger-100/70' : 'text-text-400'
            }`}>
              <ChevronDownIcon />
            </span>
          )}
          <span className={`font-medium font-mono ${isError ? 'text-danger-100' : 'text-text-300'}`}>
            {label}
          </span>
          {fileName && <span className="text-text-500 truncate font-mono">{fileName}</span>}
          
          {/* Loading indicator in header */}
          {isLoading && (
            <div className="flex items-center gap-1.5 text-text-400">
              <div className="w-3 h-3 border-2 border-accent-main-100/30 border-t-accent-main-100 rounded-full animate-spin" />
              <span className="text-xs">{loadingText}</span>
            </div>
          )}
        </div>
        
        <div className="flex items-center gap-3 font-mono">
          {/* Diff stats */}
          {diffStats && (
            <div className="flex items-center gap-2 tabular-nums font-medium">
              {diffStats.additions > 0 && <span className="text-success-100">+{diffStats.additions}</span>}
              {diffStats.deletions > 0 && <span className="text-danger-100">-{diffStats.deletions}</span>}
              {diffStats.additions === 0 && diffStats.deletions === 0 && (
                <span className="text-text-500">No changes</span>
              )}
            </div>
          )}
          
          {/* 放大按钮 - 仅 diff 模式 */}
          {isDiff && diff && (
            <button
              className="p-1 text-text-400 hover:text-text-200 hover:bg-bg-300/50 rounded transition-colors"
              onClick={(e) => {
                e.stopPropagation()
                setDiffModalOpen(true)
              }}
              title="全屏查看"
            >
              <MaximizeIcon size={14} />
            </button>
          )}
          
          {/* Exit code */}
          {stats?.exit !== undefined && (
            <span className={`tabular-nums ${stats.exit === 0 ? 'text-accent-secondary-100' : 'text-warning-100'}`}>
              exit {stats.exit}
            </span>
          )}
        </div>
      </div>

      {/* Body - 使用 grid 实现平滑展开动画 */}
      <div className={`grid transition-[grid-template-rows] duration-300 ease-out ${
        (hasContent && !collapsed) || isLoading ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'
      }`}>
        <div className="overflow-hidden">
          {/* Loading skeleton */}
          {isLoading && !hasContent && (
            <div className="px-3 py-3 space-y-2">
              <div className="h-3 bg-bg-300/50 rounded animate-pulse w-3/4" />
              <div className="h-3 bg-bg-300/50 rounded animate-pulse w-1/2" />
            </div>
          )}
          
          {/* Actual content */}
          {hasContent && (
            <div className="relative group/content overflow-auto custom-scrollbar" style={{ maxHeight }}>
              {/* Copy button - 悬浮在内容区右上角 */}
              {content && <CopyButton text={content} position="absolute" groupName="content" />}
              
              {isDiff ? (
                <DiffRenderer 
                  before={typeof diff === 'object' ? diff.before : undefined} 
                  after={typeof diff === 'object' ? diff.after : undefined}
                  unifiedDiff={typeof diff === 'string' ? diff : undefined}
                  language={lang} 
                />
              ) : content ? (
                <CodeRenderer content={content} language={lang} isError={isError} />
              ) : stats?.exit !== undefined ? (
                <div className="px-3 py-2 text-text-500 font-mono">
                  {stats.exit === 0 ? 'Completed successfully' : 'No output'}
                </div>
              ) : null}
            </div>
          )}
        </div>
      </div>
      
      {/* Diff Modal */}
      {isDiff && diff && (
        <DiffModal
          isOpen={diffModalOpen}
          onClose={() => setDiffModalOpen(false)}
          diff={diff}
          filePath={filePath}
          language={lang}
          diffStats={diffStats || undefined}
        />
      )}
    </div>
  )
})

// ============================================
// CodeRenderer - 代码渲染器
// ============================================

interface CodeRendererProps {
  content: string
  language: string
  isError?: boolean
}

const CodeRenderer = memo(function CodeRenderer({ content, language, isError }: CodeRendererProps) {
  // 性能优化：大内容不高亮
  const shouldHighlight = content.length < 50000
  const { output: html } = useSyntaxHighlight(content, { lang: language, enabled: shouldHighlight })

  if (html) {
    return (
      <div
        className={`
          [&_pre]:p-3 [&_pre]:m-0 [&_pre]:!bg-transparent
          [&_.shiki]:!bg-transparent
          [&_code]:font-mono leading-relaxed
          ${isError ? '[&_span]:!text-danger-100' : ''}
        `}
        dangerouslySetInnerHTML={{ __html: html as string }}
      />
    )
  }

  return (
    <pre className={`p-3 m-0 whitespace-pre-wrap break-all font-mono ${isError ? 'text-danger-100' : 'text-text-300'}`}>
      {content}
    </pre>
  )
})

// ============================================
// DiffRenderer - Diff 渲染器
// ============================================

interface DiffLine {
  type: 'add' | 'delete' | 'context'
  content: string
  oldLineNo?: number
  newLineNo?: number
}

interface DiffRendererProps {
  before?: string
  after?: string
  unifiedDiff?: string
  language: string
}

const DiffRenderer = memo(function DiffRenderer({ before, after, unifiedDiff, language }: DiffRendererProps) {
  // 性能优化：大内容不高亮
  const totalLength = (before?.length || 0) + (after?.length || 0) + (unifiedDiff?.length || 0)
  const shouldHighlight = totalLength < 50000
  
  // 仅在 before/after 模式下使用
  const { output: oldTokens } = useSyntaxHighlight(before || '', { lang: language, mode: 'tokens', enabled: shouldHighlight && !!before })
  const { output: newTokens } = useSyntaxHighlight(after || '', { lang: language, mode: 'tokens', enabled: shouldHighlight && !!after })
  
  // 仅在 unifiedDiff 模式下使用 - 提取出的 before/after 用于高亮
  const [unifiedParts, setUnifiedParts] = useState<{ before: string, after: string } | null>(null)
  
  useEffect(() => {
    if (unifiedDiff) {
      // 提取 before/after 用于语法高亮
      // 必须跳过 diff header 行，否则 tokens 索引会错位
      let b = '', a = ''
      const lines = unifiedDiff.split('\n')
      for (const line of lines) {
        // 跳过 diff header 行
        if (line.startsWith('---') || line.startsWith('+++') || 
            line.startsWith('Index:') || line.startsWith('===') ||
            line.startsWith('@@') || line.startsWith('\\ No newline')) {
          continue
        }
        // 只处理实际的 diff 内容行
        if (line.startsWith('-')) b += line.slice(1) + '\n'
        else if (line.startsWith('+')) a += line.slice(1) + '\n'
        else if (line.startsWith(' ')) {
          b += line.slice(1) + '\n'
          a += line.slice(1) + '\n'
        }
      }
      setUnifiedParts({ before: b, after: a })
    }
  }, [unifiedDiff])
  
  const { output: unifiedOldTokens } = useSyntaxHighlight(unifiedParts?.before || '', { lang: language, mode: 'tokens', enabled: shouldHighlight && !!unifiedParts })
  const { output: unifiedNewTokens } = useSyntaxHighlight(unifiedParts?.after || '', { lang: language, mode: 'tokens', enabled: shouldHighlight && !!unifiedParts })
  
  const [lines, setLines] = useState<DiffLine[]>([])

  useEffect(() => {
    // 模式 1: Unified Diff (直接解析，不计算 diff)
    if (unifiedDiff) {
      const result: DiffLine[] = []
      const diffLinesArr = unifiedDiff.split('\n')
      
      // 如果需要高亮
      let oldHtmlLines: string[] = []
      let newHtmlLines: string[] = []
      
      if (shouldHighlight && unifiedOldTokens && unifiedNewTokens) {
        oldHtmlLines = tokensToHtmlLines(unifiedOldTokens as any[][])
        newHtmlLines = tokensToHtmlLines(unifiedNewTokens as any[][])
      }
      
      let oldLineNo = 1
      let newLineNo = 1
      let oldIdx = 0
      let newIdx = 0
      
      // 解析 unified diff header 寻找起始行号 (@@ -1,5 +1,5 @@)
      for (const line of diffLinesArr) {
        if (line.startsWith('---') || line.startsWith('+++') || line.startsWith('Index:') || line.startsWith('===')) {
          continue
        }
        
        if (line.startsWith('@@')) {
          // Parse hunk header: @@ -oldStart,oldLen +newStart,newLen @@
          const match = line.match(/@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/)
          if (match) {
            oldLineNo = parseInt(match[1], 10)
            newLineNo = parseInt(match[2], 10)
            
            // 渲染一个分隔符行? 或者只是更新行号
            result.push({ 
              type: 'context', 
              content: '<span class="text-text-500 opacity-50">...</span>',
              oldLineNo: undefined,
              newLineNo: undefined
            })
          }
          continue
        }
        
        if (line.startsWith('-')) {
          const content = shouldHighlight && oldHtmlLines[oldIdx] 
            ? oldHtmlLines[oldIdx] 
            : escapeHtml(line.slice(1))
            
          result.push({ 
            type: 'delete', 
            content, 
            oldLineNo: oldLineNo++ 
          })
          oldIdx++
        } else if (line.startsWith('+')) {
          const content = shouldHighlight && newHtmlLines[newIdx] 
            ? newHtmlLines[newIdx] 
            : escapeHtml(line.slice(1))
            
          result.push({ 
            type: 'add', 
            content, 
            newLineNo: newLineNo++ 
          })
          newIdx++
        } else if (line.startsWith(' ')) {
          const content = shouldHighlight && newHtmlLines[newIdx] 
            ? newHtmlLines[newIdx] 
            : escapeHtml(line.slice(1))
            
          result.push({ 
            type: 'context', 
            content, 
            oldLineNo: oldLineNo++, 
            newLineNo: newLineNo++ 
          })
          oldIdx++
          newIdx++
        }
      }
      
      setLines(result)
      return
    }
    
    // 模式 2: Before/After (需要计算 diff)
    if (!before || !after) return

    const changes = diffLines(before, after)
    
    if (!shouldHighlight || !oldTokens || !newTokens) {
      // 无高亮模式
      const result: DiffLine[] = []
      let oldLineNo = 1, newLineNo = 1
      
      for (const change of changes) {
        const changeLines = (change.value || '').replace(/\n$/, '').split('\n')
        
        for (const line of changeLines) {
          if (change.added) {
            result.push({ type: 'add', content: escapeHtml(line), newLineNo: newLineNo++ })
          } else if (change.removed) {
            result.push({ type: 'delete', content: escapeHtml(line), oldLineNo: oldLineNo++ })
          } else {
            result.push({ type: 'context', content: escapeHtml(line), oldLineNo: oldLineNo++, newLineNo: newLineNo++ })
          }
        }
      }
      setLines(result)
      return
    }

    // 带高亮模式
    const oldHtmlLines = tokensToHtmlLines(oldTokens as any[][])
    const newHtmlLines = tokensToHtmlLines(newTokens as any[][])
    
    const result: DiffLine[] = []
    let oldIdx = 0, newIdx = 0
    
    for (const change of changes) {
      const count = change.count || 0
      
      if (change.removed) {
        for (let i = 0; i < count; i++) {
          result.push({ type: 'delete', content: oldHtmlLines[oldIdx + i] || ' ', oldLineNo: oldIdx + i + 1 })
        }
        oldIdx += count
      } else if (change.added) {
        for (let i = 0; i < count; i++) {
          result.push({ type: 'add', content: newHtmlLines[newIdx + i] || ' ', newLineNo: newIdx + i + 1 })
        }
        newIdx += count
      } else {
        for (let i = 0; i < count; i++) {
          result.push({
            type: 'context',
            content: newHtmlLines[newIdx + i] || ' ',
            oldLineNo: oldIdx + i + 1,
            newLineNo: newIdx + i + 1,
          })
        }
        oldIdx += count
        newIdx += count
      }
    }
    
    setLines(result)
  }, [before, after, unifiedDiff, oldTokens, newTokens, unifiedOldTokens, unifiedNewTokens, shouldHighlight])

  if (lines.length === 0) {
    return <div className="p-3 text-text-500 font-mono animate-pulse">Loading...</div>
  }

  return (
    <table className="w-full border-collapse table-fixed">
      <colgroup>
        <col className="w-10" />
        <col className="w-10" />
        <col />
      </colgroup>
      <tbody>
        {lines.map((line, idx) => {
          const rowBgClass = line.type === 'add' ? 'bg-success-bg' :
                             line.type === 'delete' ? 'bg-danger-bg' : ''
          return (
          <tr
            key={idx}
          >
            {/* Old line number - 只在非 add 时显示 */}
            <td className={`px-2 py-0.5 text-right text-text-500 select-none tabular-nums font-mono text-[11px] align-top border-r border-border-300/20 ${rowBgClass}`}>
              {line.type !== 'add' && line.oldLineNo}
            </td>
            {/* New line number - 只在非 delete 时显示 */}
            <td className={`px-2 py-0.5 text-right text-text-500 select-none tabular-nums font-mono text-[11px] align-top border-r border-border-300/20 ${rowBgClass}`}>
              {line.type !== 'delete' && line.newLineNo}
            </td>
            {/* Content with inline +/- indicator */}
            <td className={`px-3 py-0.5 font-mono whitespace-pre break-all align-top relative ${rowBgClass}`}>
              {/* +/- indicator */}
              {(line.type === 'add' || line.type === 'delete') && (
                <span className={`absolute left-0.5 select-none font-bold opacity-70 ${
                  line.type === 'add' ? 'text-success-100' : 'text-danger-100'
                }`}>
                  {line.type === 'add' ? '+' : '-'}
                </span>
              )}
              <span dangerouslySetInnerHTML={{ __html: line.content }} />
            </td>
          </tr>
        )})}
      </tbody>
    </table>
  )
})

// ============================================
// Helpers
// ============================================

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

function tokensToHtmlLines(tokenLines: any[][]): string[] {
  return tokenLines.map(lineTokens => {
    if (!lineTokens || lineTokens.length === 0) return ' '
    return lineTokens.map(t => 
      `<span style="color:${t.color}">${escapeHtml(t.content)}</span>`
    ).join('')
  })
}
