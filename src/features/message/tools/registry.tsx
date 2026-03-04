import type { ReactNode } from 'react'
import type { ToolPart } from '../../../types/message'
import type { ToolConfig, ToolRegistry, ExtractedToolData, DiagnosticInfo } from './types'
import {
  FileReadIcon,
  FileWriteIcon,
  TerminalIcon,
  SearchIcon,
  GlobeIcon,
  BrainIcon,
  ChecklistIcon,
  QuestionIcon,
  TaskIcon,
  WrenchIcon,
} from './icons'
import { detectLanguage } from '../../../utils/languageUtils'
import { BashRenderer } from './renderers'

// ============================================
// Tool Matchers (复用的匹配函数)
// ============================================

const includes = (...keywords: string[]) => (name: string) => {
  const lower = name.toLowerCase()
  return keywords.some(k => lower.includes(k))
}

const exact = (...names: string[]) => (name: string) => {
  const lower = name.toLowerCase()
  return names.some(n => lower === n)
}

// ============================================
// Default Data Extractor
// ============================================

export function defaultExtractData(part: ToolPart): ExtractedToolData {
  const { state } = part
  const inputObj = state.input as Record<string, unknown> | undefined
  const metadata = state.metadata as Record<string, unknown> | undefined
  
  const result: ExtractedToolData = {}
  
  // Input
  if (inputObj && Object.keys(inputObj).length > 0) {
    result.input = JSON.stringify(inputObj, null, 2)
    result.inputLang = 'json'
  }
  
  // Error
  if (state.error) {
    result.error = String(state.error)
  }
  
  // FilePath
  if (metadata && typeof metadata.filepath === 'string') {
    result.filePath = metadata.filepath
  }
  if (!result.filePath) {
    const inputPath = inputObj?.filePath ?? inputObj?.filepath ?? inputObj?.path
    if (inputPath !== undefined) {
      result.filePath = String(inputPath)
    }
  }
  
  // Exit code
  if (metadata && typeof metadata.exit === 'number') {
    result.exitCode = metadata.exit
  }

  const intent = extractIntentText(metadata, inputObj)
  if (intent) {
    result.subtitle = intent
  }
  
  // Diff / Files (from metadata)
  if (metadata) {
    if (Array.isArray(metadata.files) && metadata.files.length > 0) {
      result.files = (metadata.files as any[]).map((f: any) => ({
        filePath: f.filePath || f.file || 'unknown',
        diff: f.diff,
        before: f.before,
        after: f.after,
        additions: f.additions,
        deletions: f.deletions,
      }))
      if (!result.filePath && result.files.length === 1) {
        result.filePath = result.files[0].filePath
      }
    } else if (typeof metadata.diff === 'string') {
      // 优先使用 unified diff
      result.diff = metadata.diff
      // 从 filediff 获取统计
      if (metadata.filediff && typeof metadata.filediff === 'object') {
        const fd = metadata.filediff as { additions?: number; deletions?: number }
        if (fd.additions !== undefined || fd.deletions !== undefined) {
          result.diffStats = {
            additions: fd.additions || 0,
            deletions: fd.deletions || 0
          }
        }
      }
    } else if (metadata.filediff && typeof metadata.filediff === 'object') {
      const fd = metadata.filediff as { file?: string; before?: string; after?: string; additions?: number; deletions?: number }
      if (fd.before !== undefined && fd.after !== undefined) {
        result.diff = { before: fd.before, after: fd.after }
      }
      if (!result.filePath && fd.file) {
        result.filePath = fd.file
      }
      if (fd.additions !== undefined || fd.deletions !== undefined) {
        result.diffStats = {
          additions: fd.additions || 0,
          deletions: fd.deletions || 0
        }
      }
    }
    
    // 提取 diagnostics
    if (metadata.diagnostics && typeof metadata.diagnostics === 'object') {
      const diagMap = metadata.diagnostics as Record<string, any[]>
      const diagnostics: DiagnosticInfo[] = []
      
      for (const [file, items] of Object.entries(diagMap)) {
        if (!Array.isArray(items)) continue
        for (const item of items) {
          if (!item || typeof item !== 'object') continue
          // severity: 1=error, 2=warning, 3=info, 4=hint
          const severityMap: Record<number, DiagnosticInfo['severity']> = {
            1: 'error',
            2: 'warning',
            3: 'info',
            4: 'hint'
          }
          diagnostics.push({
            file: file.split(/[/\\]/).pop() || file,
            severity: severityMap[item.severity] || 'info',
            message: item.message || '',
            line: item.range?.start?.line ?? 0,
            column: item.range?.start?.character ?? 0
          })
        }
      }
      
      // 只保留 error 和 warning
      const filtered = diagnostics.filter(d => d.severity === 'error' || d.severity === 'warning')
      if (filtered.length > 0) {
        result.diagnostics = filtered
      }
    }
  }
  
  // Output language from filePath
  if (result.filePath) {
    result.outputLang = detectLanguage(result.filePath)
  }
  
  // Output
  if (!result.files && !result.diff && state.output) {
    result.output = typeof state.output === 'string' 
      ? state.output 
      : JSON.stringify(state.output, null, 2)
    
    // 推断语言
    if (!result.outputLang && result.output) {
      const trimmed = result.output.trim()
      if ((trimmed.startsWith('{') && trimmed.endsWith('}')) ||
          (trimmed.startsWith('[') && trimmed.endsWith(']'))) {
        result.outputLang = 'json'
      }
    }
  }
  
  return result
}

