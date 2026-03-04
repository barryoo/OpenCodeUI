import { isValidElement, memo, useCallback, useMemo } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { CodeBlock } from './CodeBlock'
import { detectLanguage } from '../utils/languageUtils'
import { useCurrentDirectory } from '../contexts/DirectoryContext'
import { isAbsolutePath, normalizeToForwardSlash, uiErrorHandler } from '../utils'
import { isTauri } from '../utils/tauri'

interface MarkdownRendererProps {
  content: string
  className?: string
}

const INLINE_CODE_CLASS = 'font-mono text-accent-main-100 text-[0.95em] whitespace-pre-wrap break-words'
const STORAGE_KEY_PREFERRED_EDITOR = 'opencode:preferred-editor'
const DEFAULT_EDITOR_ID = 'vscode'
const COMMON_FILE_NAMES = new Set(['readme', 'license', 'dockerfile', 'makefile'])
const TRAILING_HTTP_PUNCTUATION = new Set([',', '.', ';', ')', '!', '?', '，', '。', '；', '！', '？', '）', '】', '》'])

type DesktopOs = 'macos' | 'windows' | 'linux' | 'unknown'

const EDITOR_OPEN_WITH_BY_OS: Record<DesktopOs, Partial<Record<string, string>>> = {
  macos: {
    vscode: 'Visual Studio Code',
    zed: 'Zed',
    cursor: 'Cursor',
    'intellij-idea': 'IntelliJ IDEA',
    windsurf: 'Windsurf',
    'vscode-insiders': 'Visual Studio Code - Insiders',
    vscodium: 'VSCodium',
    webstorm: 'WebStorm',
    pycharm: 'PyCharm',
    'android-studio': 'Android Studio',
    'sublime-text': 'Sublime Text',
    xcode: 'Xcode',
  },
  windows: {
    vscode: 'code',
    zed: 'zed',
    cursor: 'cursor',
    'intellij-idea': 'idea64.exe',
    windsurf: 'windsurf',
    'vscode-insiders': 'code-insiders',
    vscodium: 'codium',
    webstorm: 'webstorm64.exe',
    pycharm: 'pycharm64.exe',
    'android-studio': 'studio64.exe',
    'sublime-text': 'subl',
  },
  linux: {
    vscode: 'code',
    zed: 'zed',
    cursor: 'cursor',
    'intellij-idea': 'idea',
    windsurf: 'windsurf',
    'vscode-insiders': 'code-insiders',
    vscodium: 'codium',
    webstorm: 'webstorm',
    pycharm: 'pycharm',
    'android-studio': 'android-studio',
    'sublime-text': 'subl',
  },
  unknown: {
    vscode: 'code',
    zed: 'zed',
    cursor: 'cursor',
    'intellij-idea': 'idea',
    windsurf: 'windsurf',
    'vscode-insiders': 'code-insiders',
    vscodium: 'codium',
    webstorm: 'webstorm',
    pycharm: 'pycharm',
    'android-studio': 'android-studio',
    'sublime-text': 'subl',
  },
}

function detectDesktopOs(): DesktopOs {
  if (typeof navigator === 'undefined') return 'unknown'
  const platform = `${navigator.platform} ${navigator.userAgent}`.toLowerCase()

  if (platform.includes('mac')) return 'macos'
  if (platform.includes('win')) return 'windows'
  if (platform.includes('linux')) return 'linux'
  return 'unknown'
}

function readPreferredEditorId(): string {
  try {
    return localStorage.getItem(STORAGE_KEY_PREFERRED_EDITOR) || DEFAULT_EDITOR_ID
  } catch {
    return DEFAULT_EDITOR_ID
  }
}

function normalizePath(path: string): string {
  return path.replace(/\\/g, '/')
}

function toEditorSchemePath(path: string): string {
  const normalized = normalizePath(path)
  const withLeadingSlash = normalized.startsWith('/') ? normalized : `/${normalized}`
  return encodeURI(withLeadingSlash)
}

