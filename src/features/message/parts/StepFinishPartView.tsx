import { memo } from 'react'
import { useTheme } from '../../../hooks/useTheme'
import type { StepFinishPart } from '../../../types/message'

interface StepFinishPartViewProps {
  part: StepFinishPart
  /** 单条消息耗时（毫秒） */
  duration?: number
  /** 是否显示 token 信息（可在外层 footer 统一展示） */
  showTokens?: boolean
  /** 是否显示时长信息（可在外层 footer 统一展示） */
  showDuration?: boolean
}

function formatNumber(num: number): string {
  if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M'
  if (num >= 1000) return (num / 1000).toFixed(1) + 'k'
  return num.toString()
}

function formatCost(cost: number): string {
  if (cost < 0.01) return '<$0.01'
  return '$' + cost.toFixed(3)
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`
  const s = ms / 1000
  if (s < 60) return `${s.toFixed(1)}s`
  const m = Math.floor(s / 60)
  const rem = Math.round(s % 60)
  return rem > 0 ? `${m}m${rem}s` : `${m}m`
}

export const StepFinishPartView = memo(function StepFinishPartView({ part, duration, showTokens = true, showDuration = true }: StepFinishPartViewProps) {
  const { stepFinishDisplay: show } = useTheme()
  const { tokens, cost } = part
  const totalTokens = tokens.input + tokens.output + tokens.reasoning + tokens.cache.read + tokens.cache.write
  const cacheHit = tokens.cache.read
  const showTokenUsage = showTokens && show.tokens && totalTokens > 0
  const showDurationUsage = showDuration && show.duration && duration != null && duration > 0
  
  // 所有项都关闭时不渲染
  const hasAny = showTokenUsage
    || (show.cache && cacheHit > 0)
    || (show.cost && cost > 0)
    || showDurationUsage
  if (!hasAny) return null
  
  return (
    <div className="flex items-center gap-3 text-[10px] text-text-300 pl-5 py-0.5">
      {showTokenUsage && (
        <span
          title={`Input: ${tokens.input}, Output: ${tokens.output}, Reasoning: ${tokens.reasoning}, Cache read: ${tokens.cache.read}, Cache write: ${tokens.cache.write}`}
        >
          {formatNumber(totalTokens)} tokens
        </span>
      )}
      {show.cache && cacheHit > 0 && (
        <span className="text-text-400" title={`Cache read: ${tokens.cache.read}, write: ${tokens.cache.write}`}>
          ({formatNumber(cacheHit)} cached)
        </span>
      )}
      {show.cost && cost > 0 && (
        <span>{formatCost(cost)}</span>
      )}
      {showDurationUsage && (
        <span>{formatDuration(duration)}</span>
      )}
    </div>
  )
})
