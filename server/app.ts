import type { ServerConfig } from './config'
import type { DatabaseContext } from './db'
import type { CreateItemInput, CreateServerProfileInput, ItemType, UpdateItemInput, UpdateServerProfileInput, UpsertSessionSummaryInput, WorkflowStatus } from './domain'
import {
  consumeGithubState,
  createAuthSessionForUser,
  createGithubState,
  deleteAuthSession,
  exchangeGithubCodeForUser,
  getAuthSession,
} from './auth'
import { ThinServerRepository } from './repositories'

export interface AppContext {
  database: DatabaseContext
  repository: ThinServerRepository
  config: ServerConfig
}

interface ErrorBody {
  error: {
    code: string
    message: string
  }
}

const ITEM_TYPES: readonly ItemType[] = ['requirement', 'bug', 'research', 'code_review']
const WORKFLOW_STATUSES: readonly WorkflowStatus[] = ['not_started', 'in_progress', 'completed', 'abandoned']

function json(data: unknown, init?: ResponseInit): Response {
  const headerEntries: Array<[string, string]> = [['content-type', 'application/json; charset=utf-8']]
  const initHeaders = init?.headers

  if (Array.isArray(initHeaders)) {
    headerEntries.push(...initHeaders)
  } else if (initHeaders instanceof Headers) {
    initHeaders.forEach((value, key) => {
      headerEntries.push([key, value])
    })
  } else if (initHeaders && typeof initHeaders === 'object') {
    for (const [key, value] of Object.entries(initHeaders)) {
      if (typeof value === 'string') headerEntries.push([key, value])
    }
  }

  return new Response(JSON.stringify(data), {
    ...init,
    headers: headerEntries,
  })
}

function errorResponse(status: number, code: string, message: string): Response {
  const body: ErrorBody = { error: { code, message } }
  return json(body, { status })
}

async function parseJsonBody<T>(request: Request): Promise<T | null> {
  try {
    return (await request.json()) as T
  } catch {
    return null
  }
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined
}

function asNullableString(value: unknown): string | null | undefined {
  if (value === null) return null
  return typeof value === 'string' ? value : undefined
}

function asBoolean(value: unknown): boolean | undefined {
  return typeof value === 'boolean' ? value : undefined
}

function asItemType(value: unknown): ItemType | undefined {
  if (typeof value !== 'string') return undefined
  return ITEM_TYPES.includes(value as ItemType) ? (value as ItemType) : undefined
}

function asWorkflowStatus(value: unknown): WorkflowStatus | undefined {
  if (typeof value !== 'string') return undefined
  return WORKFLOW_STATUSES.includes(value as WorkflowStatus) ? (value as WorkflowStatus) : undefined
}

function getEffectiveUser(request: Request, context: AppContext) {
  const session = getAuthSession(request, context.repository, context.config)
  if (!session) return null
  return context.repository.findUserById(session.userId)
}

function notFound(): Response {
  return errorResponse(404, 'NOT_FOUND', 'Route not found')
}

function withCors(response: Response, request?: Request): Response {
  const headers = new Headers(response.headers)
  const origin = request?.headers.get('origin')
  headers.set('access-control-allow-origin', origin || '*')
  headers.set('access-control-allow-methods', 'GET,POST,PATCH,DELETE,OPTIONS')
  headers.set('access-control-allow-headers', 'content-type,authorization')
  headers.set('access-control-allow-credentials', 'true')
  headers.set('vary', 'origin')

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  })
}

function getRequestOrigin(request: Request): string {
  const forwardedProto = request.headers.get('x-forwarded-proto')
  const forwardedHost = request.headers.get('x-forwarded-host')
  const host = forwardedHost || request.headers.get('host')
  const url = new URL(request.url)
  const protocol = forwardedProto || url.protocol.replace(/:$/, '')
  return host ? `${protocol}://${host}` : url.origin
}

function getPublicBaseUrl(request: Request, configuredBaseUrl?: string): string {
  return configuredBaseUrl || getRequestOrigin(request)
}

function getFrontendBaseUrl(request: Request, configuredBaseUrl?: string): string {
  return configuredBaseUrl || getRequestOrigin(request)
}

