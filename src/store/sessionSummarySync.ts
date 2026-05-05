import type { ApiSession } from '../api'
import type { ThinSessionSummary, ThinWorkflowStatus } from '../api/thinServer'

export interface SummaryUpsertInput {
  projectPath: string
  externalSessionId: string
  itemId?: string | null
  variant: string | null
  titleSnapshot: string
  statusSnapshot: ThinWorkflowStatus
  activityAt: string
}

export function buildSummaryUpsertInputs(input: {
  projectPath: string
  sessions: ApiSession[]
  existing: ThinSessionSummary[]
}): SummaryUpsertInput[] {
  const existingByExternalId = new Map(input.existing.map((summary) => [summary.externalSessionId, summary]))

  return input.sessions.flatMap((session) => {
    const existing = existingByExternalId.get(session.id)
    const activityAt = new Date(session.time.updated ?? session.time.created).toISOString()
    const titleSnapshot = session.title || 'Untitled Chat'
    const statusSnapshot: ThinWorkflowStatus = existing?.statusSnapshot ?? 'in_progress'

    if (
      existing
      && existing.titleSnapshot === titleSnapshot
      && existing.activityAt === activityAt
    ) {
      return []
    }

    return [{
      projectPath: input.projectPath,
      externalSessionId: session.id,
      ...(existing?.itemId !== undefined ? { itemId: existing.itemId } : {}),
      variant: existing?.variant ?? null,
      titleSnapshot,
      statusSnapshot,
      activityAt,
    }]
  })
}
