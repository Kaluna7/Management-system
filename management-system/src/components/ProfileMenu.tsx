import { useCallback, useEffect, useId, useRef, useState, type ChangeEvent, type FormEvent } from 'react'
import { createPortal } from 'react-dom'
import { FiChevronLeft, FiChevronRight } from 'react-icons/fi'
import { ModalCloseButton } from './ModalCloseButton'
import { FormLoadingOverlay } from './FormLoadingOverlay'
import { useAuth } from '../context/AuthContext'
import { useLanguage } from '../context/LanguageContext'
import { PROFILE_AVATAR_PRESETS } from '../data/profileAvatarPresets'
import { CartoonPresetAvatar } from './CartoonPresetAvatar'
import { ProfileAvatar } from './ProfileAvatar'
import { RecordPublishSuccessModal } from './RecordPublishSuccessModal'

type Props = {
  userName: string
  userInitial: string
  compact?: boolean
}

type EditPanel = 'profile' | 'account' | 'forgot-verify' | 'forgot-password'

const PANEL_OFFSET: Record<EditPanel, number> = {
  profile: 0,
  account: 1,
  'forgot-verify': 2,
  'forgot-password': 3,
}

function formatVerificationCooldownDuration(totalSec: number): string {
  if (totalSec >= 3600) {
    const h = Math.floor(totalSec / 3600)
    const m = Math.ceil((totalSec % 3600) / 60)
    return m > 0 ? `${h}h ${m}m` : `${h}h`
  }
  if (totalSec >= 60) {
    const m = Math.floor(totalSec / 60)
    const s = totalSec % 60
    return s > 0 ? `${m}m ${s}s` : `${m}m`
  }
  return `${totalSec}s`
}

