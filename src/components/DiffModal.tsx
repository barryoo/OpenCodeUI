/**
 * DiffModal - 全屏/大屏 Diff 查看器
 * 
 * 特性：
 * - 全屏 overlay 展示
 * - Side-by-side（左右对比）和 Unified（上下对比）两种模式
 * - 根据屏幕宽度自动切换模式
 * - 支持语法高亮
 */

import { memo, useState, useEffect, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { diffLines } from 'diff'
import { CloseIcon } from './Icons'
import { useSyntaxHighlight } from '../hooks/useSyntaxHighlight'
import { detectLanguage } from '../utils/languageUtils'

// ============================================
// Types
// ============================================

interface DiffModalProps {
  isOpen: boolean
  onClose: () => void
  /** Diff 数据 */
  diff: { before: string; after: string } | string
  /** 文件路径 */
  filePath?: string
  /** 语言 */
  language?: string
  /** Diff 统计 */
  diffStats?: { additions: number; deletions: number }
}

interface DiffLine {
  type: 'add' | 'delete' | 'context'
  content: string
  oldLineNo?: number
  newLineNo?: number
}

// ============================================
// Main Component
// ============================================

export const DiffModal = memo(function DiffModal({
  isOpen,
  onClose,
  diff,
  filePath,
  language,
  diffStats: providedStats,
}: DiffModalProps) {
  const [shouldRender, setShouldRender] = useState(false)
  const [isVisible, setIsVisible] = useState(false)
  const [viewMode, setViewMode] = useState<'split' | 'unified'>('split')
  
  // 响应式：窄屏自动切换到 unified
  useEffect(() => {
    const checkWidth = () => {
      setViewMode(window.innerWidth >= 900 ? 'split' : 'unified')
    }
    checkWidth()
    window.addEventListener('resize', checkWidth)
    return () => window.removeEventListener('resize', checkWidth)
  }, [])

  // Mount/Unmount 动画
  useEffect(() => {
    if (isOpen) {
      setShouldRender(true)
    } else {
      setIsVisible(false)
      const timer = setTimeout(() => setShouldRender(false), 200)
      return () => clearTimeout(timer)
    }
  }, [isOpen])

  useEffect(() => {
    if (shouldRender && isOpen) {
      const timer = setTimeout(() => setIsVisible(true), 10)
      return () => clearTimeout(timer)
    }
  }, [shouldRender, isOpen])

  // ESC 关闭
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) onClose()
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, onClose])

  // 解析 diff 数据
  const { before, after } = useMemo(() => {
    if (typeof diff === 'object') {
      return diff
    }
    // 从 unified diff 字符串提取
    return extractContentFromUnifiedDiff(diff)
  }, [diff])

  const lang = language || detectLanguage(filePath) || 'text'
  const fileName = filePath?.split(/[/\\]/).pop()

  // 计算统计
  const diffStats = useMemo(() => {
    if (providedStats) return providedStats
    const changes = diffLines(before, after)
    let additions = 0, deletions = 0
    for (const c of changes) {
      if (c.added) additions += c.count || 0
      if (c.removed) deletions += c.count || 0
    }
    return { additions, deletions }
  }, [before, after, providedStats])

  if (!shouldRender) return null

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex flex-col transition-all duration-200 ease-out"
      style={{
        backgroundColor: isVisible ? 'rgba(0,0,0,0.85)' : 'rgba(0,0,0,0)',
        backdropFilter: isVisible ? 'blur(4px)' : 'blur(0px)',
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      {/* Header */}
      <div 
        className="flex items-center justify-between px-4 py-3 border-b border-white/10 transition-all duration-200"
        style={{ opacity: isVisible ? 1 : 0 }}
      >
        <div className="flex items-center gap-4">
          {fileName && (
            <span className="text-white/90 font-mono text-sm font-medium">{fileName}</span>
          )}
          <div className="flex items-center gap-3 text-xs font-mono">
            {diffStats.additions > 0 && (
              <span className="text-green-400">+{diffStats.additions}</span>
            )}
            {diffStats.deletions > 0 && (
              <span className="text-red-400">-{diffStats.deletions}</span>
            )}
          </div>
        </div>
        
        <div className="flex items-center gap-3">
          {/* 视图模式切换 */}
          <div className="flex items-center bg-white/10 rounded-md p-0.5 text-xs">
            <button
              className={`px-3 py-1 rounded transition-colors ${
                viewMode === 'split' ? 'bg-white/20 text-white' : 'text-white/60 hover:text-white/80'
              }`}
              onClick={() => setViewMode('split')}
            >
              Split
            </button>
            <button
              className={`px-3 py-1 rounded transition-colors ${
                viewMode === 'unified' ? 'bg-white/20 text-white' : 'text-white/60 hover:text-white/80'
              }`}
              onClick={() => setViewMode('unified')}
            >
              Unified
            </button>
          </div>
          
          <button
            onClick={onClose}
            className="p-1.5 text-white/60 hover:text-white hover:bg-white/10 rounded-md transition-colors"
          >
            <CloseIcon size={18} />
          </button>
        </div>
      </div>

      {/* Content */}
      <div 
        className="flex-1 overflow-auto custom-scrollbar transition-all duration-200"
        style={{ opacity: isVisible ? 1 : 0 }}
        onClick={(e) => e.stopPropagation()}
      >
        {viewMode === 'split' ? (
          <SplitDiffView before={before} after={after} language={lang} />
        ) : (
          <UnifiedDiffView before={before} after={after} language={lang} />
        )}
      </div>
    </div>,
    document.body
  )
})

