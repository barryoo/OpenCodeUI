import { memo } from 'react'
import type { MessageError } from '../../../types/message'

interface MessageErrorViewProps {
  error: MessageError
}

/**
 * 消息级别的错误显示
 * 用于 AssistantMessage 的 error 字段
 */
export const MessageErrorView = memo(function MessageErrorView({ error }: MessageErrorViewProps) {
  const { title, description, details, severity } = getErrorInfo(error)
  
  const bgClass = severity === 'error' ? 'bg-danger-100/10' : 'bg-warning-100/10'
  const borderClass = severity === 'error' ? 'border-danger-100/30' : 'border-warning-100/30'
  const iconClass = severity === 'error' ? 'text-danger-100' : 'text-warning-100'
  const titleClass = severity === 'error' ? 'text-danger-100' : 'text-warning-100'
  
  return (
    <div className={`rounded-xl border ${borderClass} ${bgClass} overflow-hidden`}>
      <div className="flex items-start gap-3 px-4 py-3">
        <ErrorIcon className={`w-5 h-5 flex-shrink-0 mt-0.5 ${iconClass}`} />
        <div className="flex-1 min-w-0">
          <h4 className={`text-sm font-medium ${titleClass}`}>
            {title}
          </h4>
          <p className="text-sm text-text-300 mt-1">
            {description}
          </p>
          {details && (
            <div className="mt-2 p-2 rounded-lg bg-bg-300/50 border border-border-200/30">
              <pre className="text-xs text-text-400 font-mono whitespace-pre-wrap break-all">
                {details}
              </pre>
            </div>
          )}
        </div>
      </div>
    </div>
  )
})

/**
 * 解析错误信息
 */
function getErrorInfo(error: MessageError): {
  title: string
  description: string
  details?: string
  severity: 'error' | 'warning'
} {
  switch (error.name) {
    case 'ProviderAuthError':
      return {
        title: 'Authentication Error',
        description: `Failed to authenticate with ${error.data.providerID}: ${error.data.message}`,
        severity: 'error'
      }
    
    case 'MessageOutputLengthError':
      return {
        title: 'Output Too Long',
        description: 'The response exceeded the maximum output length and was truncated.',
        severity: 'warning'
      }
    
    case 'MessageAbortedError':
      return {
        title: 'Message Aborted',
        description: error.data.message || 'The message generation was interrupted.',
        severity: 'warning'
      }
    
    case 'APIError':
      return {
        title: `API Error${error.data.statusCode ? ` (${error.data.statusCode})` : ''}`,
        description: error.data.message,
        details: error.data.responseBody,
        severity: error.data.isRetryable ? 'warning' : 'error'
      }
    
    case 'UnknownError':
    default:
      return {
        title: 'Error',
        description: error.data?.message || 'An unknown error occurred.',
        severity: 'error'
      }
  }
}

function ErrorIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <line x1="12" y1="8" x2="12" y2="12" />
      <line x1="12" y1="16" x2="12.01" y2="16" />
    </svg>
  )
}
