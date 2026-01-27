import { memo, useState } from 'react'
import { ChevronDownIcon, UndoIcon } from '../../components/Icons'
import { CopyButton } from '../../components/ui'
import {
  TextPartView,
  ReasoningPartView,
  ToolPartView,
  FilePartView,
  AgentPartView,
  SyntheticTextPartView,
  StepFinishPartView,
} from './parts'
import type { 
  Message, 
  Part, 
  TextPart, 
  ReasoningPart, 
  ToolPart,
  FilePart,
  AgentPart,
  StepFinishPart,
} from '../../types/message'

interface MessageRendererProps {
  message: Message
  onUndo?: (userMessageId: string) => void
  canUndo?: boolean
}

export const MessageRenderer = memo(function MessageRenderer({ message, onUndo, canUndo }: MessageRendererProps) {
  const { info } = message
  const isUser = info.role === 'user'
  
  if (isUser) {
    return <UserMessageView message={message} onUndo={onUndo} canUndo={canUndo} />
  }
  
  return <AssistantMessageView message={message} />
})

// ============================================
// User Message View
// ============================================

interface UserMessageViewProps {
  message: Message
  onUndo?: (userMessageId: string) => void
  canUndo?: boolean
}

function UserMessageView({ message, onUndo, canUndo }: UserMessageViewProps) {
  const { parts, info } = message
  const [showSystemContext, setShowSystemContext] = useState(false)
  
  // 分离不同类型的 parts
  const textParts = parts.filter((p): p is TextPart => p.type === 'text' && !p.synthetic)
  const syntheticParts = parts.filter((p): p is TextPart => p.type === 'text' && !!p.synthetic)
  const fileParts = parts.filter((p): p is FilePart => p.type === 'file')
  const agentParts = parts.filter((p): p is AgentPart => p.type === 'agent')
  
  const hasSystemContext = syntheticParts.length > 0
  const messageText = textParts.map(p => p.text).join('')
  
  return (
    <div className="flex flex-col items-end group">
      <div className="flex flex-col gap-1 items-end w-full">
        {/* 消息文本 */}
        {messageText && (
          <div className="px-4 py-2.5 bg-bg-300 rounded-2xl max-w-full">
            <p className="whitespace-pre-wrap break-words text-sm text-text-100 leading-relaxed">
              {messageText}
            </p>
          </div>
        )}
        
        {/* 用户附件 */}
        {(fileParts.length > 0 || agentParts.length > 0) && (
          <div className="mt-1 flex flex-wrap gap-2 justify-end">
            {fileParts.map(part => (
              <FilePartView key={part.id} part={part} />
            ))}
            {agentParts.map(part => (
              <AgentPartView key={part.id} part={part} />
            ))}
          </div>
        )}

        {/* 系统上下文 */}
        {hasSystemContext && (
          <div className="flex flex-col items-end mt-1 w-full">
            <button 
              onClick={() => setShowSystemContext(!showSystemContext)}
              className="flex items-center gap-1 text-xs text-text-400 hover:text-text-300 transition-colors py-1 px-2 rounded hover:bg-bg-200"
            >
              <span>{showSystemContext ? 'Hide' : 'Show'} system context ({syntheticParts.length})</span>
              <span className={`transition-transform duration-200 ${showSystemContext ? 'rotate-180' : ''}`}>
                <ChevronDownIcon size={10} />
              </span>
            </button>
            
            {showSystemContext && (
              <div className="pt-2 flex flex-wrap gap-2 justify-end">
                {syntheticParts.map(part => (
                  <SyntheticTextPartView key={part.id} part={part} />
                ))}
              </div>
            )}
          </div>
        )}

        {/* Action buttons */}
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          {/* Undo button */}
          {canUndo && onUndo && (
            <button
              onClick={() => onUndo(info.id)}
              className="p-1.5 rounded-md transition-all duration-200 bg-bg-200/80 text-text-400 hover:text-text-100 hover:bg-bg-100"
              title="Undo from here"
            >
              <UndoIcon />
            </button>
          )}
          {/* Copy button */}
          {messageText && (
            <CopyButton text={messageText} position="static" />
          )}
        </div>
      </div>
    </div>
  )
}

// ============================================
// Assistant Message View
// ============================================

