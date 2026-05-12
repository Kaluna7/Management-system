import gsap from 'gsap'
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { LanguageToggle } from '../components/LanguageToggle'
import { loadPendingGoogleSession, useAuth } from '../context/AuthContext'
import { useLanguage } from '../context/LanguageContext'
import { loadLottieWeb, type LottieJson, type LottiePlayer } from '../lib/lottieWeb'
import type { DepartmentRole } from '../types/user'

const USERNAME_RE = /^[a-z0-9_]{3,32}$/

/** Max time before forcing navigation if Lottie never fires `complete`. */
const SUCCESS_NAV_MAX_MS = 8000
/** Minimum time the success overlay stays visible so the animation is readable. */
const SUCCESS_NAV_MIN_MS = 1400
/** Extra pause after the animation ends before loading the dashboard. */
const SUCCESS_POST_ANIM_DELAY_MS = 550

/** Keep inline Resend Lottie visible at least this long so one loop can finish before unmount. */
const RESEND_INLINE_ANIM_MIN_MS = 2600

const API_BASE_URL = (import.meta.env.VITE_API_URL as string | undefined) ?? 'http://localhost:3000'

/** Same rules as back-end `normalizeRoleCodeDigits` (strips invisible / non-ASCII junk from paste). */
function normalizeRoleCodeInput(value: string): string {
  return value.replace(/\D/g, '').slice(0, 6)
}

/** Human-readable wait for role-code cooldown (anti-spam; `retryAfter` is in seconds). */
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

type RoleSendResult =
  | { ok: true; sentTo?: string; codeUnchanged?: boolean }
  | { ok: false; message: string; retryAfter?: number }

/** Same in-flight POST for one token — avoids React StrictMode double-invoke → 429 + no email UX. */
let roleCodeInflight: { token: string; promise: Promise<RoleSendResult> } | null = null

function requestRoleCodeDeduped(
  token: string,
  send: () => Promise<RoleSendResult>,
): Promise<RoleSendResult> {
  if (roleCodeInflight?.token === token) {
    return roleCodeInflight.promise
  }
  const promise = send().finally(() => {
    if (roleCodeInflight?.promise === promise) {
      roleCodeInflight = null
    }
  })
  roleCodeInflight = { token, promise }
  return promise
}

