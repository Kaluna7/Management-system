import { CartoonPresetAvatar } from './CartoonPresetAvatar'

type Props = {
  processingLabel: string
  userName: string
  avatarPreset?: string | null
  title?: string
  /** Full-bleed overlay (cards) vs compact chip for table rows. */
  variant?: 'overlay' | 'inline'
}

/** Presence indicator when another user is working on this record. */
export function RecordWorkingOverlay({
  processingLabel,
  userName,
  avatarPreset,
  title,
  variant = 'overlay',
}: Props) {
  const initial = userName.trim().charAt(0).toUpperCase() || '?'
  const displayName = userName.trim() || 'User'
  const tip = title ?? displayName

  const avatar = avatarPreset ? (
    <CartoonPresetAvatar
      presetId={avatarPreset}
      size="sm"
      className="ring-2 ring-white shadow-md dark:ring-slate-800"
      title={tip}
    />
  ) : (
    <span
      className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-emerald-600 text-[11px] font-semibold text-white shadow-md ring-2 ring-white dark:ring-slate-800"
      title={tip}
    >
      {initial}
    </span>
  )

  if (variant === 'inline') {
    return (
      <div className="flex min-w-0 flex-wrap items-center justify-end gap-2" title={tip}>
        <span className="inline-flex shrink-0 rounded-full bg-emerald-600 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-white shadow-sm">
          {processingLabel}
        </span>
        <div className="group relative shrink-0">
          <div
            className="pointer-events-none absolute right-full top-1/2 z-40 mr-2 -translate-y-1/2 whitespace-nowrap rounded-lg bg-slate-900 px-2.5 py-1.5 text-xs font-medium text-white opacity-0 shadow-lg transition-opacity group-hover:opacity-100"
            role="tooltip"
          >
            {displayName}
          </div>
          {avatar}
        </div>
      </div>
    )
  }

  return (
    <>
      <div
        className="pointer-events-none absolute inset-0 z-[5] rounded-xl bg-white/55 dark:bg-slate-950/45"
        aria-hidden
      />
      <span className="pointer-events-none absolute right-2 top-2 z-10 rounded-full bg-emerald-600 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white shadow-sm sm:right-3 sm:top-3 sm:px-2.5 sm:py-1">
        {processingLabel}
      </span>
      <div className="absolute bottom-2 right-2 z-30 group sm:bottom-3 sm:right-3">
        <div className="relative flex items-center">
          <div
            className="pointer-events-none absolute right-full top-1/2 z-40 mr-2.5 -translate-y-1/2 whitespace-nowrap rounded-lg bg-slate-900 px-2.5 py-1.5 text-xs font-medium text-white opacity-0 shadow-lg transition-opacity duration-150 group-hover:opacity-100"
            role="tooltip"
          >
            {displayName}
            <span
              className="absolute left-full top-1/2 -translate-y-1/2 border-4 border-transparent border-l-slate-900"
              aria-hidden
            />
          </div>
          {avatar}
        </div>
      </div>
    </>
  )
}