function toEditorQueryPath(path: string): string {
  const normalized = normalizePath(path)
  const withLeadingSlash = normalized.startsWith('/') ? normalized : `/${normalized}`
  return encodeURIComponent(withLeadingSlash)
}

function getEditorSchemeUrl(editorId: string, path: string): string | null {
  const schemePath = toEditorSchemePath(path)
  const queryPath = toEditorQueryPath(path)

  switch (editorId) {
    case 'vscode':
      return `vscode://file${schemePath}`
    case 'zed':
      return `zed://file${schemePath}`
    case 'cursor':
      return `cursor://file${schemePath}`
    case 'intellij-idea':
      return `idea://open?file=${queryPath}`
    case 'windsurf':
      return `windsurf://file${schemePath}`
    case 'vscode-insiders':
      return `vscode-insiders://file${schemePath}`
    case 'vscodium':
      return `vscodium://file${schemePath}`
    case 'webstorm':
      return `webstorm://open?file=${queryPath}`
    case 'pycharm':
      return `pycharm://open?file=${queryPath}`
    case 'sublime-text':
      return `subl://open?url=file://${queryPath}`
    default:
      return null
  }
}

function openSchemeUrl(url: string): void {
  const iframe = document.createElement('iframe')
  iframe.style.display = 'none'
  iframe.src = url
  document.body.appendChild(iframe)
  window.setTimeout(() => iframe.remove(), 800)
}

function getEditorOpenWith(editorId: string): string | undefined {
  const os = detectDesktopOs()
  return EDITOR_OPEN_WITH_BY_OS[os][editorId]
}

function sanitizeFileReference(text: string): string {
  let value = text.trim()

  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    value = value.slice(1, -1).trim()
  }

  value = value.replace(/#L\d+(?:C\d+)?$/i, '')
  value = value.replace(/[),.;]+$/, '')

  const isWindowsDrivePath = /^[a-zA-Z]:[\\/]/.test(value)
  const strippedLocation = value.replace(/:\d+(?::\d+)?$/, '')
  if (isWindowsDrivePath) {
    if (strippedLocation.indexOf(':') === 1) {
      value = strippedLocation
    }
  } else {
    value = strippedLocation
  }

  return value
}

function stripTrailingHttpPunctuation(value: string): { value: string; trailing: string } {
  let cleaned = value
  let trailing = ''

  while (cleaned.length > 0) {
    const lastChar = cleaned[cleaned.length - 1]
    if (!TRAILING_HTTP_PUNCTUATION.has(lastChar)) break
    trailing = `${lastChar}${trailing}`
    cleaned = cleaned.slice(0, -1)
  }

  return { value: cleaned, trailing }
}

function sanitizeHttpReference(text: string): string {
  let value = text.trim()

  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    value = value.slice(1, -1).trim()
  }

  return stripTrailingHttpPunctuation(value).value
}

