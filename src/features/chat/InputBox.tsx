import { useState, useRef, useEffect, useCallback, useMemo } from 'react'
import { AttachmentPreview, type Attachment } from '../attachment'
import { MentionMenu, detectMentionTrigger, MENTION_COLORS, type MentionMenuHandle, type MentionItem } from '../mention'
import { InputToolbar } from './input/InputToolbar'
import { UndoStatus } from './input/UndoStatus'
import type { ApiAgent } from '../../api/client'

// ============================================
// Types
// ============================================

/** Token 类型：普通文本或 mention */
type TokenType = 'text' | 'mention-file' | 'mention-folder' | 'mention-agent'

/** 解析后的 token */
interface Token {
  type: TokenType
  content: string
  attachmentId?: string  // 关联的 attachment id
}

export interface InputBoxProps {
  onSend: (text: string, attachments: Attachment[], options?: { agent?: string; variant?: string }) => void
  onAbort?: () => void
  disabled?: boolean
  isStreaming?: boolean
  agents?: ApiAgent[]
  selectedAgent?: string
  onAgentChange?: (agentName: string) => void
  variants?: string[]
  selectedVariant?: string
  onVariantChange?: (variant: string | undefined) => void
  supportsImages?: boolean
  rootPath?: string
  // Undo/Redo
  revertedText?: string
  revertedAttachments?: Attachment[]
  canRedo?: boolean
  revertSteps?: number
  onRedo?: () => void
  onRedoAll?: () => void
  onClearRevert?: () => void
  // Animation
  registerInputBox?: (element: HTMLElement | null) => void
}

// ============================================
// InputBox Component
// ============================================

