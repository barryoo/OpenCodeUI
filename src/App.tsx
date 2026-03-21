import { useRef, useEffect, useState, useCallback, useMemo } from 'react'
import { Header, InputBox, QuestionDialog, Sidebar, ChatArea, type ChatAreaHandle } from './features/chat'
import { PermissionActionBar } from './features/chat/PermissionActionBar'
import { type ModelSelectorHandle } from './features/chat/ModelSelector'
import { SettingsDialog } from './features/settings/SettingsDialog'
import { CommandPalette, type CommandItem } from './components/CommandPalette'
import { ToastContainer } from './components/ToastContainer'
import { RightPanel } from './components/RightPanel'
import { OutlineIndex } from './components/OutlineIndex'
import { BottomPanel } from './components/BottomPanel'
import { CloseServiceDialog } from './components/CloseServiceDialog'
import { useTheme, useModels, useModelSelection, useChatSession, useGlobalKeybindings } from './hooks'
import type { KeybindingHandlers } from './hooks/useKeybindings'
import { keybindingStore } from './store/keybindingStore'
import { layoutStore } from './store/layoutStore'
import { STORAGE_KEY_WIDE_MODE } from './constants'
import { restoreModelSelection } from './utils/sessionHelpers'
import { findModelByKey } from './utils/modelUtils'
import { isTauri, isTauriMacOS } from './utils/tauri'
import type { Attachment } from './api'
import { createPtySession } from './api/pty'
import type { TerminalTab } from './store/layoutStore'
import { useDirectory } from './contexts/DirectoryContext'
import { PermissionContext } from './contexts/PermissionContext'
import { FolderIcon } from './components/Icons'
import { extractToolData } from './features/message/tools'
import type { ToolPart } from './types/message'

function normalizeIntentText(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const compact = value.replace(/\s+/g, ' ').trim()
  if (!compact) return undefined
  return compact.length > 120 ? `${compact.slice(0, 117)}...` : compact
}

function summarizeIntentFromToolInput(part: ToolPart, filePath?: string, subtitle?: string): string | undefined {
  const input = part.state.input as Record<string, unknown> | undefined
  if (!input) return subtitle

  const descriptionLike =
    normalizeIntentText(input.description) ||
    normalizeIntentText(input.intent) ||
    normalizeIntentText(input.summary)

  const command = normalizeIntentText(input.command)
  if (descriptionLike) return descriptionLike
  if (command) return `Run: ${command}`

  const queryLike =
    normalizeIntentText(input.query) ||
    normalizeIntentText(input.pattern) ||
    normalizeIntentText(input.url) ||
    normalizeIntentText(input.prompt)
  if (queryLike) return queryLike

  const pathLike =
    normalizeIntentText(input.filePath) ||
    normalizeIntentText(input.filepath) ||
    normalizeIntentText(input.path)
  if (pathLike && !filePath) return pathLike

  if (normalizeIntentText(input.patchText) && filePath) {
    return `Modify ${filePath}`
  }

  return subtitle
}

interface SessionBaselineModel {
  sessionKey: string
  modelKey: string
  modelName: string
  variant?: string
}

