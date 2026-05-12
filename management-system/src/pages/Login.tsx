import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import { FcGoogle } from 'react-icons/fc'
import { useNavigate } from 'react-router-dom'
import { LanguageToggle } from '../components/LanguageToggle'
import { useAuth } from '../context/AuthContext'
import { useLanguage } from '../context/LanguageContext'
import { loadLottieWeb, type LottieJson, type LottiePlayer } from '../lib/lottieWeb'
import { mountGoogleSignInButton } from '../lib/googleIdentity'

const googleClientId = import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined

export function Login() {
  const { login, loginWithGoogleCredential } = useAuth()
  const { t } = useLanguage()
  const navigate = useNavigate()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [lottieData, setLottieData] = useState<LottieJson | null>(null)
  const lottieContainerRef = useRef<HTMLDivElement>(null)
  const googleBtnHostRef = useRef<HTMLDivElement>(null)
  const [showPassword , setShowPassword] = useState<boolean>(false)

  useEffect(() => {
    let cancelled = false
    void import('../assets/animation_icons/login_ready.json').then((mod) => {
      if (!cancelled) setLottieData(mod.default as LottieJson)
    })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (!lottieData) return
    const el = lottieContainerRef.current
    if (!el) return
    let player: LottiePlayer | undefined
    let alive = true
    void loadLottieWeb().then((lottie) => {
      if (!alive || !lottieContainerRef.current) return
      player = lottie.loadAnimation({
        container: lottieContainerRef.current,
        renderer: 'svg',
        loop: true,
        autoplay: true,
        animationData: lottieData,
      })
    })
    return () => {
      alive = false
      player?.destroy()
      el.replaceChildren()
    }
  }, [lottieData])

  const onGoogleCredential = useCallback(
    async (credential: string) => {
      setError(null)
      const result = await loginWithGoogleCredential(credential)
      if (result.ok === false) {
        setError(result.message)
        return
      }
      if (result.needsRole) navigate('/select-role', { replace: true })
      else navigate('/dashboard', { replace: true })
    },
    [loginWithGoogleCredential, navigate],
  )

  useEffect(() => {
    const host = googleBtnHostRef.current
    const cid = googleClientId?.trim()
    if (!host || !cid) return

    let cancelled = false
    let cleanup: (() => void) | undefined

    void mountGoogleSignInButton(host, cid, (jwt) => {
      void onGoogleCredential(jwt)
    })
      .then((fn) => {
        if (cancelled) fn()
        else cleanup = fn
      })
      .catch(() => {
        if (!cancelled) setError(t('googleSignInFailed'))
      })

    return () => {
      cancelled = true
      cleanup?.()
    }
  }, [onGoogleCredential, t])

  const [loginBusy, setLoginBusy] = useState(false)

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setLoginBusy(true)
    const result = await login(username, password)
    setLoginBusy(false)
    if (result.ok === false) setError(result.message)
  }

  return (
    <div className="relative flex min-h-dvh flex-col items-center justify-center bg-white px-4 py-10 text-slate-800 sm:px-6 sm:py-12">
      <div className="absolute right-4 top-4 z-20 sm:right-6 sm:top-6 md:right-8 md:top-8">
        <LanguageToggle />
      </div>

      <div className="relative z-10 w-full max-w-5xl">
        <div className="rounded-3xl border border-slate-200 bg-white shadow-sm">
          <div className="grid min-h-0 md:min-h-[min(560px,calc(100dvh-8rem))] md:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)] md:items-stretch">
            <aside className="flex min-h-[min(420px,50vh)] flex-col items-center justify-center border-b border-slate-200 bg-white px-6 py-10 text-center sm:px-8 md:min-h-0 md:border-b-0 md:border-r md:border-slate-200 md:px-10 md:py-12">
              <div className="flex w-full max-w-md flex-col items-center">
                <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.22em] text-violet-600">
                  {t('loginBrand')}
                </p>
                <h1 className="mb-3 max-w-sm text-2xl font-semibold tracking-tight text-slate-900 md:text-[1.65rem] md:leading-snug">
                  {t('loginTitleAside')}
                </h1>
                <p className="max-w-sm text-sm leading-relaxed text-slate-600">
                  {t('loginIntroAside')}
                </p>

                <div className="mt-8 flex w-full max-w-[min(100%,340px)] justify-center sm:mt-10">
                  {lottieData ? (
                    <div
                      ref={lottieContainerRef}
                      className="flex w-full justify-center [&>svg]:mx-auto [&_svg]:max-h-[min(42vh,360px)] [&_svg]:w-auto [&_svg]:max-w-full"
                      aria-hidden
                    />
                  ) : (
                    <div
                      className="aspect-square w-full max-w-[260px] animate-pulse rounded-3xl bg-slate-100 ring-1 ring-slate-200/80"
                      aria-hidden
                    />
                  )}
                </div>
              </div>
            </aside>

            <div className="flex flex-col justify-center bg-white px-6 py-10 sm:px-8 md:px-11 md:py-12">
              <div className="mx-auto w-full max-w-md">
                <div className="mb-8 text-center md:text-left">
                  <h2 className="text-2xl font-semibold tracking-tight text-slate-900">{t('loginHeading')}</h2>
                  <p className="mt-2 text-sm leading-relaxed text-slate-500">{t('loginSubtitle')}</p>
                </div>

                <form className="space-y-5" onSubmit={onSubmit} noValidate>
                {error ? (
                  <div
                    className="rounded-xl border border-red-200/80 bg-red-50 px-4 py-3 text-sm text-red-800 shadow-sm"
                    role="alert"
                  >
                    {error}
                  </div>
                ) : null}

                <label className="block space-y-2">
                  <span className="text-sm font-medium text-slate-700">{t('loginUsername')}</span>
                  <input
                    name="username"
                    autoComplete="username"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder={t('loginUsernamePlaceholder')}
                    required
                    className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 shadow-sm outline-none ring-violet-200/60 transition placeholder:text-slate-400 focus:border-violet-400 focus:ring-4"
                  />
                </label>

                <label className="block space-y-2">
                  <span className="text-sm font-medium text-slate-700">{t('loginPassword')}</span>
                  <div className='flex flex-row'>
                  <input
                    name="password"
                    type={showPassword ? "text": "password"}
                    autoComplete="current-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    required
                    className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 shadow-sm outline-none ring-violet-200/60 transition placeholder:text-slate-400 focus:border-violet-400 focus:ring-4"
                  />
                  <button
                  type='button'
                  onClick={() => setShowPassword(!showPassword)}
                  style={{
                    position: 'absolute',
                    transform: 'translateY(-50)',
                    right: 50,
              
                  }}
                  >
                    {showPassword? 'Hide' : 'Show'}
                  </button>
                  </div>
                </label>

                <button
                  type="submit"
                  disabled={loginBusy}
                  className="w-full rounded-xl bg-linear-to-r from-violet-600 to-violet-500 px-4 py-3.5 text-sm font-semibold text-white shadow-md shadow-violet-500/25 outline-none transition hover:from-violet-500 hover:to-violet-400 focus-visible:ring-4 focus-visible:ring-violet-300 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {loginBusy ? t('loadingData') : t('loginSubmit')}
                </button>
              </form>

              <div className="relative my-10">
                <div className="absolute inset-0 flex items-center" aria-hidden="true">
                  <div className="w-full border-t border-slate-200" />
                </div>
                <div className="relative flex justify-center">
                  <span className="bg-white px-4 text-xs font-semibold uppercase tracking-wider text-slate-400">
                    {t('orDivider')}
                  </span>
                </div>
              </div>

              <div className="space-y-3">
                {googleClientId ? (
                  <div
                    className="relative w-full overflow-visible rounded-xl border border-slate-200 bg-white shadow-sm transition hover:border-slate-300 hover:shadow-md"
                    role="group"
                    aria-label={t('googleSignIn')}
                  >
                    <div className="pointer-events-none flex min-h-[52px] w-full items-center justify-center gap-3 px-4 py-3">
                      <FcGoogle className="h-7 w-7 shrink-0" aria-hidden />
                      <span className="text-sm font-semibold tracking-tight text-slate-800">
                        {t('googleSignIn')}
                      </span>
                    </div>
                    <div
                      ref={googleBtnHostRef}
                      className="absolute inset-0 z-10 flex items-center justify-center opacity-[0.02] [&>div]:flex [&>div]:min-h-[52px] [&>div]:w-full [&>div]:max-w-full [&>div]:items-center [&>div]:justify-center [&_iframe]:mx-auto"
                      aria-hidden
                    />
                  </div>
                ) : (
                  <button
                    type="button"
                    disabled
                    className="flex w-full min-h-[52px] cursor-not-allowed items-center justify-center gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-left opacity-90 shadow-sm"
                    aria-label={t('googleSignIn')}
                  >
                    <FcGoogle className="h-7 w-7 shrink-0 opacity-80" aria-hidden />
                    <span className="text-sm font-semibold tracking-tight text-slate-600">
                      {t('googleSignIn')}
                    </span>
                  </button>
                )}
                {!googleClientId ? (
                  <p className="text-center text-xs leading-relaxed text-amber-800/90">{t('googleNotConfigured')}</p>
                ) : null}
              </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
