import type { ApiSession } from '../api'
import { useItemWorkspaceStore } from './itemWorkspaceStore'

export function syncSessionSnapshotToItemWorkspace(session: ApiSession) {
  const timestamp = new Date(session.time.updated ?? session.time.created).toISOString()
  useItemWorkspaceStore.getState().updateLocalSessionSnapshot(session.id, {
    titleSnapshot: session.title,
    activityAt: timestamp,
    updatedAt: timestamp,
  })
}