export function SelectRole() {
  const { t } = useLanguage()
  const {
    pendingGoogle,
    completeRoleSelection,
    requestRoleVerificationCode,
    verifyRoleVerificationCode,
  } = useAuth()
  const navigate = useNavigate()
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [code, setCode] = useState('')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [passwordConfirm, setPasswordConfirm] = useState('')
  const [sendStatus, setSendStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle')
  const [sentToHint, setSentToHint] = useState<string | null>(null)
  const [cooldownSec, setCooldownSec] = useState(0)
  const [step, setStep] = useState<1 | 2 | 3>(1)
  const [verifyingStep1, setVerifyingStep1] = useState(false)
  const stepsStripRef = useRef<HTMLDivElement>(null)

  const requestRoleCodeRef = useRef(requestRoleVerificationCode)
  useEffect(() => {
    requestRoleCodeRef.current = requestRoleVerificationCode
  }, [requestRoleVerificationCode])

  const [successPhase, setSuccessPhase] = useState(false)
  const [successJson, setSuccessJson] = useState<LottieJson | null>(null)
  const successLottieRef = useRef<HTMLDivElement>(null)
  const roleForDashboardRef = useRef<DepartmentRole | null>(null)

  const [formRegisterJson, setFormRegisterJson] = useState<LottieJson | null>(null)
  const formRegisterLottieRef = useRef<HTMLDivElement>(null)

  const [sendJson, setSendJson] = useState<LottieJson | null>(null)
  const [sendingFromResend, setSendingFromResend] = useState(false)
  const sendInlineLottieRef = useRef<HTMLDivElement>(null)

  /** Step 1: show send.json only beside Resend — initial auto-send or manual resend (no fullscreen). */
  const codeSendButtonLottieActive =
    step === 1 && !successPhase && (sendStatus === 'sending' || sendingFromResend)
  const codeSendButtonLottieActiveRef = useRef(codeSendButtonLottieActive)
  codeSendButtonLottieActiveRef.current = codeSendButtonLottieActive

  useEffect(() => {
    let cancelled = false
    void import('../assets/animation_icons/form_register.json').then((mod) => {
      if (!cancelled) setFormRegisterJson(mod.default as LottieJson)
    })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (!formRegisterJson) return
    const el = formRegisterLottieRef.current
    if (!el) return
    let player: LottiePlayer | undefined
    let alive = true
    void loadLottieWeb().then((lottie) => {
      if (!alive || !formRegisterLottieRef.current) return
      player = lottie.loadAnimation({
        container: formRegisterLottieRef.current,
        renderer: 'svg',
        loop: true,
        autoplay: true,
        animationData: formRegisterJson,
        rendererSettings: {
          preserveAspectRatio: 'xMidYMid meet',
        },
      })
    })
    return () => {
      alive = false
      player?.destroy()
      el.replaceChildren()
    }
  }, [formRegisterJson])

  useEffect(() => {
    let cancelled = false
    void import('../assets/animation_icons/send.json').then((mod) => {
      if (!cancelled) setSendJson(mod.default as LottieJson)
    })
    return () => {
      cancelled = true
    }
  }, [])

  /** send.json in the Resend row — initial mount send and resend (never fullscreen). */
  useEffect(() => {
    if (!codeSendButtonLottieActive || !sendJson) return
    const el = sendInlineLottieRef.current
    if (!el) return
    let player: LottiePlayer | undefined
    let alive = true
    void loadLottieWeb().then((lottie) => {
      if (!alive || !sendInlineLottieRef.current) return
      player = lottie.loadAnimation({
        container: sendInlineLottieRef.current,
        renderer: 'svg',
        loop: false,
        autoplay: true,
        animationData: sendJson,
        rendererSettings: {
          preserveAspectRatio: 'xMidYMid meet',
        },
      })
      const anim = player as unknown as {
        goToAndPlay?: (value: number, isFrame?: boolean) => void
      }
      player.addEventListener?.('complete', () => {
        if (!alive || !codeSendButtonLottieActiveRef.current) return
        anim.goToAndPlay?.(0, true)
      })
    })
    return () => {
      alive = false
      player?.destroy()
      el.replaceChildren()
    }
  }, [codeSendButtonLottieActive, sendJson])

  const cooldownActive = cooldownSec > 0
  useEffect(() => {
    if (!cooldownActive) return
    const id = window.setInterval(() => {
      setCooldownSec((s) => (s <= 1 ? 0 : s - 1))
    }, 1000)
    return () => window.clearInterval(id)
  }, [cooldownActive])

  /** Same countdown rules as POST /role/send-code — survives refresh (server stores last send time). */
  const syncCooldownFromServer = useCallback(async () => {
    const pending = loadPendingGoogleSession()
    if (!pending?.token) return
    try {
      const res = await fetch(`${API_BASE_URL}/api/auth/role/send-cooldown`, {
        headers: { Authorization: `Bearer ${pending.token}` },
      })
      if (!res.ok) return
      const data = (await res.json().catch(() => ({}))) as { retryAfterSeconds?: number }
      if (typeof data.retryAfterSeconds === 'number') {
        setCooldownSec(Math.max(0, Math.floor(data.retryAfterSeconds)))
      }
    } catch {
      /* ignore */
    }
  }, [])

  useEffect(() => {
    void syncCooldownFromServer()
  }, [syncCooldownFromServer])

  useLayoutEffect(() => {
    const el = stepsStripRef.current
    if (!el) return
    const reduce =
      typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
    gsap.to(el, {
      xPercent: -(step - 1) * (100 / 3),
      duration: reduce ? 0 : 0.55,
      ease: 'power2.inOut',
    })
    return () => {
      gsap.killTweensOf(el)
    }
  }, [step])

  useEffect(() => {
    let cancelled = false
    const tId = window.setTimeout(() => {
      if (cancelled) return
      const pending = loadPendingGoogleSession()
      if (!pending?.token) {
        setSendStatus('error')
        setError(t('roleSaveError'))
        return
      }
      setSendStatus('sending')
      void requestRoleCodeDeduped(pending.token, () => requestRoleCodeRef.current()).then((r) => {
        if (cancelled) return
        if (r.ok === false) {
          setSendStatus('error')
          if (r.retryAfter != null && r.retryAfter > 0) {
            setCooldownSec(r.retryAfter)
            setError(null)
          } else {
            setError(r.message)
          }
          return
        }
        setSendStatus('sent')
        setError(null)
        void syncCooldownFromServer()
        if (r.sentTo) {
          setSentToHint(t('roleVerificationSentTo').replace('{email}', r.sentTo))
        }
      })
    }, 0)
    return () => {
      cancelled = true
      window.clearTimeout(tId)
    }
  }, [syncCooldownFromServer])

  useEffect(() => {
    if (!successPhase) return
    void import('../assets/animation_icons/succes.json').then((mod) => {
      setSuccessJson(mod.default as LottieJson)
    })
  }, [successPhase])

  useEffect(() => {
    if (!successPhase || !successJson) return
    const el = successLottieRef.current
    if (!el) return

    const startedAt = Date.now()
    let player: LottiePlayer | undefined
    let done = false
    let maxTimer: ReturnType<typeof window.setTimeout> | undefined
    let navigateTimer: ReturnType<typeof window.setTimeout> | undefined

    const finish = () => {
      if (done) return
      done = true
      const role = roleForDashboardRef.current
      const path =
        role === 'finance' ? '/dashboard/task' : role === 'buyers' ? '/dashboard' : '/dashboard'
      navigate(path, { replace: true })
    }

    const scheduleNavigateAfterPause = () => {
      if (done) return
      if (navigateTimer !== undefined) window.clearTimeout(navigateTimer)
      const elapsed = Date.now() - startedAt
      const untilMin = Math.max(0, SUCCESS_NAV_MIN_MS - elapsed)
      const delay = untilMin + SUCCESS_POST_ANIM_DELAY_MS
      navigateTimer = window.setTimeout(() => {
        navigateTimer = undefined
        finish()
      }, delay)
    }

    maxTimer = window.setTimeout(() => {
      scheduleNavigateAfterPause()
    }, SUCCESS_NAV_MAX_MS)

    void loadLottieWeb().then((lottie) => {
      if (!successLottieRef.current) return
      player = lottie.loadAnimation({
        container: successLottieRef.current,
        renderer: 'svg',
        loop: false,
        autoplay: true,
        animationData: successJson,
        rendererSettings: {
          preserveAspectRatio: 'xMidYMid meet',
        },
      })
      player.addEventListener?.('complete', () => {
        if (maxTimer !== undefined) window.clearTimeout(maxTimer)
        maxTimer = undefined
        scheduleNavigateAfterPause()
      })
    })

    return () => {
      if (maxTimer !== undefined) window.clearTimeout(maxTimer)
      if (navigateTimer !== undefined) window.clearTimeout(navigateTimer)
      player?.destroy()
      el.replaceChildren()
    }
  }, [successPhase, successJson, navigate])

  async function resend() {
    if (cooldownSec > 0) return
    setError(null)
    const resendStartedAt = Date.now()
    setSendingFromResend(true)
    setSendStatus('sending')
    try {
      const r = await requestRoleVerificationCode({ force: true })
      if (r.ok === false) {
        setSendStatus('error')
        if (r.retryAfter != null && r.retryAfter > 0) {
          setCooldownSec(r.retryAfter)
          setError(null)
        } else {
          setError(r.message)
        }
        return
      }
      setSendStatus('sent')
      void syncCooldownFromServer()
      if (r.sentTo) {
        setSentToHint(t('roleVerificationSentTo').replace('{email}', r.sentTo))
      }
    } finally {
      const elapsed = Date.now() - resendStartedAt
      const remaining = Math.max(0, RESEND_INLINE_ANIM_MIN_MS - elapsed)
      window.setTimeout(() => {
        setSendingFromResend(false)
      }, remaining)
    }
  }

  async function goNext() {
    setError(null)
    if (step === 1) {
      const trimmed = normalizeRoleCodeInput(code)
      if (!/^\d{6}$/.test(trimmed)) {
        setError(t('roleVerificationInvalidCode'))
        return
      }
      setVerifyingStep1(true)
      try {
        const r = await verifyRoleVerificationCode(trimmed)
        if (r.ok === false) {
          setError(r.message)
          return
        }
        setStep(2)
      } finally {
        setVerifyingStep1(false)
      }
      return
    }
    if (step === 2) {
      const u = username.trim().toLowerCase()
      if (!USERNAME_RE.test(u)) {
        setError(t('selectRoleUsernameInvalid'))
        return
      }
      if (password.length < 8) {
        setError(t('selectRolePasswordHint'))
        return
      }
      if (password !== passwordConfirm) {
        setError(t('selectRolePasswordMismatch'))
        return
      }
      setStep(3)
    }
  }

  function goBack() {
    if (step === 1) return
    setError(null)
    setStep((s) => (s === 3 ? 2 : 1))
  }

  async function pick(role: DepartmentRole) {
    setError(null)
    const trimmed = normalizeRoleCodeInput(code)
    if (!/^\d{6}$/.test(trimmed)) {
      setError(t('roleVerificationInvalidCode'))
      return
    }

    const u = username.trim().toLowerCase()
    if (!USERNAME_RE.test(u)) {
      setError(t('selectRoleUsernameInvalid'))
      return
    }
    if (password.length < 8) {
      setError(t('selectRolePasswordHint'))
      return
    }
    if (password !== passwordConfirm) {
      setError(t('selectRolePasswordMismatch'))
      return
    }

    setBusy(true)
    const result = await completeRoleSelection(role, trimmed, u, password)
    setBusy(false)
    if (result.ok === false) {
      setError(result.message || t('roleSaveError'))
      return
    }
    roleForDashboardRef.current = role
    setSuccessPhase(true)
  }

  return (
    <div className="relative min-h-dvh bg-white text-slate-800">
      <div className="absolute right-4 top-4 z-20 md:right-8 md:top-8">
        <LanguageToggle />
      </div>

      <div className="flex min-h-dvh w-full items-center justify-center px-4 py-10 sm:px-6 sm:py-12">
        <div className="relative z-10 w-full max-w-5xl">
          <div className="grid gap-8 md:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] md:items-center md:gap-10 lg:gap-14">
            <aside className="flex flex-col items-center justify-center px-2 md:px-2">
              <div className="flex w-full max-w-[min(100%,400px)] justify-center sm:max-w-[min(100%,440px)] md:max-w-[min(100%,480px)]">
                {formRegisterJson ? (
                  <div
                    ref={formRegisterLottieRef}
                    className="flex w-full justify-center [&>svg]:mx-auto [&_svg]:h-auto [&_svg]:max-h-[min(40vh,380px)] [&_svg]:w-auto [&_svg]:max-w-full [&_svg]:object-contain sm:[&_svg]:max-h-[min(44vh,420px)] md:[&_svg]:max-h-[min(48vh,480px)]"
                    aria-hidden
                  />
                ) : (
                  <div
                    className="aspect-4/3 w-full max-w-[320px] animate-pulse rounded-2xl bg-slate-100 sm:max-w-[360px] md:max-w-[400px]"
                    aria-hidden
                  />
                )}
              </div>
            </aside>

            <div className="px-2 sm:px-4 md:px-2 md:pl-0">
              <div className="mx-auto w-full max-w-lg">
                <h1 className="text-xl font-semibold text-slate-900">{t('selectRoleTitle')}</h1>
                <p className="mt-1.5 text-sm leading-snug text-slate-600">{t('selectRoleSubtitle')}</p>
                {pendingGoogle?.name ? (
                  <p className="mt-2.5 rounded-lg bg-slate-50 px-3 py-1.5 text-sm text-slate-700">
                    <span className="font-medium text-slate-900">{pendingGoogle.name}</span>
                    {pendingGoogle.email ? (
                      <span className="block text-xs text-slate-500">{pendingGoogle.email}</span>
                    ) : null}
                  </p>
                ) : null}

                <div
                  className="mt-6 flex items-center justify-center gap-1.5"
                  role="navigation"
                  aria-label={t('selectRoleTitle')}
                >
                  {([1, 2, 3] as const).map((s) => (
                    <span
                      key={s}
                      className={`h-1.5 rounded-full transition-all duration-300 ease-out ${
                        step === s
                          ? 'w-8 bg-violet-600'
                          : step > s
                            ? 'w-2 bg-violet-400'
                            : 'w-2 bg-slate-200'
                      }`}
                      aria-current={step === s ? 'step' : undefined}
                    />
                  ))}
                </div>

                <div className="relative mt-8 overflow-hidden pb-1">
                  <div ref={stepsStripRef} className="flex w-[300%] will-change-transform">
                    <section className="box-border w-1/3 shrink-0 pr-2 sm:pr-3">
                      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                        {t('selectRoleStepVerify')}
                      </p>
                      <p className="mt-0.5 text-sm leading-snug text-slate-600">
                        {t('roleVerificationHint')}
                      </p>

                      {sendStatus === 'sent' ? (
                        <div className="mt-2 space-y-1">
                          <p className="text-xs text-emerald-700">{t('roleVerificationSent')}</p>
                          {sentToHint ? <p className="text-xs text-slate-600">{sentToHint}</p> : null}
                        </div>
                      ) : null}

                      {cooldownSec > 0 ? (
                        <p
                          className="mt-2 text-xs font-medium text-amber-800"
                          role="status"
                          aria-live="polite"
                        >
                          {t('roleVerificationCooldown').replace(
                            '{time}',
                            formatVerificationCooldownDuration(cooldownSec),
                          )}
                        </p>
                      ) : null}

                      {error && step === 1 ? (
                        <div className="mt-3 rounded-lg bg-red-50 px-3 py-1.5 text-sm text-red-800" role="alert">
                          {error}
                        </div>
                      ) : null}

                      <label className="mt-3 block space-y-1 text-sm">
                        <span className="font-medium text-slate-700">{t('roleVerificationLabel')}</span>
                        <input
                          type="text"
                          inputMode="numeric"
                          autoComplete="one-time-code"
                          maxLength={6}
                          value={code}
                          onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                          placeholder="000000"
                          disabled={successPhase}
                          className="w-full rounded-lg border border-slate-300 px-3 py-1.5 font-mono text-base tracking-widest outline-none ring-violet-200 focus:border-violet-400 focus:ring-2 disabled:bg-slate-50"
                        />
                      </label>

                      <div className="mt-2 flex min-h-16 items-center gap-2 sm:gap-3">
                        <div
                          className={`flex shrink-0 items-center justify-start overflow-hidden transition-[max-width,opacity,transform] duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none ${
                            codeSendButtonLottieActive
                              ? 'max-w-20 translate-x-0 opacity-100 sm:max-w-22'
                              : 'max-w-0 -translate-x-1 opacity-0'
                          }`}
                          aria-hidden
                        >
                          <div className="relative h-16 w-16 shrink-0 overflow-visible sm:h-18 sm:w-18 contain-paint">
                            <div
                              className={`absolute inset-0 flex items-center justify-center rounded-xl bg-linear-to-br from-slate-100 to-slate-200/80 transition-[opacity,transform] duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none ${
                                codeSendButtonLottieActive && !sendJson
                                  ? 'scale-100 opacity-100'
                                  : 'pointer-events-none scale-95 opacity-0'
                              }`}
                            >
                              <span className="h-9 w-9 animate-pulse rounded-lg bg-white/60" />
                            </div>
                            <div
                              ref={sendInlineLottieRef}
                              className={`absolute inset-0 flex items-center justify-center overflow-visible transition-[opacity,transform] duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none ${
                                codeSendButtonLottieActive && sendJson
                                  ? 'scale-100 opacity-100'
                                  : 'pointer-events-none scale-[0.92] opacity-0'
                              } [&>svg]:mx-auto [&_svg]:box-content [&_svg]:max-h-full [&_svg]:max-w-full [&_svg]:object-contain`}
                            />
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => void resend()}
                          disabled={
                            busy ||
                            sendStatus === 'sending' ||
                            successPhase ||
                            cooldownSec > 0 ||
                            sendingFromResend
                          }
                          aria-busy={codeSendButtonLottieActive}
                          className={`min-w-0 flex-1 text-left text-xs font-medium underline-offset-2 transition-[opacity,transform,color] duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none ${
                            codeSendButtonLottieActive
                              ? 'cursor-wait text-violet-500/85 opacity-80'
                              : busy ||
                                  sendStatus === 'sending' ||
                                  successPhase ||
                                  cooldownSec > 0
                                ? 'cursor-not-allowed text-violet-700 opacity-45'
                                : 'text-violet-700 opacity-100 hover:underline'
                          }`}
                        >
                          {cooldownSec > 0
                            ? t('roleVerificationResendWait').replace(
                                '{time}',
                                formatVerificationCooldownDuration(cooldownSec),
                              )
                            : t('roleVerificationResend')}
                        </button>
                      </div>

                      <div className="mt-6">
                        <button
                          type="button"
                          onClick={() => void goNext()}
                          disabled={successPhase || busy || verifyingStep1}
                          className="w-full rounded-xl bg-violet-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-violet-500 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          {verifyingStep1 ? t('loadingData') : t('selectRoleNext')}
                        </button>
                      </div>
                    </section>

                    <section className="box-border w-1/3 shrink-0 px-1.5 sm:px-2">
                      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                        {t('selectRoleCredentialsTitle')}
                      </p>

                      {error && step === 2 ? (
                        <div className="mt-3 rounded-lg bg-red-50 px-3 py-1.5 text-sm text-red-800" role="alert">
                          {error}
                        </div>
                      ) : null}

                      <label className="mt-3 block space-y-1 text-sm">
                        <span className="font-medium text-slate-700">{t('selectRoleUsernameLabel')}</span>
                        <input
                          type="text"
                          autoComplete="username"
                          value={username}
                          onChange={(e) =>
                            setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))
                          }
                          placeholder={t('selectRoleUsernamePlaceholder')}
                          maxLength={32}
                          disabled={successPhase}
                          className="w-full rounded-lg border border-slate-300 px-3 py-1.5 font-mono text-sm outline-none ring-violet-200 focus:border-violet-400 focus:ring-2 disabled:bg-slate-50"
                        />
                      </label>

                      <label className="mt-3 block space-y-1 text-sm">
                        <span className="font-medium text-slate-700">{t('selectRolePasswordLabel')}</span>
                        <input
                          type="password"
                          autoComplete="new-password"
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          disabled={successPhase}
                          className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm outline-none ring-violet-200 focus:border-violet-400 focus:ring-2 disabled:bg-slate-50"
                        />
                        <span className="block text-xs text-slate-500">{t('selectRolePasswordHint')}</span>
                      </label>

                      <label className="mt-3 block space-y-1 text-sm">
                        <span className="font-medium text-slate-700">
                          {t('selectRolePasswordConfirmLabel')}
                        </span>
                        <input
                          type="password"
                          autoComplete="new-password"
                          value={passwordConfirm}
                          onChange={(e) => setPasswordConfirm(e.target.value)}
                          disabled={successPhase}
                          className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm outline-none ring-violet-200 focus:border-violet-400 focus:ring-2 disabled:bg-slate-50"
                        />
                      </label>

                      <div className="mt-6 flex flex-wrap gap-3">
                        <button
                          type="button"
                          onClick={goBack}
                          className="min-w-26 rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 shadow-sm transition hover:bg-slate-50"
                        >
                          {t('selectRoleBack')}
                        </button>
                        <button
                          type="button"
                          onClick={() => void goNext()}
                          disabled={successPhase || busy || verifyingStep1}
                          className="min-w-26 flex-1 rounded-xl bg-violet-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-violet-500 disabled:cursor-not-allowed disabled:opacity-50 sm:flex-none"
                        >
                          {t('selectRoleNext')}
                        </button>
                      </div>
                    </section>

                    <section className="box-border w-1/3 shrink-0 pl-2 sm:pl-3">
                      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                        {t('selectRoleStepRoles')}
                      </p>

                      {error && step === 3 ? (
                        <div className="mt-3 rounded-lg bg-red-50 px-3 py-1.5 text-sm text-red-800" role="alert">
                          {error}
                        </div>
                      ) : null}

                      <div className="mt-4 grid gap-2.5 sm:grid-cols-2">
                        <button
                          type="button"
                          disabled={busy || sendStatus === 'sending' || successPhase}
                          onClick={() => void pick('buyers')}
                          className="rounded-xl bg-violet-50 px-3 py-3 text-left text-sm font-semibold text-violet-900 shadow-sm transition hover:bg-violet-100 disabled:opacity-50"
                        >
                          {t('selectRoleAsBuyers')}
                        </button>
                        <button
                          type="button"
                          disabled={busy || sendStatus === 'sending' || successPhase}
                          onClick={() => void pick('finance')}
                          className="rounded-xl bg-slate-50 px-3 py-3 text-left text-sm font-semibold text-slate-900 shadow-sm transition hover:bg-violet-50 disabled:opacity-50"
                        >
                          {t('selectRoleAsFinance')}
                        </button>
                      </div>
                      {busy ? (
                        <p className="mt-3 text-center text-xs text-slate-500">{t('selectRoleSaving')}</p>
                      ) : null}

                      <button
                        type="button"
                        onClick={goBack}
                        disabled={busy}
                        className="mt-6 rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:opacity-50"
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

      {successPhase ? (
        <div
          className="fixed inset-0 z-100 flex flex-col bg-slate-950/75 backdrop-blur-md"
          role="dialog"
          aria-modal="true"
          aria-labelledby="onboarding-success-title"
          aria-busy={!successJson}
        >
          <div className="flex min-h-dvh w-full flex-col items-stretch justify-center gap-5 overflow-visible px-5 py-8 sm:gap-6 sm:px-8">
            <p
              id="onboarding-success-title"
              className="shrink-0 text-center text-lg font-semibold leading-snug text-white drop-shadow-md sm:text-xl"
            >
              {t('onboardingSuccessTitle')}
            </p>
            <div className="flex min-h-0 w-full flex-1 items-center justify-center overflow-visible px-1 py-2">
              <div
                ref={successLottieRef}
                className="flex w-full max-w-[min(96vw,920px)] items-center justify-center overflow-visible [&>svg]:mx-auto [&_svg]:box-content [&_svg]:h-auto [&_svg]:max-h-[min(72dvh,88vmin)] [&_svg]:w-auto [&_svg]:max-w-full [&_svg]:object-contain"
                aria-hidden
              />
            </div>
            {!successJson ? (
              <p className="text-sm text-white/80">{t('loadingData')}</p>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  )
}
