import { createPortal } from 'react-dom'
import type { MouseEvent, ReactNode, RefObject, TouchEventHandler } from 'react'
import { MoreHorizontalIcon, PinIcon } from '../../../components/Icons'
import { formatRelativeTime } from '../../../utils/dateUtils'
import type { ThinWorkflowStatus } from '../../../api/thinServer'

function getStatusTagClass(status?: ThinWorkflowStatus): string {
  switch (status) {
    case 'in_progress':
      return 'bg-sky-500/15 text-sky-300'
    case 'not_started':
      return 'bg-violet-500/15 text-violet-300'
    case 'completed':
      return 'bg-emerald-500/15 text-emerald-300'
    case 'abandoned':
      return 'bg-zinc-500/15 text-zinc-400'
    default:
      return 'bg-bg-200 text-text-400'
  }
}

function RunningIndicator() {
  return (
    <span className="relative inline-flex h-2.5 w-2.5 items-center justify-center">
      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-accent-main-100/45" />
      <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-accent-main-100" />
    </span>
  )
}

interface ActionMenuProps {
  menuRef?: RefObject<HTMLDivElement | null>
  anchorRect: DOMRect
  children: ReactNode
}

export function ActionMenu({ menuRef, anchorRect, children }: ActionMenuProps) {
  const menuWidth = 160
  const viewportWidth = window.innerWidth
  const viewportHeight = window.innerHeight

  let left = anchorRect.right - menuWidth
  if (left < 4) left = 4

  let top = anchorRect.bottom + 4
  const estimatedHeight = 8 + 5 * 28
  if (top + estimatedHeight > viewportHeight - 8) {
    top = anchorRect.top - estimatedHeight - 4
    if (top < 8) top = 8
  }

  if (left + menuWidth > viewportWidth - 4) {
    left = viewportWidth - menuWidth - 4
  }

  return createPortal(
    <div
      ref={menuRef}
      style={{ top, left, width: menuWidth, position: 'fixed' }}
      className="rounded-lg border border-border-200/60 bg-bg-000 shadow-xl z-[9999] p-1"
    >
      {children}
    </div>,
    document.body,
  )
}

interface ActionMenuItemProps {
  label: string
  icon: ReactNode
  danger?: boolean
  onClick: () => void
}

export function ActionMenuItem({ label, icon, danger = false, onClick }: ActionMenuItemProps) {
  return (
    <button
      type="button"
      onMouseDown={(event) => {
        event.stopPropagation()
      }}
      onTouchStart={(event) => {
        event.stopPropagation()
      }}
      onTouchEnd={(event) => {
        event.preventDefault()
        event.stopPropagation()
        onClick()
      }}
      onClick={(event) => {
        event.preventDefault()
        event.stopPropagation()
        onClick()
      }}
      className={`w-full h-7 px-2 rounded-md flex items-center gap-2 text-[11px] transition-colors ${
        danger
          ? 'text-danger-100 hover:bg-danger-100/10'
          : 'text-text-200 hover:text-text-100 hover:bg-[var(--sidebar-hover-bg)]'
      }`}
    >
      <span className="text-text-400">{icon}</span>
      <span>{label}</span>
    </button>
  )
}

export interface SessionListItemAction {
  label: string
  icon: ReactNode
  danger?: boolean
  onClick: () => void
}

interface SessionListItemProps {
  title: string
  selected: boolean
  pinned: boolean
  running?: boolean
  hasUnread?: boolean
  menuOpen?: boolean
  showMenuButton?: boolean
  tagLabel?: string
  tagStatus?: ThinWorkflowStatus
  updatedTime?: number
  menuAnchorRect?: DOMRect | null
  menuRef?: RefObject<HTMLDivElement | null>
  menuActions?: SessionListItemAction[]
  onSelect: () => void
  onTogglePin: () => void
  onToggleMenu?: (anchorRect: DOMRect) => void
  onTouchStart?: TouchEventHandler<HTMLButtonElement>
  onTouchMove?: TouchEventHandler<HTMLButtonElement>
  onTouchEnd?: TouchEventHandler<HTMLButtonElement>
  onContextMenu?: (event: MouseEvent<HTMLButtonElement>) => void
}