function isLikelyFilePath(value: string): boolean {
  if (!value) return false
  if (/\s/.test(value)) return false
  if (/^https?:\/\//i.test(value)) return false
  if (/^[a-z][a-z\d+.-]*:\/\//i.test(value)) return false

  if (value.includes('/') || value.includes('\\')) return true
  if (COMMON_FILE_NAMES.has(value.toLowerCase())) return true

  return /^(?:\.[\w.-]+|[\w.-]+)\.[A-Za-z][A-Za-z0-9_-]{0,14}$/.test(value)
}

function extractFilePathFromInlineCode(text: string): string | null {
  const candidate = sanitizeFileReference(text)
  if (!isLikelyFilePath(candidate)) return null
  return candidate
}

function extractHttpUrlFromInlineCode(text: string): string | null {
  const candidate = sanitizeHttpReference(text)
  if (/^https?:\/\//i.test(candidate)) return candidate

  const matched = candidate.match(/https?:\/\/\S+/i)
  if (!matched) return null

  const normalizedMatch = sanitizeHttpReference(matched[0])
  return /^https?:\/\//i.test(normalizedMatch) ? normalizedMatch : null
}

function resolvePathForOpen(filePath: string, currentDirectory: string | undefined): string {
  if (/^\\\\/.test(filePath)) return filePath
  if (isAbsolutePath(filePath)) return filePath
  if (!currentDirectory) return filePath

  const normalizedCwd = normalizePath(currentDirectory)
  const isUnixRoot = normalizedCwd === '/'
  const isWindowsRoot = /^[a-zA-Z]:\/$/.test(normalizedCwd)
  const cwd = normalizeToForwardSlash(currentDirectory)
  const relative = normalizePath(filePath).replace(/^\.\//, '').replace(/^\/+/, '')

  if (isUnixRoot) return `/${relative}`
  if (isWindowsRoot) return `${normalizedCwd}${relative}`
  if (!cwd) return relative
  return `${cwd}/${relative}`
}

function isHttpUrl(href: string | undefined): href is string {
  return typeof href === 'string' && /^https?:\/\//i.test(href)
}

async function openFileInPreferredEditor(filePath: string, currentDirectory: string | undefined): Promise<void> {
  const preferredEditorId = readPreferredEditorId()
  const targetPath = resolvePathForOpen(filePath, currentDirectory)

  if (isTauri()) {
    const { openPath } = await import('@tauri-apps/plugin-opener')
    const openWith = getEditorOpenWith(preferredEditorId)

    if (openWith) {
      try {
        await openPath(targetPath, openWith)
        return
      } catch {
        // fallback to system default app
      }
    }

    await openPath(targetPath)
    return
  }

  const editorUrl = getEditorSchemeUrl(preferredEditorId, targetPath) || getEditorSchemeUrl(DEFAULT_EDITOR_ID, targetPath)
  if (!editorUrl) {
    throw new Error(`Unsupported editor: ${preferredEditorId}`)
  }

  openSchemeUrl(editorUrl)
}

async function openHttpLinkInBrowser(href: string): Promise<void> {
  if (!isHttpUrl(href)) return

  if (!isTauri()) return

  const { openUrl } = await import('@tauri-apps/plugin-opener')
  await openUrl(href)
}

/**
 * Inline code component
 */
const InlineCode = memo(function InlineCode({ children }: { children: React.ReactNode }) {
  return (
    <code className={INLINE_CODE_CLASS}>
      {children}
    </code>
  )
})

function isSingleLineCode(code: string): boolean {
  return !code.includes('\n')
}

function extractBlockCode(children: React.ReactNode): { code: string; language?: string } | null {
  const codeNode = Array.isArray(children) ? children[0] : children
  if (!isValidElement(codeNode)) return null

  const props = codeNode.props as { className?: string; children?: React.ReactNode }
  const match = /language-([\w-]+)/.exec(props.className || '')
  const contentStr = extractText(props.children).replace(/\n$/, '')

  return {
    code: contentStr,
    language: match?.[1],
  }
}

function extractText(node: React.ReactNode): string {
  if (typeof node === 'string' || typeof node === 'number') return String(node)
  if (Array.isArray(node)) return node.map(extractText).join('')
  return ''
}

/**
 * Main Markdown renderer component
 */
export const MarkdownRenderer = memo(function MarkdownRenderer({ 
  content, 
  className = '' 
}: MarkdownRendererProps) {
  const currentDirectory = useCurrentDirectory()

  const handleOpenFilePath = useCallback((filePath: string) => {
    void openFileInPreferredEditor(filePath, currentDirectory).catch(error => {
      uiErrorHandler('open file path from message', error)
    })
  }, [currentDirectory])

  const handleOpenHttpLink = useCallback((href: string) => {
    void openHttpLinkInBrowser(href).catch(error => {
      uiErrorHandler('open message link in browser', error)
    })
  }, [])

  const components = useMemo(() => ({
    code({ children, className: codeClassName }: { children?: React.ReactNode; className?: string }) {
      const codeText = extractText(children)
      const filePath = !codeClassName ? extractFilePathFromInlineCode(codeText) : null
      const inlineHttpUrl = extractHttpUrlFromInlineCode(codeText)

      if (filePath) {
        return (
          <button
            type="button"
            onClick={(event) => {
              if (!event.metaKey) return
              event.preventDefault()
              event.stopPropagation()
              handleOpenFilePath(filePath)
            }}
            className="inline-flex max-w-full align-baseline bg-transparent p-0 border-0 text-left"
            title={`Cmd+Click to open ${filePath}`}
          >
            <code className={`${INLINE_CODE_CLASS} cursor-pointer hover:underline underline-offset-2`}>
              {children}
            </code>
          </button>
        )
      }

      if (inlineHttpUrl) {
        const shouldInterceptInTauri = isTauri()
        return (
          <a
            href={inlineHttpUrl}
            target="_blank"
            rel="noopener noreferrer"
            onClick={shouldInterceptInTauri ? (event) => {
              event.preventDefault()
              event.stopPropagation()
              handleOpenHttpLink(inlineHttpUrl)
            } : undefined}
            className="inline-flex max-w-full align-baseline"
          >
            <code className={`${INLINE_CODE_CLASS} cursor-pointer hover:underline underline-offset-2`}>
              {children}
            </code>
          </a>
        )
      }

      return <InlineCode>{children}</InlineCode>
    },

    pre({ children }: any) {
      const blockCode = extractBlockCode(children)
      if (!blockCode) return <pre>{children}</pre>

      if (isSingleLineCode(blockCode.code)) {
        const singleLineHttpUrl = extractHttpUrlFromInlineCode(blockCode.code)
        if (singleLineHttpUrl) {
          const shouldInterceptInTauri = isTauri()
          return (
            <div className="my-3">
              <a
                href={singleLineHttpUrl}
                target="_blank"
                rel="noopener noreferrer"
                onClick={shouldInterceptInTauri ? (event) => {
                  event.preventDefault()
                  event.stopPropagation()
                  handleOpenHttpLink(singleLineHttpUrl)
                } : undefined}
              >
                <code className={`${INLINE_CODE_CLASS} cursor-pointer hover:underline underline-offset-2`}>
                  {blockCode.code}
                </code>
              </a>
            </div>
          )
        }

        return (
          <div className="my-3">
            <code className={INLINE_CODE_CLASS}>{blockCode.code}</code>
          </div>
        )
      }

      return (
        <div className="my-4 w-full">
          <CodeBlock code={blockCode.code} language={blockCode.language} />
        </div>
      )
    },
    
    // Headings - Improved typography
    h1: ({ children }: any) => (
      <h1 className="text-xl font-bold text-text-100 mt-8 mb-4 first:mt-0 tracking-tight">{children}</h1>
    ),
    h2: ({ children }: any) => (
      <h2 className="text-lg font-bold text-text-100 mt-6 mb-3 first:mt-0 tracking-tight pb-1 border-b border-border-100/50">{children}</h2>
    ),
    h3: ({ children }: any) => (
      <h3 className="text-base font-semibold text-text-100 mt-5 mb-2 first:mt-0 tracking-tight">{children}</h3>
    ),
    h4: ({ children }: any) => (
      <h4 className="text-sm font-semibold text-text-100 mt-4 mb-2 first:mt-0 tracking-tight">{children}</h4>
    ),
    
    // Paragraphs
    p: ({ children }: any) => (
      <p className="mb-4 last:mb-0 leading-7 text-text-200">{children}</p>
    ),
    
    // Lists
    ul: ({ children }: any) => (
      <ul className="list-disc list-outside ml-5 mb-4 space-y-1 marker:text-text-400/80">{children}</ul>
    ),
    ol: ({ children }: any) => (
      <ol className="list-decimal list-outside ml-5 mb-4 space-y-1 marker:text-text-400/80">{children}</ol>
    ),
    li: ({ children }: any) => (
      <li className="text-text-200 pl-1 leading-7">{children}</li>
    ),
    
    // Links
    a: ({ href, children }: { href?: string; children?: React.ReactNode }) => {
      const rawLink = typeof href === 'string' ? href.trim() : ''
      const { value: normalizedLink, trailing } = stripTrailingHttpPunctuation(rawLink)
      const link = isHttpUrl(normalizedLink) ? normalizedLink : rawLink
      const httpUrl = isHttpUrl(link)
      const shouldInterceptInTauri = httpUrl && isTauri()
      const childrenText = extractText(children)
      const shouldRenderTrailingOutside = trailing.length > 0 && childrenText === rawLink
      const linkChildren = shouldRenderTrailingOutside ? link : children

      return (
        <>
          <a
            href={httpUrl ? link : href}
            target={httpUrl ? '_blank' : undefined}
            rel={httpUrl ? 'noopener noreferrer' : undefined}
            onClick={shouldInterceptInTauri ? (event) => {
              event.preventDefault()
              event.stopPropagation()
              handleOpenHttpLink(link)
            } : undefined}
            className="font-medium text-accent-main-100 hover:text-accent-main-200 hover:underline underline-offset-2 transition-colors"
          >
            {linkChildren}
          </a>
          {shouldRenderTrailingOutside ? trailing : null}
        </>
      )
    },
    
    // Blockquotes - Modern style
    blockquote: ({ children }: any) => (
      <blockquote className="border-l-2 border-accent-main-100 pl-4 py-1 my-4 bg-bg-200/30 rounded-r-md text-text-300 italic">
        {children}
      </blockquote>
    ),
    
    // Tables - Modern style with striping
    table: ({ children }: any) => (
      <div className="overflow-x-auto my-6 border border-border-200 rounded-lg shadow-sm w-full">
        <table className="min-w-full border-collapse text-sm divide-y divide-border-200">{children}</table>
      </div>
    ),
    thead: ({ children }: any) => (
      <thead className="bg-bg-100 text-text-200 font-medium">{children}</thead>
    ),
    th: ({ children }: any) => (
      <th className="px-4 py-3 text-left font-semibold whitespace-nowrap border-b border-border-200">
        {children}
      </th>
    ),
    tbody: ({ children }: any) => (
      <tbody className="divide-y divide-border-200/50 bg-bg-000">
        {children}
      </tbody>
    ),
    tr: ({ children }: any) => (
      <tr className="hover:bg-bg-50/50 transition-colors even:bg-bg-50/30">{children}</tr>
    ),
    td: ({ children }: any) => (
      <td className="px-4 py-2.5 text-text-300 leading-relaxed">{children}</td>
    ),
    
    // Horizontal rule
    hr: () => <hr className="border-border-200 my-8" />,
    
    // Strong and emphasis
    strong: ({ children }: any) => (
      <strong className="font-semibold text-text-100">{children}</strong>
    ),
    em: ({ children }: any) => (
      <em className="italic text-text-200">{children}</em>
    ),
    
    // Strikethrough (GFM)
    del: ({ children }: any) => (
      <del className="text-text-400 line-through decoration-text-400/50">{children}</del>
    ),
  }), [handleOpenFilePath, handleOpenHttpLink])

  return (
    <div className={`markdown-content text-sm text-text-100 leading-relaxed break-words min-w-0 overflow-hidden ${className}`}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={components}
      >
        {content}
      </ReactMarkdown>
    </div>
  )
})

/**
 * Standalone code highlighter for tool previews
 * Uses file extension to determine language
 */
export const HighlightedCode = memo(function HighlightedCode({
  code,
  filePath,
  language,
  maxHeight,
  className = '',
}: {
  code: string
  filePath?: string
  language?: string
  maxHeight?: number
  className?: string
}) {
  const lang = useMemo(() => {
    return language || detectLanguage(filePath)
  }, [filePath, language])

  return (
    <div 
      className={`overflow-auto ${className}`}
      style={maxHeight ? { maxHeight } : undefined}
    >
      <CodeBlock code={code} language={lang} />
    </div>
  )
})

export default MarkdownRenderer
