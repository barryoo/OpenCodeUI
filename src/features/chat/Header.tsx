import { useState, useRef, useEffect, useMemo, useCallback } from 'react'
import { PanelRightIcon, PanelBottomIcon, ChevronDownIcon, SidebarIcon } from '../../components/Icons'
import { IconButton } from '../../components/ui'
import { ShareDialog } from './ShareDialog'
import { OpenEditorButton } from './OpenEditorButton'
import { StatusPopover } from './StatusPopover'
import { useMessageStore, useChildSessionInfo, childSessionStore } from '../../store'
import { useLayoutStore, layoutStore } from '../../store/layoutStore'
import { useSessionContext } from '../../contexts/SessionContext'
import { updateSession } from '../../api'
import { setSessionQueryData, useSessionDetailQuery } from '../../hooks'
import { uiErrorHandler } from '../../utils'
import { handleWindowTitlebarMouseDown, isTauriMacOS } from '../../utils/tauri'
import { useItemWorkspaceStore } from '../../store/itemWorkspaceStore'
import type { ThinWorkflowStatus } from '../../api/thinServer'

const SESSION_STATUS_OPTIONS: Array<{ value: ThinWorkflowStatus; label: string }> = [
  { value: 'in_progress', label: '进行中' },
  { value: 'completed', label: '完成' },
  { value: 'abandoned', label: '放弃' },
]

function getStatusLabel(status: ThinWorkflowStatus): string {
  return SESSION_STATUS_OPTIONS.find((option) => option.value === status)?.label ?? '进行中'
}

