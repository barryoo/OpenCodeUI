export interface ServerConfig {
  host: string
  port: number
  databasePath: string
  publicBaseUrl: string
  frontendBaseUrl: string
  sessionCookieName: string
  sessionTtlSeconds: number
  oauthStateTtlSeconds: number
  secureCookies: boolean
  githubClientId?: string
  githubClientSecret?: string
}

function parsePort(value: string | undefined, fallback: number): number {
  if (!value) return fallback
  const parsed = Number.parseInt(value, 10)
  return Number.isFinite(parsed) ? parsed : fallback
}

export function getServerConfig(): ServerConfig {
  const host = process.env.OPENCODEUI_SERVER_HOST || '127.0.0.1'
  const port = parsePort(process.env.OPENCODEUI_SERVER_PORT, 4097)
  const publicBaseUrl = process.env.OPENCODEUI_SERVER_PUBLIC_URL || `http://${host}:${port}`

  return {
    host,
    port,
    databasePath: process.env.OPENCODEUI_SERVER_DB || './data/opencodeui.sqlite',
    publicBaseUrl,
    frontendBaseUrl: process.env.OPENCODEUI_FRONTEND_URL || process.env.VITE_APP_URL || 'http://127.0.0.1:5173',
    sessionCookieName: process.env.OPENCODEUI_SESSION_COOKIE_NAME || 'opencodeui_session',
    sessionTtlSeconds: parsePort(process.env.OPENCODEUI_SESSION_TTL_SECONDS, 60 * 60 * 24 * 30),
    oauthStateTtlSeconds: parsePort(process.env.OPENCODEUI_OAUTH_STATE_TTL_SECONDS, 60 * 10),
    secureCookies: process.env.OPENCODEUI_SECURE_COOKIES === 'true' || publicBaseUrl.startsWith('https://'),
    githubClientId: process.env.GITHUB_CLIENT_ID,
    githubClientSecret: process.env.GITHUB_CLIENT_SECRET,
  }
}
