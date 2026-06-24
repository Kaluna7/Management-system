import { useEffect, useRef, useState } from 'react'
import { LottieAnimation } from './LottieAnimation'
import { ModalCloseButton } from './ModalCloseButton'
import { loadLottieWeb, type LottieJson, type LottiePlayer } from '../lib/lottieWeb'

type Props = {
  open: boolean
  title: string
  subtitle: string
  onClose: () => void
}

const AUTO_CLOSE_MS = 3200

export function RecordPublishSuccessModal({ open, title, subtitle, onClose }: Props) {
  const [successJson, setSuccessJson] = useState<LottieJson | null>(null)
  const lottieRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    let cancelled = false
    void import('../assets/animation_icons/succes.json')
      .then((mod) => {
        if (!cancelled) setSuccessJson(mod.default as LottieJson)
      })
      .catch(() => {
        if (!cancelled) setSuccessJson(null)
      })
    return () => {
      cancelled = true
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    const timer = window.setTimeout(onClose, AUTO_CLOSE_MS)
    return () => window.clearTimeout(timer)
  }, [open, onClose])

  useEffect(() => {
    if (!open || !successJson || !lottieRef.current) return
    let player: LottiePlayer | undefined
    let alive = true
    const el = lottieRef.current

    void loadLottieWeb().then((lottie) => {
      if (!alive || !lottieRef.current) return
      player = lottie.loadAnimation({
        container: lottieRef.current,
        renderer: 'svg',
        loop: false,
        autoplay: true,
        animationData: successJson,
        rendererSettings: { preserveAspectRatio: 'xMidYMid meet' },
      })
    })

    return () => {
      alive = false
      player?.destroy()
      el.replaceChildren()
    }
  }, [open, successJson])

  if (!open) return null

  return (
    <div
      className="portal-overlay fixed inset-0 z-[120] flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="record-publish-success-title"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div className="portal-modal relative w-full max-w-md p-6 text-center shadow-xl">
        <div className="absolute right-3 top-3">
          <ModalCloseButton onClick={onClose} label="Close" />
        </div>
        <p id="record-publish-success-title" className="portal-heading text-lg font-semibold">
          {title}
        </p>
        <p className="portal-muted mt-2 text-sm">{subtitle}</p>
        <div className="mx-auto mt-4 flex h-40 w-40 items-center justify-center sm:h-48 sm:w-48">
          {successJson ? (
            <div
              ref={lottieRef}
              className="flex h-full w-full items-center justify-center [&_svg]:max-h-full [&_svg]:max-w-full"
            />
          ) : (
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100 text-3xl text-emerald-600 dark:bg-emerald-950/50">
              ✓
            </div>
          )}
        </div>
        <button type="button" onClick={onClose} className="portal-btn-primary mt-4 px-6 py-2 text-sm">
          OK
        </button>
      </div>
    </div>
  )
}
