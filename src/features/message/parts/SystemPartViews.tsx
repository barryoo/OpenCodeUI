import { memo, useState } from 'react'
import type { RetryPart, CompactionPart, PatchPart } from '../../../types/message'

// ============================================
// Retry Part View - 显示重试状态
// ============================================

interface RetryPartViewProps {
  part: RetryPart
}

export const RetryPartView = memo(function RetryPartView({ part }: RetryPartViewProps) {
  const [expanded, setExpanded] = useState(false)
  const { attempt, error, time } = part
  
  const timeStr = new Date(time.created).toLocaleTimeString()
  const isRetryable = error.data.isRetryable
  
  return (
    <div className="my-2 px-3 py-2 rounded-lg bg-warning-100/10 border border-warning-100/20">
      <div 
        className="flex items-center gap-2 cursor-pointer"
        onClick={() => setExpanded(!expanded)}
      >
        <RetryIcon className="w-4 h-4 text-warning-100 flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <span className="text-sm text-warning-100">
            Retry attempt {attempt}
          </span>
          <span className="text-xs text-text-500 ml-2">
            {timeStr}
          </span>
        </div>
        {isRetryable && (
          <span className="text-[10px] text-warning-100/70 bg-warning-100/10 px-1.5 py-0.5 rounded">
            Retryable
          </span>
        )}
        <ChevronIcon className={`w-4 h-4 text-text-400 transition-transform ${expanded ? 'rotate-180' : ''}`} />
      </div>
      
      {expanded && (
        <div className="mt-2 pt-2 border-t border-warning-100/20">
          <p className="text-xs text-text-300 font-mono break-all">
            {error.data.message}
          </p>
          {error.data.statusCode && (
            <p className="text-[10px] text-text-500 mt-1">
              Status: {error.data.statusCode}
            </p>
          )}
        </div>
      )}
    </div>
  )
})

// ============================================
// Compaction Part View - 显示上下文压缩
// ============================================

interface CompactionPartViewProps {
  part: CompactionPart
}

export const CompactionPartView = memo(function CompactionPartView({ part }: CompactionPartViewProps) {
  const isAuto = part.auto
  
  return (
    <div className="my-2 flex items-center gap-2 px-3 py-1.5 text-xs text-text-500">
      <div className="flex-1 h-px bg-border-200" />
      <CompactIcon className="w-3.5 h-3.5" />
      <span>
        Context {isAuto ? 'auto-' : ''}compacted
      </span>
      <div className="flex-1 h-px bg-border-200" />
    </div>
  )
})

// ============================================
// Patch Part View - 显示文件变更补丁
// ============================================

interface PatchPartViewProps {
  part: PatchPart
}

export const PatchPartView = memo(function PatchPartView({ part }: PatchPartViewProps) {
  const [expanded, setExpanded] = useState(false)
  const { hash, files } = part
  const fileCount = files.length
  
  return (
    <div className="my-2 rounded-lg border border-border-200/60 bg-bg-100/50 overflow-hidden">
      <div 
        className="flex items-center gap-2 px-3 py-2 cursor-pointer hover:bg-bg-200/30 transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        <PatchIcon className="w-4 h-4 text-text-400 flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <span className="text-sm text-text-200">
            {fileCount} file{fileCount !== 1 ? 's' : ''} changed
          </span>
          <span className="text-xs text-text-500 ml-2 font-mono">
            {hash.slice(0, 7)}
          </span>
        </div>
        <ChevronIcon className={`w-4 h-4 text-text-400 transition-transform ${expanded ? 'rotate-180' : ''}`} />
      </div>
      
      {expanded && (
        <div className="px-3 py-2 border-t border-border-200/40 space-y-1">
          {files.map((file, idx) => (
            <div key={idx} className="flex items-center gap-2 text-xs">
              <FileIcon className="w-3 h-3 text-text-500" />
              <span className="text-text-300 font-mono truncate">{file}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
})

// ============================================
// Icons
// ============================================

function RetryIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" />
      <path d="M21 3v5h-5" />
      <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16" />
      <path d="M3 21v-5h5" />
    </svg>
  )
}

function CompactIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 12h16" />
      <path d="M4 6h16" />
      <path d="M4 18h16" />
      <path d="M8 3v3" />
      <path d="M16 3v3" />
      <path d="M8 18v3" />
      <path d="M16 18v3" />
    </svg>
  )
}

function PatchIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3v18" />
      <path d="M3 12h18" />
      <rect x="6" y="6" width="12" height="12" rx="2" />
    </svg>
  )
}

function FileIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
      <polyline points="14 2 14 8 20 8" />
    </svg>
  )
}

function ChevronIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="m6 9 6 6 6-6" />
    </svg>
  )
}
