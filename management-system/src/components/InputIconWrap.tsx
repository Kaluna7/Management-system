import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'

type Props = {
  icon: LucideIcon
  children: ReactNode
  className?: string
  iconClassName?: string
}

/** Positions a Lucide icon inside text inputs and selects. */
export function InputIconWrap({
  icon: Icon,
  children,
  className = '',
  iconClassName = 'h-4 w-4',
}: Props) {
  return (
    <div className={`relative ${className}`}>
      <Icon
        className={`pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 ${iconClassName}`}
        aria-hidden
      />
      {children}
    </div>
  )
}
