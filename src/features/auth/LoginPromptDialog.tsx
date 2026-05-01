import { Dialog } from '../../components/ui/Dialog'
import { Button } from '../../components/ui/Button'

interface LoginPromptDialogProps {
  isOpen: boolean
  isLoading?: boolean
  onContinueWithoutLogin: () => void
  onLogin: () => void
}

export function LoginPromptDialog({
  isOpen,
  isLoading = false,
  onLogin,
  onContinueWithoutLogin,
}: LoginPromptDialogProps) {
  return (
    <Dialog isOpen={isOpen} onClose={onContinueWithoutLogin} title="选择使用方式" width={460} showCloseButton={false}>
      <div className="space-y-4">
        <p className="text-sm text-text-300 leading-6">
          你可以直接连接默认的 OpenCode server 开始使用，也可以先使用 GitHub 登录，启用 server 配置同步、事项和会话摘要等增强能力。
        </p>
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onContinueWithoutLogin}>
            继续使用
          </Button>
          <Button onClick={onLogin} isLoading={isLoading}>
            使用 GitHub 登录
          </Button>
        </div>
      </div>
    </Dialog>
  )
}