type PatchSectionKind = 'add' | 'update' | 'delete'

interface PatchSection {
  kind: PatchSectionKind
  filePath: string
  lines: string[]
}

function parseApplyPatchText(patchText: string): NonNullable<ExtractedToolData['files']> {
  const lines = patchText.replace(/\r\n/g, '\n').split('\n')
  const files: NonNullable<ExtractedToolData['files']> = []
  let current: PatchSection | null = null

  const pushCurrent = () => {
    if (!current) return
    const normalizedPath = normalizePatchPath(current.filePath)
    if (!normalizedPath) {
      current = null
      return
    }

    const diff = buildPatchSectionDiff(current)
    const stats = diff ? countDiffStats(diff) : undefined

    files.push({
      filePath: normalizedPath,
      diff,
      additions: stats?.additions,
      deletions: stats?.deletions,
    })

    current = null
  }

  for (const line of lines) {
    if (line.startsWith('*** Begin Patch')) continue
    if (line.startsWith('*** End Patch')) {
      pushCurrent()
      break
    }

    const sectionHeader = parsePatchSectionHeader(line)
    if (sectionHeader) {
      pushCurrent()
      current = {
        kind: sectionHeader.kind,
        filePath: sectionHeader.filePath,
        lines: [],
      }
      continue
    }

    if (!current) continue

    const moveToMatch = line.match(/^\*\*\* Move to:\s+(.+)$/)
    if (moveToMatch) {
      current.filePath = moveToMatch[1]
      continue
    }

    if (line.startsWith('***')) continue
    current.lines.push(line)
  }

  pushCurrent()
  return files
}

function parsePatchSectionHeader(line: string): { kind: PatchSectionKind; filePath: string } | null {
  const addMatch = line.match(/^\*\*\* Add File:\s+(.+)$/)
  if (addMatch) {
    return { kind: 'add', filePath: addMatch[1] }
  }

  const updateMatch = line.match(/^\*\*\* Update File:\s+(.+)$/)
  if (updateMatch) {
    return { kind: 'update', filePath: updateMatch[1] }
  }

  const deleteMatch = line.match(/^\*\*\* Delete File:\s+(.+)$/)
  if (deleteMatch) {
    return { kind: 'delete', filePath: deleteMatch[1] }
  }

  return null
}

function normalizePatchPath(filePath: string): string {
  const trimmed = filePath.trim()
  if (!trimmed) return ''

  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1)
  }

  return trimmed
}