// ============================================
// Split Diff View (Side-by-Side)
// ============================================

interface DiffViewProps {
  before: string
  after: string
  language: string
}

const SplitDiffView = memo(function SplitDiffView({ before, after, language }: DiffViewProps) {
  const { output: oldTokens } = useSyntaxHighlight(before, { lang: language, mode: 'tokens' })
  const { output: newTokens } = useSyntaxHighlight(after, { lang: language, mode: 'tokens' })
  
  const { oldLines, newLines } = useMemo(() => {
    if (!oldTokens || !newTokens) return { oldLines: [], newLines: [] }
    
    const changes = diffLines(before, after)
    const oldHtml = tokensToHtmlLines(oldTokens as any[][])
    const newHtml = tokensToHtmlLines(newTokens as any[][])
    
    const oldResult: DiffLine[] = []
    const newResult: DiffLine[] = []
    let oldIdx = 0, newIdx = 0
    
    for (const change of changes) {
      const count = change.count || 0
      
      if (change.removed) {
        for (let i = 0; i < count; i++) {
          oldResult.push({ type: 'delete', content: oldHtml[oldIdx + i] || ' ', oldLineNo: oldIdx + i + 1 })
          newResult.push({ type: 'context', content: '', newLineNo: undefined }) // 空行占位
        }
        oldIdx += count
      } else if (change.added) {
        for (let i = 0; i < count; i++) {
          oldResult.push({ type: 'context', content: '', oldLineNo: undefined }) // 空行占位
          newResult.push({ type: 'add', content: newHtml[newIdx + i] || ' ', newLineNo: newIdx + i + 1 })
        }
        newIdx += count
      } else {
        for (let i = 0; i < count; i++) {
          oldResult.push({ type: 'context', content: oldHtml[oldIdx + i] || ' ', oldLineNo: oldIdx + i + 1 })
          newResult.push({ type: 'context', content: newHtml[newIdx + i] || ' ', newLineNo: newIdx + i + 1 })
        }
        oldIdx += count
        newIdx += count
      }
    }
    
    return { oldLines: oldResult, newLines: newResult }
  }, [before, after, oldTokens, newTokens])

  if (oldLines.length === 0) {
    return <div className="p-4 text-white/50 text-sm animate-pulse">Loading...</div>
  }

  return (
    <div className="flex min-h-full">
      {/* Left (Before) */}
      <div className="flex-1 border-r border-white/10 overflow-x-auto">
        <div className="px-3 py-1.5 text-xs text-white/40 border-b border-white/10 sticky top-0 bg-black/50 backdrop-blur">
          Before
        </div>
        <table className="w-full border-collapse text-xs font-mono">
          <tbody>
            {oldLines.map((line, idx) => (
              <tr key={idx} className={line.type === 'delete' ? 'bg-red-500/20' : ''}>
                <td className="px-2 py-0.5 text-right text-white/30 select-none w-12 align-top border-r border-white/5">
                  {line.oldLineNo}
                </td>
                <td className="px-3 py-0.5 whitespace-pre text-white/90 align-top">
                  {line.type === 'delete' && <span className="text-red-400 mr-2 select-none">-</span>}
                  <span dangerouslySetInnerHTML={{ __html: line.content }} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      
      {/* Right (After) */}
      <div className="flex-1 overflow-x-auto">
        <div className="px-3 py-1.5 text-xs text-white/40 border-b border-white/10 sticky top-0 bg-black/50 backdrop-blur">
          After
        </div>
        <table className="w-full border-collapse text-xs font-mono">
          <tbody>
            {newLines.map((line, idx) => (
              <tr key={idx} className={line.type === 'add' ? 'bg-green-500/20' : ''}>
                <td className="px-2 py-0.5 text-right text-white/30 select-none w-12 align-top border-r border-white/5">
                  {line.newLineNo}
                </td>
                <td className="px-3 py-0.5 whitespace-pre text-white/90 align-top">
                  {line.type === 'add' && <span className="text-green-400 mr-2 select-none">+</span>}
                  <span dangerouslySetInnerHTML={{ __html: line.content }} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
})

// ============================================
// Unified Diff View
// ============================================

const UnifiedDiffView = memo(function UnifiedDiffView({ before, after, language }: DiffViewProps) {
  const { output: oldTokens } = useSyntaxHighlight(before, { lang: language, mode: 'tokens' })
  const { output: newTokens } = useSyntaxHighlight(after, { lang: language, mode: 'tokens' })
  
  const lines = useMemo(() => {
    if (!oldTokens || !newTokens) return []
    
    const changes = diffLines(before, after)
    const oldHtml = tokensToHtmlLines(oldTokens as any[][])
    const newHtml = tokensToHtmlLines(newTokens as any[][])
    
    const result: DiffLine[] = []
    let oldIdx = 0, newIdx = 0
    
    for (const change of changes) {
      const count = change.count || 0
      
      if (change.removed) {
        for (let i = 0; i < count; i++) {
          result.push({ type: 'delete', content: oldHtml[oldIdx + i] || ' ', oldLineNo: oldIdx + i + 1 })
        }
        oldIdx += count
      } else if (change.added) {
        for (let i = 0; i < count; i++) {
          result.push({ type: 'add', content: newHtml[newIdx + i] || ' ', newLineNo: newIdx + i + 1 })
        }
        newIdx += count
      } else {
        for (let i = 0; i < count; i++) {
          result.push({
            type: 'context',
            content: newHtml[newIdx + i] || ' ',
            oldLineNo: oldIdx + i + 1,
            newLineNo: newIdx + i + 1,
          })
        }
        oldIdx += count
        newIdx += count
      }
    }
    
    return result
  }, [before, after, oldTokens, newTokens])

  if (lines.length === 0) {
    return <div className="p-4 text-white/50 text-sm animate-pulse">Loading...</div>
  }

  return (
    <div className="max-w-4xl mx-auto">
      <table className="w-full border-collapse text-xs font-mono">
        <tbody>
          {lines.map((line, idx) => {
            const bgClass = line.type === 'add' ? 'bg-green-500/20' :
                           line.type === 'delete' ? 'bg-red-500/20' : ''
            return (
              <tr key={idx}>
                <td className={`px-2 py-0.5 text-right text-white/30 select-none w-12 align-top border-r border-white/5 ${bgClass}`}>
                  {line.type !== 'add' && line.oldLineNo}
                </td>
                <td className={`px-2 py-0.5 text-right text-white/30 select-none w-12 align-top border-r border-white/5 ${bgClass}`}>
                  {line.type !== 'delete' && line.newLineNo}
                </td>
                <td className={`px-3 py-0.5 whitespace-pre text-white/90 align-top ${bgClass}`}>
                  {line.type === 'add' && <span className="text-green-400 mr-2 select-none">+</span>}
                  {line.type === 'delete' && <span className="text-red-400 mr-2 select-none">-</span>}
                  <span dangerouslySetInnerHTML={{ __html: line.content }} />
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
})

// ============================================
// Helpers
// ============================================

function extractContentFromUnifiedDiff(diff: string): { before: string, after: string } {
  let before = '', after = ''
  const lines = diff.split('\n')
  
  for (const line of lines) {
    if (line.startsWith('---') || line.startsWith('+++') || 
        line.startsWith('Index:') || line.startsWith('===') ||
        line.startsWith('@@') || line.startsWith('\\ No newline')) {
      continue
    }
    if (line.startsWith('-')) {
      before += line.slice(1) + '\n'
    } else if (line.startsWith('+')) {
      after += line.slice(1) + '\n'
    } else if (line.startsWith(' ')) {
      before += line.slice(1) + '\n'
      after += line.slice(1) + '\n'
    }
  }
  
  return { before: before.trimEnd(), after: after.trimEnd() }
}

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
