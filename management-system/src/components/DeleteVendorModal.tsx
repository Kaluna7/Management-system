import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { Search, Trash2 } from 'lucide-react'
import type { VendorOption } from '../data/vendors'
import { FormLoadingOverlay } from './FormLoadingOverlay'
import { InputIconWrap } from './InputIconWrap'
import { ModalCloseButton } from './ModalCloseButton'

export type DeleteVendorModalProps = {
  open: boolean
  title: string
  searchPlaceholder: string
  noResults: string
  listCount: string
  deleteLabel: string
  deletingLabel?: string
  closeLabel: string
  confirmMessage: (code: string, name: string) => string
  selectHint: string
  busy?: boolean
  error?: string | null
  vendors: VendorOption[]
  onClose: () => void
  onDelete: (code: string) => void | Promise<void>
}

function matchesQuery(v: VendorOption, q: string) {
  const needle = q.trim().toLowerCase()
  if (!needle) return true
  return v.code.toLowerCase().includes(needle) || v.name.toLowerCase().includes(needle)
}

export function DeleteVendorModal({
  open,
  title,
  searchPlaceholder,
  noResults,
  listCount,
  deleteLabel,
  deletingLabel,
  closeLabel,
  confirmMessage,
  selectHint,
  busy = false,
  error = null,
  vendors,
  onClose,
  onDelete,
}: DeleteVendorModalProps) {
  const [query, setQuery] = useState('')
  const [selectedCode, setSelectedCode] = useState('')

  useEffect(() => {
    if (!open) return
    setQuery('')
    setSelectedCode('')
  }, [open])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !busy) onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, busy, onClose])

  const filtered = useMemo(
    () => vendors.filter((v) => matchesQuery(v, query)),
    [vendors, query],
  )

  const selected = useMemo(
    () => vendors.find((v) => v.code === selectedCode) ?? null,
    [vendors, selectedCode],
  )

  const listCountLabel = listCount.replace('{count}', String(filtered.length))

  if (!open || typeof document === 'undefined') return null

  async function handleDelete() {
    if (!selected) return
    if (!window.confirm(confirmMessage(selected.code, selected.name))) return
    await onDelete(selected.code)
  }

  return createPortal(
    <div
      className="portal-overlay fixed inset-0 z-[210] flex items-center justify-center p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="delete-vendor-title"
      onMouseDown={(ev) => {
        if (ev.target === ev.currentTarget && !busy) onClose()
      }}
    >
      <div
        className="relative portal-modal flex max-h-[min(90vh,32rem)] w-full max-w-md flex-col overflow-hidden p-6"
        onMouseDown={(ev) => ev.stopPropagation()}
      >
        <FormLoadingOverlay active={busy} label={deletingLabel} />
        <div className="mb-4 flex shrink-0 items-start justify-between gap-3">
          <h2 id="delete-vendor-title" className="portal-heading text-lg font-semibold">
            {title}
          </h2>
          <ModalCloseButton onClick={onClose} disabled={busy} label={closeLabel} />
        </div>

        <InputIconWrap icon={Search} className="mb-2 shrink-0">
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={searchPlaceholder}
            disabled={busy || vendors.length === 0}
            className="portal-input pl-9"
            autoComplete="off"
            autoFocus
          />
        </InputIconWrap>

        <p className="portal-muted mb-2 shrink-0 text-xs">{listCountLabel}</p>

        <div className="portal-card-sm min-h-0 flex-1 overflow-y-auto border p-1">
          {filtered.length === 0 ? (
            <p className="px-3 py-4 text-sm portal-muted">{noResults}</p>
          ) : (
            <ul className="divide-y divide-slate-100 dark:divide-slate-800">
              {filtered.map((v) => {
                const active = v.code === selectedCode
                return (
                  <li key={v.code}>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => setSelectedCode(v.code)}
                      className={`w-full px-3 py-2.5 text-left text-sm transition ${
                        active
                          ? 'bg-primary-light font-semibold text-primary'
                          : 'hover:bg-slate-50 dark:hover:bg-slate-800/60'
                      }`}
                    >
                      <span className="font-mono text-xs">{v.code}</span>
                      <span className="mt-0.5 block truncate">{v.name}</span>
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </div>

        {selected ? (
          <p className="portal-body mt-3 shrink-0 text-xs">
            <span className="font-semibold">{selected.code}</span> — {selected.name}
          </p>
        ) : (
          <p className="portal-muted mt-3 shrink-0 text-xs">{selectHint}</p>
        )}

        {error ? (
          <p className="mt-2 shrink-0 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800" role="alert">
            {error}
          </p>
        ) : null}

        <div className="mt-4 flex shrink-0 flex-wrap justify-end gap-2 border-t border-slate-100 pt-4 dark:border-slate-800">
          <button type="button" disabled={busy} onClick={onClose} className="portal-btn-secondary">
            {closeLabel}
          </button>
          <button
            type="button"
            disabled={busy || !selected}
            onClick={() => void handleDelete()}
            className="portal-btn-primary inline-flex items-center gap-1.5 bg-red-600 hover:bg-red-700 disabled:opacity-60"
          >
            <Trash2 className="h-4 w-4" aria-hidden strokeWidth={1.75} />
            {busy ? (deletingLabel ?? deleteLabel) : deleteLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
