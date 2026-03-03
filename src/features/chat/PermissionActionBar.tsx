// ============================================
// PermissionActionBar - 统一的权限操作栏
// 同时用于底部切换区（isSticky=false，默认）
// 和消息区底部吸附版（isSticky=true，保留备用）
// ============================================

import { memo } from 'react'
import { PermissionListIcon, HandIcon, CheckIcon, CloseIcon, ChevronDownIcon } from '../../components/Icons'
import { autoApproveStore } from '../../store'
import { useIsMobile } from '../../hooks'
import type { ApiPermissionRequest, PermissionReply } from '../../api'

export interface PermissionActionBarProps {
  request: ApiPermissionRequest
  queueLength: number
  isReplying: boolean
  onReply: (reply: PermissionReply) => void
  /** 是否处于底部吸附状态（保留兼容，当前统一在底部渲染） */
  isSticky?: boolean
  /** Jump to 回调（仅 isSticky 时显示） */
  onScrollTo?: () => void
}

export const PermissionActionBar = memo(function PermissionActionBar({
  request,
  queueLength,
  isReplying,
  onReply,
  isSticky = false,
  onScrollTo,
}: PermissionActionBarProps) {
  const isMobile = useIsMobile()
  const intent = request.metadata?.intent as string | undefined

  const handleAlwaysAllow = () => {
    if (autoApproveStore.enabled) {
      const rulePatterns = [
        ...(request.always || []),
        ...(request.patterns || []),
      ]
      const unique = [...new Set(rulePatterns)]
      if (unique.length > 0) {
        autoApproveStore.addRules(request.sessionID, request.permission, unique)
        onReply('once')
        return
      }
    }
    onReply('always')
  }

  return (
    <div className="relative rounded-2xl overflow-hidden shadow-float">
      {/* 脉冲边框动画层 */}
      <div className="absolute inset-0 rounded-2xl border border-accent-main-100/60 animate-permission-pulse pointer-events-none z-10" />

      {/* 底色 */}
      <div className="absolute inset-0 rounded-2xl bg-bg-000/95 backdrop-blur-xl pointer-events-none" />

      <div className="relative">
        {/* Header 行 */}
        <div className="flex items-center gap-2 px-4 py-2.5 border-b border-border-200/30">
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <PermissionListIcon size={14} className="text-accent-main-100 shrink-0" />
            <span className="text-xs font-medium text-text-100 truncate">
              Permission: {request.permission}
            </span>
            {queueLength > 1 && (
              <span className="text-[10px] text-text-400 bg-bg-200 px-1.5 py-0.5 rounded shrink-0">
                +{queueLength - 1}
              </span>
            )}
            {intent && (
              <>
                <span className="text-text-500 shrink-0">·</span>
                <span className="text-xs text-text-400 truncate">{intent}</span>
              </>
            )}
          </div>

          {/* Jump to：仅吸附态显示 */}
          {isSticky && onScrollTo && (
            <button
              onClick={onScrollTo}
              title="Scroll to permission request"
              className="flex items-center gap-1.5 text-xs text-text-400 hover:text-text-100 transition-colors cursor-pointer shrink-0 ml-2 px-2 py-1 rounded-lg hover:bg-bg-200"
            >
              <ChevronDownIcon size={14} />
              <span>Jump to</span>
            </button>
          )}
        </div>

        {/* 按钮行 */}
        <div className={`px-3 py-2.5 ${isMobile ? 'flex flex-col gap-2' : 'flex items-center gap-2'}`}>
          {/* Allow once */}
          <button
            onClick={() => onReply('once')}
            disabled={isReplying}
            className="flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg bg-text-100 text-bg-000 text-xs font-medium hover:bg-text-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
          >
            <HandIcon size={12} />
            <span>{isReplying ? 'Sending...' : 'Allow once'}</span>
          </button>

          {/* Always allow */}
          <button
            onClick={handleAlwaysAllow}
            disabled={isReplying}
            className="flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg border border-border-200/50 text-text-200 text-xs hover:bg-bg-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
          >
            <CheckIcon size={12} />
            <span>Always allow</span>
            {!isMobile && (
              <span className="text-[10px] text-text-400 ml-0.5">
                ({autoApproveStore.enabled ? 'Browser' : 'Session'})
              </span>
            )}
          </button>

          {/* Reject */}
          <button
            onClick={() => onReply('reject')}
            disabled={isReplying}
            className="flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg text-text-300 text-xs hover:bg-bg-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
          >
            <CloseIcon size={12} />
            <span>Reject</span>
          </button>
        </div>

        {queueLength > 1 && (
          <div className="px-4 pb-2.5 text-[10px] text-text-500">
            +{queueLength - 1} more permission request{queueLength > 2 ? 's' : ''} pending
          </div>
        )}
      </div>
    </div>
  )
})
