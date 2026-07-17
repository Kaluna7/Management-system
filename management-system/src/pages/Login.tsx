import gsap from 'gsap'
import { useEffect, useLayoutEffect, useRef, useState, type FormEvent } from 'react'
import { Eye, EyeOff } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { LanguageToggle } from '../components/LanguageToggle'
import { useAuth } from '../context/AuthContext'
import { useLanguage } from '../context/LanguageContext'
import { loadLottieWeb, type LottieJson, type LottiePlayer } from '../lib/lottieWeb'

const USERNAME_RE = /^[a-z0-9_]{3,32}$/

type AuthPanel = 'login' | 'signup' | 'verify'

function formatVerificationCooldownDuration(totalSec: number): string {
  if (!Number.isFinite(totalSec) || totalSec < 0) return '0s'
  const s = Math.floor(totalSec)
  if (s < 60) return `${s}s`
  if (s < 3600) {
    const m = Math.floor(s / 60)
    const r = s % 60
    if (r === 0) return `${m} min`
    return `${m} min ${r} s`
  }
  const h = Math.floor(s / 3600)
  const rem = s % 3600
  const m = Math.floor(rem / 60)
  if (m === 0) return `${h} h`
  return `${h} h ${m} min`
}

export function Login() {
  const { login, sendEmailSignupCode, verifyEmailSignup } = useAuth()
  const { t } = useLanguage()
  const navigate = useNavigate()
  const [panel, setPanel] = useState<AuthPanel>('login')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [signupEmail, setSignupEmail] = useState('')
  const [signupUsername, setSignupUsername] = useState('')
  const [verifyCode, setVerifyCode] = useState('')
  const [sentToHint, setSentToHint] = useState<string | null>(null)
  const [cooldownSec, setCooldownSec] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [lottieData, setLottieData] = useState<LottieJson | null>(null)
  const lottieContainerRef = useRef<HTMLDivElement>(null)
  const panelStripRef = useRef<HTMLDivElement>(null)
  const [showPassword, setShowPassword] = useState(false)
  const [enableLottie, setEnableLottie] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(min-width: 768px)').matches,
  )

  useLayoutEffect(() => {
    const el = panelStripRef.current
    if (!el) return
    const idx = panel === 'login' ? 0 : panel === 'signup' ? 1 : 2
    const reduce =
      typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
    gsap.to(el, {
      xPercent: -idx * (100 / 3),
      duration: reduce ? 0 : 0.45,
      ease: 'power2.inOut',
    })
    return () => {
      gsap.killTweensOf(el)
    }
  }, [panel])

  useEffect(() => {
    const mq = window.matchMedia('(min-width: 768px)')
    const onChange = () => setEnableLottie(mq.matches)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])

  useEffect(() => {
    if (!enableLottie) {
      setLottieData(null)
      return
    }
    let cancelled = false
    void import('../assets/animation_icons/login_ready.json').then((mod) => {
      if (!cancelled) setLottieData(mod.default as LottieJson)
    })
    return () => {
      cancelled = true
    }
  }, [enableLottie])

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

  const cooldownActive = cooldownSec > 0
  useEffect(() => {
    if (!cooldownActive) return
    const id = window.setInterval(() => {
      setCooldownSec((s) => (s <= 1 ? 0 : s - 1))
    }, 1000)
    return () => window.clearInterval(id)
  }, [cooldownActive])

  const [loginBusy, setLoginBusy] = useState(false)
  const [signupBusy, setSignupBusy] = useState(false)

  async function onSubmitLogin(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setLoginBusy(true)
    const result = await login(username, password)
    setLoginBusy(false)
    if (result.ok === false) setError(result.message)
  }

  async function onSubmitSignup(e: FormEvent) {
    e.preventDefault()
    setError(null)
    const u = signupUsername.trim().toLowerCase()
    if (!USERNAME_RE.test(u)) {
      setError(t('selectRoleUsernameInvalid'))
      return
    }
    setSignupBusy(true)
    const result = await sendEmailSignupCode(signupEmail, u)
    setSignupBusy(false)
    if (result.ok === false) {
      if (result.retryAfter != null && result.retryAfter > 0) {
        setCooldownSec(result.retryAfter)
      } else {
        setError(result.message)
      }
      return
    }
    setVerifyCode('')
    if (result.sentTo) {
      setSentToHint(t('roleVerificationSentTo').replace('{email}', result.sentTo))
    }
    setPanel('verify')
  }

  async function onSubmitVerify(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setSignupBusy(true)
    const result = await verifyEmailSignup(signupEmail, verifyCode)
    setSignupBusy(false)
    if (result.ok === false) {
      setError(result.message)
      return
    }
    navigate('/select-role?step=2', { replace: true })
  }

  async function onResendVerify() {
    if (cooldownSec > 0) return
    setError(null)
    setSignupBusy(true)
    const result = await sendEmailSignupCode(signupEmail, signupUsername.trim().toLowerCase(), {
      force: true,
    })
    setSignupBusy(false)
    if (result.ok === false) {
      if (result.retryAfter != null && result.retryAfter > 0) {
        setCooldownSec(result.retryAfter)
      } else {
        setError(result.message)
      }
      return
    }
    if (result.sentTo) {
      setSentToHint(t('roleVerificationSentTo').replace('{email}', result.sentTo))
    }
  }

  const panelTitle =
    panel === 'login'
      ? t('loginHeading')
      : panel === 'signup'
        ? t('signupEmailTitle')
        : t('signupEmailVerifyTitle')

  const panelSubtitle =
    panel === 'login'
      ? t('loginSubtitle')
      : panel === 'signup'
        ? t('signupWithEmailHint')
        : t('signupEmailVerifySubtitle')

  return (
    <div className="portal-shell relative flex min-h-dvh flex-col md:items-center md:justify-center md:px-4 md:py-10 lg:px-6 lg:py-12">
      <div className="absolute right-3 top-3 z-20 flex items-center gap-2 pt-[env(safe-area-inset-top)] sm:right-6 sm:top-6 md:right-8 md:top-8 md:pt-0">
        <LanguageToggle className="portal-input !w-auto !py-2 text-xs font-semibold" />
      </div>

      <div className="relative z-10 flex w-full min-h-dvh flex-col md:min-h-0 md:max-w-5xl">
        <div className="portal-modal auth-login-modal flex min-h-dvh flex-1 flex-col rounded-none shadow-none max-md:border-0 md:min-h-0 md:rounded-3xl md:shadow-sm">
          <div className="grid min-h-0 flex-1 md:min-h-[min(560px,calc(100dvh-8rem))] md:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)] md:items-stretch">
            <aside className="auth-login-panel portal-border hidden min-h-0 flex-col items-center justify-center border-b px-6 py-10 text-center sm:px-8 md:flex md:border-b-0 md:border-r md:px-10 md:py-12">
              <div className="flex w-full max-w-md flex-col items-center">
                <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.22em] text-violet-600">
                  {t('loginBrand')}
                </p>
                <h1 className="portal-heading mb-3 max-w-sm text-2xl font-semibold tracking-tight md:text-[1.65rem] md:leading-snug">
                  {t('loginTitleAside')}
                </h1>
                <p className="portal-body max-w-sm text-sm leading-relaxed">{t('loginIntroAside')}</p>

                <div className="mt-8 flex w-full max-w-[min(100%,340px)] justify-center sm:mt-10">
                  {lottieData ? (
                    <div
                      ref={lottieContainerRef}
                      className="flex w-full justify-center [&>svg]:mx-auto [&_svg]:max-h-[min(42vh,360px)] [&_svg]:w-auto [&_svg]:max-w-full"
                      aria-hidden
                    />
                  ) : (
                    <div
                      className="aspect-square w-full max-w-[260px] animate-pulse rounded-3xl bg-slate-100 ring-1 ring-slate-200/80 dark:bg-slate-800 dark:ring-slate-700"
                      aria-hidden
                    />
                  )}
                </div>
              </div>
            </aside>

            <div className="auth-login-panel flex min-h-0 flex-1 flex-col justify-center px-4 py-10 pb-[max(2rem,env(safe-area-inset-bottom))] pt-[max(5.5rem,12vh)] sm:px-6 sm:py-12 sm:pt-[max(5rem,10vh)] md:min-h-0 md:justify-center md:px-11 md:py-12 md:pt-12">
              <div className="mx-auto w-full max-w-md max-md:translate-y-3 md:translate-y-1">
                <div className="mb-6 text-center md:mb-8 md:text-left">
                  <h2 className="portal-heading text-2xl font-semibold tracking-tight">{panelTitle}</h2>
                  <p className="portal-muted mt-2 text-sm leading-relaxed">{panelSubtitle}</p>
                </div>

                {error ? (
                  <div
                    className="mb-4 rounded-xl border border-red-200/80 bg-red-50 px-4 py-3 text-sm text-red-800 shadow-sm dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-200"
                    role="alert"
                  >
                    {error}
                  </div>
                ) : null}

                <div className="overflow-hidden pb-1">
                  <div ref={panelStripRef} className="flex w-[300%] will-change-transform">
                    {/* Login */}
                    <section className="box-border w-1/3 shrink-0 pr-2">
                      <form className="space-y-5" onSubmit={onSubmitLogin} noValidate>
                        <label className="block space-y-2">
                          <span className="portal-subheading text-sm font-medium">{t('loginUsername')}</span>
                          <input
                            name="username"
                            autoComplete="username"
                            value={username}
                            onChange={(e) => setUsername(e.target.value)}
                            placeholder={t('loginUsernamePlaceholder')}
                            required
                            className="portal-input rounded-xl px-4 py-3 text-sm focus:ring-4"
                          />
                        </label>

                        <label className="block space-y-2">
                          <span className="portal-subheading text-sm font-medium">{t('loginPassword')}</span>
                          <div className="relative">
                            <input
                              name="password"
                              type={showPassword ? 'text' : 'password'}
                              autoComplete="current-password"
                              value={password}
                              onChange={(e) => setPassword(e.target.value)}
                              placeholder="••••••••"
                              required
                              className="portal-input w-full rounded-xl py-3 pl-4 pr-11 text-sm focus:ring-4"
                            />
                            <button
                              type="button"
                              onClick={() => setShowPassword((v) => !v)}
                              className="absolute inset-y-0 right-0 flex w-11 items-center justify-center rounded-r-xl text-slate-400 transition hover:bg-primary-light hover:text-primary focus-visible:ring-primary/40"
                              aria-label={showPassword ? t('loginHidePassword') : t('loginShowPassword')}
                              aria-pressed={showPassword}
                            >
                              {showPassword ? (
                                <EyeOff className="h-5 w-5" aria-hidden strokeWidth={1.75} />
                              ) : (
                                <Eye className="h-5 w-5" aria-hidden strokeWidth={1.75} />
                              )}
                            </button>
                          </div>
                        </label>

                        <button
                          type="submit"
                          disabled={loginBusy}
                          className="w-full rounded-xl bg-linear-to-r from-primary to-primary-hover px-4 py-3.5 text-sm font-semibold text-white shadow-md shadow-primary/25 outline-none transition hover:from-primary-hover hover:to-primary focus-visible:ring-4 focus-visible:ring-violet-300 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {loginBusy ? t('loadingData') : t('loginSubmit')}
                        </button>
                      </form>

                      <p className="pt-6 text-center text-sm">
                          <button
                            type="button"
                            onClick={() => {
                              setError(null)
                              setPanel('signup')
                            }}
                            className="font-semibold text-primary hover:text-primary-hover hover:underline"
                          >
                          {t('signupWithEmail')}
                        </button>
                      </p>
                    </section>

                    {/* Sign up */}
                    <section className="box-border w-1/3 shrink-0 px-1">
                      <form className="space-y-4" onSubmit={onSubmitSignup} noValidate>
                        <label className="block space-y-2">
                          <span className="portal-subheading text-sm font-medium">{t('signupEmailLabel')}</span>
                          <input
                            type="email"
                            autoComplete="email"
                            value={signupEmail}
                            onChange={(e) => setSignupEmail(e.target.value)}
                            placeholder={t('signupEmailPlaceholder')}
                            required
                            className="portal-input rounded-xl px-4 py-3 text-sm focus:ring-4"
                          />
                        </label>

                        <label className="block space-y-2">
                          <span className="portal-subheading text-sm font-medium">{t('selectRoleUsernameLabel')}</span>
                          <input
                            type="text"
                            autoComplete="username"
                            value={signupUsername}
                            onChange={(e) =>
                              setSignupUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))
                            }
                            placeholder={t('selectRoleUsernamePlaceholder')}
                            maxLength={32}
                            required
                            className="portal-input rounded-xl px-4 py-3 font-mono text-sm focus:ring-4"
                          />
                        </label>

                        <button
                          type="submit"
                          disabled={signupBusy}
                          className="w-full rounded-xl bg-linear-to-r from-primary to-primary-hover px-4 py-3.5 text-sm font-semibold text-white shadow-md shadow-primary/25 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {signupBusy ? t('loadingData') : t('signupEmailSubmit')}
                        </button>
                      </form>

                      <button
                        type="button"
                        onClick={() => {
                          setError(null)
                          setPanel('login')
                        }}
                        className="mt-4 text-sm font-medium text-primary hover:underline"
                      >
                        {t('signupEmailBackToLogin')}
                      </button>
                    </section>

                    {/* Verify code */}
                    <section className="box-border w-1/3 shrink-0 pl-2">
                      {sentToHint ? (
                        <p className="mb-3 text-xs text-emerald-700 dark:text-emerald-300">{sentToHint}</p>
                      ) : null}
                      {cooldownSec > 0 ? (
                        <p className="mb-3 text-xs font-medium text-amber-800 dark:text-amber-200">
                          {t('roleVerificationCooldown').replace(
                            '{time}',
                            formatVerificationCooldownDuration(cooldownSec),
                          )}
                        </p>
                      ) : null}

                      <form className="space-y-4" onSubmit={onSubmitVerify} noValidate>
                        <label className="block space-y-2">
                          <span className="portal-subheading text-sm font-medium">{t('roleVerificationLabel')}</span>
                          <input
                            type="text"
                            inputMode="numeric"
                            autoComplete="one-time-code"
                            maxLength={6}
                            value={verifyCode}
                            onChange={(e) => setVerifyCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                            placeholder="000000"
                            className="portal-input w-full rounded-xl px-4 py-3 font-mono text-base tracking-widest focus:ring-4"
                          />
                        </label>

                        <button
                          type="button"
                          onClick={() => void onResendVerify()}
                          disabled={signupBusy || cooldownSec > 0}
                          className="text-xs font-medium text-primary underline-offset-2 hover:underline disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          {cooldownSec > 0
                            ? t('roleVerificationResendWait').replace(
                                '{time}',
                                formatVerificationCooldownDuration(cooldownSec),
                              )
                            : t('roleVerificationResend')}
                        </button>

                        <button
                          type="submit"
                          disabled={signupBusy}
                          className="w-full rounded-xl bg-linear-to-r from-primary to-primary-hover px-4 py-3.5 text-sm font-semibold text-white shadow-md shadow-primary/25 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {signupBusy ? t('loadingData') : t('signupEmailContinue')}
                        </button>
                      </form>

                      <button
                        type="button"
                        onClick={() => {
                          setError(null)
                          setPanel('signup')
                        }}
                        className="mt-4 text-sm font-medium text-primary hover:underline"
                      >
                        {t('selectRoleBack')}
                      </button>
                    </section>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
