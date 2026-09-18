import { useEffect } from 'react'
import { createPortal } from 'react-dom'

export type AlertDialogProps = {
  open: boolean
  message: string
  okLabel: string
  onClose: () => void
  title?: string
  /** Visual tone — danger shows a red warning style. */
  tone?: 'default' | 'danger'
}

export function AlertDialog({
  open,
  message,
  okLabel,
  onClose,
  title,
  tone = 'default',
}: AlertDialogProps) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' || e.key === 'Enter') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  const isDanger = tone === 'danger'

  return createPortal(
    <div
      className="portal-overlay fixed inset-0 z-[400] flex items-center justify-center p-4 backdrop-blur-sm"
      role="alertdialog"
      aria-modal="true"
      aria-labelledby={title ? 'alert-dialog-title' : undefined}
      aria-describedby="alert-dialog-message"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div
        className={`portal-modal w-full max-w-md overflow-hidden p-0 ${
          isDanger ? 'border border-red-300 shadow-lg shadow-red-900/10' : ''
        }`}
        onMouseDown={(e) => e.stopPropagation()}
      >
        {isDanger ? (
          <div className="border-b border-red-200 bg-red-50 px-6 py-3 dark:border-red-500/30 dark:bg-red-950/40">
            <p className="text-xs font-semibold uppercase tracking-wide text-red-700 dark:text-red-300">
              {title ?? 'Warning'}
            </p>
          </div>
        ) : title ? (
          <div className="px-6 pt-6">
            <h3 id="alert-dialog-title" className="portal-heading text-lg font-semibold">
              {title}
            </h3>
          </div>
        ) : null}
        <div className="px-6 py-5">
          {isDanger && title ? (
            <h3 id="alert-dialog-title" className="mb-2 text-base font-semibold text-red-800 dark:text-red-200">
              {title}
            </h3>
          ) : null}
          <p
            id="alert-dialog-message"
            className={`whitespace-pre-wrap text-sm ${
              isDanger ? 'text-red-900/90 dark:text-red-100/90' : 'portal-body'
            }`}
          >
            {message}
          </p>
          <div className="mt-5 flex flex-wrap justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className={
                isDanger
                  ? 'rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-red-700'
                  : 'portal-btn-primary'
              }
              autoFocus
            >
              {okLabel}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  )
}
