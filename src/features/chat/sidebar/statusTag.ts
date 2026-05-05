import type { ThinWorkflowStatus } from '../../../api/thinServer'

const STATUS_TAG_BASE_CLASS = 'shrink-0 rounded px-1.5 py-0.5 text-[9px] leading-none'
const STATUS_TAG_FALLBACK_CLASS = 'bg-bg-200 text-text-400'

const STATUS_TAG_TONE_CLASS: Record<ThinWorkflowStatus, string> = {
  not_started: 'bg-[hsl(var(--status-tag-not-started-bg))] text-[hsl(var(--status-tag-not-started-text))]',
  in_progress: 'bg-[hsl(var(--status-tag-in-progress-bg))] text-[hsl(var(--status-tag-in-progress-text))]',
  completed: 'bg-[hsl(var(--status-tag-completed-bg))] text-[hsl(var(--status-tag-completed-text))]',
  abandoned: 'bg-[hsl(var(--status-tag-abandoned-bg))] text-[hsl(var(--status-tag-abandoned-text))]',
}

export function getStatusTagClass(status?: ThinWorkflowStatus): string {
  return `${STATUS_TAG_BASE_CLASS} ${status ? STATUS_TAG_TONE_CLASS[status] ?? STATUS_TAG_FALLBACK_CLASS : STATUS_TAG_FALLBACK_CLASS}`
}
