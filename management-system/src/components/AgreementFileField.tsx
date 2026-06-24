import { useCallback, useEffect, useId, useState } from 'react'
import { ModalCloseButton } from './ModalCloseButton'

const PREVIEWABLE_IMAGE = /^image\//i
const PREVIEWABLE_PDF = /^application\/pdf$/i

export type AgreementFileFieldProps = {
  file: File | null
  onFileChange: (file: File | null) => void
  /** Saved file on server (edit mode). Shown when no new `file` is picked. */
  existingFileName?: string | null
  /** Preview/download URL for the saved file. */
  existingPreviewUrl?: string | null
  /** Called after user confirms delete of the saved file (enables new upload). */
  onDeleteExisting?: () => void
  labels: {
    choose: string
    selected: string
    preview: string
    closePreview: string
    remove: string
    previewUnavailable: string
    hint: string
    confirmFile: string
    cancelPick: string
    invalidFile?: string
    currentFile?: string
    replaceHint?: string
    deleteExisting?: string
    deleteExistingConfirm?: string
    uploadAfterDelete?: string
  }
  required?: boolean
  pdfOnly?: boolean
  portalUI?: boolean
}

function isPdfFile(f: File) {
  return f.type === 'application/pdf' || f.name.toLowerCase().endsWith('.pdf')
}

function isPdfName(name: string) {
  return name.toLowerCase().endsWith('.pdf')
}

