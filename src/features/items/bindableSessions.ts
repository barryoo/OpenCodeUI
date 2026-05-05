import type { ApiSession } from '../../api'
import type { ThinSessionSummary } from '../../api/thinServer'

export interface BindableSessionsResult {
  bindableSessions: ApiSession[]
  reusableSummaryByExternalId: Map<string, ThinSessionSummary>
}

export function getBindableSessions(
  sessions: ApiSession[],
  projectSummaries: ThinSessionSummary[],
  currentItemId: string,
): BindableSessionsResult {
  // projectSummaries is assumed deduplicated by externalSessionId
  const summaryByExternalId = new Map(
    projectSummaries.map(s => [s.externalSessionId, s]),
  )

  const bindableSessions: ApiSession[] = []
  const reusableSummaryByExternalId = new Map<string, ThinSessionSummary>()

  for (const session of sessions) {
    const summary = summaryByExternalId.get(session.id)

    if (!summary) {
      bindableSessions.push(session)
      continue
    }

    if (summary.itemId === currentItemId) {
      continue
    }

    if (summary.itemId !== null) {
      continue
    }

    bindableSessions.push(session)
    reusableSummaryByExternalId.set(session.id, summary)
  }

  return { bindableSessions, reusableSummaryByExternalId }
}
