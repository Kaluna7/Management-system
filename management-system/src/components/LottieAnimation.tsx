import { useEffect, useRef } from 'react'
import { loadLottieWeb, type LottieJson, type LottiePlayer } from '../lib/lottieWeb'

type Props = {
  animation: LottieJson | null
  loop?: boolean
  className?: string
}

export function LottieAnimation({ animation, loop = true, className }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!animation || !containerRef.current) return
    let player: LottiePlayer | undefined
    let alive = true
    const el = containerRef.current

    void loadLottieWeb().then((lottie) => {
      if (!alive || !containerRef.current) return
      player = lottie.loadAnimation({
        container: containerRef.current,
        renderer: 'svg',
        loop,
        autoplay: true,
        animationData: animation,
        rendererSettings: { preserveAspectRatio: 'xMidYMid meet' },
      })
    })

    return () => {
      alive = false
      player?.destroy()
      el.replaceChildren()
    }
  }, [animation, loop])

  return <div ref={containerRef} className={className} aria-hidden />
}
