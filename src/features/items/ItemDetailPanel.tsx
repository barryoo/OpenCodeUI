import { useEffect, useMemo, useRef, useState } from 'react'
import { ChevronDownIcon, MoreHorizontalIcon, LinkIcon, PinIcon, ClockIcon, CopyIcon, TrashIcon } from '../../components/Icons'
import { deleteSession, getSessions, type ApiSession, updateSession } from '../../api'
import { formatPathForApi } from '../../utils/directoryUtils'
import { Button } from '../../components/ui/Button'
import { ConfirmDialog } from '../../components/ui/ConfirmDialog'
import type { ThinItem, ThinItemType, ThinSessionSummary, ThinWorkflowStatus } from '../../api/thinServer'
import { SessionListItem } from '../chat/sidebar/SessionListItem'

const ITEM_TYPE_OPTIONS: Array<{ value: ThinItemType; label: string }> = [
  { value: 'requirement', label: '需求' },
  { value: 'bug', label: 'Bug' },
  { value: 'research', label: '研究' },
  { value: 'code_review', label: '审查' },
]

const STATUS_OPTIONS: Array<{ value: ThinWorkflowStatus; label: string }> = [
  { value: 'not_started', label: '未开始' },
  { value: 'in_progress', label: '进行中' },
  { value: 'completed', label: '完成' },
  { value: 'abandoned', label: '放弃' },
]

interface ItemDetailPanelProps {
  item: ThinItem
  mode?: 'create' | 'edit'
  linkedSessions: ThinSessionSummary[]
  unboundSessions?: ThinSessionSummary[]
  projectDirectory?: string
  isLinkedSessionPinned?: (sessionId: string) => boolean
  onToggleLinkedSessionPin?: (sessionId: string) => void
  onCopyWorktree?: () => void
  onRenameItem?: () => void
  onArchiveItem?: () => void
  onBindSession?: (summaryId: string, itemId: string) => Promise<void>
  onBindProjectSession?: (session: ApiSession, itemId: string) => Promise<void>
  onCreateItem?: (input: Pick<ThinItem, 'title' | 'type' | 'description'>) => Promise<void>
  onUpdateItem?: (itemId: string, input: Partial<Pick<ThinItem, 'title' | 'type' | 'description' | 'status'>>) => Promise<void>
  onDeleteItem?: (itemId: string) => Promise<void>
  onCancelCreate?: () => void
  onSelectSession: (sessionId: string) => void
  onCreateSession: (itemId: string) => Promise<void>
  onUnbindSession: (summaryId: string) => Promise<void>
  onSearchFiles: (query: string) => Promise<string[]>
}

