import { memo } from 'react'
import { MarkdownRenderer } from '../../../components'
import { STREAMING_MARKDOWN_THRESHOLD } from '../../../constants'
import { useSmoothStream } from '../../../hooks/useSmoothStream'
import type { TextPart } from '../../../types/message'

interface TextPartViewProps {
  part: TextPart
  isStreaming?: boolean
}

/**
 * TextPartView - 使用 Smooth Streaming 实现打字机效果
 * 
 * 核心思想：解耦网络接收和视觉渲染
 * - 后端推过来的文本先缓冲
 * - 前端以固定速度逐字符释放显示
 * - 不管后端推送多块多慢，用户看到的始终是均匀流畅的
 */
export const TextPartView = memo(function TextPartView({ part, isStreaming = false }: TextPartViewProps) {
  const shouldAnimate = isStreaming && !part.time?.end
  // 使用 smooth streaming hook
  const { displayText, isAnimating } = useSmoothStream(
    part.text || '',
    isStreaming,
    { charDelay: 8, disableAnimation: !shouldAnimate }  // 8ms per char ≈ 125 chars/sec
  )

  // 跳过空文本（除非正在 streaming 或动画中）
  if (!part.text?.trim() && !isStreaming && !isAnimating) return null
  
  // 跳过 synthetic 文本（系统上下文，单独处理）
  if (part.synthetic) return null
  
  // streaming 时也渲染 markdown，只有超长文本才降级为纯文本
  // useSmoothStream 的批量更新已经控制了更新频率，不会导致性能问题
  const shouldUseMarkdown = displayText.length < STREAMING_MARKDOWN_THRESHOLD

  return (
    <div className="font-response">
      {shouldUseMarkdown ? (
        <MarkdownRenderer content={displayText} />
      ) : (
        <div className="whitespace-pre-wrap break-words text-sm text-text-200 leading-relaxed">
          {displayText}
        </div>
      )}
    </div>
  )
})