export function SessionListItem({
  title,
  selected,
  pinned,
  running = false,
  hasUnread = false,
  menuOpen = false,
  showMenuButton = true,
  tagLabel = '会话',
  tagStatus,
  updatedTime,
  menuAnchorRect,
  menuRef,
  menuActions,
  onSelect,
  onTogglePin,
  onToggleMenu,
  onTouchStart,
  onTouchMove,
  onTouchEnd,
  onContextMenu,
}: SessionListItemProps) {
  const canOpenMenu = showMenuButton && !!onToggleMenu

  return (
    <div className="group/session relative">
      <button
        type="button"
        onClick={onSelect}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        onContextMenu={onContextMenu}
        className={`w-full h-7 px-1.5 pr-12 rounded-md flex items-center gap-1.5 text-left transition-colors ${
          selected ? 'bg-[var(--sidebar-hover-bg)] text-text-100' : 'text-text-200 hover:text-text-100 hover:bg-[var(--sidebar-hover-bg)]'
        }`}
        title={title}
      >
        <span className="relative h-4 w-4 shrink-0">
          <span
            className={`absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 h-1.5 w-1.5 rounded-full transition-opacity ${
              hasUnread ? 'bg-accent-main-100 opacity-100' : 'bg-transparent opacity-0'
            } group-hover/session:opacity-0 group-focus-within/session:opacity-0`}
          />
          <span
            role="button"
            tabIndex={-1}
            onMouseDown={(event) => event.preventDefault()}
            onClick={(event) => {
              event.stopPropagation()
              onTogglePin()
            }}
            className={`absolute inset-0 rounded flex items-center justify-center transition-all duration-150 ${
              pinned
                ? 'text-accent-main-100 opacity-0 group-hover/session:opacity-100 group-focus-within/session:opacity-100'
                : 'text-text-400 opacity-0 group-hover/session:opacity-100 group-focus-within/session:opacity-100 hover:text-text-100'
            }`}
            title={pinned ? '取消置顶' : '置顶会话'}
          >
            <PinIcon size={11} />
          </span>
        </span>
        <span className="min-w-0 flex-1 flex items-center gap-1.5 overflow-hidden">
          <span className={`shrink-0 rounded px-1.5 py-0.5 text-[9px] leading-none ${getStatusTagClass(tagStatus)}`}>
            {tagLabel}
          </span>
          <span className="truncate text-[12px] font-medium leading-none">{title}</span>
        </span>
      </button>

      <div className="absolute right-1 top-1/2 -translate-y-1/2 h-5 w-10 flex items-center justify-center">
        <span className={`flex items-center justify-center transition-opacity duration-150 ${menuOpen ? 'opacity-0' : 'group-hover/session:opacity-0'}`}>
          {running ? <RunningIndicator /> : <span className="text-[9px] text-text-400/90 whitespace-nowrap">{updatedTime ? formatRelativeTime(updatedTime) : ''}</span>}
        </span>
        {canOpenMenu && (
          <button
            type="button"
            onMouseDown={(event) => {
              event.preventDefault()
              event.stopPropagation()
            }}
            onTouchStart={(event) => {
              event.stopPropagation()
            }}
            onClick={(event) => {
              event.stopPropagation()
              onToggleMenu(event.currentTarget.getBoundingClientRect())
            }}
            className={`absolute inset-0 rounded-md flex items-center justify-center text-text-400 hover:text-text-100 hover:bg-[var(--sidebar-hover-bg)] transition-all duration-150 ${
              menuOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none group-hover/session:opacity-100 group-hover/session:pointer-events-auto'
            }`}
            title="会话菜单"
          >
            <MoreHorizontalIcon size={12} />
          </button>
        )}
      </div>

      {menuOpen && menuAnchorRect && (menuActions?.length ?? 0) > 0 && (
        <ActionMenu menuRef={menuRef} anchorRect={menuAnchorRect}>
          {menuActions?.map((action) => (
            <ActionMenuItem
              key={action.label}
              label={action.label}
              icon={action.icon}
              danger={action.danger}
              onClick={action.onClick}
            />
          ))}
        </ActionMenu>
      )}
    </div>
  )
}
