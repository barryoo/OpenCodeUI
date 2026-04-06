import type { NotificationData } from './useNotification'

export type NotificationEventType = 'permission' | 'question' | 'completed' | 'error'

export interface NotificationPolicyInput {
  type: NotificationEventType
  sessionId: string
  sessionTitle?: string
  directory?: string
  body: string
  isCurrentSessionFamily: boolean
  isAppForeground: boolean
}

export interface NotificationDispatchPlan {
  title: string
  body: string
  data: NotificationData
  sendToast: boolean
  sendSystem: boolean
  dedupeKey?: string
}

const notificationLabels: Record<NotificationEventType, string | null> = {
  permission: 'Permission Required',
  question: 'Question',
  completed: 'Session completed',
  error: 'Session error',
}

function getSessionLabel(sessionId: string, sessionTitle?: string) {
  if (sessionTitle) return sessionTitle
  return `Session ${sessionId.slice(0, 6)}`
}

export function buildNotificationPlan(input: NotificationPolicyInput): NotificationDispatchPlan {
  const sessionLabel = getSessionLabel(input.sessionId, input.sessionTitle)
  const suffix = notificationLabels[input.type]
  const title = suffix ? `${sessionLabel} - ${suffix}` : sessionLabel
  const sendSystem = !input.isCurrentSessionFamily || !input.isAppForeground

  return {
    title,
    body: input.body,
    data: {
      sessionId: input.sessionId,
      directory: input.directory,
    },
    sendToast: !input.isCurrentSessionFamily,
    sendSystem,
    dedupeKey: input.type === 'completed' ? `${input.type}:${input.sessionId}` : undefined,
  }
}
