import type { ApiPermissionRequest, PermissionReply } from '../../api'
import { PermissionListIcon, GlobeIcon, UsersIcon, ReturnIcon } from '../../components/Icons'
import { DiffView } from '../../components/DiffView'
import { childSessionStore } from '../../store'

interface PermissionDialogProps {
  request: ApiPermissionRequest
  onReply: (reply: PermissionReply) => void
  queueLength?: number  // 队列中的请求数量
  isReplying?: boolean  // 是否正在回复
  currentSessionId?: string | null  // 当前主 session ID，用于判断是否来自子 agent
}

export function PermissionDialog({ request, onReply, queueLength = 1, isReplying = false, currentSessionId }: PermissionDialogProps) {
  // 从 metadata 中提取 diff 信息
  const metadata = request.metadata
  const diff = metadata?.diff as string | undefined
  const filepath = metadata?.filepath as string | undefined
  
  // Extract structured filediff if available
  let before: string | undefined
  let after: string | undefined
  
  if (metadata?.filediff && typeof metadata.filediff === 'object') {
    const fd = metadata.filediff as Record<string, unknown>
    before = String(fd.before || '')
    after = String(fd.after || '')
  }
  
  // 判断是否是文件编辑类权限
  const isFileEdit = request.permission === 'edit' || request.permission === 'write'

  // 判断是否来自子 session
  const isFromChildSession = currentSessionId && request.sessionID !== currentSessionId
  const childSessionInfo = isFromChildSession 
    ? childSessionStore.getSessionInfo(request.sessionID) 
    : null

  return (
    <div className="absolute bottom-0 left-0 right-0 z-[10]">
      <div className="mx-auto max-w-3xl px-4 pb-7">
        <div className="border border-border-300/40 rounded-[14px] shadow-float bg-bg-100 overflow-hidden">
          <div className="bg-bg-000 rounded-t-[14px]">
            {/* Header */}
            <div className="flex items-center justify-between py-3 px-4">
              <div className="flex items-center gap-2">
                <div className="flex items-center justify-center text-text-100 w-5 h-5">
                  <PermissionListIcon size={20} />
                </div>
                <h3 className="text-sm font-medium text-text-100">Permission: {request.permission}</h3>
                {queueLength > 1 && (
                  <span className="text-xs text-text-400 bg-bg-200 px-1.5 py-0.5 rounded">
                    +{queueLength - 1} more
                  </span>
                )}
              </div>
            </div>

            {/* Child session indicator */}
            {isFromChildSession && (
              <div className="px-4 pb-2 flex items-center gap-2">
                <UsersIcon className="w-3.5 h-3.5 text-info-100" />
                <span className="text-xs text-info-100">
                  From subtask: {childSessionInfo?.title || 'Subtask'}
                </span>
              </div>
            )}

            <div className="border-t border-border-300/30" />

            {/* Content */}
            <div className="px-4 py-3 space-y-4 max-h-[45vh] overflow-y-auto custom-scrollbar">
              {/* Diff Preview for file edits */}
              {isFileEdit && diff && (
                <div>
                  <p className="text-xs text-text-400 mb-2">Changes preview</p>
                  <DiffView 
                    diff={diff} 
                    before={before}
                    after={after}
                    filePath={filepath}
                    defaultCollapsed={false}
                    maxHeight={200}
                  />
                </div>
              )}

              {/* Patterns */}
              {request.patterns && request.patterns.length > 0 && (
                <div>
                  <p className="text-xs text-text-400 mb-2">Patterns to allow</p>
                  <div className="space-y-1.5">
                    {request.patterns.map((pattern, i) => (
                      <div key={i} className="flex items-center gap-2">
                        <span className="flex-shrink-0 w-4 h-4 flex items-center justify-center text-text-400">
                          <GlobeIcon />
                        </span>
                        <span className="text-sm text-text-100 font-mono">{pattern}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Already allowed */}
              {request.always && request.always.length > 0 && (
                <div>
                  <p className="text-xs text-text-400 mb-2">Already allowed</p>
                  <div className="space-y-1.5">
                    {request.always.map((pattern, i) => (
                      <div key={i} className="flex items-start gap-2">
                        <span className="flex-shrink-0 w-5 h-5 rounded-full border border-border-300/50 flex items-center justify-center text-[10px] text-text-400 mt-0.5">
                          ✓
                        </span>
                        <span className="text-sm text-text-300 font-mono">{pattern}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Actions */}
            <div className="px-3 py-3 space-y-[6px]">
              {/* Primary: Allow once */}
              <button
                onClick={() => onReply('once')}
                disabled={isReplying}
                className="w-full flex items-center justify-between px-3.5 py-2 rounded-lg bg-text-100 text-bg-000 hover:bg-text-200 transition-colors font-medium text-sm disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <span>{isReplying ? 'Sending...' : 'Allow once'}</span>
                {!isReplying && <ReturnIcon />}
              </button>
              
              {/* Secondary: Always allow */}
              <button
                onClick={() => onReply('always')}
                disabled={isReplying}
                className="w-full flex items-center justify-between px-3.5 py-2 rounded-lg border border-border-200/50 text-text-100 hover:bg-bg-200 transition-colors text-sm disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <span>Always allow</span>
                <span className="text-xs text-text-400">This session</span>
              </button>

              {/* Tertiary: Reject */}
              <button
                onClick={() => onReply('reject')}
                disabled={isReplying}
                className="w-full flex items-center justify-between px-3.5 py-2 rounded-lg text-text-300 hover:bg-bg-200 transition-colors text-sm disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <span>Reject</span>
                <span className="text-xs text-text-500">Esc</span>
              </button>

              <p className="text-[11px] text-text-500 pt-1 px-1 leading-relaxed">
                You can change permission settings at any time.
              </p>
            </div>
          </div>

        </div>
      </div>
    </div>
  )
}