export function InputBox({ 
  onSend, 
  onAbort, 
  disabled, 
  isStreaming,
  agents = [],
  selectedAgent,
  onAgentChange,
  variants = [],
  selectedVariant,
  onVariantChange,
  supportsImages = false,
  rootPath = '',
  revertedText,
  revertedAttachments,
  canRedo = false,
  revertSteps = 0,
  onRedo,
  onRedoAll,
  onClearRevert,
  registerInputBox,
}: InputBoxProps) {
  // 文本状态
  const [text, setText] = useState('')
  // 附件状态（图片、文件、文件夹、agent）
  const [attachments, setAttachments] = useState<Attachment[]>([])
  
  // @ Mention 状态
  const [mentionOpen, setMentionOpen] = useState(false)
  const [mentionQuery, setMentionQuery] = useState('')
  const [mentionStartIndex, setMentionStartIndex] = useState(-1)
  
  // Refs
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const inputContainerRef = useRef<HTMLDivElement>(null)
  const mentionMenuRef = useRef<MentionMenuHandle>(null)
  const prevRevertedTextRef = useRef<string | undefined>(undefined)

  // 注册输入框容器用于动画
  useEffect(() => {
    if (registerInputBox) {
      registerInputBox(inputContainerRef.current)
      return () => registerInputBox(null)
    }
  }, [registerInputBox])

  // 处理 revert 恢复
  useEffect(() => {
    if (revertedText !== undefined) {
      setText(revertedText)
      setAttachments(revertedAttachments || [])
      // 聚焦并移动光标到末尾
      if (textareaRef.current) {
        textareaRef.current.focus()
        textareaRef.current.setSelectionRange(revertedText.length, revertedText.length)
      }
    } else if (prevRevertedTextRef.current !== undefined && revertedText === undefined) {
      setText('')
      setAttachments([])
    }
    prevRevertedTextRef.current = revertedText
  }, [revertedText, revertedAttachments])

  // 自动调整 textarea 高度
  useEffect(() => {
    const textarea = textareaRef.current
    if (!textarea) return
    textarea.style.height = 'auto'
    textarea.style.height = Math.min(textarea.scrollHeight, window.innerHeight * 0.5) + 'px'
  }, [text])

  // 计算
  const canSend = (text.trim().length > 0 || attachments.length > 0) && !disabled

  // ============================================
  // Handlers
  // ============================================

  const handleSend = useCallback(() => {
    if (!canSend) return
    
    // 从 attachments 中找 agent mention
    const agentAttachment = attachments.find(a => a.type === 'agent')
    const mentionedAgent = agentAttachment?.agentName
    
    onSend(text, attachments, {
      agent: mentionedAgent || selectedAgent,
      variant: selectedVariant,
    })
    
    // 清空
    setText('')
    setAttachments([])
    onClearRevert?.()
  }, [canSend, text, attachments, selectedAgent, selectedVariant, onSend, onClearRevert])

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Mention 菜单打开时，拦截导航键
    if (mentionOpen && mentionMenuRef.current) {
      switch (e.key) {
        case 'ArrowUp':
          e.preventDefault()
          mentionMenuRef.current.moveUp()
          return
        case 'ArrowDown':
          e.preventDefault()
          mentionMenuRef.current.moveDown()
          return
        case 'ArrowRight': {
          // 进入文件夹
          const selected = mentionMenuRef.current.getSelectedItem()
          if (selected?.type === 'folder') {
            e.preventDefault()
            const basePath = (selected.relativePath || selected.displayName).replace(/\/+$/, '')
            const folderPath = basePath + '/'
            updateMentionQuery(folderPath)
          }
          return
        }
        case 'ArrowLeft': {
          // 返回上一级
          if (mentionQuery.includes('/')) {
            e.preventDefault()
            const parts = mentionQuery.replace(/\/$/, '').split('/')
            parts.pop()
            const parentPath = parts.length > 0 ? parts.join('/') + '/' : ''
            updateMentionQuery(parentPath)
          }
          return
        }
        case 'Enter':
        case 'Tab':
          e.preventDefault()
          mentionMenuRef.current.selectCurrent()
          return
        case 'Escape':
          e.preventDefault()
          setMentionOpen(false)
          return
      }
    }
    
    // Tab 键：mention 菜单关闭时，不做任何事（阻止跳到工具栏）
    if (e.key === 'Tab') {
      e.preventDefault()
      return
    }
    
    // Enter 发送（Shift+Enter 换行）
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }, [mentionOpen, mentionQuery, handleSend])
  
  // 更新 @ 查询文本（用于进入/退出文件夹）
  const updateMentionQuery = useCallback((newQuery: string) => {
    if (!textareaRef.current) return
    
    const beforeAt = text.slice(0, mentionStartIndex)
    const afterQuery = text.slice(mentionStartIndex + 1 + mentionQuery.length)
    const newText = beforeAt + '@' + newQuery + afterQuery
    
    setText(newText)
    setMentionQuery(newQuery)
    
    // 移动光标到 @ 查询末尾
    requestAnimationFrame(() => {
      if (!textareaRef.current) return
      const pos = mentionStartIndex + 1 + newQuery.length
      textareaRef.current.setSelectionRange(pos, pos)
      textareaRef.current.focus()
    })
  }, [text, mentionStartIndex, mentionQuery])

  const handleChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newText = e.target.value
    setText(newText)
    
    // 同步检测 mention 是否被破坏/删除
    // 比对 attachments 的 textRange：如果文本中对应位置不再匹配，删除该 attachment
    setAttachments(prev => {
      const surviving = prev.filter(a => {
        if (!a.textRange) return true // 图片等无 textRange 的保留
        const { start, end, value } = a.textRange
        const actual = newText.slice(start, end)
        return actual === value
      })
      // 只在数量变化时更新（避免不必要的 re-render）
      return surviving.length === prev.length ? prev : surviving
    })
    
    // 检测 @ 触发
    const cursorPos = e.target.selectionStart || 0
    const trigger = detectMentionTrigger(newText, cursorPos, '@')
    
    if (trigger) {
      setMentionQuery(trigger.query)
      setMentionStartIndex(trigger.startIndex)
      setMentionOpen(true)
    } else {
      setMentionOpen(false)
    }
  }, [])

  // @ Mention 选择处理
  const handleMentionSelect = useCallback((item: MentionItem & { _enterFolder?: boolean }) => {
    if (!textareaRef.current) return
    
    // 如果是进入文件夹
    if (item._enterFolder && item.type === 'folder') {
      const basePath = (item.relativePath || item.displayName).replace(/\/+$/, '')
      const folderPath = basePath + '/'
      updateMentionQuery(folderPath)
      return
    }
    
    // 构建 @ 文本
    const mentionText = item.type === 'agent' 
      ? `@${item.displayName}`
      : `@${item.relativePath || item.displayName}`
    
    // 计算新文本
    const beforeAt = text.slice(0, mentionStartIndex)
    const afterQuery = text.slice(mentionStartIndex + 1 + mentionQuery.length)
    const newText = beforeAt + mentionText + ' ' + afterQuery
    
    // 创建附件
    const attachment: Attachment = {
      id: crypto.randomUUID(),
      type: item.type,
      displayName: item.displayName,
      relativePath: item.relativePath,
      url: item.type !== 'agent' ? item.value : undefined,
      mime: item.type !== 'agent' ? 'text/plain' : undefined,
      agentName: item.type === 'agent' ? item.displayName : undefined,
      textRange: {
        value: mentionText,
        start: mentionStartIndex,
        end: mentionStartIndex + mentionText.length,
      },
    }
    
    setText(newText)
    setAttachments(prev => [...prev, attachment])
    setMentionOpen(false)
    
    // 移动光标到 mention 后
    requestAnimationFrame(() => {
      if (!textareaRef.current) return
      const newCursorPos = mentionStartIndex + mentionText.length + 1
      textareaRef.current.setSelectionRange(newCursorPos, newCursorPos)
      textareaRef.current.focus()
    })
  }, [text, mentionStartIndex, mentionQuery, updateMentionQuery])

  const handleMentionClose = useCallback(() => {
    setMentionOpen(false)
    textareaRef.current?.focus()
  }, [])

  // 图片上传
  const handleImageUpload = useCallback((files: FileList | null) => {
    if (!files || !supportsImages) return
    
    Array.from(files).forEach(file => {
      if (!file.type.startsWith('image/')) return
      
      const reader = new FileReader()
      reader.onload = (e) => {
        const dataUrl = e.target?.result as string
        const attachment: Attachment = {
          id: crypto.randomUUID(),
          type: 'file',
          displayName: file.name,
          url: dataUrl,
          mime: file.type,
        }
        setAttachments(prev => [...prev, attachment])
      }
      reader.readAsDataURL(file)
    })
  }, [supportsImages])

  // 删除附件
  const handleRemoveAttachment = useCallback((id: string) => {
    const attachment = attachments.find(a => a.id === id)
    if (!attachment) return
    
    // 如果有 textRange，从文本中删除 @mention
    if (attachment.textRange) {
      const { value } = attachment.textRange
      // 删除 @mention 和后面的空格
      const newText = text.replace(value + ' ', '').replace(value, '')
      setText(newText)
    }
    
    setAttachments(prev => prev.filter(a => a.id !== id))
  }, [attachments, text])

  // 粘贴处理
  const handlePaste = useCallback((e: React.ClipboardEvent) => {
    // 处理图片粘贴
    if (supportsImages) {
      const items = e.clipboardData?.items
      const files: File[] = []
      
      if (items) {
        for (let i = 0; i < items.length; i++) {
          if (items[i].kind === 'file') {
            const file = items[i].getAsFile()
            if (file) files.push(file)
          }
        }
      }
      
      if (files.length > 0) {
        const imageFiles = files.filter(f => f.type.startsWith('image/'))
        if (imageFiles.length > 0) {
          e.preventDefault()
          const dt = new DataTransfer()
          imageFiles.forEach(f => dt.items.add(f))
          handleImageUpload(dt.files)
          return
        }
      }
    }
    
    // 文本粘贴：让 textarea 默认处理（天然支持换行和 undo）
  }, [supportsImages, handleImageUpload])

  // 滚动同步（备用，overlay 内部也监听了 scroll）
  const handleScroll = useCallback(() => {
    // overlay 通过 useEffect 自动同步，这里留空
  }, [])

  // ============================================
  // Render
  // ============================================

  // 计算已选择的 items (用于过滤菜单)
  const excludeValues = new Set<string>()
  attachments.forEach(a => {
    if (a.url) excludeValues.add(a.url)
    if (a.agentName) excludeValues.add(a.agentName)
  })

  return (
    <div className="w-full">
      <div className="mx-auto max-w-3xl px-4 pb-4 pointer-events-auto transition-[max-width] duration-300 ease-in-out">
        <div className="flex flex-col gap-2">
          {/* Revert Status Bar */}
          <UndoStatus 
            canRedo={canRedo} 
            revertSteps={revertSteps} 
            onRedo={onRedo} 
            onRedoAll={onRedoAll} 
          />
          
          {/* Input Container */}
          <div 
            ref={inputContainerRef}
            className={`bg-bg-000 rounded-2xl relative z-30 transition-all focus-within:outline-none shadow-2xl shadow-black/5 ${
              isStreaming 
                ? 'border border-accent-main-100/50 animate-border-pulse' 
                : 'border border-border-200/50'
            }`}
          >
            {/* @ Mention Menu */}
            <MentionMenu
              ref={mentionMenuRef}
              isOpen={mentionOpen}
              query={mentionQuery}
              agents={agents}
              rootPath={rootPath}
              excludeValues={excludeValues}
              onSelect={handleMentionSelect}
              onClose={handleMentionClose}
            />
            
            <div className="relative">
              <div className="overflow-hidden">
                {/* Attachments Preview - 显示在输入框上方 */}
                <div className={`overflow-hidden transition-all duration-300 ease-out ${
                  attachments.length > 0 ? 'max-h-40 opacity-100' : 'max-h-0 opacity-0'
                }`}>
                  <div className="px-4 pt-3">
                    <AttachmentPreview 
                      attachments={attachments}
                      onRemove={handleRemoveAttachment}
                    />
                  </div>
                </div>

                {/* Text Input - textarea with highlight overlay */}
                <div className="px-4 pt-4 pb-2">
                  <div className="relative w-full">
                    {/* Textarea - 主体，文字透明，只显示光标 */}
                    <textarea
                      ref={textareaRef}
                      value={text}
                      onChange={handleChange}
                      onKeyDown={handleKeyDown}
                      onPaste={handlePaste}
                      onScroll={handleScroll}
                      placeholder="Reply to Agent (type @ to mention)"
                      className="w-full resize-none focus:outline-none focus:ring-0 bg-transparent placeholder:text-text-400 custom-scrollbar block"
                      style={{ 
                        ...SHARED_TEXT_STYLE,
                        minHeight: '24px', 
                        maxHeight: '50vh',
                        color: 'transparent',
                        caretColor: 'hsl(var(--text-100))',
                        position: 'relative',
                        zIndex: 2,
                        // 确保没有浏览器默认样式干扰
                        WebkitAppearance: 'none',
                        outline: 'none',
                      }}
                      rows={1}
                    />
                    {/* Highlight overlay - 渲染在 textarea 下方，显示染色文本 */}
                    <TextHighlightOverlay 
                      text={text}
                      attachments={attachments}
                      scrollRef={textareaRef}
                    />
                  </div>
                </div>

                {/* Bottom Bar -> InputToolbar */}
                <InputToolbar 
                  agents={agents}
                  selectedAgent={selectedAgent}
                  onAgentChange={onAgentChange}
                  variants={variants}
                  selectedVariant={selectedVariant}
                  onVariantChange={onVariantChange}
                  supportsImages={supportsImages}
                  onImageUpload={handleImageUpload}
                  isStreaming={isStreaming}
                  onAbort={onAbort}
                  canSend={canSend || false} 
                  onSend={handleSend}
                />
              </div>
            </div>
          </div>

          {/* Disclaimer */}
          <div className="flex justify-center pt-2 text-text-500">
            <a href="#" className="text-[11px] hover:text-text-300 transition-colors text-center shadow-sm">
              AI can make mistakes. Please double-check responses.
            </a>
          </div>
        </div>
      </div>
    </div>
  )
}

