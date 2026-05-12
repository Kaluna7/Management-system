/** Minimal types for https://accounts.google.com/gsi/client */

export type GoogleCredentialResponse = {
  credential?: string
}

type GoogleAccountsId = {
  initialize: (config: {
    client_id: string
    callback: (response: GoogleCredentialResponse) => void
    auto_select?: boolean
  }) => void
  renderButton: (parent: HTMLElement, options: Record<string, unknown>) => void
  cancel: () => void
}

declare global {
  interface Window {
    google?: {
      accounts: {
        id: GoogleAccountsId
      }
    }
  }
}

const GSI_SRC = 'https://accounts.google.com/gsi/client'

let gsiLoadPromise: Promise<void> | null = null

export function loadGoogleIdentityScript(): Promise<void> {
  if (typeof window === 'undefined') return Promise.resolve()
  if (window.google?.accounts?.id) return Promise.resolve()
  if (gsiLoadPromise) return gsiLoadPromise
  gsiLoadPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[src="${GSI_SRC}"]`)
    if (existing) {
      existing.addEventListener('load', () => resolve(), { once: true })
      existing.addEventListener('error', () => reject(new Error('Google script failed')), { once: true })
      return
    }
    const s = document.createElement('script')
    s.src = GSI_SRC
    s.async = true
    s.defer = true
    s.onload = () => resolve()
    s.onerror = () => reject(new Error('Google script failed'))
    document.head.appendChild(s)
  })
  return gsiLoadPromise
}

/**
 * Renders the official Google Sign-In button into `container`.
 * Returns cleanup to remove the button (run on unmount).
 */
export async function mountGoogleSignInButton(
  container: HTMLElement,
  clientId: string,
  onCredential: (jwt: string) => void,
): Promise<() => void> {
  await loadGoogleIdentityScript()
  const id = window.google?.accounts?.id
  if (!id) {
    throw new Error('Google Identity Services not available')
  }
  container.innerHTML = ''
  id.initialize({
    client_id: clientId,
    auto_select: false,
    callback: (response) => {
      if (response.credential) onCredential(response.credential)
    },
  })
  await new Promise<void>((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
  })
  const w = Math.round(container.getBoundingClientRect().width)
  const widthPx = Math.min(400, Math.max(240, w > 0 ? w : 340))
  id.renderButton(container, {
    theme: 'outline',
    size: 'large',
    text: 'continue_with',
    shape: 'rectangular',
    width: widthPx,
    logo_alignment: 'center',
  })
  return () => {
    try {
      id.cancel()
    } catch {
      /* ignore */
    }
    container.innerHTML = ''
  }
}
