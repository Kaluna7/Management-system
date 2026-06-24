import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { ModalCloseButton } from './ModalCloseButton'

const PREVIEWABLE_IMAGE = /^image\//i
const PREVIEWABLE_PDF = /^application\/pdf$/i

export type StampedPaperUploadButtonLabels = {
  pickFile: string
  viewStamped: string
  close: string
  confirmUpload: string
  publish: string
  previewUnavailable: string
  uploading: string
  publishing: string
}

type Props = {
  recordId: string
  onConfirm: (recordId: string, file: File) => void | Promise<void>
  onPublish?: (recordId: string) => void | Promise<void>
  labels: StampedPaperUploadButtonLabels
  disabled?: boolean
  buttonClassName?: string
  icon?: ReactNode
  /** Server file already uploaded — button opens view with Publish / Close. */
  stampUploaded?: boolean
  uploadedFileName?: string
  serverPreviewUrl?: string
}

function isPdfName(name: string) {
  return name.toLowerCase().endsWith('.pdf')
}

function isImageName(name: string) {
  return /\.(jpe?g|png|webp|gif)$/i.test(name)
}

export function StampedPaperUploadButton({
  recordId,
  onConfirm,
  onPublish,
  labels,
  disabled = false,
  buttonClassName = 'portal-btn-primary inline-flex items-center gap-2 px-4 py-2.5',
  icon = null,
  stampUploaded = false,
  uploadedFileName = '',
  serverPreviewUrl,
}: Props) {
  const inputId = useId()
  const inputRef = useRef<HTMLInputElement>(null)
  const [stagingFile, setStagingFile] = useState<File | null>(null)
  const [previewOpen, setPreviewOpen] = useState(false)
  const [objectUrl, setObjectUrl] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const previewSource = stagingFile
  const serverPreview = stampUploaded && !stagingFile ? serverPreviewUrl : null
  const displayName = stagingFile?.name ?? uploadedFileName

  useEffect(() => {
    if (!previewOpen || !previewSource) {
      if (!serverPreview) setObjectUrl(null)
      return
    }
    const url = URL.createObjectURL(previewSource)
    setObjectUrl(url)
    return () => URL.revokeObjectURL(url)
  }, [previewOpen, previewSource, serverPreview])

  const canPreviewLocal =
    previewSource != null &&
    (PREVIEWABLE_IMAGE.test(previewSource.type) || PREVIEWABLE_PDF.test(previewSource.type))

  const canPreviewServer =
    Boolean(serverPreview) && (isPdfName(uploadedFileName) || isImageName(uploadedFileName))

  const closePreview = useCallback(() => {
    setStagingFile(null)
    setPreviewOpen(false)
  }, [])

  const openView = useCallback(() => {
    setPreviewOpen(true)
  }, [])

  useEffect(() => {
    if (!previewOpen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !busy) closePreview()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [previewOpen, closePreview, busy])

  const onInputChange = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const picked = event.target.files?.[0] ?? null
    event.target.value = ''
    if (!picked) return
    setStagingFile(picked)
    setPreviewOpen(true)
  }, [])

  const confirmPublish = useCallback(async () => {
    if (busy) return
    if (!stagingFile && !stampUploaded) return
    if (!stagingFile && !onPublish) return
    setBusy(true)
    try {
      if (stagingFile) {
        await onConfirm(recordId, stagingFile)
        setStagingFile(null)
      }
      if (onPublish) {
        await onPublish(recordId)
      }
      closePreview()
    } catch {
      /* keep modal open on failure */
    } finally {
      setBusy(false)
    }
  }, [busy, stagingFile, stampUploaded, onPublish, onConfirm, recordId, closePreview])

  const modal =
    previewOpen &&
    createPortal(
      <div
        className="portal-overlay fixed inset-0 z-[200] flex items-center justify-center p-4 backdrop-blur-sm"
        role="dialog"
        aria-modal="true"
        aria-labelledby={`${inputId}-preview-title`}
        onMouseDown={(e) => {
          if (e.target === e.currentTarget && !busy) closePreview()
        }}
      >
        <div
          className="portal-modal flex max-h-[92vh] w-full max-w-3xl flex-col overflow-hidden"
          onMouseDown={(e) => e.stopPropagation()}
        >
          <div className="portal-divider flex items-center justify-between gap-3 border-b px-4 py-3">
            <p id={`${inputId}-preview-title`} className="portal-heading truncate text-sm font-semibold">
              {displayName}
            </p>
            <ModalCloseButton onClick={closePreview} disabled={busy} label={labels.close} />
          </div>
          <div className="min-h-0 flex-1 overflow-auto bg-slate-100 p-4 dark:bg-slate-900/40">
            {canPreviewLocal && objectUrl ? (
              PREVIEWABLE_PDF.test(previewSource!.type) || isPdfName(previewSource!.name) ? (
                <iframe
                  title={displayName}
                  src={objectUrl}
                  className="h-[min(65vh,680px)] w-full rounded-lg bg-white"
                />
              ) : (
                <img
                  src={objectUrl}
                  alt={displayName}
                  className="mx-auto max-h-[min(65vh,680px)] max-w-full rounded-lg object-contain"
                />
              )
            ) : serverPreview && canPreviewServer ? (
              isPdfName(uploadedFileName) ? (
                <iframe
                  title={displayName}
                  src={serverPreview}
                  className="h-[min(65vh,680px)] w-full rounded-lg bg-white"
                />
              ) : (
                <img
                  src={serverPreview}
                  alt={displayName}
                  className="mx-auto max-h-[min(65vh,680px)] max-w-full rounded-lg object-contain"
                />
              )
            ) : (
              <p className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-600/40 dark:bg-amber-950/30 dark:text-amber-100">
                {labels.previewUnavailable}
              </p>
            )}
          </div>
          <div className="portal-divider flex flex-wrap justify-end gap-2 border-t px-4 py-3">
            <button
              type="button"
              disabled={busy || (!stagingFile && !stampUploaded) || (!stagingFile && !onPublish)}
              onClick={() => void confirmPublish()}
              className="portal-btn-primary disabled:opacity-60"
            >
              {busy ? labels.publishing : labels.publish}
            </button>
          </div>
        </div>
      </div>,
      document.body,
    )

  const triggerLabel = stampUploaded ? labels.viewStamped : labels.pickFile

  return (
    <>
      {!stampUploaded ? (
        <input
          id={inputId}
          ref={inputRef}
          type="file"
          className="sr-only"
          accept=".pdf,application/pdf,image/jpeg,image/png,image/webp"
          disabled={disabled || busy}
          onChange={onInputChange}
        />
      ) : null}
      <button
        type="button"
        disabled={disabled || busy}
        onClick={() => {
          if (stampUploaded) openView()
          else inputRef.current?.click()
        }}
        className={buttonClassName}
      >
        {icon}
        {triggerLabel}
      </button>
      {modal}
    </>
  )
}