// ============================================
// TextHighlightOverlay - 在 textarea 上渲染高亮文本
// ============================================

/** 
 * Overlay 和 textarea 共享的文本样式
 * 必须完全一致才能让光标位置正确对齐
 */
const SHARED_TEXT_STYLE: React.CSSProperties = {
  fontSize: '14px',
  lineHeight: '20px',
  fontFamily: 'ui-sans-serif, system-ui, sans-serif, "Apple Color Emoji", "Segoe UI Emoji"',
  letterSpacing: 'normal',
  wordSpacing: 'normal',
  whiteSpace: 'pre-wrap',
  wordBreak: 'break-word' as const,
  overflowWrap: 'break-word',
  padding: 0,
  margin: 0,
  border: 'none',
  boxSizing: 'border-box' as const,
  // 关键：确保字体渲染一致
  WebkitFontSmoothing: 'antialiased',
  MozOsxFontSmoothing: 'grayscale',
  textRendering: 'geometricPrecision',
  fontKerning: 'normal',
  fontFeatureSettings: 'normal',
  fontVariantLigatures: 'normal',
}

interface TextHighlightOverlayProps {
  text: string
  attachments: Attachment[]
  scrollRef: React.RefObject<HTMLTextAreaElement | null>
}

function TextHighlightOverlay({ text, attachments, scrollRef }: TextHighlightOverlayProps) {
  const overlayRef = useRef<HTMLDivElement>(null)
  
  // 同步滚动和尺寸
  useEffect(() => {
    const textarea = scrollRef.current
    const overlay = overlayRef.current
    if (!textarea || !overlay) return
    
    const syncScroll = () => {
      overlay.scrollTop = textarea.scrollTop
      overlay.scrollLeft = textarea.scrollLeft
    }
    
    // 同步尺寸（高度会随内容变化）
    const syncSize = () => {
      overlay.style.height = textarea.style.height
    }
    
    // 监听滚动
    textarea.addEventListener('scroll', syncScroll)
    
    // 使用 ResizeObserver 监听尺寸变化
    const resizeObserver = new ResizeObserver(syncSize)
    resizeObserver.observe(textarea)
    
    // 初始同步
    syncScroll()
    syncSize()
    
    return () => {
      textarea.removeEventListener('scroll', syncScroll)
      resizeObserver.disconnect()
    }
  }, [scrollRef])

  // 将文本分割为 token（普通文本 + mention 高亮）
  const tokens = useMemo(() => tokenize(text, attachments), [text, attachments])

  // 共享的 overlay 样式
  const overlayStyle: React.CSSProperties = {
    ...SHARED_TEXT_STYLE,
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 1,
    pointerEvents: 'none',
    overflow: 'hidden',
    // 关键：与 textarea 保持一致
    minHeight: '24px',
    maxHeight: '50vh',
  }

  // 没有 mention 时直接渲染纯文本（性能优化）
  if (attachments.filter(a => a.textRange).length === 0) {
    return (
      <div
        ref={overlayRef}
        className="text-text-100"
        style={overlayStyle}
        aria-hidden
      >
        {text || '\u00A0'}
      </div>
    )
  }

  return (
    <div
      ref={overlayRef}
      style={overlayStyle}
      aria-hidden
    >
      {tokens.map((token, i) => {
        if (token.type === 'text') {
          return <span key={i} className="text-text-100">{token.content || '\u00A0'}</span>
        }
        // Mention token — 用对应类型的颜色
        const colorKey = token.type === 'mention-agent' ? 'agent' 
          : token.type === 'mention-folder' ? 'folder' 
          : 'file'
        const colors = MENTION_COLORS[colorKey]
        return (
          <span 
            key={i} 
            className={`${colors.bg} ${colors.text} ${colors.darkText} rounded px-0.5 -mx-0.5`}
          >
            {token.content}
          </span>
        )
      })}
    </div>
  )
}

