// ============================================
// BottomPanel - 底部面板容器
// 支持多标签、resize、右键菜单移动
// 性能优化：resize 期间使用 CSS visibility:hidden 完全跳过布局计算
// ============================================

import { memo, useCallback, useRef, useState, useEffect, useLayoutEffect } from 'react'
import { Terminal } from './Terminal'
import { TerminalIcon } from './Icons'
import { PanelContainer } from './PanelContainer'
import { layoutStore, useLayoutStore, type TerminalTab, type PanelTab } from '../store/layoutStore'
import { createPtySession, removePtySession, listPtySessions } from '../api/pty'
import { SessionChangesPanel } from './SessionChangesPanel'
import { FileExplorer } from './FileExplorer'
import { useMessageStore } from '../store'
import { useIsMobile } from '../hooks'

// 常量
const MIN_HEIGHT = 100
const MAX_HEIGHT = 600

interface BottomPanelProps {
  directory?: string
}

export const BottomPanel = memo(function BottomPanel({ directory }: BottomPanelProps) {
  const { bottomPanelOpen, bottomPanelHeight, previewFile } = useLayoutStore()
  const { sessionId } = useMessageStore()
  const isMobile = useIsMobile()
  
  const [isResizing, setIsResizing] = useState(false)
  const [isRestoring, setIsRestoring] = useState(false)
  const panelRef = useRef<HTMLDivElement>(null)
  const contentRef = useRef<HTMLDivElement>(null)
  const restoredRef = useRef(false)
  const rafRef = useRef<number>(0)
  const currentHeightRef = useRef(bottomPanelHeight)

  // 同步 store 高度到 CSS 变量
  useLayoutEffect(() => {
    if (!isResizing && panelRef.current && !isMobile) {
      panelRef.current.style.setProperty('--panel-height', `${bottomPanelHeight}px`)
      currentHeightRef.current = bottomPanelHeight
    }
  }, [bottomPanelHeight, isResizing, isMobile])

  // 页面加载时恢复已有的 PTY sessions
  useEffect(() => {
    if (restoredRef.current || !directory) return
    restoredRef.current = true

    const restoreSessions = async () => {
      try {
        setIsRestoring(true)
        const sessions = await listPtySessions(directory)
        console.log('[BottomPanel] Found existing PTY sessions:', sessions)
        
        if (sessions.length > 0) {
          for (const pty of sessions) {
            if (!layoutStore.getTerminalTabs().some(t => t.id === pty.id)) {
              const tab: TerminalTab = {
                id: pty.id,
                title: pty.title || 'Terminal',
                status: pty.running ? 'connecting' : 'exited',
              }
              layoutStore.addTerminalTab(tab, false)
            }
          }
        }
      } catch (error) {
        console.error('[BottomPanel] Failed to restore sessions:', error)
      } finally {
        setIsRestoring(false)
      }
    }

    restoreSessions()
  }, [directory])

  // 创建新终端
  const handleNewTerminal = useCallback(async () => {
    try {
      console.log('[BottomPanel] Creating PTY session, directory:', directory)
      const pty = await createPtySession({ cwd: directory }, directory)
      console.log('[BottomPanel] PTY created:', pty)
      const tab: TerminalTab = {
        id: pty.id,
        title: pty.title || 'Terminal',
        status: 'connecting',
      }
      layoutStore.addTerminalTab(tab)
    } catch (error) {
      console.error('[BottomPanel] Failed to create terminal:', error)
    }
  }, [directory])

  // 关闭终端
  const handleCloseTerminal = useCallback(async (ptyId: string) => {
    try {
      await removePtySession(ptyId, directory)
    } catch {
      // ignore - may already be closed
    }
  }, [directory])

  // PC 端拖拽调整高度
  const handleResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    
    const panel = panelRef.current
    const content = contentRef.current
    if (!panel || !content) return
    
    setIsResizing(true)
    document.body.style.cursor = 'row-resize'
    document.body.style.userSelect = 'none'
    
    window.dispatchEvent(new CustomEvent('panel-resize-start'))
    content.style.display = 'none'
    
    const startY = e.clientY
    const startHeight = currentHeightRef.current
    
    const handleMouseMove = (moveEvent: MouseEvent) => {
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current)
      }
      
      rafRef.current = requestAnimationFrame(() => {
        const deltaY = startY - moveEvent.clientY
        const newHeight = Math.min(Math.max(startHeight + deltaY, MIN_HEIGHT), MAX_HEIGHT)
        panel.style.setProperty('--panel-height', `${newHeight}px`)
        currentHeightRef.current = newHeight
      })
    }
    
    const handleMouseUp = () => {
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current)
      }
      
      if (content) {
        content.style.display = ''
        window.dispatchEvent(new CustomEvent('panel-resize-end'))
      }
      
      setIsResizing(false)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
      
      layoutStore.setBottomPanelHeight(currentHeightRef.current)
    }
    
    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)
  }, [])

  // 移动端 Touch Resize
  const handleTouchResizeStart = useCallback((e: React.TouchEvent) => {
    const panel = panelRef.current
    const content = contentRef.current
    if (!panel) return
    
    setIsResizing(true)
    
    if (content) {
        // Mobile 上也可以尝试隐藏内容以提高性能，或者保留以直观看到效果
        // 考虑到 mobile 性能，隐藏可能更好，但用户体验可能变差（看不到内容变化）
        // 暂时不隐藏，如果卡顿再优化
        // content.style.display = 'none'
    }

    const startY = e.touches[0].clientY
    const startHeight = panel.getBoundingClientRect().height
    
    const handleTouchMove = (moveEvent: TouchEvent) => {
       moveEvent.preventDefault() // 防止页面滚动
       const touchY = moveEvent.touches[0].clientY
       const deltaY = startY - touchY
       const newHeight = Math.min(Math.max(startHeight + deltaY, 200), window.innerHeight * 0.9)
       
       panel.style.height = `${newHeight}px`
       currentHeightRef.current = newHeight
    }
    
    const handleTouchEnd = () => {
       setIsResizing(false)
       
       if (content) {
           content.style.display = ''
       }
       
       window.dispatchEvent(new CustomEvent('panel-resize-end'))
       document.removeEventListener('touchmove', handleTouchMove)
       document.removeEventListener('touchend', handleTouchEnd)
       // Mobile 不一定需要保存到底部高度设置，或者也可以保存
       layoutStore.setBottomPanelHeight(currentHeightRef.current)
    }

    document.addEventListener('touchmove', handleTouchMove, { passive: false })
    document.addEventListener('touchend', handleTouchEnd)
  }, [])

  // 渲染内容
  const renderContent = useCallback((activeTab: PanelTab | null) => {
    if (isRestoring) {
      return (
        <div className="flex flex-col items-center justify-center h-full text-text-400 text-sm gap-2">
          <TerminalIcon size={24} className="opacity-30 animate-pulse" />
          <span>Restoring sessions...</span>
        </div>
      )
    }

    if (!activeTab) {
      return (
        <div className="flex flex-col items-center justify-center h-full text-text-400 text-sm gap-2">
          <TerminalIcon size={24} className="opacity-30" />
          <span>No content</span>
          <button
            onClick={handleNewTerminal}
            className="px-3 py-1.5 text-xs bg-bg-200/50 hover:bg-bg-200 text-text-200 rounded-md transition-colors"
          >
            Create Terminal
          </button>
        </div>
      )
    }

    switch (activeTab.type) {
      case 'terminal':
        return (
          <TerminalContent
            activeTab={activeTab}
            directory={directory}
          />
        )
      case 'files':
        return (
          <FileExplorer 
            directory={directory ?? ''}
            previewFile={previewFile}
            position="bottom"
            isPanelResizing={isResizing}
          />
        )
      case 'changes':
        if (!sessionId) {
          return (
            <div className="flex items-center justify-center h-full text-text-400 text-xs">
              No active session
            </div>
          )
        }
        return <SessionChangesPanel sessionId={sessionId} isResizing={isResizing} />
      default:
        return null
    }
  }, [isRestoring, handleNewTerminal, directory, previewFile, sessionId, isResizing])

  // Mobile 动画条件渲染
  const shouldRender = isMobile ? bottomPanelOpen : true
  if (!shouldRender) return null

  return (
    <>
      {/* Mobile Overlay */}
      {isMobile && bottomPanelOpen && (
        <div 
          className="mobile-overlay-backdrop animate-fade-in-overlay"
          onClick={() => layoutStore.closeBottomPanel()}
        />
      )}

      <div 
        ref={panelRef}
        className={`
          flex flex-col bg-bg-100 
          ${isMobile 
            ? 'fixed bottom-0 left-0 right-0 z-[100] h-[40vh] shadow-2xl animate-slide-in-bottom rounded-t-xl overflow-hidden border-t border-border-200' 
            : 'relative'
          }
        `}
        style={!isMobile ? { 
          '--panel-height': `${bottomPanelHeight}px`,
          height: bottomPanelOpen ? 'var(--panel-height)' : 0 
        } as React.CSSProperties : undefined}
      >
        {/* Resize Handle - PC Only */}
        {!isMobile && (
          <div
            className={`
              absolute top-0 left-0 right-0 h-2 cursor-row-resize z-50
              hover:bg-accent-main-100/30 active:bg-accent-main-100/50 transition-colors -translate-y-1/2
              ${isResizing ? 'bg-accent-main-100/50' : 'bg-transparent'}
            `}
            onMouseDown={handleResizeStart}
          />
        )}
        
        {/* Resize Handle - Mobile Only (Handle Bar) */}
        {isMobile && (
          <div 
            className="w-full flex items-center justify-center pt-2 pb-1 cursor-ns-resize touch-none bg-bg-100"
            onTouchStart={handleTouchResizeStart}
          >
             {/* Visual Indicator */}
             <div className="w-10 h-1 rounded-full bg-border-300 opacity-50" />
          </div>
        )}

        {/* Resize 时的遮罩层 (PC) */}
        {!isMobile && isResizing && (
          <div className="absolute inset-0 z-40 bg-transparent pointer-events-auto" />
        )}
        
        {/* Top Border (PC) */}
        {!isMobile && <div className="h-px bg-border-200/50 shrink-0" />}

        {/* Content Container */}
        <div ref={contentRef} className="flex-1 flex flex-col min-h-0">
          {/* Panel Container with Tabs */}
          <PanelContainer
            position="bottom"
            onNewTerminal={handleNewTerminal}
            onCloseTerminal={handleCloseTerminal}
          >
            {renderContent}
          </PanelContainer>
        </div>
      </div>
    </>
  )
})

// ============================================
// Terminal Content - 渲染所有终端实例
// ============================================

interface TerminalContentProps {
  activeTab: PanelTab
  directory?: string
}

const TerminalContent = memo(function TerminalContent({ 
  activeTab,
  directory,
}: TerminalContentProps) {
  const { panelTabs } = useLayoutStore()
  
  // 获取所有 bottom 位置的 terminal tabs
  const terminalTabs = panelTabs.filter(
    t => t.position === 'bottom' && t.type === 'terminal'
  )

  return (
    <>
      {terminalTabs.map((tab) => (
        <Terminal
          key={tab.id}
          ptyId={tab.id}
          directory={directory}
          isActive={tab.id === activeTab.id}
        />
      ))}
    </>
  )
})
