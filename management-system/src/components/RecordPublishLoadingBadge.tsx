import loadingJson from '../assets/animation_icons/loading.json'
import { LottieAnimation } from './LottieAnimation'
import type { LottieJson } from '../lib/lottieWeb'

type Props = {
  active: boolean
  className?: string
}

const animation = loadingJson as LottieJson

/** Small looping loader on record cards until published (status history). */
export function RecordPublishLoadingBadge({ active, className = '' }: Props) {
  if (!active) return null

  return (
    <div
      className={`pointer-events-none absolute bottom-3 left-3 z-[4] flex h-11 w-11 items-center justify-center ${className}`}
      aria-hidden
    >
      <LottieAnimation animation={animation} loop className="h-full w-full [&_svg]:h-full [&_svg]:w-full" />
    </div>
  )
}
