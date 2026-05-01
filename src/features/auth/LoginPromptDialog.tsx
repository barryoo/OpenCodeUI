import { Dialog } from '../../components/ui/Dialog'
import { Button } from '../../components/ui/Button'

interface LoginPromptDialogProps {
  isOpen: boolean
  isLoading?: boolean
  onContinueWithoutLogin: () => void
  onLogin: () => void
}

export function LoginPromptDialog({ isOpen, isLoading = false, onContinueWithoutLogin, onLogin }: LoginPromptDialogProps) {
  return (
    <Dialog isOpen={isOpen} onClose={() => {}} title="登录 OpenCodeUI" width={420} showCloseButton={false}>
      <div className="space-y-4">
        <p className="text-sm text-text-300 leading-6">
          当前还没有登录。请先使用 GitHub 登录，才能同步 server 配置、事项和会话摘要。
        </p>
        <div className="flex justify-end gap-2">
          <Button onClick={onContinueWithoutLogin} variant="secondary">
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