// ============================================
// tokenize - 将文本按 attachment 的 textRange 分割
// ============================================

function tokenize(text: string, attachments: Attachment[]): Token[] {
  // 收集有 textRange 的 mention attachments，按 start 排序
  const mentions = attachments
    .filter(a => a.textRange)
    .map(a => ({
      start: a.textRange!.start,
      end: a.textRange!.end,
      value: a.textRange!.value,
      type: a.type,
      id: a.id,
    }))
    .sort((a, b) => a.start - b.start)

  if (mentions.length === 0) {
    return [{ type: 'text', content: text }]
  }

  const tokens: Token[] = []
  let lastIndex = 0

  for (const m of mentions) {
    // 验证 mention 在文本中仍然匹配
    const actual = text.slice(m.start, m.end)
    if (actual !== m.value) continue  // 不匹配，跳过

    // 前面的普通文本
    if (m.start > lastIndex) {
      tokens.push({ type: 'text', content: text.slice(lastIndex, m.start) })
    }

    // mention token
    const tokenType: TokenType = m.type === 'agent' ? 'mention-agent'
      : m.type === 'folder' ? 'mention-folder'
      : 'mention-file'
    tokens.push({ type: tokenType, content: m.value, attachmentId: m.id })

    lastIndex = m.end
  }

  // 剩余文本
  if (lastIndex < text.length) {
    tokens.push({ type: 'text', content: text.slice(lastIndex) })
  }

  return tokens
}
