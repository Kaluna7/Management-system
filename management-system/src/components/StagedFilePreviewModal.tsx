import { useEffect, useId, useState } from 'react'
import { ModalCloseButton } from './ModalCloseButton'

const PREVIEWABLE_IMAGE = /^image\//i
const PREVIEWABLE_PDF = /^application\/pdf$/i

export type StagedFilePreviewLabels = {
  confirmFile: string
  cancelPick: string
  previewUnavailable: string
  queueProgress?: string
}

type Accent = 'violet' | 'emerald'

type Props = {
  open: boolean
  file: File | null
  queuePosition?: { current: number; total: number }
  labels: StagedFilePreviewLabels
  portalUI?: boolean
  accent?: Accent
  viewOnly?: boolean
  closeLabel?: string
  onConfirm: () => void
  onCancel: () => void
}

function isPdfFile(f: File) {
  return PREVIEWABLE_PDF.test(f.type) || f.name.toLowerCase().endsWith('.pdf')
}

function isImageFile(f: File) {
  return PREVIEWABLE_IMAGE.test(f.type) || /\.(jpe?g|png|webp|gif)$/i.test(f.name)
}

export function StagedFilePreviewModal({
  open,
  file,
  queuePosition,
  labels,
  portalUI = false,
  accent = 'violet',
  viewOnly = false,
  closeLabel,
  onConfirm,
  onCancel,
}: Props) {
  const titleId = useId()
  const [objectUrl, setObjectUrl] = useState<string | null>(null)

  useEffect(() => {
    if (!open || !file) {
      setObjectUrl(null)
      return
    }
    const url = URL.createObjectURL(file)
    setObjectUrl(url)
    return () => URL.revokeObjectURL(url)
  }, [open, file])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel()
    }
    document.body.style.overflow = 'hidden'
    window.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = ''
      window.removeEventListener('keydown', onKey)
    }
  }, [open, onCancel])

  if (!open || !file || typeof document === 'undefined') return null

  const canPreview = isPdfFile(file) || isImageFile(file)
  const confirmClass =
    accent === 'emerald'
      ? portalUI
        ? 'portal-btn-primary'
        : 'rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700'
      : portalUI
        ? 'portal-btn-primary'
        : 'rounded-lg bg-violet-600 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-700'

  const progressLabel =
    queuePosition && labels.queueProgress
      ? labels.queueProgress
          .replace('{current}', String(queuePosition.current))
          .replace('{total}', String(queuePosition.total))
      : null

  return (
    <div
      className={`fixed inset-0 flex items-center justify-center p-4 backdrop-blur-sm ${portalUI ? 'portal-overlay z-[200]' : 'z-[200] bg-slate-900/50'}`}
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onCancel()
      }}
    >
      <div
        className={
          portalUI
            ? 'portal-modal flex max-h-[92vh] w-full max-w-3xl flex-col overflow-hidden'
            : 'flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl'
        }
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div
          className={
            portalUI
              ? 'portal-divider flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3'
              : 'flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-4 py-3'
          }
        >
          <div className="min-w-0">
            <p
              id={titleId}
              className={
                portalUI
                  ? 'portal-heading truncate text-sm font-semibold'
                  : 'truncate text-sm font-semibold text-slate-900'
              }
            >
              {file.name}
            </p>
            {progressLabel ? (
              <p className={portalUI ? 'portal-muted mt-0.5 text-xs' : 'mt-0.5 text-xs text-slate-500'}>
                {progressLabel}
              </p>
            ) : null}
          </div>
          <ModalCloseButton onClick={onCancel} label={closeLabel ?? labels.cancelPick} />
        </div>
        <div
          className={
            portalUI
              ? 'min-h-0 flex-1 overflow-auto bg-slate-100 p-4 dark:bg-slate-900/40'
              : 'min-h-0 flex-1 overflow-auto bg-slate-100 p-4'
          }
        >
          {canPreview && objectUrl ? (
            isPdfFile(file) ? (
              <iframe
                title={file.name}
                src={objectUrl}
                className="h-[min(65vh,680px)] w-full rounded-lg bg-white"
              />
            ) : (
              <img
                src={objectUrl}
                alt={file.name}
                className="mx-auto max-h-[min(65vh,680px)] max-w-full rounded-lg object-contain"
              />
            )
          ) : (
            <p className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
              {labels.previewUnavailable}
            </p>
          )}
        </div>
        {viewOnly ? null : (
        <div
          className={
            portalUI
              ? 'portal-divider flex flex-wrap justify-end gap-2 border-t px-4 py-3'
              : 'flex flex-wrap justify-end gap-2 border-t border-slate-200 px-4 py-3'
          }
        >
              <button
                type="button"
                onClick={onCancel}
                className={portalUI ? 'portal-btn-secondary' : 'rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50'}
              >
                {labels.cancelPick}
              </button>
              <button type="button" onClick={onConfirm} className={confirmClass}>
                {labels.confirmFile}
              </button>
        </div>
        )}
      </div>
    </div>
  )
}