function App() {
  // ============================================
  // Refs
  // ============================================
  const chatAreaRef = useRef<ChatAreaHandle>(null)
  const modelSelectorRef = useRef<ModelSelectorHandle>(null)
  const lastEscTimeRef = useRef(0)
  const restoredModelSessionRef = useRef<string | null>(null)
  const initializedBaselineSessionRef = useRef<string | null>(null)

  // Directory (for new-session project banner)
  const { currentDirectory, savedDirectories } = useDirectory()
  const escHintTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // ============================================
  // Cancel Hint (double-Esc to abort)
  // ============================================
  const [showCancelHint, setShowCancelHint] = useState(false)

  // ============================================
  // Theme
  // ============================================
  const { 
    mode: themeMode, setThemeWithAnimation,
    presetId, setPresetWithAnimation, availablePresets,
    customCSS, setCustomCSS,
  } = useTheme()

  // ============================================
  // Models
  // ============================================
  const { models, isLoading: modelsLoading, refetch: refetchModels } = useModels()
  const {
    selectedModelKey,
    selectedVariant,
    currentModel,
    handleModelChange,
    handleVariantChange,
    restoreFromMessage,
  } = useModelSelection({ models })
  const [sessionBaselineModel, setSessionBaselineModel] = useState<SessionBaselineModel | null>(null)

  // ============================================
  // Visible Message IDs (for outline index)
  // ============================================
  const [visibleMessageIds, setVisibleMessageIds] = useState<string[]>([])
  const [isAtBottom, setIsAtBottom] = useState(true)

  // ============================================
  // Input Box Height (动态测量，用于 ChatArea 底部留白)
  // ============================================
  const [inputBoxHeight, setInputBoxHeight] = useState(0)
  const inputBoxWrapperRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = inputBoxWrapperRef.current
    if (!el) return
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setInputBoxHeight(entry.contentRect.height)
      }
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // Viewport height tracking
  // - Tauri Android: 原生 setPadding 让 WebView 自动 resize，直接用 window.innerHeight
  // - Browser/PWA: 通过 visualViewport 计算键盘遮挡区域
  useEffect(() => {
    const root = document.documentElement
    const isTauriApp = root.classList.contains('tauri-app')

    if (isTauriApp) {
      // Tauri: 原生层已处理键盘 resize，只需跟踪 innerHeight
      const updateAppHeight = () => {
        root.style.setProperty('--app-height', `${window.innerHeight}px`)
      }
      updateAppHeight()
      window.addEventListener('resize', updateAppHeight)
      return () => window.removeEventListener('resize', updateAppHeight)
    }

    // Browser/PWA: 用 visualViewport 检测键盘
    const updateViewport = () => {
      const viewport = window.visualViewport
      if (!viewport) return
      const inset = Math.max(0, window.innerHeight - viewport.height - viewport.offsetTop)
      root.style.setProperty('--keyboard-inset-bottom', `${Math.round(inset)}px`)
    }
    updateViewport()
    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', updateViewport)
      window.visualViewport.addEventListener('scroll', updateViewport)
    }
    return () => {
      if (window.visualViewport) {
        window.visualViewport.removeEventListener('resize', updateViewport)
        window.visualViewport.removeEventListener('scroll', updateViewport)
      }
    }
  }, [])

  // ============================================
  // Wide Mode
  // ============================================
  const [isWideMode, setIsWideMode] = useState(() => {
    return localStorage.getItem(STORAGE_KEY_WIDE_MODE) === 'true'
  })

  const toggleWideMode = useCallback(() => {
    setIsWideMode(prev => {
      const next = !prev
      localStorage.setItem(STORAGE_KEY_WIDE_MODE, String(next))
      return next
    })
  }, [])

  // ============================================
  // Settings Dialog
  // ============================================
  const [settingsDialogOpen, setSettingsDialogOpen] = useState(false)
  const [settingsInitialTab, setSettingsInitialTab] = useState<'appearance' | 'chat' | 'notifications' | 'service' | 'servers' | 'keybindings'>('servers')
  const openSettings = useCallback(() => { setSettingsInitialTab('servers'); setSettingsDialogOpen(true) }, [])
  const closeSettings = useCallback(() => setSettingsDialogOpen(false), [])

  // ============================================
  // Project Dialog (triggered externally via keybinding)
  // ============================================
  const [projectDialogOpen, setProjectDialogOpen] = useState(false)
  const openProject = useCallback(() => setProjectDialogOpen(true), [])
  const closeProjectDialog = useCallback(() => setProjectDialogOpen(false), [])

  // ============================================
  // Command Palette
  // ============================================
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false)

  // ============================================
  // Chat Session
  // ============================================
  const {
    // State
    messages,
    isStreaming,
    prependedCount,
    canUndo,
    canRedo,
    redoSteps,
    revertedContent,
    agents,
    selectedAgent,
    setSelectedAgent,
    activeStoreSessionId,
    routeSessionId,
    loadState,
    hasMoreHistory,
    sidebarExpanded,
    setSidebarExpanded,
    effectiveDirectory,
    
    // Permissions
    pendingPermissionRequests,
    pendingQuestionRequests,
    handlePermissionReply,
    handleQuestionReply,
    handleQuestionReject,
    isReplying,
    
    // Session management
    loadMoreHistory,
    handleRedoAll,
    clearRevert,
    
    // Animation
    registerMessage,
    registerInputBox,
    
    // Handlers
    handleSend,
    handleAbort,
    handleCommand,
    handleUndoWithAnimation,
    handleForkSession,
    handleRedoWithAnimation,
    handleSelectSession,
    handleNewSession,
    handleVisibleMessageIdsChange,
    handleArchiveSession,
    handlePreviousSession,
    handleNextSession,
    handleCopyLastResponse,
    restoreAgentFromMessage,
  } = useChatSession({ chatAreaRef, currentModel, refetchModels })
  const activeSessionKey = routeSessionId ?? '__new_session__'

  // ============================================
  // Agent Change with Model Sync
  // ============================================
  // 切换 agent 时，如果 agent 绑定了模型，同步切换输入框里的模型选择
  const syncModelForAgent = useCallback((agentName: string) => {
    const agent = agents.find(a => a.name === agentName)
    if (agent?.model) {
      const modelKey = `${agent.model.providerID}:${agent.model.modelID}`
      const model = findModelByKey(models, modelKey)
      if (model) {
        handleModelChange(modelKey, model)
      }
    }
  }, [agents, models, handleModelChange])

  const handleAgentChange = useCallback((agentName: string) => {
    setSelectedAgent(agentName)
    syncModelForAgent(agentName)
  }, [setSelectedAgent, syncModelForAgent])

  const handleRestoreSessionModel = useCallback(() => {
    if (!sessionBaselineModel) return
    const baselineModel = findModelByKey(models, sessionBaselineModel.modelKey)
    if (!baselineModel) return

    handleModelChange(sessionBaselineModel.modelKey, baselineModel)
  }, [sessionBaselineModel, models, handleModelChange])

  // 包装 handleToggleAgent，切换后同步模型
  const handleToggleAgentWithSync = useCallback(() => {
    const primaryAgents = agents.filter(a => a.mode !== 'subagent' && !a.hidden)
    if (primaryAgents.length <= 1) return
    const currentIndex = primaryAgents.findIndex(a => a.name === selectedAgent)
    const nextIndex = (currentIndex + 1) % primaryAgents.length
    const nextAgentName = primaryAgents[nextIndex].name
    handleAgentChange(nextAgentName)
  }, [agents, selectedAgent, handleAgentChange])

  // ============================================
  // Model Restoration Effect
  // ============================================
  useEffect(() => {
    if (!routeSessionId) {
      restoredModelSessionRef.current = null
      return
    }

    if (activeStoreSessionId !== routeSessionId) return

    // 只在切换/初始化会话后恢复一次模型，避免 Undo 或消息更新覆盖用户手动选择
    if (restoredModelSessionRef.current === routeSessionId) return
    if (loadState !== 'loaded' || models.length === 0) return

    if (messages.length === 0) {
      restoredModelSessionRef.current = routeSessionId
      return
    }

    const lastUserMsg = [...messages].reverse().find(m => m.info.role === 'user')
    if (lastUserMsg && 'model' in lastUserMsg.info) {
      const userInfo = lastUserMsg.info as { model?: { providerID: string; modelID: string }; variant?: string }
      restoreFromMessage(userInfo.model, userInfo.variant)
    }

    restoredModelSessionRef.current = routeSessionId
  }, [routeSessionId, activeStoreSessionId, loadState, messages, models, restoreFromMessage])

  useEffect(() => {
    initializedBaselineSessionRef.current = null
    setSessionBaselineModel(null)
  }, [activeSessionKey])

  useEffect(() => {
    if (models.length === 0) return
    if (routeSessionId && activeStoreSessionId !== routeSessionId) return

    const lastUserMsg = [...messages].reverse().find(m => m.info.role === 'user')
    if (lastUserMsg && 'model' in lastUserMsg.info) {
      const userInfo = lastUserMsg.info as { model?: { providerID: string; modelID: string }; variant?: string }
      const restoredSelection = restoreModelSelection(userInfo.model ?? null, userInfo.variant ?? null, models)

      if (restoredSelection) {
        setSessionBaselineModel({
          sessionKey: activeSessionKey,
          modelKey: restoredSelection.modelKey,
          modelName: restoredSelection.model.name,
          variant: restoredSelection.variant,
        })
        initializedBaselineSessionRef.current = activeSessionKey
        return
      }
    }

    const canInitializeEmptySession = !routeSessionId || loadState === 'loaded'
    if (!canInitializeEmptySession || initializedBaselineSessionRef.current === activeSessionKey || !selectedModelKey) return

    const baselineModel = findModelByKey(models, selectedModelKey)
    if (!baselineModel) return

    setSessionBaselineModel({
      sessionKey: activeSessionKey,
      modelKey: selectedModelKey,
      modelName: baselineModel.name,
      variant: selectedVariant,
    })
    initializedBaselineSessionRef.current = activeSessionKey
  }, [activeSessionKey, routeSessionId, activeStoreSessionId, loadState, messages, models, selectedModelKey, selectedVariant])

  const showRestoreSessionModel = !!sessionBaselineModel
    && sessionBaselineModel.sessionKey === activeSessionKey
    && sessionBaselineModel.modelKey !== selectedModelKey
    && !!findModelByKey(models, sessionBaselineModel.modelKey)

  // ============================================
  // Agent Restoration Effect
  // ============================================
  useEffect(() => {
    // 1. 优先从 revertedContent 恢复（Undo/Redo 场景）
    if (revertedContent?.agent) {
      restoreAgentFromMessage(revertedContent.agent)
      return
    }

    // 2. 从历史消息恢复（切换 session 时）
    if (messages.length === 0) return

    const lastUserMsg = [...messages].reverse().find(m => m.info.role === 'user')
    if (lastUserMsg && 'agent' in lastUserMsg.info) {
      restoreAgentFromMessage((lastUserMsg.info as { agent?: string }).agent)
    }
  }, [messages, revertedContent, restoreAgentFromMessage])

  // ============================================
  // Global Keybindings
  // ============================================
  
  // Create new terminal handler
  const handleNewTerminal = useCallback(async () => {
    try {
      const pty = await createPtySession({ cwd: effectiveDirectory }, effectiveDirectory)
      const tab: TerminalTab = {
        id: pty.id,
        title: pty.title || 'Terminal',
        status: 'connecting',
      }
      layoutStore.addTerminalTab(tab, true)
    } catch (error) {
      console.error('[App] Failed to create terminal:', error)
    }
  }, [effectiveDirectory])
  
  const keybindingHandlers = useMemo<KeybindingHandlers>(() => ({
    // General
    openSettings,
    openProject,
    commandPalette: () => setCommandPaletteOpen(true),
    toggleSidebar: () => setSidebarExpanded(!sidebarExpanded),
    toggleRightPanel: () => layoutStore.toggleRightPanel(),
    focusInput: () => {
      const input = document.querySelector<HTMLTextAreaElement>('[data-input-box] textarea')
      input?.focus()
    },
    
    // Session
    newSession: handleNewSession,
    archiveSession: handleArchiveSession,
    previousSession: handlePreviousSession,
    nextSession: handleNextSession,
    
    // Terminal
    toggleTerminal: () => layoutStore.toggleBottomPanel(),
    newTerminal: handleNewTerminal,
    
    // Model
    selectModel: () => modelSelectorRef.current?.openMenu(),
    toggleAgent: handleToggleAgentWithSync,
    
    // Message
    cancelMessage: () => {
      if (!isStreaming) return
      
      const now = Date.now()
      const elapsed = now - lastEscTimeRef.current
      
      if (elapsed < 600) {
        // 双击确认 → 真正取消
        lastEscTimeRef.current = 0
        setShowCancelHint(false)
        if (escHintTimerRef.current) clearTimeout(escHintTimerRef.current)
        handleAbort()
      } else {
        // 第一次按 → 显示提示
        lastEscTimeRef.current = now
        setShowCancelHint(true)
        if (escHintTimerRef.current) clearTimeout(escHintTimerRef.current)
        escHintTimerRef.current = setTimeout(() => {
          setShowCancelHint(false)
          lastEscTimeRef.current = 0
        }, 1500)
      }
    },
    copyLastResponse: handleCopyLastResponse,
  }), [
    openSettings,
    openProject,
    sidebarExpanded, 
    setSidebarExpanded, 
    handleNewSession,
    handleArchiveSession,
    handlePreviousSession,
    handleNextSession,
    handleNewTerminal,
    handleToggleAgentWithSync,
    isStreaming, 
    handleAbort,
    handleCopyLastResponse,
  ])

  useGlobalKeybindings(keybindingHandlers)

  // ============================================
  // Command Palette - Commands List
  // ============================================
  const commands = useMemo<CommandItem[]>(() => {
    const getShortcut = (action: string) => keybindingStore.getKey(action as import('./store/keybindingStore').KeybindingAction)

    return [
      // General
      { id: 'openSettings', label: 'Open Settings', description: 'Open settings dialog', category: 'General', shortcut: getShortcut('openSettings'), action: openSettings },
      { id: 'openProject', label: 'Open Project', description: 'Open project selector', category: 'General', shortcut: getShortcut('openProject'), action: openProject },
      { id: 'openSettingsShortcuts', label: 'Open Shortcuts Settings', description: 'Open settings to shortcuts tab', category: 'General', action: () => { setSettingsInitialTab('keybindings'); setSettingsDialogOpen(true) } },
      { id: 'toggleSidebar', label: 'Toggle Sidebar', description: 'Show or hide sidebar', category: 'General', shortcut: getShortcut('toggleSidebar'), action: () => setSidebarExpanded(!sidebarExpanded) },
      { id: 'toggleRightPanel', label: 'Toggle Right Panel', description: 'Show or hide right panel', category: 'General', shortcut: getShortcut('toggleRightPanel'), action: () => layoutStore.toggleRightPanel() },
      { id: 'focusInput', label: 'Focus Input', description: 'Focus message input', category: 'General', shortcut: getShortcut('focusInput'), action: () => { const input = document.querySelector<HTMLTextAreaElement>('[data-input-box] textarea'); input?.focus() } },

      // Session
      { id: 'newSession', label: 'New Session', description: 'Create new chat session', category: 'Session', shortcut: getShortcut('newSession'), action: handleNewSession },
      { id: 'archiveSession', label: 'Archive Session', description: 'Archive current session', category: 'Session', shortcut: getShortcut('archiveSession'), action: handleArchiveSession },
      { id: 'previousSession', label: 'Previous Session', description: 'Switch to previous session', category: 'Session', shortcut: getShortcut('previousSession'), action: handlePreviousSession },
      { id: 'nextSession', label: 'Next Session', description: 'Switch to next session', category: 'Session', shortcut: getShortcut('nextSession'), action: handleNextSession },

      // Terminal
      { id: 'toggleTerminal', label: 'Toggle Terminal', description: 'Show or hide terminal panel', category: 'Terminal', shortcut: getShortcut('toggleTerminal'), action: () => layoutStore.toggleBottomPanel() },
      { id: 'newTerminal', label: 'New Terminal', description: 'Open new terminal tab', category: 'Terminal', shortcut: getShortcut('newTerminal'), action: handleNewTerminal },

      // Model
      { id: 'selectModel', label: 'Select Model', description: 'Open model selector', category: 'Model', shortcut: getShortcut('selectModel'), action: () => modelSelectorRef.current?.openMenu() },
      { id: 'toggleAgent', label: 'Toggle Agent', description: 'Switch agent mode', category: 'Model', shortcut: getShortcut('toggleAgent'), action: handleToggleAgentWithSync },

      // Message
      { id: 'copyLastResponse', label: 'Copy Last Response', description: 'Copy last AI response to clipboard', category: 'Message', shortcut: getShortcut('copyLastResponse'), action: handleCopyLastResponse },
      { id: 'cancelMessage', label: 'Cancel Message', description: 'Cancel current response', category: 'Message', shortcut: getShortcut('cancelMessage'), action: () => { if (isStreaming) handleAbort() }, when: () => isStreaming },
    ]
  }, [
    openSettings, openProject, sidebarExpanded, setSidebarExpanded,
    handleNewSession, handleArchiveSession, handlePreviousSession, handleNextSession,
    handleNewTerminal, handleToggleAgentWithSync, handleCopyLastResponse,
    isStreaming, handleAbort,
  ])

  // ============================================
  // Render
  // ============================================

  // ============================================
  // Close Service Dialog (Tauri desktop only)
  // 监听 Rust 侧的 close-requested 事件
  // ============================================
  const [showCloseDialog, setShowCloseDialog] = useState(false)

  useEffect(() => {
    if (!isTauri()) return

    let unlisten: (() => void) | undefined

    // 动态 import Tauri event API
    import('@tauri-apps/api/event').then(({ listen }) => {
      listen('close-requested', () => {
        setShowCloseDialog(true)
      }).then(fn => { unlisten = fn })
    })

    return () => { unlisten?.() }
  }, [])

  const handleCloseDialogConfirm = useCallback(async (stopService: boolean) => {
    if (!isTauri()) return
    try {
      const { invoke } = await import('@tauri-apps/api/core')
      await invoke('confirm_close_app', { stopService })
    } catch (e) {
      console.error('[CloseDialog] Failed to close app:', e)
    }
  }, [])

  // ============================================
  // Dialog Collapsed State
  // ============================================
  const [questionCollapsed, setQuestionCollapsed] = useState(false)
  const hasPendingPermission = pendingPermissionRequests.length > 0

  // 查找当前待授权工具的信息
  const pendingToolInfo = useMemo(() => {
    if (!hasPendingPermission) return null
    const req = pendingPermissionRequests[0]
    const requestMetadata = req.metadata as Record<string, unknown> | undefined
    const metadataIntent = normalizeIntentText(requestMetadata?.intent)
    const metadataOperation = normalizeIntentText(requestMetadata?.operation)
    if (!req.tool) return null

    // 从 messages 中查找对应的 ToolPart
    for (const msg of messages) {
      if (msg.info.id !== req.tool.messageID) continue
      if (msg.info.role !== 'assistant') continue

      for (const part of msg.parts) {
        if (part.type === 'tool' && part.callID === req.tool.callID) {
          const toolPart = part as ToolPart
          const data = extractToolData(toolPart)
          const intent = metadataIntent || summarizeIntentFromToolInput(toolPart, data.filePath, data.subtitle) || metadataOperation
          return {
            toolName: toolPart.tool,
            filePath: data.filePath,
            intent,
            callID: toolPart.callID,
          }
        }
      }
    }
    return null
  }, [hasPendingPermission, pendingPermissionRequests, messages])

  // 新的 request 到来时自动展开
  const questionRequestId = pendingQuestionRequests[0]?.id
  useEffect(() => {
    if (questionRequestId) setQuestionCollapsed(false)
  }, [questionRequestId])

  // streaming 结束时清理 cancel hint
  useEffect(() => {
    if (!isStreaming) {
      setShowCancelHint(false)
      lastEscTimeRef.current = 0
      if (escHintTimerRef.current) {
        clearTimeout(escHintTimerRef.current)
        escHintTimerRef.current = null
      }
    }
  }, [isStreaming])

  const revertedMessage = revertedContent ? {
    text: revertedContent.text,
    attachments: revertedContent.attachments as Attachment[],
  } : undefined

  const nativeMacTitlebar = isTauriMacOS()
  const topInset = nativeMacTitlebar ? '0px' : 'var(--safe-area-inset-top)'

  return (
    <div className="relative h-[var(--app-height)] flex bg-bg-200 overflow-hidden" style={{ paddingTop: topInset }}>
      {/* Sidebar */}
      <Sidebar
        isOpen={sidebarExpanded}
        selectedSessionId={routeSessionId}
        onSelectSession={handleSelectSession}
        onNewSession={handleNewSession}
        onOpen={() => setSidebarExpanded(true)}
        onClose={() => setSidebarExpanded(false)}
        contextLimit={currentModel?.contextLimit}
        onOpenSettings={openSettings}
        themeMode={themeMode}
        onThemeChange={setThemeWithAnimation}
        isWideMode={isWideMode}
        onToggleWideMode={toggleWideMode}
        projectDialogOpen={projectDialogOpen}
        onProjectDialogClose={closeProjectDialog}
      />

      {/* Main Content Area: Chat Column + Right Panel */}
      <div className="flex-1 flex min-w-0 h-full overflow-hidden">
        {/* Left Column: Chat + Bottom Panel */}
        <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
          {/* Chat Area */}
          <div className="flex-1 relative overflow-hidden flex flex-col min-h-0 bg-bg-000">
            {/* Header Overlay */}
            <div className="absolute top-0 left-0 right-0 z-20 pointer-events-none">
              <div className="pointer-events-auto">
                <Header
                  onOpenSidebar={() => setSidebarExpanded(true)}
                  showDesktopSidebarToggle={isTauri() && !sidebarExpanded}
                />
              </div>
            </div>

            {/* Scrollable Area */}
            <div className="absolute inset-0">
              <PermissionContext.Provider value={{
                pendingPermission: pendingPermissionRequests.length > 0 ? pendingPermissionRequests[0] : null,
                queueLength: pendingPermissionRequests.length,
                isReplying,
                onReply: (reply) => pendingPermissionRequests.length > 0
                  ? handlePermissionReply(pendingPermissionRequests[0].id, reply, effectiveDirectory)
                  : Promise.resolve(),
                currentSessionId: routeSessionId,
              }}>
                <ChatArea 
                  ref={chatAreaRef} 
                  messages={messages}
                  sessionId={routeSessionId}
                  isStreaming={isStreaming}
                  prependedCount={prependedCount}
                  loadState={loadState}
                  hasMoreHistory={hasMoreHistory}
                  onLoadMore={loadMoreHistory}
                  onUndo={handleUndoWithAnimation}
                  onFork={handleForkSession}
                  canUndo={canUndo}
                  registerMessage={registerMessage}
                  isWideMode={isWideMode}
                  bottomPadding={inputBoxHeight}
                  onVisibleMessageIdsChange={(ids) => {
                    handleVisibleMessageIdsChange(ids)
                    setVisibleMessageIds(ids)
                  }}
                  onAtBottomChange={setIsAtBottom}
                />
              </PermissionContext.Provider>

              {/* 新会话空白页：居中显示当前项目名，帮助用户确认所属项目 */}
              {!routeSessionId && messages.length === 0 && currentDirectory && (() => {
                const projectName = savedDirectories.find(
                  d => d.path === currentDirectory || d.path.replace(/\\/g, '/') === currentDirectory.replace(/\\/g, '/')
                )?.name ?? currentDirectory.replace(/\\/g, '/').split('/').filter(Boolean).pop() ?? currentDirectory
                return (
                  <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none select-none">
                    <div className="flex items-center gap-2 text-text-400/50">
                      <FolderIcon className="w-4 h-4 shrink-0" />
                      <span className="text-sm font-medium tracking-wide">{projectName}</span>
                    </div>
                  </div>
                )
              })()}
            </div>

            {/* Outline Index - 消息目录索引 */}
            <OutlineIndex
              messages={messages}
              onScrollToMessageId={(messageId) => chatAreaRef.current?.scrollToMessageId(messageId)}
              visibleMessageIds={visibleMessageIds}
            />

            {/* 底部交互区：capsule 按钮 + InputBox/PermissionActionBar 在同一容器 */}
            <div ref={inputBoxWrapperRef} className="absolute bottom-0 left-0 right-0 z-10 pointer-events-none">
              {hasPendingPermission ? (
                /* PermissionActionBar 模式 */
                (() => {
                  const req = pendingPermissionRequests[0]
                  const handleReply = (reply: Parameters<typeof handlePermissionReply>[1]) =>
                    handlePermissionReply(req.id, reply, effectiveDirectory)
                  return (
                    <div className="mx-auto max-w-3xl px-4 pb-4 pointer-events-auto">
                      {/* Capsule 按钮 */}
                      {!isAtBottom && (
                        <div className="flex items-center justify-center gap-2 mb-2">
                          <button
                            onClick={() => chatAreaRef.current?.scrollToBottom()}
                            className="h-[32px] w-[32px] min-w-[32px] rounded-full bg-accent-main-100/10 border border-accent-main-100/20 backdrop-blur-md flex items-center justify-center text-accent-main-000 hover:bg-accent-main-100/20 transition-colors shrink-0"
                            aria-label="Scroll to bottom"
                          >
                            <span className="text-base">↓</span>
                          </button>
                        </div>
                      )}
                      {/* PermissionActionBar */}
                      <PermissionActionBar
                        request={req}
                        queueLength={pendingPermissionRequests.length}
                        isReplying={isReplying}
                        onReply={handleReply}
                        toolInfo={pendingToolInfo}
                      />
                    </div>
                  )
                })()
              ) : (
                /* InputBox 模式 */
                <>
                  {/* Double-Esc cancel hint - 独立渲染 */}
                  {showCancelHint && (
                    <div className="flex justify-center mb-2 pointer-events-none">
                      <div className="px-3 py-1.5 bg-bg-000/95 border border-border-200 rounded-lg shadow-lg text-xs text-text-300 backdrop-blur-sm animate-in fade-in slide-in-from-bottom-2 duration-150">
                        Press <kbd className="mx-0.5 px-1.5 py-0.5 bg-bg-200 border border-border-200 rounded text-[11px] font-medium text-text-200">Esc</kbd> again to stop
                      </div>
                    </div>
                  )}
                  <InputBox
                    onSend={handleSend}
                    onAbort={handleAbort}
                    onCommand={handleCommand}
                    onNewChat={handleNewSession}
                    disabled={false}
                    isStreaming={isStreaming}
                    agents={agents}
                    selectedAgent={selectedAgent}
                    onAgentChange={handleAgentChange}
                    variants={currentModel?.variants ?? []}
                    selectedVariant={selectedVariant}
                    onVariantChange={handleVariantChange}
                    supportsImages={currentModel?.supportsImages ?? false}
                    models={models}
                    selectedModelKey={selectedModelKey}
                    onModelChange={handleModelChange}
                    showRestoreModel={showRestoreSessionModel}
                    restoreModelLabel={sessionBaselineModel?.modelName}
                    onRestoreModel={handleRestoreSessionModel}
                    modelsLoading={modelsLoading}
                    modelSelectorRef={modelSelectorRef}
                    rootPath={effectiveDirectory}
                    sessionId={routeSessionId}
                    revertedText={revertedMessage?.text}
                    revertedAttachments={revertedMessage?.attachments}
                    canRedo={canRedo}
                    revertSteps={redoSteps}
                    onRedo={handleRedoWithAnimation}
                    onRedoAll={handleRedoAll}
                    onClearRevert={clearRevert}
                    registerInputBox={registerInputBox}
                    isAtBottom={isAtBottom}
                    showScrollToBottom={!isAtBottom}
                    onScrollToBottom={() => chatAreaRef.current?.scrollToBottom()}
                    collapsedQuestion={
                      pendingQuestionRequests.length > 0 && questionCollapsed
                        ? { label: 'Question', queueLength: pendingQuestionRequests.length, onExpand: () => setQuestionCollapsed(false) }
                        : undefined
                    }
                    hideCapsuleButtons={false}
                  />
                </>
              )}
            </div>

            {/* Question Dialog - 仍然使用弹窗，因为需要聚焦用户注意力 */}
            {pendingPermissionRequests.length === 0 && pendingQuestionRequests.length > 0 && (
              <QuestionDialog
                request={pendingQuestionRequests[0]}
                onReply={(answers) => handleQuestionReply(pendingQuestionRequests[0].id, answers, effectiveDirectory)}
                onReject={() => handleQuestionReject(pendingQuestionRequests[0].id, effectiveDirectory)}
                queueLength={pendingQuestionRequests.length}
                isReplying={isReplying}
                collapsed={questionCollapsed}
                onCollapsedChange={setQuestionCollapsed}
              />
            )}
          </div>

          {/* Bottom Panel */}
          <BottomPanel directory={effectiveDirectory} />
        </div>

        {/* Right Panel - 占满整个高度 */}
        <RightPanel />
      </div>

      {/* Settings Dialog */}
      <SettingsDialog
        isOpen={settingsDialogOpen}
        onClose={closeSettings}
        themeMode={themeMode}
        onThemeChange={setThemeWithAnimation}
        isWideMode={isWideMode}
        onToggleWideMode={toggleWideMode}
        initialTab={settingsInitialTab}
        presetId={presetId}
        onPresetChange={setPresetWithAnimation}
        availablePresets={availablePresets}
        customCSS={customCSS}
        onCustomCSSChange={setCustomCSS}
      />

      {/* Command Palette */}
      <CommandPalette
        isOpen={commandPaletteOpen}
        onClose={() => setCommandPaletteOpen(false)}
        commands={commands}
      />

      {/* Toast Notifications */}
      <ToastContainer />

      {/* Close Service Dialog (Tauri desktop) */}
      <CloseServiceDialog
        isOpen={showCloseDialog}
        onConfirm={handleCloseDialogConfirm}
        onCancel={() => setShowCloseDialog(false)}
      />
    </div>
  )
}

export default App
