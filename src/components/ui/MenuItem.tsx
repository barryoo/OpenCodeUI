import { CheckIcon } from '../Icons'

interface MenuItemProps {
  label: string
  description?: string
  icon?: React.ReactNode
  disabled?: boolean
  selected?: boolean
  onClick?: () => void
  variant?: 'default' | 'danger'
}

export function MenuItem({
  label,
  description,
  icon,
  disabled = false,
  selected = false,
  onClick,
  variant = 'default',
}: MenuItemProps) {
  return (
    <div
      onClick={disabled ? undefined : onClick}
      className={`
        px-2 py-2 rounded-lg flex items-start gap-2
        transition-all duration-150 select-none
        ${disabled
          ? 'text-text-500 cursor-not-allowed'
          : `cursor-pointer active:scale-[0.98] ${variant === 'danger' ? 'hover:bg-danger-bg hover:text-danger-100' : 'hover:bg-bg-200'}`
        }
        ${selected && !disabled ? 'text-text-100' : ''}
      `}
    >
      {icon && (
        <span className={`w-4 h-4 flex items-center justify-center flex-shrink-0 mt-0.5 ${variant === 'danger' ? 'text-danger-100' : 'text-text-400'}`}>
          {icon}
        </span>
      )}
      <div className="flex-1 min-w-0">
        <div className={`text-sm ${disabled ? 'text-text-500' : selected ? 'text-text-100' : variant === 'danger' ? 'text-danger-100' : 'text-text-200'}`}>
          {label}
        </div>
        {description && (
          <div className="text-xs text-text-500 mt-0.5">
            {description}
          </div>
        )}
      </div>
      {selected && !disabled && (
        <span className="text-accent-secondary-100 flex-shrink-0 mt-0.5">
          <CheckIcon />
        </span>
      )}
    </div>
  )
}