export function ProfileMenu({ userName, userInitial, compact = false }: Props) {
  const { t } = useLanguage()
  const {
    user,
    authToken,
    logout,
    updateProfile,
    deleteAccount,
    requestPasswordResetCode,
    verifyPasswordResetCode,
    completePasswordReset,
    fetchPasswordResetCooldown,
    updateProfileAvatar,
    uploadProfilePhoto,
    removeProfilePhoto,
  } = useAuth()
  const menuId = useId()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const rootRef = useRef<HTMLDivElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const [open, setOpen] = useState(false)
  const [menuAnchor, setMenuAnchor] = useState<{
    top?: number
    bottom?: number
    right: number
  } | null>(null)
  const [editOpen, setEditOpen] = useState(false)
  const [panel, setPanel] = useState<EditPanel>('profile')
  const [displayName, setDisplayName] = useState(userName)
  const [selectedPreset, setSelectedPreset] = useState<string | null>(user?.avatarPreset ?? null)
  const [deletePassword, setDeletePassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [deleteBusy, setDeleteBusy] = useState(false)
  const [avatarBusy, setAvatarBusy] = useState(false)
  const [resetCode, setResetCode] = useState('')
  const [resetSentTo, setResetSentTo] = useState('')
  const [resetCooldownSec, setResetCooldownSec] = useState(0)
  const [resetSendStatus, setResetSendStatus] = useState<'idle' | 'sending' | 'sent'>('idle')
  const [resetError, setResetError] = useState('')
  const [resetBusy, setResetBusy] = useState(false)
  const [forgotNewPassword, setForgotNewPassword] = useState('')
  const [forgotConfirmPassword, setForgotConfirmPassword] = useState('')
  const [forgotPasswordBusy, setForgotPasswordBusy] = useState(false)
  const [passwordSuccessOpen, setPasswordSuccessOpen] = useState(false)

  const canManageAccount = Boolean(authToken && user?.source !== 'demo')
  const hasCustomPhoto = Boolean(user?.hasProfileImage || user?.profileImageDataUrl)

  const updateMenuAnchor = useCallback(() => {
    const btn = buttonRef.current
    if (!btn) return
    const rect = btn.getBoundingClientRect()
    const menuEstimateHeight = 132
    const spaceBelow = window.innerHeight - rect.bottom
    const openUp = spaceBelow < menuEstimateHeight + 12
    setMenuAnchor({
      right: window.innerWidth - rect.right,
      ...(openUp
        ? { bottom: window.innerHeight - rect.top + 8 }
        : { top: rect.bottom + 8 }),
    })
  }, [])

  useEffect(() => {
    if (!open) {
      setMenuAnchor(null)
      return
    }
    updateMenuAnchor()
    window.addEventListener('resize', updateMenuAnchor)
    window.addEventListener('scroll', updateMenuAnchor, true)
    return () => {
      window.removeEventListener('resize', updateMenuAnchor)
      window.removeEventListener('scroll', updateMenuAnchor, true)
    }
  }, [open, updateMenuAnchor])

  useEffect(() => {
    if (!open) return
    const onPointer = (e: MouseEvent) => {
      const target = e.target as Node
      if (rootRef.current?.contains(target)) return
      if (menuRef.current?.contains(target)) return
      setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onPointer)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onPointer)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  useEffect(() => {
    if (!editOpen) return
    setDisplayName(userName)
    setSelectedPreset(user?.avatarPreset ?? null)
    setPanel('profile')
    setDeletePassword('')
    setResetCode('')
    setResetSentTo('')
    setResetCooldownSec(0)
    setResetSendStatus('idle')
    setResetError('')
    setForgotNewPassword('')
    setForgotConfirmPassword('')
  }, [editOpen, userName, user?.avatarPreset])

  useEffect(() => {
    if (!editOpen || panel !== 'forgot-verify') return
    let alive = true
    const syncCooldown = async () => {
      const { retryAfterSeconds } = await fetchPasswordResetCooldown()
      if (alive) setResetCooldownSec(retryAfterSeconds)
    }
    void syncCooldown()
    const timer = window.setInterval(() => {
      setResetCooldownSec((s) => (s > 0 ? s - 1 : 0))
    }, 1000)
    return () => {
      alive = false
      window.clearInterval(timer)
    }
  }, [editOpen, panel, fetchPasswordResetCooldown])

  useEffect(() => {
    if (!editOpen) return
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeEditModal()
    }
    document.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = prevOverflow
      document.removeEventListener('keydown', onKey)
    }
  }, [editOpen])

  function closeEditModal() {
    setEditOpen(false)
    window.setTimeout(() => setPanel('profile'), 320)
  }

  function openEdit() {
    setOpen(false)
    setEditOpen(true)
  }

  async function pickPreset(presetId: string) {
    if (avatarBusy || selectedPreset === presetId) return
    setAvatarBusy(true)
    try {
      const result = await updateProfileAvatar(presetId)
      if (result.ok) {
        setSelectedPreset(presetId.padStart(2, '0'))
      } else {
        window.alert(result.message)
      }
    } finally {
      setAvatarBusy(false)
    }
  }

  async function onPhotoFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    setAvatarBusy(true)
    try {
      const result = await uploadProfilePhoto(file)
      if (result.ok) {
        setSelectedPreset(null)
      } else {
        window.alert(result.message)
      }
    } finally {
      setAvatarBusy(false)
    }
  }

  async function onRemovePhoto() {
    if (!hasCustomPhoto || avatarBusy) return
    setAvatarBusy(true)
    try {
      const result = await removeProfilePhoto()
      if (!result.ok) window.alert(result.message)
    } finally {
      setAvatarBusy(false)
    }
  }

  async function submitProfile(event: FormEvent) {
    event.preventDefault()
    const name = displayName.trim()
    if (!name) return

    setBusy(true)
    try {
      const result = await updateProfile({ displayName: name })
      if (result.ok) {
        closeEditModal()
        window.alert(t('profileSaveSuccess'))
      } else {
        window.alert(result.message)
      }
    } finally {
      setBusy(false)
    }
  }

  function resetForgotFlowState() {
    setResetCode('')
    setResetSentTo('')
    setResetCooldownSec(0)
    setResetSendStatus('idle')
    setResetError('')
    setForgotNewPassword('')
    setForgotConfirmPassword('')
  }

  async function startForgotPassword() {
    if (!canManageAccount || resetBusy) return
    resetForgotFlowState()
    setResetBusy(true)
    setResetSendStatus('sending')
    try {
      const result = await requestPasswordResetCode()
      if (!result.ok) {
        setResetError(result.message)
        if (result.retryAfter) setResetCooldownSec(result.retryAfter)
        return
      }
      setResetSendStatus('sent')
      if (result.sentTo) setResetSentTo(result.sentTo)
      setPanel('forgot-verify')
    } finally {
      setResetBusy(false)
    }
  }

  async function resendForgotCode() {
    if (resetCooldownSec > 0 || resetBusy) return
    setResetError('')
    setResetBusy(true)
    setResetSendStatus('sending')
    try {
      const result = await requestPasswordResetCode({ force: true })
      if (!result.ok) {
        setResetError(result.message)
        if (result.retryAfter) setResetCooldownSec(result.retryAfter)
        return
      }
      setResetSendStatus('sent')
      if (result.sentTo) setResetSentTo(result.sentTo)
    } finally {
      setResetBusy(false)
    }
  }

  async function submitForgotVerify(event: FormEvent) {
    event.preventDefault()
    const trimmed = resetCode.replace(/\D/g, '').slice(0, 6)
    if (trimmed.length !== 6) {
      setResetError(t('roleVerificationInvalidCode'))
      return
    }
    setResetBusy(true)
    setResetError('')
    try {
      const result = await verifyPasswordResetCode(trimmed)
      if (!result.ok) {
        setResetError(result.message)
        return
      }
      setPanel('forgot-password')
    } finally {
      setResetBusy(false)
    }
  }

  async function submitForgotPassword(event: FormEvent) {
    event.preventDefault()
    if (forgotNewPassword !== forgotConfirmPassword) {
      window.alert(t('profilePasswordMismatch'))
      return
    }
    setForgotPasswordBusy(true)
    try {
      const result = await completePasswordReset(forgotNewPassword)
      if (!result.ok) {
        window.alert(result.message)
        return
      }
      resetForgotFlowState()
      setPanel('account')
      closeEditModal()
      setPasswordSuccessOpen(true)
    } finally {
      setForgotPasswordBusy(false)
    }
  }

  async function submitDeleteAccount() {
    if (!deletePassword.trim()) {
      window.alert(t('accountDeleteConfirmPrompt'))
      return
    }
    const confirmed = window.confirm(`${t('accountDeleteWarning')}\n\n${t('accountDeleteConfirmPrompt')}`)
    if (!confirmed) return

    setDeleteBusy(true)
    try {
      const result = await deleteAccount(deletePassword)
      if (result.ok) {
        closeEditModal()
        window.alert(t('accountDeleteSuccess'))
      } else {
        window.alert(result.message)
      }
    } finally {
      setDeleteBusy(false)
    }
  }

  return (
    <>
      <div ref={rootRef} className="relative">
        <button
          ref={buttonRef}
          type="button"
          onClick={() => {
            setOpen((v) => {
              const next = !v
              if (next) updateMenuAnchor()
              return next
            })
          }}
          className="rounded-full ring-2 ring-transparent transition focus-visible:outline-none focus-visible:ring-primary/40"
          aria-expanded={open}
          aria-haspopup="menu"
          aria-controls={menuId}
          title={userName}
        >
          <ProfileAvatar
            user={user}
            authToken={authToken}
            fallbackInitial={userInitial}
            size={compact ? 'sm' : 'md'}
          />
        </button>

        {open && menuAnchor && typeof document !== 'undefined'
          ? createPortal(
              <div
                ref={menuRef}
                id={menuId}
                role="menu"
                style={{
                  position: 'fixed',
                  right: menuAnchor.right,
                  zIndex: 140,
                  ...(menuAnchor.top != null ? { top: menuAnchor.top } : {}),
                  ...(menuAnchor.bottom != null ? { bottom: menuAnchor.bottom } : {}),
                }}
                className="portal-dropdown min-w-[11rem]"
              >
                <p className="portal-border portal-heading border-b px-4 py-2.5 text-sm font-medium">
                  {userName}
                </p>
                <button
                  type="button"
                  role="menuitem"
                  className="block w-full px-4 py-2.5 text-left text-sm portal-body transition hover:bg-primary-light hover:text-primary"
                  onClick={openEdit}
                >
                  {t('editProfile')}
                </button>
                <button
                  type="button"
                  role="menuitem"
                  className="block w-full px-4 py-2.5 text-left text-sm portal-body transition hover:bg-primary-light hover:text-primary"
                  onClick={() => {
                    setOpen(false)
                    logout()
                  }}
                >
                  {t('logout')}
                </button>
              </div>,
              document.body,
            )
          : null}
      </div>

      {editOpen
        ? createPortal(
            <div
              className="fixed inset-0 z-[120] overflow-y-auto portal-overlay"
              role="presentation"
              onMouseDown={(e) => {
                if (e.target === e.currentTarget) closeEditModal()
              }}
            >
              <div className="flex min-h-full items-center justify-center p-3 sm:p-4 md:p-6">
                <div
                  className="relative portal-modal flex w-full max-w-[min(100%,28rem)] flex-col overflow-hidden shadow-xl sm:max-w-md"
                  role="dialog"
                  aria-modal="true"
                  aria-labelledby="profile-edit-title"
                  onMouseDown={(e) => e.stopPropagation()}
                >
                  <FormLoadingOverlay
                    active={busy || resetBusy || forgotPasswordBusy}
                    label={t('savingData')}
                  />
                  <div className="relative w-full overflow-hidden" style={{ minHeight: 'min(70dvh, 28rem)' }}>
              <div
                className="flex h-full w-[400%] transition-transform duration-300 ease-in-out"
                style={{
                  transform: `translateX(-${PANEL_OFFSET[panel] * 25}%)`,
                }}
              >
                {/* Profile panel */}
                <div className="flex w-1/4 shrink-0 flex-col">
                  <div className="portal-border flex shrink-0 items-center justify-between gap-3 border-b px-4 py-3 sm:px-6 sm:py-4">
                    <h2 id="profile-edit-title" className="portal-heading text-base font-semibold sm:text-lg">
                      {t('profileEditTitle')}
                    </h2>
                    <ModalCloseButton onClick={closeEditModal} label={t('close')} />
                  </div>

                  <form
                    onSubmit={(e) => void submitProfile(e)}
                    className="flex max-h-[min(70dvh,24rem)] min-h-0 flex-1 flex-col overflow-y-auto px-4 py-4 sm:max-h-[min(75dvh,26rem)] sm:px-6 sm:py-5"
                  >
                    <div className="space-y-5">
                      <section className="space-y-3">
                        <p className="text-sm font-medium text-slate-700">{t('profilePhoto')}</p>
                        <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:gap-4">
                          <ProfileAvatar
                            user={user}
                            authToken={authToken}
                            fallbackInitial={userInitial}
                            size="lg"
                          />
                          <div className="flex flex-wrap gap-2">
                            <input
                              ref={fileInputRef}
                              type="file"
                              accept="image/*"
                              className="hidden"
                              onChange={(e) => void onPhotoFileChange(e)}
                            />
                            <button
                              type="button"
                              disabled={avatarBusy}
                              onClick={() => fileInputRef.current?.click()}
                              className="rounded-lg border border-primary/20 bg-primary-light text-primary hover:bg-primary/10 disabled:opacity-60"
                            >
                              {t('profileUploadPhoto')}
                            </button>
                            {hasCustomPhoto ? (
                              <button
                                type="button"
                                disabled={avatarBusy}
                                onClick={() => void onRemovePhoto()}
                                className="rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-600 hover:bg-slate-50 disabled:opacity-60"
                              >
                                {t('profileRemovePhoto')}
                              </button>
                            ) : null}
                          </div>
                        </div>
                        <p className="text-xs text-slate-500">{t('profilePhotoHint')}</p>
                        <p className="text-[10px] text-slate-400">{t('profileAvatarCredit')}</p>

                        <p className="text-sm font-medium text-slate-700">{t('profileChoosePreset')}</p>
                        <div className="grid grid-cols-4 gap-2 sm:grid-cols-5">
                          {PROFILE_AVATAR_PRESETS.map((preset) => {
                            const active = selectedPreset === preset.id && !hasCustomPhoto
                            return (
                              <button
                                key={preset.id}
                                type="button"
                                disabled={avatarBusy}
                                title={preset.label}
                                onClick={() => void pickPreset(preset.id)}
                                className={`rounded-full transition hover:scale-105 disabled:opacity-60 ${
                                  active ? 'ring-2 ring-primary ring-offset-2' : 'ring-1 ring-app-border'
                                }`}
                              >
                                <CartoonPresetAvatar presetId={preset.id} size="picker" title={preset.label} />
                              </button>
                            )
                          })}
                        </div>
                      </section>

                      <label className="block space-y-1 text-sm">
                        <span className="font-medium text-slate-700">{t('profileDisplayName')}</span>
                        <input
                          value={displayName}
                          onChange={(e) => setDisplayName(e.target.value)}
                          required
                          className="portal-input"
                        />
                      </label>

                      {user?.source === 'demo' ? (
                        <p className="text-xs text-slate-500">{t('profileDemoNote')}</p>
                      ) : null}

                      <button
                        type="button"
                        onClick={() => setPanel('account')}
                        className="portal-card-sm flex w-full items-center justify-between portal-surface-muted px-4 py-3 text-left text-sm font-medium portal-heading transition hover:border-primary/25 hover:bg-primary-light/60"
                      >
                        <span>{t('accountMenuRow')}</span>
                        <FiChevronRight className="h-5 w-5 shrink-0 text-slate-400" aria-hidden />
                      </button>
                    </div>

                    <div className="portal-divider mt-6 flex shrink-0 flex-wrap justify-end gap-2 border-t pt-4">
                      <button type="button" onClick={closeEditModal} className="portal-btn-secondary w-full sm:w-auto">
                        {t('cancel')}
                      </button>
                      <button
                        type="submit"
                        disabled={busy}
                        className="portal-btn-primary w-full sm:w-auto disabled:opacity-60"
                      >
                        {busy ? t('savingData') : t('save')}
                      </button>
                    </div>
                  </form>
                </div>

                {/* Account settings panel */}
                <div className="flex w-1/4 shrink-0 flex-col">
                  <div className="portal-border flex shrink-0 flex-wrap items-center gap-2 border-b px-4 py-3 sm:px-6 sm:py-4">
                    <button
                      type="button"
                      onClick={() => setPanel('profile')}
                      className="portal-accent inline-flex shrink-0 items-center gap-1 rounded-lg px-2 py-1.5 text-sm font-medium hover:bg-primary-light"
                    >
                      <FiChevronLeft className="h-4 w-4" aria-hidden />
                      <span className="max-sm:sr-only">{t('accountBackToProfile')}</span>
                    </button>
                    <h2 className="portal-heading min-w-0 flex-1 text-center text-base font-semibold sm:text-lg">
                      {t('accountSettingsTitle')}
                    </h2>
                    <ModalCloseButton onClick={closeEditModal} label={t('close')} className="shrink-0" />
                  </div>

                  <div className="max-h-[min(70dvh,24rem)] min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:max-h-[min(75dvh,26rem)] sm:px-6 sm:py-5">
                    {!canManageAccount ? (
                      <p className="text-sm portal-body">{t('accountDemoNoSettings')}</p>
                    ) : (
                      <div className="space-y-8">
                        <section>
                          <button
                            type="button"
                            disabled={resetBusy}
                            onClick={() => void startForgotPassword()}
                            className="portal-card-sm flex w-full items-center justify-between portal-surface-muted px-4 py-3 text-left text-sm font-medium portal-heading transition hover:border-primary/25 hover:bg-primary-light/60 disabled:opacity-50"
                          >
                            <span>{t('accountForgotPassword')}</span>
                            <FiChevronRight className="h-5 w-5 shrink-0 text-slate-400" aria-hidden />
                          </button>
                        </section>

                        <section className="rounded-xl border border-red-200 bg-red-50/50 p-4">
                          <h3 className="mb-2 text-sm font-semibold text-red-800">{t('accountDeleteAccount')}</h3>
                          <p className="mb-4 text-xs text-red-700/90">{t('accountDeleteWarning')}</p>
                          <label className="mb-3 block space-y-1 text-sm">
                            <span className="text-slate-700">{t('profileCurrentPassword')}</span>
                            <input
                              type="password"
                              value={deletePassword}
                              onChange={(e) => setDeletePassword(e.target.value)}
                              autoComplete="current-password"
                              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2"
                            />
                          </label>
                          <button
                            type="button"
                            disabled={deleteBusy}
                            onClick={() => void submitDeleteAccount()}
                            className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-500 disabled:opacity-60"
                          >
                            {t('accountDeleteConfirmButton')}
                          </button>
                        </section>
                      </div>
                    )}
                  </div>
                </div>

                {/* Forgot password — verification code */}
                <div className="flex w-1/4 shrink-0 flex-col">
                  <div className="portal-border flex shrink-0 flex-wrap items-center gap-2 border-b px-4 py-3 sm:px-6 sm:py-4">
                    <button
                      type="button"
                      onClick={() => {
                        resetForgotFlowState()
                        setPanel('account')
                      }}
                      className="portal-accent inline-flex shrink-0 items-center gap-1 rounded-lg px-2 py-1.5 text-sm font-medium hover:bg-primary-light"
                    >
                      <FiChevronLeft className="h-4 w-4" aria-hidden />
                      <span className="max-sm:sr-only">{t('accountForgotPasswordBack')}</span>
                    </button>
                    <h2 className="portal-heading min-w-0 flex-1 text-center text-base font-semibold sm:text-lg">
                      {t('accountForgotPasswordTitle')}
                    </h2>
                    <ModalCloseButton onClick={closeEditModal} label={t('close')} className="shrink-0" />
                  </div>
                  <form
                    onSubmit={(e) => void submitForgotVerify(e)}
                    className="max-h-[min(70dvh,24rem)] min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:max-h-[min(75dvh,26rem)] sm:px-6 sm:py-5"
                  >
                    <p className="portal-muted text-sm">{t('accountForgotPasswordHint')}</p>
                    {resetSendStatus === 'sent' ? (
                      <div className="mt-3 space-y-1">
                        <p className="text-xs text-emerald-700 dark:text-emerald-300">{t('roleVerificationSent')}</p>
                        {resetSentTo ? (
                          <p className="text-xs portal-muted">
                            {t('roleVerificationSentTo').replace('{email}', resetSentTo)}
                          </p>
                        ) : null}
                      </div>
                    ) : null}
                    {resetCooldownSec > 0 ? (
                      <p className="mt-2 text-xs font-medium text-amber-800 dark:text-amber-200">
                        {t('roleVerificationCooldown').replace(
                          '{time}',
                          formatVerificationCooldownDuration(resetCooldownSec),
                        )}
                      </p>
                    ) : null}
                    {resetError ? (
                      <div className="mt-3 rounded-lg bg-red-50 px-3 py-1.5 text-sm text-red-800 dark:bg-red-950/40 dark:text-red-200" role="alert">
                        {resetError}
                      </div>
                    ) : null}
                    <label className="mt-4 block space-y-1 text-sm">
                      <span className="portal-subheading font-medium">{t('roleVerificationLabel')}</span>
                      <input
                        type="text"
                        inputMode="numeric"
                        autoComplete="one-time-code"
                        maxLength={6}
                        value={resetCode}
                        onChange={(e) => setResetCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                        placeholder="000000"
                        className="portal-input font-mono tracking-widest"
                      />
                    </label>
                    <button
                      type="button"
                      disabled={resetBusy || resetCooldownSec > 0}
                      onClick={() => void resendForgotCode()}
                      className="mt-3 text-xs font-medium text-primary underline-offset-2 hover:underline"
                    >
                      {resetCooldownSec > 0
                        ? t('roleVerificationResendWait').replace(
                            '{time}',
                            formatVerificationCooldownDuration(resetCooldownSec),
                          )
                        : t('roleVerificationResend')}
                    </button>
                    <div className="mt-6">
                      <button
                        type="submit"
                        disabled={resetBusy}
                        className="portal-btn-primary w-full disabled:opacity-60"
                      >
                        {resetBusy ? t('loadingData') : t('accountForgotPasswordNext')}
                      </button>
                    </div>
                  </form>
                </div>

                {/* Forgot password — new password */}
                <div className="flex w-1/4 shrink-0 flex-col">
                  <div className="portal-border flex shrink-0 flex-wrap items-center gap-2 border-b px-4 py-3 sm:px-6 sm:py-4">
                    <button
                      type="button"
                      onClick={() => setPanel('forgot-verify')}
                      className="portal-accent inline-flex shrink-0 items-center gap-1 rounded-lg px-2 py-1.5 text-sm font-medium hover:bg-primary-light"
                    >
                      <FiChevronLeft className="h-4 w-4" aria-hidden />
                      <span className="max-sm:sr-only">{t('accountForgotPasswordBack')}</span>
                    </button>
                    <h2 className="portal-heading min-w-0 flex-1 text-center text-base font-semibold sm:text-lg">
                      {t('profileNewPassword')}
                    </h2>
                    <ModalCloseButton onClick={closeEditModal} label={t('close')} className="shrink-0" />
                  </div>
                  <form
                    onSubmit={(e) => void submitForgotPassword(e)}
                    className="max-h-[min(70dvh,24rem)] min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:max-h-[min(75dvh,26rem)] sm:px-6 sm:py-5"
                  >
                    <div className="space-y-3">
                      <label className="block space-y-1 text-sm">
                        <span className="portal-subheading font-medium">{t('profileNewPassword')}</span>
                        <input
                          type="password"
                          value={forgotNewPassword}
                          onChange={(e) => setForgotNewPassword(e.target.value)}
                          autoComplete="new-password"
                          required
                          minLength={8}
                          className="portal-input"
                        />
                      </label>
                      <label className="block space-y-1 text-sm">
                        <span className="portal-subheading font-medium">{t('profileConfirmPassword')}</span>
                        <input
                          type="password"
                          value={forgotConfirmPassword}
                          onChange={(e) => setForgotConfirmPassword(e.target.value)}
                          autoComplete="new-password"
                          required
                          minLength={8}
                          className="portal-input"
                        />
                      </label>
                    </div>
                    <div className="mt-6">
                      <button
                        type="submit"
                        disabled={forgotPasswordBusy}
                        className="portal-btn-primary w-full disabled:opacity-60"
                      >
                        {forgotPasswordBusy ? t('loadingData') : t('accountChangePassword')}
                      </button>
                    </div>
                  </form>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>,
            document.body,
          )
        : null}
      <RecordPublishSuccessModal
        open={passwordSuccessOpen}
        title={t('accountForgotPasswordSuccess')}
        subtitle={t('accountForgotPasswordSuccessSubtitle')}
        onClose={() => setPasswordSuccessOpen(false)}
      />
    </>
  )
}