function ItemTagMenu<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T
  options: Array<{ value: T; label: string }>
  onChange: (value: T) => void
}) {
  const [open, setOpen] = useState(false)
  const active = options.find((option) => option.value === value)
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const cancelClose = () => {
    if (closeTimerRef.current) {
      clearTimeout(closeTimerRef.current)
      closeTimerRef.current = null
    }
  }

  const scheduleClose = () => {
    cancelClose()
    closeTimerRef.current = setTimeout(() => setOpen(false), 120)
  }

  return (
    <div
      className="relative"
      onMouseEnter={cancelClose}
      onMouseLeave={scheduleClose}
    >
      <button
        type="button"
        className="inline-flex items-center gap-1 rounded-full bg-bg-200 px-2.5 py-1 text-[11px] font-medium text-text-200 hover:bg-bg-300"
        onMouseEnter={() => {
          cancelClose()
          setOpen(true)
        }}
        onClick={() => setOpen((prev) => !prev)}
      >
        <span>{active?.label ?? value}</span>
        <ChevronDownIcon size={12} />
      </button>
      {open && (
        <div
          className="absolute left-0 top-full z-20 mt-1 min-w-[120px] rounded-lg border border-border-200 bg-bg-000 p-1 shadow-xl"
          onMouseEnter={cancelClose}
          onMouseLeave={scheduleClose}
        >
          {options.map((option) => (
            <button
              key={option.value}
              type="button"
              className={`flex w-full items-center rounded-md px-2 py-1.5 text-left text-[12px] ${option.value === value ? 'bg-bg-200 text-text-100' : 'text-text-300 hover:bg-bg-100 hover:text-text-100'}`}
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

export function ItemDetailPanel({
  item,
  mode = 'edit',
  linkedSessions,
  unboundSessions = [],
  projectDirectory,
  isLinkedSessionPinned,
  onToggleLinkedSessionPin,
  onCopyWorktree,
  onRenameItem,
  onArchiveItem,
  onBindSession,
  onBindProjectSession,
  onCreateItem,
  onUpdateItem,
  onDeleteItem,
  onCancelCreate,
  onSelectSession,
  onCreateSession,
  onUnbindSession,
  onSearchFiles,
}: ItemDetailPanelProps) {
  const isCreateMode = mode === 'create'
  const [title, setTitle] = useState(item.title)
  const [type, setType] = useState<ThinItemType>(item.type)
  const [status, setStatus] = useState<ThinWorkflowStatus>(item.status)
  const [description, setDescription] = useState(item.description)
  const [suggestions, setSuggestions] = useState<string[]>([])
  const [isEditingTitle, setIsEditingTitle] = useState(isCreateMode)
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const [saveMessage, setSaveMessage] = useState('')
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [itemMenuOpen, setItemMenuOpen] = useState(false)
  const [sessionMenuId, setSessionMenuId] = useState<string | null>(null)
  const [sessionMenuAnchor, setSessionMenuAnchor] = useState<DOMRect | null>(null)
  const [bindMenuOpen, setBindMenuOpen] = useState(false)
  const [bindableSessions, setBindableSessions] = useState<ApiSession[]>([])
  const [existingLinkedSessionIds, setExistingLinkedSessionIds] = useState<Set<string> | null>(null)
  const bindMenuRef = useRef<HTMLDivElement | null>(null)
  const itemMenuRef = useRef<HTMLDivElement | null>(null)
  const sessionMenuRef = useRef<HTMLDivElement | null>(null)
  const titleInputRef = useRef<HTMLInputElement | null>(null)
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const hideSavedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const canCreate = useMemo(() => title.trim().length > 0, [title])

  useEffect(() => {
    setTitle(item.title)
    setType(item.type)
    setStatus(item.status)
    setDescription(item.description)
  }, [item.description, item.status, item.title, item.type])

  useEffect(() => {
    if (isEditingTitle) titleInputRef.current?.focus()
  }, [isEditingTitle])

  useEffect(() => {
    const match = description.match(/@([^\s@]+)$/)
    if (!match) {
      setSuggestions([])
      return
    }
    let cancelled = false
    void onSearchFiles(match[1]).then((files) => {
      if (!cancelled) setSuggestions(files)
    }).catch(() => {
      if (!cancelled) setSuggestions([])
    })
    return () => {
      cancelled = true
    }
  }, [description, onSearchFiles])

  useEffect(() => () => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    if (hideSavedTimerRef.current) clearTimeout(hideSavedTimerRef.current)
  }, [])

  useEffect(() => {
    if (!bindMenuOpen) return

    const handlePointerDown = (event: MouseEvent) => {
      if (!bindMenuRef.current?.contains(event.target as Node)) {
        setBindMenuOpen(false)
      }
    }

    document.addEventListener('mousedown', handlePointerDown)
    return () => document.removeEventListener('mousedown', handlePointerDown)
  }, [bindMenuOpen])

  useEffect(() => {
    if (!itemMenuOpen) return

    const handlePointerDown = (event: MouseEvent) => {
      if (!itemMenuRef.current?.contains(event.target as Node)) {
        setItemMenuOpen(false)
      }
    }

    document.addEventListener('mousedown', handlePointerDown)
    return () => document.removeEventListener('mousedown', handlePointerDown)
  }, [itemMenuOpen])

  useEffect(() => {
    if (!sessionMenuId) return

    const handlePointerDown = (event: MouseEvent | TouchEvent) => {
      if (!sessionMenuRef.current?.contains(event.target as Node)) {
        setSessionMenuId(null)
        setSessionMenuAnchor(null)
      }
    }

    document.addEventListener('mousedown', handlePointerDown)
    document.addEventListener('touchstart', handlePointerDown)
    return () => {
      document.removeEventListener('mousedown', handlePointerDown)
      document.removeEventListener('touchstart', handlePointerDown)
    }
  }, [sessionMenuId])

  useEffect(() => {
    if (!bindMenuOpen || isCreateMode) return

    let cancelled = false
    void getSessions({ directory: formatPathForApi(projectDirectory), roots: true, limit: 200 }).then((sessions) => {
      if (cancelled) return
      const boundIds = new Set(linkedSessions.map((session) => session.externalSessionId))
      const summariesByExternalId = new Map(unboundSessions.map((summary) => [summary.externalSessionId, summary]))
      setBindableSessions(sessions.filter((session) => !boundIds.has(session.id) || summariesByExternalId.has(session.id)))
    }).catch(() => {
      if (!cancelled) setBindableSessions([])
    })

    return () => {
      cancelled = true
    }
  }, [bindMenuOpen, isCreateMode, linkedSessions, projectDirectory, unboundSessions])

  useEffect(() => {
    if (isCreateMode) return

    const directory = formatPathForApi(projectDirectory)
    if (!directory) {
      setExistingLinkedSessionIds(null)
      return
    }

    let cancelled = false
    void getSessions({ directory, roots: true, limit: 200 }).then(async (sessions) => {
      if (cancelled) return

      const nextIds = new Set(sessions.map((session) => session.id))
      setExistingLinkedSessionIds(nextIds)

      const staleSummaries = linkedSessions.filter((session) => !nextIds.has(session.externalSessionId))
      if (staleSummaries.length === 0) return

      await Promise.allSettled(staleSummaries.map(async (session) => {
        await onUnbindSession(session.id)
      }))
    }).catch(() => {
      if (!cancelled) setExistingLinkedSessionIds(null)
    })

    return () => {
      cancelled = true
    }
  }, [isCreateMode, linkedSessions, onUnbindSession, projectDirectory])

  const visibleLinkedSessions = useMemo(() => {
    if (!existingLinkedSessionIds) return linkedSessions
    return linkedSessions.filter((session) => existingLinkedSessionIds.has(session.externalSessionId))
  }, [existingLinkedSessionIds, linkedSessions])

  const markSaved = (message = '已保存') => {
    setSaveState('saved')
    setSaveMessage(message)
    if (hideSavedTimerRef.current) clearTimeout(hideSavedTimerRef.current)
    hideSavedTimerRef.current = setTimeout(() => {
      setSaveState('idle')
      setSaveMessage('')
    }, 1600)
  }

  const markError = (message: string) => {
    setSaveState('error')
    setSaveMessage(message)
  }

  const persistUpdate = async (input: Partial<Pick<ThinItem, 'title' | 'type' | 'description' | 'status'>>) => {
    if (isCreateMode || !onUpdateItem) return
    setSaveState('saving')
    setSaveMessage('保存中…')
    try {
      await onUpdateItem(item.id, input)
      markSaved()
    } catch (error) {
      markError(error instanceof Error ? error.message : '保存失败')
    }
  }

  const scheduleDescriptionSave = (nextDescription: string) => {
    setDescription(nextDescription)
    setSaveState('saving')
    setSaveMessage('等待自动保存…')
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    saveTimerRef.current = setTimeout(() => {
      void persistUpdate({ description: nextDescription })
    }, 2000)
  }

  const handleTitleCommit = async () => {
    setIsEditingTitle(false)
    if (isCreateMode) return
    if (title.trim() === item.title) return
    await persistUpdate({ title: title.trim() })
  }

  const handleCreate = async () => {
    if (!canCreate) {
      markError('请先填写事项标题')
      return
    }
    setSaveState('saving')
    setSaveMessage('创建中…')
    try {
      await onCreateItem?.({ title: title.trim(), type, description })
      markSaved('已创建')
    } catch (error) {
      markError(error instanceof Error ? error.message : '创建失败')
    }
  }

  const handleDelete = async () => {
    if (!onDeleteItem) return
    setDeleting(true)
    try {
      await onDeleteItem(item.id)
      setDeleteConfirmOpen(false)
    } catch (error) {
      markError(error instanceof Error ? error.message : '删除失败')
    } finally {
      setDeleting(false)
    }
  }

  const handleArchiveLinkedSession = async (session: ThinSessionSummary) => {
    const directory = formatPathForApi(projectDirectory)
    if (!directory) return
    try {
      await updateSession(session.externalSessionId, { time: { archived: Date.now() } }, directory)
      await onUnbindSession(session.id)
    } catch (error) {
      markError(error instanceof Error ? error.message : '归档失败')
    } finally {
      setSessionMenuId(null)
      setSessionMenuAnchor(null)
    }
  }

  const handleDeleteLinkedSession = async (session: ThinSessionSummary) => {
    const directory = formatPathForApi(projectDirectory)
    if (!directory) return
    try {
      await deleteSession(session.externalSessionId, directory)
      await onUnbindSession(session.id)
    } catch (error) {
      markError(error instanceof Error ? error.message : '移除失败')
    } finally {
      setSessionMenuId(null)
      setSessionMenuAnchor(null)
    }
  }

  const handleCopyLinkedSessionDirectory = async () => {
    const directory = formatPathForApi(projectDirectory)
    if (!directory) return
    try {
      await navigator.clipboard.writeText(directory)
    } catch {
      // ignore clipboard errors
    } finally {
      setSessionMenuId(null)
      setSessionMenuAnchor(null)
    }
  }

  const beginRename = () => {
    setItemMenuOpen(false)
    setIsEditingTitle(true)
  }

  return (
    <div className="w-[380px] shrink-0 border-r border-border-200/50 bg-bg-000 flex flex-col min-h-0">
      <div className="flex-1 min-h-0 overflow-auto px-4 py-4 space-y-4">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <ItemTagMenu value={type} options={ITEM_TYPE_OPTIONS} onChange={(next) => {
              setType(next)
              if (!isCreateMode) void persistUpdate({ type: next })
            }} />
            <ItemTagMenu value={status} options={STATUS_OPTIONS} onChange={(next) => {
              setStatus(next)
              if (!isCreateMode) void persistUpdate({ status: next })
            }} />
          </div>
          <div className="flex items-center gap-2">
            {!isCreateMode && (
              <div className="relative" ref={bindMenuRef}>
                <Button type="button" variant="ghost" size="sm" onClick={() => setBindMenuOpen((prev) => !prev)} title="绑定本项目会话"><LinkIcon size={12} /></Button>
                {bindMenuOpen && (
                  <div className="absolute right-0 top-full z-[80] mt-1 max-h-72 w-[280px] max-w-[calc(100vw-32px)] overflow-auto rounded-lg border border-border-200 bg-bg-000 p-1 shadow-xl">
                    {bindableSessions.length === 0 ? (
                      <div className="px-2 py-2 text-[12px] text-text-500">暂无可绑定会话</div>
                    ) : bindableSessions.map((session) => {
                      const existingSummary = unboundSessions.find((summary) => summary.externalSessionId === session.id)
                      return (
                      <button
                        key={session.id}
                        type="button"
                        className="flex w-full rounded-md px-2 py-1.5 text-left text-[12px] text-text-300 hover:bg-bg-100 hover:text-text-100"
                        onClick={() => {
                          setBindMenuOpen(false)
                          if (existingSummary?.id) {
                            void onBindSession?.(existingSummary.id, item.id)
                            return
                          }
                          void onBindProjectSession?.(session, item.id)
                        }}
                      >
                        <span className="truncate">{session.title || existingSummary?.titleSnapshot || 'Untitled Chat'}</span>
                      </button>
                    )})}
                  </div>
                )}
              </div>
            )}
            {!isCreateMode && (
              <div className="relative" ref={itemMenuRef}>
                <Button type="button" variant="ghost" size="sm" onClick={() => setItemMenuOpen((prev) => !prev)}><MoreHorizontalIcon size={12} /></Button>
                {itemMenuOpen && (
                  <div className="absolute right-0 top-full z-20 mt-1 min-w-[150px] rounded-lg border border-border-200 bg-bg-000 p-1 shadow-xl">
                    <button type="button" className="flex w-full rounded-md px-2 py-1.5 text-left text-[12px] text-text-300 hover:bg-bg-100 hover:text-text-100" onClick={() => { beginRename(); onRenameItem?.() }}>重命名</button>
                    <button type="button" className="flex w-full rounded-md px-2 py-1.5 text-left text-[12px] text-text-300 hover:bg-bg-100 hover:text-text-100" onClick={() => { setItemMenuOpen(false); onArchiveItem?.() }}>归档</button>
                    <button type="button" className="flex w-full rounded-md px-2 py-1.5 text-left text-[12px] text-text-300 hover:bg-bg-100 hover:text-text-100" onClick={() => { setItemMenuOpen(false); onCopyWorktree?.() }}>复制工作目录</button>
                    <button type="button" className="flex w-full rounded-md px-2 py-1.5 text-left text-[12px] text-danger-100 hover:bg-danger-100/10" onClick={() => { setItemMenuOpen(false); setDeleteConfirmOpen(true) }}>删除</button>
                  </div>
                )}
              </div>
            )}
            {isCreateMode && onCancelCreate && (
              <Button type="button" variant="ghost" size="sm" onClick={onCancelCreate}>取消</Button>
            )}
            {isCreateMode && <Button type="button" size="sm" onClick={() => void handleCreate()} disabled={!canCreate}>创建</Button>}
          </div>
        </div>

        <div className="min-h-[32px]">
          {isEditingTitle ? (
            <input
              ref={titleInputRef}
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              onBlur={() => { void handleTitleCommit() }}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault()
                  void handleTitleCommit()
                }
              }}
              placeholder="请输入事项标题"
              className="w-full h-8 bg-transparent text-lg font-semibold text-text-100 outline-none border-b border-border-200"
            />
          ) : (
            <button type="button" className="h-8 text-left text-lg font-semibold text-text-100 hover:text-accent-main-100" onClick={() => setIsEditingTitle(true)}>
              {title || '点击输入事项标题'}
            </button>
          )}
        </div>

        <div className="relative min-h-[320px]">
          <textarea
            value={description}
            onChange={(event) => scheduleDescriptionSave(event.target.value)}
            rows={16}
            placeholder="输入事项描述，支持 @ 文件引用"
            className="w-full min-h-[320px] resize-none bg-transparent px-0 py-0 text-[12px] leading-6 text-text-200 outline-none"
          />
          <div className={`mt-2 min-h-[16px] text-[11px] ${saveState === 'error' ? 'text-rose-300' : 'text-text-500'}`}>
            {saveMessage || ' '}
          </div>
          {suggestions.length > 0 && (
            <div className="absolute left-0 right-0 top-full z-20 mt-1 rounded-lg border border-border-200 bg-bg-000 shadow-xl overflow-hidden">
              {suggestions.map((file) => (
                <button
                  key={file}
                  type="button"
                  className="block w-full px-3 py-2 text-left text-xs text-text-200 hover:bg-bg-100"
                  onClick={() => {
                    const match = description.match(/@([^\s@]+)$/)
                    if (!match) return
                    scheduleDescriptionSave(description.replace(new RegExp(`@${match[1]}$`), `@${file}`))
                    setSuggestions([])
                  }}
                >
                  {file}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="space-y-2 pt-2">
          <div className="flex items-center justify-between gap-2">
            <div className="text-xs font-medium text-text-300">事项会话</div>
            {!isCreateMode && (
              <Button type="button" variant="ghost" size="sm" onClick={() => void onCreateSession(item.id)}>新建会话</Button>
            )}
          </div>
          {visibleLinkedSessions.length === 0 ? (
            <div className="text-sm text-text-500">当前事项暂无关联会话。</div>
          ) : visibleLinkedSessions.map((session) => {
            const isPinned = !!isLinkedSessionPinned?.(session.externalSessionId)
            const isMenuOpen = sessionMenuId === session.id
            return (
              <SessionListItem
                key={session.id}
                title={session.titleSnapshot}
                selected={false}
                pinned={isPinned}
                menuOpen={isMenuOpen}
                updatedTime={Date.parse(session.updatedAt || session.activityAt)}
                tagLabel="会话"
                tagStatus={session.statusSnapshot}
                menuAnchorRect={isMenuOpen ? sessionMenuAnchor : null}
                menuRef={sessionMenuRef}
                menuActions={[
                  {
                    label: isPinned ? '取消置顶' : '置顶会话',
                    icon: <PinIcon size={12} />,
                    onClick: () => {
                      onToggleLinkedSessionPin?.(session.externalSessionId)
                      setSessionMenuId(null)
                      setSessionMenuAnchor(null)
                    },
                  },
                  {
                    label: '重命名',
                    icon: <MoreHorizontalIcon size={12} />,
                    onClick: () => {
                      setSessionMenuId(null)
                      setSessionMenuAnchor(null)
                    },
                  },
                  {
                    label: '归档',
                    icon: <ClockIcon size={12} />,
                    onClick: () => {
                      void handleArchiveLinkedSession(session)
                    },
                  },
                  {
                    label: '复制工作目录',
                    icon: <CopyIcon size={12} />,
                    onClick: () => {
                      void handleCopyLinkedSessionDirectory()
                    },
                  },
                  {
                    label: '解绑',
                    icon: <LinkIcon size={12} />,
                    onClick: () => {
                      setSessionMenuId(null)
                      setSessionMenuAnchor(null)
                      void onUnbindSession(session.id)
                    },
                  },
                  {
                    label: '移除会话',
                    icon: <TrashIcon size={12} />,
                    danger: true,
                    onClick: () => {
                      void handleDeleteLinkedSession(session)
                    },
                  },
                ]}
                onSelect={() => onSelectSession(session.externalSessionId)}
                onTogglePin={() => onToggleLinkedSessionPin?.(session.externalSessionId)}
                onToggleMenu={(anchorRect) => {
                  setSessionMenuId((prev) => prev === session.id ? null : session.id)
                  setSessionMenuAnchor(anchorRect)
                }}
              />
            )
          })}
        </div>
      </div>

      <ConfirmDialog
        isOpen={deleteConfirmOpen}
        onClose={() => setDeleteConfirmOpen(false)}
        onConfirm={() => { void handleDelete() }}
        title="删除事项"
        description={`删除后不可恢复。确认删除「${item.title || '未命名事项'}」吗？`}
        confirmText="删除"
        cancelText="取消"
        variant="danger"
        isLoading={deleting}
      />
    </div>
  )
}
