import { useEffect } from 'react'
import { createPortal } from 'react-dom'
import { ModalCloseButton } from './ModalCloseButton'
import { agreementFileNamesFromRecord } from '../utils/agreementFiles'
import { formulaFormFileNamesFromInvoice } from '../utils/formulaFormFiles'

export type RecordFileKind = 'agreement' | 'formula-form' | 'stamped-paper'

export type RecordDocumentItem = {
  kind: RecordFileKind
  fileName: string
  fileIndex?: number
}

type Props = {
  open: boolean
  fileName: string
  previewUrl: string
  closeLabel: string
  previewUnavailableLabel: string
  onClose: () => void
}

function isPdfName(name: string) {
  return name.toLowerCase().endsWith('.pdf')
}

function isImageName(name: string) {
  return /\.(jpe?g|png|webp|gif)$/i.test(name)
}

export function RecordDocumentPreviewModal({
  open,
  fileName,
  previewUrl,
  closeLabel,
  previewUnavailableLabel,
  onClose,
}: Props) {
  const canPreview = isPdfName(fileName) || isImageName(fileName)

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.body.style.overflow = 'hidden'
    window.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = ''
      window.removeEventListener('keydown', onKey)
    }
  }, [open, onClose])

  if (!open || typeof document === 'undefined') return null

  return createPortal(
    <div
      className="portal-overlay fixed inset-0 z-[130] flex items-center justify-center p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="record-doc-preview-title"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div
        className="portal-modal flex max-h-[92vh] w-full max-w-3xl flex-col overflow-hidden"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="portal-divider flex items-center justify-between gap-3 border-b px-4 py-3">
          <p id="record-doc-preview-title" className="portal-heading min-w-0 truncate text-sm font-semibold">
            {fileName}
          </p>
          <ModalCloseButton onClick={onClose} label={closeLabel} />
        </div>
        <div className="min-h-0 flex-1 overflow-auto bg-slate-100 p-4 dark:bg-slate-900/40">
          {canPreview ? (
            isPdfName(fileName) ? (
              <iframe
                title={fileName}
                src={previewUrl}
                className="h-[min(65vh,680px)] w-full rounded-lg bg-white"
              />
            ) : (
              <img
                src={previewUrl}
                alt={fileName}
                className="mx-auto max-h-[min(65vh,680px)] max-w-full rounded-lg object-contain"
              />
            )
          ) : (
            <p className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-600/40 dark:bg-amber-950/30 dark:text-amber-100">
              {previewUnavailableLabel}
            </p>
          )}
        </div>
      </div>
    </div>,
    document.body,
  )
}

export function listRecordDocuments(record: {
  agreementFileName?: string
  agreementFileNames?: string[]
  stampedPaperFileName?: string
  invoice?: { formulaFormFileName?: string; formulaFormFileNames?: string[] } | null
}): RecordDocumentItem[] {
  const items: RecordDocumentItem[] = []
  agreementFileNamesFromRecord(record).forEach((fileName, fileIndex) => {
    items.push({ kind: 'agreement', fileName, fileIndex })
  })
  const formulas = formulaFormFileNamesFromInvoice(
    record.invoice as import('../types/workflow').InvoiceData | null | undefined,
  )
  formulas.forEach((fileName, fileIndex) => {
    items.push({ kind: 'formula-form', fileName, fileIndex })
  })
  const stamped = record.stampedPaperFileName?.trim()
  if (stamped) items.push({ kind: 'stamped-paper', fileName: stamped })
  return items
}
