/**
 * FileChangeSummary - 消息末尾的文件改动汇总栏
 *
 * 功能：
 * 1. 汇总栏：显示 "已修改 N 个文件 ||||"（竖线图表）
 * 2. 第一层展开：文件列表，每行右侧 +N -M
 * 3. 第二层展开（点击单个文件）：复用 ContentBlock 展示 diff
 */

import { memo, useState, useMemo } from 'react'
import { ChevronDownIcon, ChevronRightIcon } from '../../../components/Icons'
import { ContentBlock } from '../../../components/ContentBlock'
import { useCurrentDirectory } from '../../../contexts/DirectoryContext'
import { extractToolData } from '../tools'
import type { ToolPart } from '../../../types/message'

// ============================================
// Types
// ============================================

interface FileChange {
  filePath: string
  additions: number
  deletions: number
  diff?: { before: string; after: string } | string
}

// ============================================
// Helpers
// ============================================

const WRITE_EDIT_TOOLS = new Set(['write', 'save', 'edit', 'replace', 'patch', 'apply_patch', 'apply-patch'])

function isWriteEditTool(toolName: string): boolean {
  const lower = toolName.toLowerCase()
  return WRITE_EDIT_TOOLS.has(lower)
}

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

/**
 * 从 tool parts 中提取文件改动列表
 * 同一文件的多次编辑会合并（additions/deletions 累加，使用最后一次 diff）
 */
function extractFileChanges(toolParts: ToolPart[]): FileChange[] {
  const fileMap = new Map<string, FileChange>()

  for (const part of toolParts) {
    if (part.state.status !== 'completed') continue
    if (!isWriteEditTool(part.tool)) continue

    const data = extractToolData(part)

    // 处理 files 数组（部分工具返回多文件）
    if (data.files && data.files.length > 0) {
      for (const f of data.files) {
        const key = f.filePath
        const existing = fileMap.get(key)
        const additions = f.additions ?? 0
        const deletions = f.deletions ?? 0
        const diff = f.diff
          ? f.diff
          : f.before !== undefined && f.after !== undefined
          ? { before: f.before, after: f.after }
          : undefined

        if (existing) {
          existing.additions += additions
          existing.deletions += deletions
          if (diff) existing.diff = diff
        } else {
          fileMap.set(key, { filePath: key, additions, deletions, diff })
        }
      }
      continue
    }

    // 处理单文件
    const filePath = data.filePath
    if (!filePath) continue

    const additions = data.diffStats?.additions ?? 0
    const deletions = data.diffStats?.deletions ?? 0
    const diff = data.diff

    const existing = fileMap.get(filePath)
    if (existing) {
      existing.additions += additions
      existing.deletions += deletions
      if (diff) existing.diff = diff
    } else {
      fileMap.set(filePath, { filePath, additions, deletions, diff })
    }
  }

  return Array.from(fileMap.values())
}

/**
 * 生成竖线图表（类似 git log --stat 的图形）
 * 绿色竖线 = 新增，红色竖线 = 删除
 */
function DiffBar({ additions, deletions }: { additions: number; deletions: number }) {
  const total = additions + deletions
  if (total === 0) return null

  const MAX_BARS = 5
  const addBars = total > 0 ? Math.round((additions / total) * MAX_BARS) : 0
  const delBars = MAX_BARS - addBars

  return (
    <span className="inline-flex items-center gap-[2px] font-mono text-xs" aria-hidden>
      {Array.from({ length: addBars }).map((_, i) => (
        <span key={`a${i}`} className="w-[3px] h-[12px] rounded-[1px] bg-success-100 inline-block" />
      ))}
      {Array.from({ length: delBars }).map((_, i) => (
        <span key={`d${i}`} className="w-[3px] h-[12px] rounded-[1px] bg-danger-100 inline-block" />
      ))}
    </span>
  )
}

// ============================================
// File Row - 单个文件条目（可展开 diff）
// ============================================

interface FileRowProps {
  change: FileChange
  relativePath: string
  isLast: boolean
}

