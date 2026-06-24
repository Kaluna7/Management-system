import { X } from 'lucide-react'

type Props = {
  onClick: () => void
  disabled?: boolean
  className?: string
  /** Accessible label (e.g. translated "Close") */
  label?: string
}

export function ModalCloseButton({
  onClick,
  disabled = false,
  className = '',
  label = 'Close',
}: Props) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-red-600 transition hover:bg-red-50 hover:text-red-700 disabled:cursor-not-allowed disabled:opacity-50 dark:text-red-400 dark:hover:bg-red-950/40 dark:hover:text-red-300 ${className}`}
    >
      <X className="h-5 w-5" strokeWidth={2.25} aria-hidden />
    </button>
  )
}
