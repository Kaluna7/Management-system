/// <reference types="vite/client" />

/** lottie-web loaded at runtime from esm.sh (see Login.tsx). */
declare module 'https://esm.sh/lottie-web@5.12.2' {
  const lottie: {
    loadAnimation: (opts: {
      container: Element
      renderer: 'svg' | 'canvas' | 'html'
      loop?: boolean
      autoplay?: boolean
      animationData: Record<string, unknown>
    }) => { destroy: () => void }
  }
  export default lottie
}
