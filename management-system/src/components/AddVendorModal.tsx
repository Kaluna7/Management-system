import { useEffect, useState, type FormEvent } from 'react'
import { createPortal } from 'react-dom'
import { ModalCloseButton } from './ModalCloseButton'

export type AddVendorModalProps = {
  open: boolean
  title: string
  codeLabel: string
  nameLabel: string
  saveLabel: string
  closeLabel: string
  busy?: boolean
  error?: string | null
  onClose: () => void
  onSave: (code: string, name: string) => void | Promise<void>
}

export function AddVendorModal({
  open,
  title,
  codeLabel,
  nameLabel,
  saveLabel,
  closeLabel,
  busy = false,
  error = null,
  onClose,
  onSave,
}: AddVendorModalProps) {
  const [code, setCode] = useState('')
  const [name, setName] = useState('')

  useEffect(() => {
    if (!open) return
    setCode('')
    setName('')
  }, [open])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !busy) onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, busy, onClose])

  if (!open || typeof document === 'undefined') return null

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    await onSave(code.trim(), name.trim())
  }

  return createPortal(
    <div
      className="portal-overlay fixed inset-0 z-[210] flex items-center justify-center p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="add-vendor-title"
      onMouseDown={(ev) => {
        if (ev.target === ev.currentTarget && !busy) onClose()
      }}
    >
      <div
        className="portal-modal w-full max-w-md p-6"
        onMouseDown={(ev) => ev.stopPropagation()}
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <h2 id="add-vendor-title" className="portal-heading text-lg font-semibold">
            {title}
          </h2>
          <ModalCloseButton onClick={onClose} disabled={busy} label={closeLabel} />
        </div>
        <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
          <label className="block space-y-1 text-sm">
            <span className="portal-subheading font-medium">{codeLabel}</span>
            <input
              value={code}
              onChange={(e) => setCode(e.target.value)}
              required
              disabled={busy}
              autoFocus
              className="portal-input"
              autoComplete="off"
            />
          </label>
          <label className="block space-y-1 text-sm">
            <span className="portal-subheading font-medium">{nameLabel}</span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              disabled={busy}
              className="portal-input"
              autoComplete="off"
            />
          </label>
          {error ? (
            <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800" role="alert">
              {error}
            </p>
          ) : null}
          <div className="flex flex-wrap justify-end gap-2 pt-1">
            <button type="button" disabled={busy} onClick={onClose} className="portal-btn-secondary">
              {closeLabel}
            </button>
            <button type="submit" disabled={busy} className="portal-btn-primary">
              {saveLabel}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body,
  )
}
