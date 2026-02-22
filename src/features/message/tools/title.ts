import type { ToolPart } from '../../../types/message'

const GREP_PRIMARY_KEYS = ['pattern', 'query', 'regex', 'regexp'] as const
const GREP_SCOPE_KEYS = ['path', 'include', 'glob', 'cwd', 'directory'] as const

const GLOB_PRIMARY_KEYS = ['pattern', 'glob', 'query'] as const
const GLOB_SCOPE_KEYS = ['path', 'cwd', 'directory'] as const

interface ToolTitleOptions {
  projectDirectory?: string
}

interface TitleBuildOptions {
  projectDirectory?: string
  shortenPrimaryAsPath?: boolean
}

interface FieldPick {
  raw: unknown
}

export function getToolDisplayTitle(part: ToolPart, options?: ToolTitleOptions): string {
  const explicitTitle = normalizeText(part.state.title)
  if (explicitTitle) return explicitTitle

  const input = toRecord(part.state.input)
  if (!input) return ''

  const toolName = part.tool.toLowerCase()

  if (toolName.includes('grep')) {
    return buildSearchTitle(input, GREP_PRIMARY_KEYS, GREP_SCOPE_KEYS, {
      projectDirectory: options?.projectDirectory,
      shortenPrimaryAsPath: false,
    })
  }

  if (toolName.includes('glob')) {
    return buildSearchTitle(input, GLOB_PRIMARY_KEYS, GLOB_SCOPE_KEYS, {
      projectDirectory: options?.projectDirectory,
      shortenPrimaryAsPath: true,
    })
  }

  return ''
}

function buildSearchTitle(
  input: Record<string, unknown>,
  primaryKeys: readonly string[],
  scopeKeys: readonly string[],
  options: TitleBuildOptions
): string {
  const projectDirectory = resolveProjectDirectory(input, options.projectDirectory)
  const scopeField = pickField(input, scopeKeys)
  const primaryField = pickField(input, primaryKeys)
  const scope = scopeField
    ? normalizeValue(scopeField.raw, value => shortenPathDisplay(value, projectDirectory))
    : ''
  const primary = primaryField
    ? normalizeValue(
      primaryField.raw,
      options.shortenPrimaryAsPath
        ? value => shortenPathDisplay(value, projectDirectory)
        : undefined
    )
    : ''

  // 搜索类标题更可读的顺序：范围（路径）在前，pattern 在后
  if (scope && primary && scope !== primary) {
    return `${scope} · ${primary}`
  }

  return scope || primary || ''
}

function pickField(input: Record<string, unknown>, keys: readonly string[]): FieldPick | null {
  for (const key of keys) {
    const value = normalizeValue(input[key])
    if (value) return { raw: input[key] }
  }
  return null
}

function toRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  return value as Record<string, unknown>
}

function normalizeValue(value: unknown, transformText?: (value: string) => string): string {
  if (typeof value === 'string') {
    const normalized = normalizeText(value)
    if (!normalized) return ''
    return transformText ? transformText(normalized) : normalized
  }

  if (Array.isArray(value)) {
    const normalized = value
      .map(item => normalizeValue(item, transformText))
      .filter(Boolean)

    if (normalized.length === 0) return ''
    if (normalized.length === 1) return normalized[0]
    return `${normalized[0]} +${normalized.length - 1}`
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value)
  }

  return ''
}

function normalizeText(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const normalized = value.replace(/\s+/g, ' ').trim()
  return normalized || null
}

function resolveProjectDirectory(
  input: Record<string, unknown>,
  explicitProjectDirectory?: string
): string | null {
  const explicit = normalizePath(explicitProjectDirectory)
  if (explicit) return explicit

  for (const key of ['directory', 'cwd']) {
    const value = input[key]
    if (typeof value !== 'string') continue
    const normalized = normalizePath(value)
    if (normalized) return normalized
  }

  return null
}

function shortenPathDisplay(value: string, projectDirectory: string | null): string {
  const normalized = normalizePath(value)
  if (!normalized) return value

  if (projectDirectory) {
    const relative = toProjectRelativePath(normalized, projectDirectory)
    if (relative !== null) return relative
  }

  return normalized.replace(/^\.\//, '')
}

function toProjectRelativePath(targetPath: string, projectDirectory: string): string | null {
  const target = normalizePath(targetPath)
  const project = normalizePath(projectDirectory)
  if (!target || !project) return null

  const isWindows = isWindowsPath(target) || isWindowsPath(project)
  const comparableTarget = isWindows ? target.toLowerCase() : target
  const comparableProject = isWindows ? project.toLowerCase() : project

  if (comparableTarget === comparableProject) {
    return '.'
  }

  const projectPrefix = `${comparableProject}/`
  if (!comparableTarget.startsWith(projectPrefix)) {
    return null
  }

  const relative = target.slice(project.length + 1)
  return relative || '.'
}

function normalizePath(value: string | undefined): string {
  if (!value) return ''

  const normalized = value.trim().replace(/\\/g, '/')
  if (!normalized) return ''
  if (normalized === '/') return '/'

  const trimmed = normalized.replace(/\/+$/, '')
  if (/^[a-zA-Z]:$/.test(trimmed)) return `${trimmed}/`

  return trimmed || '/'
}

function isWindowsPath(path: string): boolean {
  return /^[a-zA-Z]:\//.test(path)
}
