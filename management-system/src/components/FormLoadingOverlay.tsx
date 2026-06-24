import loadingJson from '../assets/animation_icons/loading.json'
import { LottieAnimation } from './LottieAnimation'
import type { LottieJson } from '../lib/lottieWeb'

const animation = loadingJson as LottieJson

type Props = {
  active: boolean
  label?: string
  className?: string
}

/** Blocks interaction and shows a loader while a form is submitting. */
export function FormLoadingOverlay({ active, label, className = '' }: Props) {
  if (!active) return null

  return (
    <div
      className={`absolute inset-0 z-20 flex flex-col items-center justify-center gap-3 rounded-[inherit] bg-white/82 backdrop-blur-[2px] dark:bg-slate-950/78 ${className}`}
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <div className="h-14 w-14 shrink-0">
        <LottieAnimation animation={animation} loop className="h-full w-full [&_svg]:h-full [&_svg]:w-full" />
      </div>
      {label ? <p className="text-sm font-medium portal-muted">{label}</p> : null}
    </div>
  )
}
