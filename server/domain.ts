export type ItemType = 'requirement' | 'bug' | 'research' | 'code_review'

export type WorkflowStatus = 'not_started' | 'in_progress' | 'completed' | 'abandoned'

export interface UserRecord {
  id: string
  githubId: string
  login: string
  name: string | null
  avatarUrl: string | null
  createdAt: string
  updatedAt: string
}

export interface AuthSessionRecord {
  id: string
  token: string
  userId: string
  login: string
  expiresAt: string
  createdAt: string
  updatedAt: string
}

export interface OAuthStateRecord {
  id: string
  state: string
  provider: string
  expiresAt: string
  createdAt: string
}

export interface ServerProfileRecord {
  id: string
  userId: string
  name: string
  baseUrl: string
  authType: string
  authSecretEncrypted: string | null
  isDefault: boolean
  createdAt: string
  updatedAt: string
}

export interface ItemRecord {
  id: string
  userId: string
  serverProfileId: string
  projectId: string
  title: string
  type: ItemType
  status: WorkflowStatus
  description: string
  activityAt: string
  createdAt: string
  updatedAt: string
}

export interface SessionSummaryRecord {
  id: string
  userId: string
  serverProfileId: string
  projectId: string
  externalSessionId: string
  itemId: string | null
  titleSnapshot: string
  statusSnapshot: WorkflowStatus
  lastMessageAt: string | null
  activityAt: string
  createdAt: string
  updatedAt: string
}

export interface ItemDocumentRefRecord {
  id: string
  itemId: string
  filePath: string
  displayName: string
  createdAt: string
}

export interface CreateServerProfileInput {
  userId: string
  name: string
  baseUrl: string
  authType?: string
  authSecretEncrypted?: string | null
  isDefault?: boolean
}

export interface UpdateServerProfileInput {
  name?: string
  baseUrl?: string
  authType?: string
  authSecretEncrypted?: string | null
  isDefault?: boolean
}

export interface CreateItemInput {
  userId: string
  serverProfileId: string
  projectId: string
  title: string
  type: ItemType
  description?: string
}

export interface UpdateItemInput {
  title?: string
  type?: ItemType
  description?: string
  status?: WorkflowStatus
  activityAt?: string
}

export interface UpsertSessionSummaryInput {
  userId: string
  serverProfileId: string
  projectId: string
  externalSessionId: string
  titleSnapshot: string
  statusSnapshot: WorkflowStatus
  itemId?: string | null
  lastMessageAt?: string | null
  activityAt: string
}