export function AgreementFileField({
  file,
  onFileChange,
  existingFileName,
  existingPreviewUrl,
  onDeleteExisting,
  labels,
  required,
  pdfOnly = false,
  portalUI = false,
}: AgreementFileFieldProps) {
  const inputId = useId()
  const [previewOpen, setPreviewOpen] = useState(false)
  const [stagingFile, setStagingFile] = useState<File | null>(null)
  const [existingPreviewOpen, setExistingPreviewOpen] = useState(false)
  const [objectUrl, setObjectUrl] = useState<string | null>(null)

  const savedName = existingFileName?.trim() || ''
  const hasSavedFile = Boolean(savedName && !file)
  const previewTarget = previewOpen ? stagingFile : null

  useEffect(() => {
    if (!previewTarget) {
      setObjectUrl(null)
      return
    }
    const url = URL.createObjectURL(previewTarget)
    setObjectUrl(url)
    return () => URL.revokeObjectURL(url)
  }, [previewTarget])

  const canPreviewLocal =
    previewTarget != null &&
    (PREVIEWABLE_IMAGE.test(previewTarget.type) || PREVIEWABLE_PDF.test(previewTarget.type))

  const canPreviewExisting =
    hasSavedFile && Boolean(existingPreviewUrl) && (pdfOnly ? isPdfName(savedName) : true)

  const openStagingPreview = useCallback((picked: File) => {
    setStagingFile(picked)
    setPreviewOpen(true)
  }, [])

  const confirmStaging = useCallback(() => {
    if (stagingFile) onFileChange(stagingFile)
    setStagingFile(null)
    setPreviewOpen(false)
  }, [stagingFile, onFileChange])

  const cancelStaging = useCallback(() => {
    setStagingFile(null)
    setPreviewOpen(false)
  }, [])

  const closeExistingPreview = useCallback(() => {
    setExistingPreviewOpen(false)
  }, [])

  useEffect(() => {
    if (!previewOpen && !existingPreviewOpen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (previewOpen) cancelStaging()
        if (existingPreviewOpen) closeExistingPreview()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [previewOpen, existingPreviewOpen, cancelStaging, closeExistingPreview])

  const onInputChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const picked = event.target.files?.[0] ?? null
      event.target.value = ''
      if (!picked) return
      if (pdfOnly && !isPdfFile(picked)) {
        if (labels.invalidFile) window.alert(labels.invalidFile)
        return
      }
      openStagingPreview(picked)
    },
    [openStagingPreview, pdfOnly, labels.invalidFile],
  )

  const labelClass = portalUI ? 'portal-subheading block font-medium' : 'block font-medium text-slate-700'
  const inputClass = portalUI
    ? 'portal-input-file w-full'
    : 'w-full rounded-lg border border-slate-300 px-3 py-2 text-sm file:mr-3 file:rounded-md file:border-0 file:bg-violet-50 file:px-3 file:py-1.5 file:font-medium file:text-violet-700'
  const hintClass = portalUI ? 'portal-muted text-xs' : 'text-xs text-slate-500'
  const selectedBoxClass = portalUI
    ? 'portal-card-sm flex flex-wrap items-center gap-2 rounded-lg border px-3 py-2'
    : 'flex flex-wrap items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50/80 px-3 py-2'
  const overlayClass = portalUI ? 'portal-overlay z-[200]' : 'z-[130] bg-slate-900/50'
  const modalClass = portalUI
    ? 'portal-modal flex max-h-[92vh] w-full max-w-3xl flex-col overflow-hidden'
    : 'flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl'

  const fileRequired = Boolean(required && !file && !hasSavedFile)

  const handleDeleteExisting = useCallback(() => {
    if (!onDeleteExisting) return
    if (labels.deleteExistingConfirm && !window.confirm(labels.deleteExistingConfirm)) return
    closeExistingPreview()
    onDeleteExisting()
  }, [onDeleteExisting, labels.deleteExistingConfirm, closeExistingPreview])

  return (
    <div className={`space-y-2 text-sm ${portalUI ? 'md:col-span-2' : ''}`}>
      <label htmlFor={inputId} className={labelClass}>
        {labels.choose}
      </label>
      {!hasSavedFile ? (
        <input
          id={inputId}
          type="file"
          accept={pdfOnly ? '.pdf,application/pdf' : '.pdf,application/pdf,image/jpeg,image/png,image/webp'}
          required={fileRequired}
          onChange={onInputChange}
          className={inputClass}
        />
      ) : null}
      <p className={hintClass}>
        {hasSavedFile
          ? (labels.replaceHint ?? labels.hint)
          : fileRequired && labels.uploadAfterDelete
            ? labels.uploadAfterDelete
            : labels.hint}
      </p>

      {hasSavedFile ? (
        <div className={selectedBoxClass}>
          <span className="min-w-0 flex-1 truncate text-xs font-medium text-emerald-900 dark:text-emerald-100">
            {labels.currentFile ?? labels.selected} {savedName}
          </span>
          {canPreviewExisting ? (
            <button
              type="button"
              onClick={() => setExistingPreviewOpen(true)}
              className="rounded-md border border-violet-200 bg-white px-2.5 py-1 text-xs font-semibold text-violet-700 hover:bg-violet-50 dark:border-violet-500/40 dark:bg-slate-900 dark:text-violet-200 dark:hover:bg-violet-950/40"
            >
              {labels.preview}
            </button>
          ) : null}
          {onDeleteExisting ? (
            <button
              type="button"
              onClick={handleDeleteExisting}
              className="rounded-md border border-red-200 bg-white px-2.5 py-1 text-xs font-semibold text-red-700 hover:bg-red-50 dark:border-red-500/40 dark:bg-slate-900 dark:text-red-300 dark:hover:bg-red-950/40"
            >
              {labels.deleteExisting ?? labels.remove}
            </button>
          ) : null}
        </div>
      ) : null}

      {file ? (
        <div className={selectedBoxClass}>
          <span className="min-w-0 flex-1 truncate text-xs font-medium text-emerald-900 dark:text-emerald-100">
            {labels.selected} {file.name}
          </span>
          {PREVIEWABLE_IMAGE.test(file.type) || PREVIEWABLE_PDF.test(file.type) ? (
            <button
              type="button"
              onClick={() => openStagingPreview(file)}
              className="rounded-md border border-violet-200 bg-white px-2.5 py-1 text-xs font-semibold text-violet-700 hover:bg-violet-50 dark:border-violet-500/40 dark:bg-slate-900 dark:text-violet-200 dark:hover:bg-violet-950/40"
            >
              {labels.preview}
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => {
              onFileChange(null)
              cancelStaging()
            }}
            className="rounded-md border border-slate-300 bg-white px-2.5 py-1 text-xs font-medium text-slate-600 hover:bg-slate-100 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            {labels.remove}
          </button>
        </div>
      ) : null}

      {previewOpen && stagingFile ? (
        <div
          className={`fixed inset-0 flex items-center justify-center p-4 backdrop-blur-sm ${overlayClass}`}
          role="dialog"
          aria-modal="true"
          aria-labelledby={`${inputId}-preview-title`}
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) cancelStaging()
          }}
        >
          <div className={modalClass} onMouseDown={(e) => e.stopPropagation()}>
            <div
              className={
                portalUI
                  ? 'portal-divider flex items-center justify-between gap-3 border-b px-4 py-3'
                  : 'flex items-center justify-between gap-3 border-b border-slate-200 px-4 py-3'
              }
            >
              <p
                id={`${inputId}-preview-title`}
                className={
                  portalUI
                    ? 'portal-heading truncate text-sm font-semibold'
                    : 'truncate text-sm font-semibold text-slate-900'
                }
              >
                {stagingFile.name}
              </p>
              <ModalCloseButton onClick={cancelStaging} label={labels.cancelPick} />
            </div>
            <div
              className={
                portalUI
                  ? 'min-h-0 flex-1 overflow-auto bg-slate-100 p-4 dark:bg-slate-900/40'
                  : 'min-h-0 flex-1 overflow-auto bg-slate-100 p-4'
              }
            >
              {canPreviewLocal && objectUrl ? (
                PREVIEWABLE_PDF.test(stagingFile.type) ? (
                  <iframe
                    title={stagingFile.name}
                    src={objectUrl}
                    className="h-[min(65vh,680px)] w-full rounded-lg bg-white"
                  />
                ) : (
                  <img
                    src={objectUrl}
                    alt={stagingFile.name}
                    className="mx-auto max-h-[min(65vh,680px)] max-w-full rounded-lg object-contain"
                  />
                )
              ) : (
                <p className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                  {labels.previewUnavailable}
                </p>
              )}
            </div>
            <div
              className={
                portalUI
                  ? 'portal-divider flex flex-wrap justify-end gap-2 border-t px-4 py-3'
                  : 'flex flex-wrap justify-end gap-2 border-t border-slate-200 px-4 py-3'
              }
            >
              <button
                type="button"
                onClick={cancelStaging}
                className={portalUI ? 'portal-btn-secondary' : 'rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50'}
              >
                {labels.cancelPick}
              </button>
              <button
                type="button"
                onClick={confirmStaging}
                className={portalUI ? 'portal-btn-primary' : 'rounded-lg bg-violet-600 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-700'}
              >
                {labels.confirmFile}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {existingPreviewOpen && existingPreviewUrl && hasSavedFile ? (
        <div
          className={`fixed inset-0 flex items-center justify-center p-4 backdrop-blur-sm ${overlayClass}`}
          role="dialog"
          aria-modal="true"
          aria-labelledby={`${inputId}-existing-preview-title`}
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) closeExistingPreview()
          }}
        >
          <div className={modalClass} onMouseDown={(e) => e.stopPropagation()}>
            <div
              className={
                portalUI
                  ? 'portal-divider flex items-center justify-between gap-3 border-b px-4 py-3'
                  : 'flex items-center justify-between gap-3 border-b border-slate-200 px-4 py-3'
              }
            >
              <p
                id={`${inputId}-existing-preview-title`}
                className={
                  portalUI
                    ? 'portal-heading truncate text-sm font-semibold'
                    : 'truncate text-sm font-semibold text-slate-900'
                }
              >
                {savedName}
              </p>
              <ModalCloseButton onClick={closeExistingPreview} label={labels.closePreview} />
            </div>
            <div
              className={
                portalUI
                  ? 'min-h-0 flex-1 overflow-auto bg-slate-100 p-4 dark:bg-slate-900/40'
                  : 'min-h-0 flex-1 overflow-auto bg-slate-100 p-4'
              }
            >
              {isPdfName(savedName) ? (
                <iframe
                  title={savedName}
                  src={existingPreviewUrl}
                  className="h-[min(65vh,680px)] w-full rounded-lg bg-white"
                />
              ) : (
                <img
                  src={existingPreviewUrl}
                  alt={savedName}
                  className="mx-auto max-h-[min(65vh,680px)] max-w-full rounded-lg object-contain"
                />
              )}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