function buildPatchSectionDiff(section: PatchSection): string | undefined {
  if (section.lines.length === 0) return undefined

  const normalizedLines = section.lines.map((line) => normalizePatchLine(line, section.kind))
  const hasDiffMarkers = normalizedLines.some(
    (line) => line.startsWith('+') || line.startsWith('-') || line.startsWith('@@'),
  )

  if (!hasDiffMarkers) return undefined

  return normalizedLines.join('\n').trimEnd()
}

function normalizePatchLine(line: string, kind: PatchSectionKind): string {
  if (
    line.startsWith('@@') ||
    line.startsWith('+') ||
    line.startsWith('-') ||
    line.startsWith(' ') ||
    line.startsWith('\\ No newline')
  ) {
    return line
  }

  if (kind === 'add') return `+${line}`
  if (kind === 'delete') return `-${line}`
  return ` ${line}`
}

function countDiffStats(diff: string): { additions: number; deletions: number } {
  let additions = 0
  let deletions = 0

  for (const line of diff.split('\n')) {
    if (line.startsWith('+++') || line.startsWith('---')) continue
    if (line.startsWith('+')) additions += 1
    if (line.startsWith('-')) deletions += 1
  }

  return { additions, deletions }
}

function normalizeIntentText(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const compact = value.replace(/\s+/g, ' ').trim()
  if (!compact) return undefined
  return compact.length > 120 ? `${compact.slice(0, 117)}...` : compact
}

function extractIntentText(
  metadata?: Record<string, unknown>,
  inputObj?: Record<string, unknown>,
): string | undefined {
  const metadataIntent =
    normalizeIntentText(metadata?.intent) ||
    normalizeIntentText(metadata?.operation) ||
    normalizeIntentText(metadata?.description) ||
    normalizeIntentText(metadata?.summary) ||
    normalizeIntentText(metadata?.action) ||
    normalizeIntentText(metadata?.reason)

  if (metadataIntent) return metadataIntent

  const inputIntent =
    normalizeIntentText(inputObj?.description) ||
    normalizeIntentText(inputObj?.intent) ||
    normalizeIntentText(inputObj?.summary)

  if (inputIntent) return inputIntent

  const queryLike =
    normalizeIntentText(inputObj?.query) ||
    normalizeIntentText(inputObj?.pattern) ||
    normalizeIntentText(inputObj?.prompt)

  if (queryLike) return queryLike

  const command = normalizeIntentText(inputObj?.command)
  if (command) return `Run: ${command}`

  return undefined
}

// ============================================
// Tool-Specific Data Extractors
// ============================================

function bashExtractData(part: ToolPart): ExtractedToolData {
  const base = defaultExtractData(part)
  const inputObj = part.state.input as Record<string, unknown> | undefined
  
  if (inputObj?.command) {
    base.input = String(inputObj.command)
    base.inputLang = 'bash'
  }
  
  return base
}

function readExtractData(part: ToolPart): ExtractedToolData {
  const base = defaultExtractData(part)
  
  if (part.state.output) {
    const str = String(part.state.output)
    const match = str.match(/<file[^>]*>([\s\S]*?)<\/file>/i)
    base.output = match ? match[1] : str
  }
  
  return base
}

function writeExtractData(part: ToolPart): ExtractedToolData {
  const base = defaultExtractData(part)
  const inputObj = part.state.input as Record<string, unknown> | undefined
  
  // 从 input.content 构造 diff（和 editExtractData 一致）
  // 状态控制由渲染层（OutputBlock）统一处理，extractData 只做数据转换
  if (!base.files && !base.diff && inputObj?.content && typeof inputObj.content === 'string') {
    base.diff = {
      before: '',
      after: inputObj.content
    }
  }
  
  return base
}

