import { memo } from 'react'
import { useLayoutStore, layoutStore, type RightPanelTab } from '../store/layoutStore'
import { CloseIcon, GitCommitIcon, TerminalIcon, EyeIcon } from './Icons'
import { SessionChangesPanel } from './SessionChangesPanel'
import { useMessageStore } from '../store'

export const RightPanel = memo(function RightPanel() {
  const { activeTab } = useLayoutStore()
  const { sessionId } = useMessageStore()
  
  // 为了动画，我们这里不返回 null，而是通过 CSS 控制显示隐藏
  // 或者在父组件控制渲染
  // 这里假设父组件控制了宽度，我们只负责内容

  return (
    <div className="flex flex-col h-full bg-bg-000 border-l border-border-100">
      {/* Header / Tabs */}
      <div className="flex items-center justify-between px-2 py-1.5 border-b border-border-100 bg-bg-100/50 shrink-0">
        <div className="flex items-center gap-1">
          <TabButton 
            id="changes" 
            active={activeTab === 'changes'} 
            icon={<GitCommitIcon size={14} />} 
            label="Changes" 
          />
          <TabButton 
            id="terminal" 
            active={activeTab === 'terminal'} 
            icon={<TerminalIcon size={14} />} 
            label="Terminal" 
          />
          <TabButton 
            id="preview" 
            active={activeTab === 'preview'} 
            icon={<EyeIcon size={14} />} 
            label="Preview" 
          />
        </div>
        
        <button
          onClick={() => layoutStore.closeRightPanel()}
          className="p-1.5 text-text-400 hover:text-text-100 hover:bg-bg-200 rounded-md transition-colors"
        >
          <CloseIcon size={16} />
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-hidden relative">
        {activeTab === 'changes' && sessionId && (
          <SessionChangesPanel sessionId={sessionId} />
        )}
        
        {activeTab === 'terminal' && (
          <div className="flex items-center justify-center h-full text-text-400 text-xs">
            Terminal coming soon (Phase 3.2)
          </div>
        )}
        
        {activeTab === 'preview' && (
          <div className="flex items-center justify-center h-full text-text-400 text-xs">
            Preview coming soon (Phase 1.3)
          </div>
        )}
        
        {activeTab === 'changes' && !sessionId && (
          <div className="flex items-center justify-center h-full text-text-400 text-xs">
            No active session
          </div>
        )}
      </div>
    </div>
  )
})

interface TabButtonProps {
  id: RightPanelTab
  active: boolean
  icon: React.ReactNode
  label: string
}

function TabButton({ id, active, icon, label }: TabButtonProps) {
  return (
    <button
      onClick={() => layoutStore.toggleRightPanel(id)}
      className={`
        flex items-center gap-2 px-3 py-1.5 rounded-md text-xs font-medium transition-colors
        ${active 
          ? 'bg-bg-200 text-text-100 shadow-sm' 
          : 'text-text-400 hover:text-text-200 hover:bg-bg-200/50'
        }
      `}
    >
      {icon}
      <span>{label}</span>
    </button>
  )
}
