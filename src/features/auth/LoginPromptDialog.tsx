import { useEffect, useMemo, useState } from 'react'
import { Dialog } from '../../components/ui/Dialog'
import { Button } from '../../components/ui/Button'

interface LoginPromptDialogProps {
  isOpen: boolean
  isLoading?: boolean
  error?: string | null
  onGithubLogin: () => void
  onEmailLogin: (email: string, password: string) => void | Promise<void>
  onEmailRegister: (email: string, password: string) => void | Promise<void>
  onContinueWithoutLogin: () => void
}

type AuthMode = 'login' | 'register'

export function LoginPromptDialog({
  isOpen,
  isLoading = false,
  error,
  onGithubLogin,
  onEmailLogin,
  onEmailRegister,
  onContinueWithoutLogin,
}: LoginPromptDialogProps) {
  const [mode, setMode] = useState<AuthMode>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [localError, setLocalError] = useState<string | null>(null)

  useEffect(() => {
    if (!isOpen) return
    setLocalError(null)
  }, [isOpen, mode])

  const currentError = localError || error
  const title = mode === 'login' ? '邮箱登录' : '创建账号'
  const submitLabel = mode === 'login' ? '使用邮箱登录' : '注册并登录'
  const switchLabel = mode === 'login' ? '还没有账号？去注册' : '已有账号？去登录'

  const helperText = useMemo(() => {
    if (mode === 'login') {
      return '登录后可同步 server 配置、事项与会话摘要，也可继续使用 GitHub 登录。'
    }
    return '注册后会自动登录；如果你已有账号，也可以直接切回登录。'
  }, [mode])

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (isLoading) return

    const trimmedEmail = email.trim()
    if (!trimmedEmail) {
      setLocalError('请输入邮箱地址')
      return
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
      setLocalError('请输入有效的邮箱地址')
      return
    }

    if (!password) {
      setLocalError('请输入密码')
      return
    }

    if (mode === 'register' && (password.length < 8 || !/[A-Za-z]/.test(password) || !/\d/.test(password))) {
      setLocalError('密码至少 8 位且包含字母和数字')
      return
    }

    setLocalError(null)
    if (mode === 'login') {
      await onEmailLogin(trimmedEmail, password)
      return
    }
    await onEmailRegister(trimmedEmail, password)
  }

  return (
    <Dialog isOpen={isOpen} onClose={() => undefined} title="选择使用方式" width={460} showCloseButton={false}>
      <div className="space-y-4">
        <p className="text-sm text-text-300 leading-6">
          你可以直接连接默认的 OpenCode server 开始使用，也可以登录账号以启用 server 配置同步、事项和会话摘要等增强能力。
        </p>

        <div className="inline-flex rounded-lg border border-border-200/70 bg-bg-100/60 p-1">
          <button
            type="button"
            onClick={() => setMode('login')}
            className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${mode === 'login' ? 'bg-bg-000 text-text-100 shadow-sm' : 'text-text-400 hover:text-text-200'}`}
          >
            登录
          </button>
          <button
            type="button"
            onClick={() => setMode('register')}
            className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${mode === 'register' ? 'bg-bg-000 text-text-100 shadow-sm' : 'text-text-400 hover:text-text-200'}`}
          >
            注册
          </button>
        </div>

        <form className="space-y-3" onSubmit={handleSubmit}>
          <div>
            <div className="mb-1 text-[11px] font-medium text-text-300">邮箱</div>
            <input
              type="email"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value)
                setLocalError(null)
              }}
              autoComplete={mode === 'login' ? 'email' : 'username'}
              placeholder="name@example.com"
              className="w-full h-9 rounded-md border border-border-200 bg-bg-000 px-3 text-sm text-text-100 placeholder:text-text-400 focus:outline-none focus:border-accent-main-100/50"
            />
          </div>

          <div>
            <div className="mb-1 text-[11px] font-medium text-text-300">密码</div>
            <input
              type="password"
              value={password}
              onChange={(e) => {
                setPassword(e.target.value)
                setLocalError(null)
              }}
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              placeholder={mode === 'login' ? '输入密码' : '至少 8 位且包含字母和数字'}
              className="w-full h-9 rounded-md border border-border-200 bg-bg-000 px-3 text-sm text-text-100 placeholder:text-text-400 focus:outline-none focus:border-accent-main-100/50"
            />
          </div>

          <div className="rounded-lg border border-border-200/60 bg-bg-050/70 px-3 py-2 text-xs leading-5 text-text-400">
            <div className="font-medium text-text-200">{title}</div>
            <div className="mt-0.5">{helperText}</div>
          </div>

          {currentError && (
            <div className="rounded-md border border-danger-100/20 bg-danger-bg px-3 py-2 text-xs text-danger-100">
              {currentError}
            </div>
          )}

          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <button
              type="button"
              onClick={() => setMode(mode === 'login' ? 'register' : 'login')}
              className="text-left text-xs text-accent-main-100 transition-colors hover:text-accent-main-200"
            >
              {switchLabel}
            </button>
            <Button type="submit" isLoading={isLoading} className="sm:min-w-[120px]">
              {submitLabel}
            </Button>
          </div>
        </form>

        <div className="relative py-1">
          <div className="absolute inset-x-0 top-1/2 border-t border-border-100/70" />
          <div className="relative mx-auto w-fit bg-bg-000 px-3 text-[11px] text-text-400">或使用其他方式</div>
        </div>

        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="secondary" onClick={onContinueWithoutLogin}>
            暂不登录，直接使用
          </Button>
          <Button variant="secondary" onClick={onGithubLogin} isLoading={isLoading}>
            使用 GitHub 登录
          </Button>
        </div>
      </div>
    </Dialog>
  )
}