function AssistantMessageView({ message }: { message: Message }) {
  const { parts, isStreaming } = message
  
  // 收集连续的 tool parts 合并渲染
  const renderItems = groupPartsForRender(parts)
  
  // 计算完整文本用于复制
  const fullText = parts
    .filter((p): p is TextPart => p.type === 'text' && !p.synthetic)
    .map(p => p.text)
    .join('')
  
  return (
    <div className="flex flex-col gap-2 w-full group">
      {/* Empty streaming message placeholder */}
      {isStreaming && renderItems.length === 0 && (
        <div className="py-2">
          <div className="w-2.5 h-5 bg-accent-main-100/80 rounded-[1px] animate-pulse" />
        </div>
      )}

      {renderItems.map((item) => {
        if (item.type === 'tool-group') {
          return (
            <ToolGroup 
              key={item.parts[0].id} 
              parts={item.parts as ToolPart[]}
              stepFinish={item.stepFinish}
            />
          )
        }
        
        const part = item.part
        switch (part.type) {
          case 'text':
            return (
              <TextPartView 
                key={part.id} 
                part={part as TextPart} 
                isStreaming={isStreaming}
              />
            )
          case 'reasoning':
            return (
              <ReasoningPartView 
                key={part.id} 
                part={part as ReasoningPart}
                isStreaming={isStreaming}
              />
            )
          case 'step-finish':
            return (
              <StepFinishPartView 
                key={part.id} 
                part={part as StepFinishPart}
              />
            )
          default:
            return null
        }
      })}

      {/* Copy button */}
      {fullText.trim() && (
        <div className="opacity-0 group-hover:opacity-100 transition-opacity">
          <CopyButton text={fullText} position="static" />
        </div>
      )}
    </div>
  )
}

// ============================================
// Tool Group (连续的 tool parts)
// ============================================

interface ToolGroupProps {
  parts: ToolPart[]
  stepFinish?: StepFinishPart
}

function ToolGroup({ parts, stepFinish }: ToolGroupProps) {
  const [expanded, setExpanded] = useState(true)
  
  const doneCount = parts.filter(p => p.state.status === 'completed').length
  const totalCount = parts.length
  const isAllDone = doneCount === totalCount
  
  return (
    <div className={`flex flex-col transition-all duration-300 ease-in-out -ml-3 ${
      expanded ? 'w-[calc(100%+1.5rem)]' : 'w-[260px]'
    }`}>
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-1.5 px-3 py-2 text-text-500 text-sm hover:bg-bg-200/30 rounded-lg transition-colors"
      >
        <span className="whitespace-nowrap">
          {isAllDone ? `${totalCount} steps` : `${doneCount}/${totalCount} steps`}
        </span>
        {/* Step finish info inline when collapsed */}
        {!expanded && stepFinish && (
          <span className="text-xs text-text-600 ml-2">
            {formatTokens(stepFinish.tokens)}
          </span>
        )}
        <span className={`ml-auto transition-transform duration-300 ${expanded ? 'rotate-180' : ''}`}>
          <ChevronDownIcon />
        </span>
      </button>

      <div className={`grid transition-[grid-template-rows] duration-300 ease-in-out ${
        expanded ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'
      }`}>
        <div className="flex flex-col overflow-hidden">
          {parts.map((part, idx) => (
            <ToolPartView 
              key={part.id} 
              part={part} 
              isFirst={idx === 0}
              isLast={idx === parts.length - 1}
            />
          ))}
          {/* Step finish at bottom of group */}
          {stepFinish && (
            <div className="px-3 pt-1">
              <StepFinishPartView part={stepFinish} />
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ============================================
// Helpers
// ============================================

function formatTokens(tokens: StepFinishPart['tokens']): string {
  const total = tokens.input + tokens.output + tokens.reasoning
  if (total >= 1000) {
    return `${(total / 1000).toFixed(1)}k tokens`
  }
  return `${total} tokens`
}

// ============================================
// Helper: Group parts for rendering
// ============================================

type RenderItem = 
  | { type: 'single'; part: Part }
  | { type: 'tool-group'; parts: Part[]; stepFinish?: StepFinishPart }

function groupPartsForRender(parts: Part[]): RenderItem[] {
  const result: RenderItem[] = []
  let currentToolGroup: ToolPart[] = []
  
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i]
    
    // 跳过不渲染的 parts
    if (part.type === 'step-start' || part.type === 'snapshot' || part.type === 'patch' || 
        part.type === 'retry' || part.type === 'compaction') {
      continue
    }
    
    // 跳过空 text
    if (part.type === 'text' && !(part as TextPart).text?.trim()) {
      continue
    }
    
    // 跳过 synthetic text（用户消息处理）
    if (part.type === 'text' && (part as TextPart).synthetic) {
      continue
    }
    
    if (part.type === 'tool') {
      currentToolGroup.push(part as ToolPart)
    } else if (part.type === 'step-finish') {
      // 如果有 tool group，把 step-finish 附加到它上面
      if (currentToolGroup.length > 0) {
        result.push({ type: 'tool-group', parts: currentToolGroup, stepFinish: part as StepFinishPart })
        currentToolGroup = []
      } else {
        // 独立的 step-finish（没有 tools）
        result.push({ type: 'single', part })
      }
    } else {
      // 遇到非 tool part，先输出累积的 tool group
      if (currentToolGroup.length > 0) {
        result.push({ type: 'tool-group', parts: currentToolGroup })
        currentToolGroup = []
      }
      result.push({ type: 'single', part })
    }
  }
  
  // 输出最后的 tool group
  if (currentToolGroup.length > 0) {
    result.push({ type: 'tool-group', parts: currentToolGroup })
  }
  
  return result
}