function SessionStatusTag({
  status,
  onChange,
}: {
  status: ThinWorkflowStatus
  onChange: (status: ThinWorkflowStatus) => void
}) {
  const [open, setOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!open) return
    const onDown = (event: MouseEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  return (
    <div className="relative" ref={menuRef}>
      <button
        type="button"
        className="inline-flex items-center gap-1 rounded-full bg-bg-200 px-2.5 py-1 text-[11px] font-medium text-text-200 hover:bg-bg-300"
        onClick={() => setOpen((prev) => !prev)}
      >
        <span>{getStatusLabel(status)}</span>
        <ChevronDownIcon size={12} />
      </button>
      {open && (
        <div className="absolute left-0 top-full z-[60] mt-1 min-w-[120px] rounded-lg border border-border-200 bg-bg-000 p-1 shadow-xl">
          {SESSION_STATUS_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              className={`flex w-full items-center rounded-md px-2 py-1.5 text-left text-[12px] ${option.value === status ? 'bg-bg-200 text-text-100' : 'text-text-300 hover:bg-bg-100 hover:text-text-100'}`}
              onClick={() => {
                setOpen(false)
                onChange(option.value)
              }}
            >
              {option.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

interface HeaderProps {
  onOpenSidebar?: () => void
  showDesktopSidebarToggle?: boolean
}

export function Header({
  onOpenSidebar,
  showDesktopSidebarToggle = false,
}: HeaderProps) {
  const { sessionId, messages, sessionDirectory } = useMessageStore()
  const { rightPanelOpen, bottomPanelOpen } = useLayoutStore()
  const { sessions, refresh } = useSessionContext()
  const childSessionInfo = useChildSessionInfo(sessionId)
  const sessionSummary = useItemWorkspaceStore((state) => sessionId ? state.getSessionSummaryByExternalId(sessionId) : null)
  const updateSessionStatus = useItemWorkspaceStore((state) => state.updateSessionStatus)
  
  const [shareDialogOpen, setShareDialogOpen] = useState(false)
  
  const [isEditingTitle, setIsEditingTitle] = useState(false)
  const [editTitle, setEditTitle] = useState('')
  const titleInputRef = useRef<HTMLInputElement>(null)
  const nativeMacTitlebar = isTauriMacOS()
  const headerContainerClass = nativeMacTitlebar
    ? 'h-14 items-center md:pl-[5.25rem]'
    : 'h-14 items-center'
  const desktopTitleClass = 'absolute left-1/2 top-1/2 hidden -translate-x-1/2 -translate-y-1/2 md:flex z-20'

  // Session Data
  const currentSession = useMemo(() => 
    sessions.find(s => s.id === sessionId), 
    [sessions, sessionId]
  )
  const targetDirectory = sessionDirectory || currentSession?.directory || undefined
  const { data: sessionDetail } = useSessionDetailQuery(sessionId, targetDirectory)

  const fallbackAgentName = useMemo(() => {
    for (const message of messages) {
      const agent = message.info.agent?.trim()
      if (agent) return agent
    }
    return ''
  }, [messages])

  const trimmedDetailTitle = sessionDetail?.title?.trim()
  const trimmedCurrentTitle = currentSession?.title?.trim()
  const trimmedChildTitle = childSessionInfo?.title?.trim()
  const isSubagentSession = Boolean(sessionDetail?.parentID || childSessionInfo?.parentID)
  const resolvedTitle =
    trimmedDetailTitle
    || trimmedCurrentTitle
    || trimmedChildTitle
    || (isSubagentSession && fallbackAgentName ? fallbackAgentName : '')
  const sessionTitle = sessionId
    ? (resolvedTitle || (currentSession ? 'New Chat' : `Session ${sessionId.slice(0, 6)}`))
    : 'New Chat'
  const hasNamedTitle = Boolean(resolvedTitle)
  const sessionStatus: ThinWorkflowStatus = sessionSummary?.statusSnapshot ?? 'in_progress'

  // 同步 document.title - 有 session 标题时显示 "标题 - OpenCode"，否则只显示 "OpenCode"
  useEffect(() => {
    if (nativeMacTitlebar) {
      document.title = 'OpenCode'
      return () => { document.title = 'OpenCode' }
    }

    if (hasNamedTitle) {
      document.title = `${sessionTitle} - OpenCode`
    } else {
      document.title = 'OpenCode'
    }
    return () => { document.title = 'OpenCode' }
  }, [hasNamedTitle, sessionTitle, nativeMacTitlebar])

  // Editing Logic
  useEffect(() => {
    setIsEditingTitle(false)
  }, [sessionId])

  useEffect(() => {
    if (isEditingTitle && titleInputRef.current) {
      titleInputRef.current.focus()
      titleInputRef.current.select()
    }
  }, [isEditingTitle])

  const handleStartEdit = () => {
    if (!sessionId) return
    setEditTitle(sessionTitle)
    setIsEditingTitle(true)
  }

  const handleRename = async () => {
    if (!sessionId || !editTitle.trim() || editTitle === sessionTitle) {
      setIsEditingTitle(false)
      return
    }
    try {
      const targetDirectory = currentSession?.directory || sessionDirectory || undefined
      const updatedSession = await updateSession(sessionId, { title: editTitle.trim() }, targetDirectory)
      refresh()
      setSessionQueryData(updatedSession)
      childSessionStore.updateChildSession(sessionId, { title: updatedSession.title })
    } catch (e) {
      uiErrorHandler('rename session', e)
    } finally {
      setIsEditingTitle(false)
    }
  }

  const handleHeaderMouseDown = useCallback((event: React.MouseEvent<HTMLDivElement>) => {
    void handleWindowTitlebarMouseDown(event.target, event.button, event.detail)
  }, [])

  const handleSessionStatusChange = useCallback(async (status: ThinWorkflowStatus) => {
    if (!sessionId || !currentSession?.projectID) return
    try {
      await updateSessionStatus({
        projectId: currentSession.projectID,
        externalSessionId: sessionId,
        titleSnapshot: currentSession.title || sessionTitle,
        activityAt: new Date((currentSession.time.updated ?? currentSession.time.created ?? Date.now())).toISOString(),
        status,
      })
    } catch (error) {
      uiErrorHandler('update session status', error)
    }
  }, [currentSession?.projectID, currentSession?.time.created, currentSession?.time.updated, currentSession?.title, sessionId, sessionTitle, updateSessionStatus])

  return (
    <div
      className={`${headerContainerClass} flex justify-between px-4 z-20 bg-bg-000/95 border-b border-border-200/55 backdrop-blur-md transition-colors duration-200 relative select-none`}
      onMouseDown={handleHeaderMouseDown}
    >
      
      {/* Left: Mobile Menu + Title (z-20) */}
      <div className="flex items-center gap-2 min-w-0 shrink-1 z-20" data-no-window-drag="true">
        {/* Mobile Sidebar Toggle - 只在移动端显示 */}
        {onOpenSidebar && (
          <IconButton
            aria-label="Open sidebar"
            onClick={onOpenSidebar}
            className={`${showDesktopSidebarToggle ? '' : 'md:hidden'} hover:bg-bg-200/50 text-text-400 hover:text-text-100 -ml-2`}
          >
            <SidebarIcon size={18} />
          </IconButton>
        )}
        {sessionId && (
          <div className="hidden md:flex items-center">
            <SessionStatusTag status={sessionStatus} onChange={(status) => { void handleSessionStatusChange(status) }} />
          </div>
        )}
        {/* 移动端：Session Title */}
        <div className="md:hidden min-w-0">
          <div className={`flex items-center group ${isEditingTitle ? 'bg-bg-200/50 ring-1 ring-accent-main-100' : 'bg-transparent hover:bg-bg-200/50 border border-transparent hover:border-border-200/50'} rounded-lg transition-all duration-200 p-0.5 min-w-0 shrink`}>
            {isEditingTitle ? (
              <input
                ref={titleInputRef}
                type="text"
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
                onBlur={handleRename}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleRename()
                  if (e.key === 'Escape') setIsEditingTitle(false)
                }}
                className="px-2 py-1.5 text-sm font-medium text-text-100 bg-transparent border-none outline-none w-[160px] h-full"
              />
            ) : (
              <button 
                onClick={handleStartEdit}
                className="px-2 py-1.5 text-sm font-medium text-text-200 hover:text-text-100 transition-colors truncate max-w-[200px] cursor-text select-none"
                title="Click to rename"
              >
                {sessionTitle}
              </button>
            )}
            {!isEditingTitle && (
              <>
                <div className="w-[1.5px] h-3 bg-border-200/50 mx-0.5 shrink-0" />
                <button 
                  className="p-1 text-text-400 hover:text-text-100 transition-colors rounded-md hover:bg-bg-300/50 shrink-0"
                  title="Share session"
                  onClick={() => setShareDialogOpen(true)}
                >
                  <ChevronDownIcon size={12} />
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Center: Session Title (PC only, 居中) (z-20) */}
      <div className={desktopTitleClass} data-no-window-drag="true">
        <div className={`flex items-center group ${isEditingTitle ? 'bg-bg-200/50 ring-1 ring-accent-main-100' : 'bg-transparent hover:bg-bg-200/50 border border-transparent hover:border-border-200/50'} rounded-lg transition-all duration-200 p-0.5 min-w-0 shrink`}>
          
          {isEditingTitle ? (
            <input
              ref={titleInputRef}
              type="text"
              value={editTitle}
              onChange={(e) => setEditTitle(e.target.value)}
              onBlur={handleRename}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleRename()
                if (e.key === 'Escape') setIsEditingTitle(false)
              }}
              className="px-3 py-1.5 text-sm font-medium text-text-100 bg-transparent border-none outline-none w-[200px] lg:w-[300px] h-full text-center"
            />
          ) : (
            <button 
              onClick={handleStartEdit}
              className="px-3 py-1.5 text-sm font-medium text-text-200 hover:text-text-100 transition-colors truncate max-w-[300px] cursor-text select-none text-center"
              title="Click to rename"
            >
              {sessionTitle}
            </button>
          )}

          {!isEditingTitle && (
            <>
              <div className="w-[1.5px] h-3 bg-border-200/50 mx-0.5 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />
              <button 
                className="p-1 text-text-400 hover:text-text-100 transition-colors rounded-md hover:bg-bg-300/50 opacity-0 group-hover:opacity-100 shrink-0"
                title="Share session"
                onClick={() => setShareDialogOpen(true)}
              >
                <ChevronDownIcon size={12} />
              </button>
            </>
          )}
        </div>
      </div>

      {/* Right: Open Editor + Panel Toggles (z-20) */}
      <div className="flex items-center gap-1 pointer-events-auto shrink-0 z-20" data-no-window-drag="true">
        <OpenEditorButton />
        <StatusPopover />

        {/* Panel Toggles Group */}
        <div className="flex items-center gap-0.5">
          <IconButton
            aria-label={bottomPanelOpen ? "Close bottom panel" : "Open bottom panel"}
            onClick={() => layoutStore.toggleBottomPanel()}
            className={`transition-colors ${bottomPanelOpen ? 'text-accent-main-100 bg-bg-200/50' : 'text-text-400 hover:text-text-100 hover:bg-bg-200/50'}`}
          >
            <PanelBottomIcon size={18} />
          </IconButton>

          <IconButton
            aria-label={rightPanelOpen ? "Close panel" : "Open panel"}
            onClick={() => layoutStore.toggleRightPanel()}
            className={`transition-colors ${rightPanelOpen ? 'text-accent-main-100 bg-bg-200/50' : 'text-text-400 hover:text-text-100 hover:bg-bg-200/50'}`}
          >
            <PanelRightIcon size={18} />
          </IconButton>
        </div>
      </div>

      <ShareDialog isOpen={shareDialogOpen} onClose={() => setShareDialogOpen(false)} />

      {/* Smooth gradient - z-10 */}
      <div className="absolute top-full left-0 right-0 h-8 bg-gradient-to-b from-bg-000 to-transparent pointer-events-none z-10" />
    </div>
  )
}
