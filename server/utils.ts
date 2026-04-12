export function nowIsoString(): string {
  return new Date().toISOString()
}

export function createId(prefix: string): string {
  const randomPart = Math.random().toString(36).slice(2, 10)
  return `${prefix}_${Date.now().toString(36)}_${randomPart}`
}

export function normalizeWorkflowStatus(status: string | null | undefined): 'not_started' | 'in_progress' | 'completed' | 'abandoned' {
  if (status === 'in_progress' || status === 'completed' || status === 'abandoned') {
    return status
  }
  return 'not_started'
}

export function isOlderThanDays(isoString: string, days: number): boolean {
  const timestamp = Date.parse(isoString)
  if (Number.isNaN(timestamp)) return false
  return Date.now() - timestamp > days * 24 * 60 * 60 * 1000
}
