import { CartoonPresetAvatar } from './CartoonPresetAvatar'

type Props = {
  processingLabel: string
  userName: string
  avatarPreset?: string | null
  title?: string
}

/** Top-right “Processing” + bottom-right profile avatar when another finance user is on this record. */
export function RecordWorkingOverlay({ processingLabel, userName, avatarPreset, title }: Props) {
  const initial = userName.trim().charAt(0).toUpperCase() || '?'
  const displayName = userName.trim() || 'User'

  return (
    <>
      <div
        className="pointer-events-none absolute inset-0 z-[5] rounded-xl bg-white/55 dark:bg-slate-950/45"
        aria-hidden
      />
      <span
        className="pointer-events-none absolute right-3 top-3 z-10 rounded-full bg-emerald-600 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-white shadow-sm dark:bg-emerald-500"
      >
        {processingLabel}
      </span>
      <div className="absolute bottom-3 right-3 z-30 group">
        <div className="relative flex items-center">
          <div
            className="pointer-events-none absolute right-full top-1/2 z-40 mr-2.5 -translate-y-1/2 whitespace-nowrap rounded-lg bg-slate-900 px-2.5 py-1.5 text-xs font-semibold text-white opacity-0 shadow-lg transition-opacity duration-150 group-hover:opacity-100 dark:bg-emerald-950"
            role="tooltip"
          >
            {displayName}
            <span
              className="absolute left-full top-1/2 -translate-y-1/2 border-4 border-transparent border-l-slate-900 dark:border-l-emerald-950"
              aria-hidden
            />
          </div>
          {avatarPreset ? (
            <CartoonPresetAvatar
              presetId={avatarPreset}
              size="sm"
              className="ring-2 ring-white shadow-md transition-transform group-hover:scale-105 dark:ring-slate-800"
              title={title ?? displayName}
            />
          ) : (
            <span
              className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-emerald-600 text-xs font-bold text-white shadow-md ring-2 ring-white transition-transform group-hover:scale-105 dark:ring-slate-800"
              title={title ?? displayName}
            >
              {initial}
            </span>
          )}
        </div>
      </div>
    </>
  )
}
