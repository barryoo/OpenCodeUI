export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase()
}

export function validatePassword(password: string): { ok: true } | { ok: false; message: string } {
  const hasLetter = /[A-Za-z]/.test(password)
  const hasNumber = /\d/.test(password)
  if (password.length < 8 || !hasLetter || !hasNumber) {
    return { ok: false, message: '密码至少 8 位且包含字母和数字' }
  }
  return { ok: true }
}

export function deriveAuthDescriptor(user: { githubId: string | null; passwordHash: string | null }) {
  if (user.githubId && user.passwordHash) {
    return { provider: 'github+password', mode: 'password' }
  }
  if (user.githubId) {
    return { provider: 'github', mode: 'oauth' }
  }
  return { provider: 'password', mode: 'password' }
}
