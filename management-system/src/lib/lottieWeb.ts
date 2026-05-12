export type LottieJson = Record<string, unknown>

export type LottiePlayer = {
  destroy: () => void
  addEventListener?: (name: string, fn: () => void) => void
}

export type LottieLoadOpts = {
  container: Element
  renderer: 'svg'
  loop: boolean
  autoplay: boolean
  animationData: LottieJson
  /** Passed to lottie SVG renderer (e.g. preserveAspectRatio — avoids clipped scaling). */
  rendererSettings?: Record<string, unknown>
}

/** Load lottie-web from esm.sh (no local npm package). */
export function loadLottieWeb(): Promise<{
  loadAnimation: (opts: LottieLoadOpts) => LottiePlayer
}> {
  type Mod = {
    default: {
      loadAnimation: (opts: LottieLoadOpts) => LottiePlayer
    }
  }
  return (
    import(/* @vite-ignore */ 'https://esm.sh/lottie-web@5.12.2') as Promise<Mod>
  ).then((m) => m.default)
}