const FileRow = memo(function FileRow({ change, relativePath, isLast }: FileRowProps) {
  const [expanded, setExpanded] = useState(false)
  const hasDiff = !!change.diff

  return (
    <div className={`${isLast ? '' : 'border-b border-border-200/40'}`}>
      {/* 文件标题行 */}
      <div
        className={`flex items-center gap-2 px-3 py-2 text-xs ${
          hasDiff ? 'cursor-pointer hover:bg-bg-200/40 transition-colors' : ''
        }`}
        onClick={hasDiff ? () => setExpanded(!expanded) : undefined}
      >
        {/* 展开箭头 */}
        <span className="shrink-0 text-text-400 w-3">
          {hasDiff ? (
            expanded ? <ChevronDownIcon size={11} /> : <ChevronRightIcon size={11} />
          ) : null}
        </span>

        {/* 文件名 */}
        <span className="font-mono text-text-200 truncate flex-1 min-w-0" title={change.filePath}>
          {relativePath}
        </span>

        {/* 增删行数 */}
        <div className="flex items-center gap-2 shrink-0 font-mono font-medium text-[11px] tabular-nums">
          {change.additions > 0 && (
            <span className="text-success-100">+{change.additions}</span>
          )}
          {change.deletions > 0 && (
            <span className="text-danger-100">-{change.deletions}</span>
          )}
          {change.additions === 0 && change.deletions === 0 && (
            <span className="text-text-400">No changes</span>
          )}
        </div>
      </div>

      {/* Diff 内容（折叠动画） */}
      {hasDiff && (
        <div className={`grid transition-[grid-template-rows] duration-300 ease-in-out ${
          expanded ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'
        }`}>
          <div className="overflow-hidden">
            <div className="px-2 pb-2">
              <ContentBlock
                label=""
                hideLabel
                filePath={change.filePath}
                diff={change.diff}
                diffStats={{ additions: change.additions, deletions: change.deletions }}
                defaultCollapsed={false}
                collapsible={false}
                maxHeight={400}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  )
})

// ============================================
// FileChangeSummary - 主组件
// ============================================

interface FileChangeSummaryProps {
  toolParts: ToolPart[]
}

export const FileChangeSummary = memo(function FileChangeSummary({ toolParts }: FileChangeSummaryProps) {
  const cwd = useCurrentDirectory()
  const [expanded, setExpanded] = useState(false)

  const changes = useMemo(() => extractFileChanges(toolParts), [toolParts])

  if (changes.length === 0) return null

  const totalAdditions = changes.reduce((s, c) => s + c.additions, 0)
  const totalDeletions = changes.reduce((s, c) => s + c.deletions, 0)
  const fileCount = changes.length

  return (
    <div className="rounded-lg overflow-hidden border border-border-200/55 bg-bg-000/85 text-xs mt-1">
      {/* 汇总标题行 */}
      <button
        className="w-full flex items-center gap-2 px-3 py-2.5 bg-bg-200/30 hover:bg-bg-200/55 transition-colors text-left select-none"
        onClick={() => setExpanded(!expanded)}
      >
        <span className="shrink-0 text-text-400">
          {expanded ? <ChevronDownIcon size={12} /> : <ChevronRightIcon size={12} />}
        </span>
        <span className="font-medium text-text-200">
          已修改 <span className="tabular-nums">{fileCount}</span> 个文件
        </span>
        <DiffBar additions={totalAdditions} deletions={totalDeletions} />
      </button>

      {/* 文件列表（折叠动画） */}
      <div className={`grid transition-[grid-template-rows] duration-300 ease-in-out ${
        expanded ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'
      }`}>
        <div className="overflow-hidden">
          {changes.map((change, idx) => (
            <FileRow
              key={change.filePath}
              change={change}
              relativePath={toRelativePath(change.filePath, cwd)}
              isLast={idx === changes.length - 1}
            />
          ))}
        </div>
      </div>
    </div>
  )
})