export async function handleRequest(request: Request, context: AppContext): Promise<Response> {
  const url = new URL(request.url)
  const pathname = url.pathname
  const method = request.method

  if (method === 'OPTIONS') {
    return withCors(new Response(null, { status: 204 }), request)
  }

  if (pathname === '/health' && method === 'GET') {
    return withCors(json({ ok: true, database: 'connected' }), request)
  }

  if (pathname === '/api/meta' && method === 'GET') {
    const migrationCount = context.database.db.query('SELECT COUNT(*) AS count FROM schema_migrations').get() as { count: number }
    return withCors(json({
      service: 'opencodeui-thin-server',
      migrationCount: migrationCount.count,
      repositoryReady: true,
    }), request)
  }

  if (pathname === '/api/auth/github/login' && method === 'GET') {
    if (context.config.githubClientId && context.config.githubClientSecret) {
      const state = createGithubState(context.repository, context.config)
      const redirectUri = `${getPublicBaseUrl(request, context.config.publicBaseUrl)}/api/auth/github/callback`
      const authorizeUrl = new URL('https://github.com/login/oauth/authorize')
      authorizeUrl.searchParams.set('client_id', context.config.githubClientId)
      authorizeUrl.searchParams.set('redirect_uri', redirectUri)
      authorizeUrl.searchParams.set('scope', 'read:user user:email')
      authorizeUrl.searchParams.set('state', state)
      return withCors(json({ ok: true, provider: 'github', mode: 'oauth', authorizeUrl: authorizeUrl.toString() }), request)
    }

    return withCors(errorResponse(503, 'OAUTH_NOT_CONFIGURED', 'GitHub OAuth is not configured'), request)
  }

  if (pathname === '/api/auth/github/callback' && method === 'GET') {
    const code = url.searchParams.get('code')
    const state = url.searchParams.get('state')
    if (!code || !state || !consumeGithubState(context.repository, state)) {
      return withCors(errorResponse(400, 'AUTH_ERROR', 'Invalid OAuth callback'), request)
    }

    const githubUser = await exchangeGithubCodeForUser(code, context.config)
    if (!githubUser) {
      return withCors(errorResponse(400, 'AUTH_ERROR', 'Failed to exchange GitHub code'), request)
    }

    const user = context.repository.upsertUserByGithubProfile(githubUser)
    const headers = new Headers({ location: getFrontendBaseUrl(request, context.config.frontendBaseUrl) })
    createAuthSessionForUser(headers, context.repository, context.config, user)
    return withCors(new Response(null, { status: 302, headers }), request)
  }

  if (pathname === '/api/auth/me' && method === 'GET') {
    const user = getEffectiveUser(request, context)
    if (!user) return withCors(json({ user: null, auth: null }), request)
    return withCors(json({ user, auth: { provider: 'github', mode: 'oauth' } }), request)
  }

  if (pathname === '/api/auth/logout' && method === 'POST') {
    const headers = new Headers()
    deleteAuthSession(request, context.repository, headers, context.config)
    return withCors(json({ ok: true }, { headers }), request)
  }

  const user = getEffectiveUser(request, context)
  if (!user) {
    return withCors(errorResponse(401, 'UNAUTHORIZED', 'Please login first'), request)
  }

  if (pathname === '/api/server-profiles' && method === 'GET') {
    return withCors(json({ data: context.repository.listServerProfiles(user.id) }), request)
  }

  if (pathname === '/api/server-profiles' && method === 'POST') {
    const body = await parseJsonBody<Record<string, unknown>>(request)
    if (!body) return withCors(errorResponse(400, 'INVALID_JSON', 'Request body must be valid JSON'), request)

    const name = asString(body.name)
    const baseUrl = asString(body.baseUrl)
    if (!name || !baseUrl) {
      return withCors(errorResponse(400, 'VALIDATION_ERROR', 'name and baseUrl are required'), request)
    }

    const input: CreateServerProfileInput = {
      userId: user.id,
      name,
      baseUrl,
      authType: asString(body.authType),
      authSecretEncrypted: asNullableString(body.authSecretEncrypted),
      isDefault: asBoolean(body.isDefault),
    }
    return withCors(json({ data: context.repository.createServerProfile(input) }, { status: 201 }), request)
  }

  const serverProfileMatch = pathname.match(/^\/api\/server-profiles\/([^/]+)$/)
  if (serverProfileMatch && method === 'PATCH') {
    const body = await parseJsonBody<Record<string, unknown>>(request)
    if (!body) return withCors(errorResponse(400, 'INVALID_JSON', 'Request body must be valid JSON'), request)

    const input: UpdateServerProfileInput = {
      name: asString(body.name),
      baseUrl: asString(body.baseUrl),
      authType: asString(body.authType),
      authSecretEncrypted: asNullableString(body.authSecretEncrypted),
      isDefault: asBoolean(body.isDefault),
    }
    const updated = context.repository.updateServerProfile(serverProfileMatch[1], user.id, input)
    if (!updated) return withCors(errorResponse(404, 'NOT_FOUND', 'Server profile not found'), request)
    return withCors(json({ data: updated }), request)
  }

  if (serverProfileMatch && method === 'DELETE') {
    const deleted = context.repository.deleteServerProfile(serverProfileMatch[1], user.id)
    if (!deleted) return withCors(errorResponse(404, 'NOT_FOUND', 'Server profile not found'), request)
    return withCors(json({ ok: true }), request)
  }

  const serverProfileDefaultMatch = pathname.match(/^\/api\/server-profiles\/([^/]+)\/default$/)
  if (serverProfileDefaultMatch && method === 'POST') {
    const updated = context.repository.setDefaultServerProfile(serverProfileDefaultMatch[1], user.id)
    if (!updated) return withCors(errorResponse(404, 'NOT_FOUND', 'Server profile not found'), request)
    return withCors(json({ data: updated }), request)
  }

  if (pathname === '/api/items' && method === 'GET') {
    const projectId = url.searchParams.get('projectId')
    const data = projectId ? context.repository.listItems(user.id, projectId) : context.repository.listItemsByUser(user.id)
    return withCors(json({ data }), request)
  }

  if (pathname === '/api/items' && method === 'POST') {
    const body = await parseJsonBody<Record<string, unknown>>(request)
    if (!body) return withCors(errorResponse(400, 'INVALID_JSON', 'Request body must be valid JSON'), request)

    const serverProfileId = asString(body.serverProfileId)
    const projectId = asString(body.projectId)
    const title = asString(body.title)
    const type = asItemType(body.type)
    if (!serverProfileId || !projectId || !title || !type) {
      return withCors(errorResponse(400, 'VALIDATION_ERROR', 'serverProfileId, projectId, title, type are required'), request)
    }

    const input: CreateItemInput = {
      userId: user.id,
      serverProfileId,
      projectId,
      title,
      type,
      description: asString(body.description),
    }
    return withCors(json({ data: context.repository.createItem(input) }, { status: 201 }), request)
  }

  const itemMatch = pathname.match(/^\/api\/items\/([^/]+)$/)
  if (itemMatch && method === 'GET') {
    const item = context.repository.getItem(itemMatch[1], user.id)
    if (!item) return withCors(errorResponse(404, 'NOT_FOUND', 'Item not found'), request)
    return withCors(json({ data: item }), request)
  }

  if (itemMatch && method === 'PATCH') {
    const body = await parseJsonBody<Record<string, unknown>>(request)
    if (!body) return withCors(errorResponse(400, 'INVALID_JSON', 'Request body must be valid JSON'), request)

    const input: UpdateItemInput = {
      title: asString(body.title),
      type: asItemType(body.type),
      description: asString(body.description),
      status: asWorkflowStatus(body.status),
      activityAt: asString(body.activityAt),
    }
    const updated = context.repository.updateItem(itemMatch[1], user.id, input)
    if (!updated) return withCors(errorResponse(404, 'NOT_FOUND', 'Item not found'), request)
    return withCors(json({ data: updated }), request)
  }

  if (itemMatch && method === 'DELETE') {
    const deleted = context.repository.deleteItem(itemMatch[1], user.id)
    if (!deleted) return withCors(errorResponse(404, 'NOT_FOUND', 'Item not found'), request)
    return withCors(json({ ok: true }), request)
  }

  const itemSessionsMatch = pathname.match(/^\/api\/items\/([^/]+)\/session-summaries$/)
  if (itemSessionsMatch && method === 'GET') {
    return withCors(json({ data: context.repository.listItemSessionSummaries(user.id, itemSessionsMatch[1]) }), request)
  }

  if (pathname === '/api/session-summaries' && method === 'GET') {
    const projectId = url.searchParams.get('projectId')
    const data = projectId ? context.repository.listSessionSummaries(user.id, projectId) : context.repository.listSessionSummariesByUser(user.id)
    return withCors(json({ data }), request)
  }

  if (pathname === '/api/session-summaries' && method === 'POST') {
    const body = await parseJsonBody<Record<string, unknown>>(request)
    if (!body) return withCors(errorResponse(400, 'INVALID_JSON', 'Request body must be valid JSON'), request)

    const serverProfileId = asString(body.serverProfileId)
    const projectId = asString(body.projectId)
    const externalSessionId = asString(body.externalSessionId)
    const titleSnapshot = asString(body.titleSnapshot)
    const statusSnapshot = asWorkflowStatus(body.statusSnapshot)
    const activityAt = asString(body.activityAt)
    if (!serverProfileId || !projectId || !externalSessionId || !titleSnapshot || !statusSnapshot || !activityAt) {
      return withCors(errorResponse(400, 'VALIDATION_ERROR', 'serverProfileId, projectId, externalSessionId, titleSnapshot, statusSnapshot, activityAt are required'), request)
    }

    const input: UpsertSessionSummaryInput = {
      userId: user.id,
      serverProfileId,
      projectId,
      externalSessionId,
      titleSnapshot,
      statusSnapshot,
      activityAt,
      itemId: asNullableString(body.itemId),
      lastMessageAt: asNullableString(body.lastMessageAt),
    }
    return withCors(json({ data: context.repository.upsertSessionSummary(input) }, { status: 201 }), request)
  }

  const sessionMatch = pathname.match(/^\/api\/session-summaries\/([^/]+)$/)
  if (sessionMatch && method === 'GET') {
    const summary = context.repository.getSessionSummary(sessionMatch[1], user.id)
    if (!summary) return withCors(errorResponse(404, 'NOT_FOUND', 'Session summary not found'), request)
    return withCors(json({ data: summary }), request)
  }

  if (sessionMatch && method === 'PATCH') {
    const body = await parseJsonBody<Record<string, unknown>>(request)
    if (!body) return withCors(errorResponse(400, 'INVALID_JSON', 'Request body must be valid JSON'), request)
    const status = asWorkflowStatus(body.status)
    if (!status) return withCors(errorResponse(400, 'VALIDATION_ERROR', 'status is required'), request)

    const updated = context.repository.updateSessionSummaryStatus(sessionMatch[1], user.id, status)
    if (!updated) return withCors(errorResponse(404, 'NOT_FOUND', 'Session summary not found'), request)
    return withCors(json({ data: updated }), request)
  }

  const bindMatch = pathname.match(/^\/api\/session-summaries\/([^/]+)\/bind-item$/)
  if (bindMatch && method === 'POST') {
    const body = await parseJsonBody<Record<string, unknown>>(request)
    if (!body) return withCors(errorResponse(400, 'INVALID_JSON', 'Request body must be valid JSON'), request)
    const itemId = asString(body.itemId)
    if (!itemId) return withCors(errorResponse(400, 'VALIDATION_ERROR', 'itemId is required'), request)

    const updated = context.repository.bindSessionSummaryToItem(bindMatch[1], user.id, itemId)
    if (!updated) return withCors(errorResponse(404, 'NOT_FOUND', 'Session summary not found'), request)
    return withCors(json({ data: updated }), request)
  }

  const unbindMatch = pathname.match(/^\/api\/session-summaries\/([^/]+)\/unbind-item$/)
  if (unbindMatch && method === 'POST') {
    const updated = context.repository.bindSessionSummaryToItem(unbindMatch[1], user.id, null)
    if (!updated) return withCors(errorResponse(404, 'NOT_FOUND', 'Session summary not found'), request)
    return withCors(json({ data: updated }), request)
  }

  const projectItemsMatch = pathname.match(/^\/api\/projects\/([^/]+)\/items$/)
  if (projectItemsMatch && method === 'GET') {
    return withCors(json({ data: context.repository.listItems(user.id, projectItemsMatch[1]) }), request)
  }

  const projectSessionsMatch = pathname.match(/^\/api\/projects\/([^/]+)\/session-summaries$/)
  if (projectSessionsMatch && method === 'GET') {
    return withCors(json({ data: context.repository.listSessionSummaries(user.id, projectSessionsMatch[1]) }), request)
  }

  const projectSearchMatch = pathname.match(/^\/api\/projects\/([^/]+)\/files\/search$/)
  if (projectSearchMatch && method === 'GET') {
    const q = url.searchParams.get('q')?.trim() ?? ''
    if (!q) return withCors(errorResponse(400, 'VALIDATION_ERROR', 'q is required'), request)
    return withCors(json({ data: context.repository.searchProjectFiles(user.id, projectSearchMatch[1], q) }), request)
  }

  return withCors(notFound(), request)
}