function editExtractData(part: ToolPart): ExtractedToolData {
  const base = defaultExtractData(part)
  const inputObj = part.state.input as Record<string, unknown> | undefined

  if (!base.files && !base.diff && typeof inputObj?.patchText === 'string') {
    const parsedFiles = parseApplyPatchText(inputObj.patchText)
    if (parsedFiles.length > 0) {
      if (parsedFiles.length === 1) {
        const firstFile = parsedFiles[0]
        base.filePath = base.filePath || firstFile.filePath
        if (firstFile.diff) {
          base.diff = firstFile.diff
          if (firstFile.additions !== undefined || firstFile.deletions !== undefined) {
            base.diffStats = {
              additions: firstFile.additions || 0,
              deletions: firstFile.deletions || 0,
            }
          }
        } else {
          base.files = parsedFiles
        }
      } else {
        base.files = parsedFiles
        base.subtitle = `${parsedFiles.length} files`
      }
    }
  }
  
  // 如果 metadata 没有 diff，从 input 构造
  if (!base.files && !base.diff && inputObj?.oldString && inputObj?.newString) {
    base.diff = {
      before: String(inputObj.oldString),
      after: String(inputObj.newString)
    }
  }
  
  return base
}

// ============================================
// Tool Registry
// 按优先级排列，第一个匹配的配置生效
// ============================================

export const toolRegistry: ToolRegistry = [
  // Bash / Terminal
  {
    match: includes('bash', 'sh', 'cmd', 'terminal', 'shell'),
    icon: <TerminalIcon />,
    extractData: bashExtractData,
    renderer: BashRenderer,
  },
  
  // Todo (must be before write/read to avoid TodoWrite matching "write")
  {
    match: includes('todo'),
    icon: <ChecklistIcon />,
  },
  
  // Task (子 agent)
  {
    match: exact('task'),
    icon: <TaskIcon />,
  },
  
  // Read file
  {
    match: includes('read', 'cat'),
    icon: <FileReadIcon />,
    extractData: readExtractData,
  },
  
  // Write file
  {
    match: includes('write', 'save'),
    icon: <FileWriteIcon />,
    extractData: writeExtractData,
  },
  
  // Edit file
  {
    match: includes('edit', 'replace', 'patch'),
    icon: <FileWriteIcon />,
    extractData: editExtractData,
  },
  
  // Search / Grep / Glob
  {
    match: includes('search', 'find', 'grep', 'glob'),
    icon: <SearchIcon />,
    extractData: (part: ToolPart): ExtractedToolData => {
      const base = defaultExtractData(part)
      const inputObj = part.state.input as Record<string, unknown> | undefined
      if (!inputObj) return base

      // 搜索词：pattern / query / glob pattern
      const pattern =
        inputObj.pattern ??
        inputObj.query ??
        inputObj.glob_pattern ??
        inputObj.glob

      // 搜索路径：path / directory（存入 filePath 供标题行相对化显示）
      const rawPath =
        inputObj.path ??
        inputObj.directory ??
        inputObj.dir

      // filePath 存路径（供标题行相对化显示），subtitle 存 pattern
      if (rawPath) {
        base.filePath = String(rawPath)
      }
      if (pattern) {
        base.subtitle = String(pattern)
      }

      return base
    },
  },
  
  // Web / Network
  {
    match: includes('web', 'fetch', 'http', 'browse', 'network', 'exa'),
    icon: <GlobeIcon />,
  },
  
  // Think / Reasoning
  {
    match: includes('think', 'reason', 'plan'),
    icon: <BrainIcon />,
  },
  
  // Question
  {
    match: includes('question', 'ask'),
    icon: <QuestionIcon />,
  },
]

// ============================================
// Registry Helpers
// ============================================

/**
 * 获取工具配置
 */
export function getToolConfig(toolName: string): ToolConfig | undefined {
  return toolRegistry.find(config => config.match(toolName))
}

/**
 * 获取工具图标
 */
export function getToolIcon(toolName: string): ReactNode {
  const config = getToolConfig(toolName)
  return config?.icon ?? <WrenchIcon />
}

/**
 * 提取工具数据
 */
export function extractToolData(part: ToolPart): ExtractedToolData {
  const config = getToolConfig(part.tool)
  if (config?.extractData) {
    return config.extractData(part)
  }
  return defaultExtractData(part)
}
