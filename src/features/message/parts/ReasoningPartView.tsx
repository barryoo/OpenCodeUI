import { memo, useState, useEffect, useMemo, useRef, useLayoutEffect } from 'react'
import remarkBreaks from 'remark-breaks'
import { ChevronDownIcon, LightbulbIcon, SpinnerIcon } from '../../../components/Icons'
import { MarkdownRenderer } from '../../../components'
import { useSmoothStream } from '../../../hooks/useSmoothStream'
import type { ReasoningPart } from '../../../types/message'

interface ReasoningPartViewProps {
  part: ReasoningPart
  isStreaming?: boolean
}

const THINKING_MARKDOWN_CLASS = [
  '!text-xs !leading-5 !text-text-200',
  // compact spacing for reasoning blocks
  '[&_p]:!mb-1 [&_p:last-child]:!mb-0',
  '[&_p]:!leading-5',
  '[&_ul]:!mb-1 [&_ol]:!mb-1 [&_ul:last-child]:!mb-0 [&_ol:last-child]:!mb-0',
  '[&_li]:!leading-5',
  // keep headings from dominating in small block
  '[&_h1]:text-sm [&_h1]:!mt-1 [&_h1]:!mb-1 [&_h1]:!leading-5',
  '[&_h2]:text-sm [&_h2]:!mt-1 [&_h2]:!mb-1 [&_h2]:!leading-5',
  '[&_h3]:text-xs [&_h3]:!mt-1 [&_h3]:!mb-1 [&_h3]:!leading-5',
  '[&_h4]:text-xs [&_h4]:!mt-1 [&_h4]:!mb-1 [&_h4]:!leading-5',
].join(' ')

export const ReasoningPartView = memo(function ReasoningPartView({ part, isStreaming }: ReasoningPartViewProps) {
  const thinkingText = part.text || ''
  const isPartStreaming = isStreaming && !part.time?.end
  const hasContent = !!thinkingText.trim()

  // 使用 smooth streaming 实现打字机效果
  const { displayText } = useSmoothStream(
    thinkingText,
    !!isPartStreaming,
    { charDelay: 6, disableAnimation: !isPartStreaming }  // 稍快一点，因为是思考过程
  )
  const [expanded, setExpanded] = useState(false)
  const srStatusText = useMemo(() => {
    const compact = (displayText || '').replace(/\s+/g, ' ').trim()
    return compact || (isPartStreaming ? 'Thinking...' : '')
  }, [displayText, isPartStreaming])
  const thinkingDisplayText = displayText || (isPartStreaming ? 'Thinking...' : '')
  const contentRef = useRef<HTMLDivElement>(null)
  const [contentHeight, setContentHeight] = useState(0)
  const collapsedMaxHeight = '1.25rem'

  useLayoutEffect(() => {
    if (!contentRef.current) return
    const nextHeight = contentRef.current.scrollHeight
    setContentHeight(prev => (prev === nextHeight ? prev : nextHeight))
  }, [displayText])

  useEffect(() => {
    if (isPartStreaming && hasContent) {
      setExpanded(true)
    } else if (!isPartStreaming) {
      setExpanded(false)
    }
  }, [isPartStreaming, hasContent])

  if (!hasContent) return null

  return (
    <div className="py-1">
      <div className="grid grid-cols-[14px_minmax(0,1fr)] gap-x-1.5 items-start">
        <span className="inline-flex h-5 w-[14px] items-start justify-center pt-[3px] text-text-400">
          {isPartStreaming ? (
            <SpinnerIcon className="animate-spin" size={14} />
          ) : (
            <LightbulbIcon size={14} />
          )}
        </span>

        <div className="min-w-0">
          <button
            type="button"
            onClick={() => setExpanded(!expanded)}
            aria-expanded={expanded}
            className="group w-full m-0 p-0 border-0 bg-transparent grid grid-cols-[minmax(0,1fr)_12px] items-start gap-x-2 text-left cursor-pointer text-text-300 hover:text-text-100"
          >
            <div
              className="min-w-0 flex-1 relative overflow-hidden transition-[max-height] duration-200 ease-out"
              style={{ maxHeight: expanded ? `${contentHeight}px` : collapsedMaxHeight }}
            >
              <div ref={contentRef}>
                <MarkdownRenderer
                  content={thinkingDisplayText}
                  className={THINKING_MARKDOWN_CLASS}
                  remarkPlugins={[remarkBreaks]}
                />
              </div>
            </div>
            <span className={`inline-flex h-5 w-3 items-center justify-center shrink-0 text-text-400 group-hover:text-text-200 transition-[transform,color] duration-200 ${expanded ? 'rotate-180' : ''}`}>
              <ChevronDownIcon size={12} />
            </span>
          </button>
        </div>
      </div>

      <span className="sr-only" role="status" aria-live="polite">
        {srStatusText}
      </span>
    </div>
  )
})
