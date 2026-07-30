import { useEffect } from 'react'
import { createPortal } from 'react-dom'

export type AlertDialogProps = {
  open: boolean
  message: string
  okLabel: string
  onClose: () => void
  title?: string
}

export function AlertDialog({ open, message, okLabel, onClose, title }: AlertDialogProps) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' || e.key === 'Enter') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  return createPortal(
    <div
      className="portal-overlay fixed inset-0 z-[220] flex items-center justify-center p-4 backdrop-blur-sm"
      role="alertdialog"
      aria-modal="true"
      aria-labelledby={title ? 'alert-dialog-title' : undefined}
      aria-describedby="alert-dialog-message"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div
        className="portal-modal w-full max-w-md p-6"
        onMouseDown={(e) => e.stopPropagation()}
      >
        {title ? (
          <h3 id="alert-dialog-title" className="portal-heading mb-2 text-lg font-semibold">
            {title}
          </h3>
        ) : null}
        <p id="alert-dialog-message" className="portal-body whitespace-pre-wrap text-sm">
          {message}
        </p>
        <div className="mt-5 flex flex-wrap justify-end gap-2">
          <button type="button" onClick={onClose} className="portal-btn-primary" autoFocus>
            {okLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
