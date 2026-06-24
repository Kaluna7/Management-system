import { useCallback, useId, useState } from 'react'
import { Eye, Trash2, X } from 'lucide-react'
import { FORMULA_FORM_MAX } from '../utils/formulaFormFiles'
import { StagedFilePreviewModal } from './StagedFilePreviewModal'

export type FormulaExistingFile = {
  originalIndex: number
  name: string
  previewUrl?: string | null
}

export type FormulaFormFilesFieldLabels = {
  choose: string
  hint: string
  maxHint: string
  count: string
  selected: string
  currentFile: string
  remove: string
  preview: string
  confirmFile: string
  cancelPick: string
  previewUnavailable: string
  queueProgress?: string
  invalidFile: string
  deleteExisting: string
  deleteExistingConfirm: string
  close: string
}

type Props = {
  files: File[]
  onFilesChange: (files: File[]) => void
  existingFiles: FormulaExistingFile[]
  onRemoveExisting: (originalIndex: number) => void
  labels: FormulaFormFilesFieldLabels
  maxFiles?: number
  required?: boolean
  portalUI?: boolean
  onPreviewExisting?: (url: string, name: string) => void
}

function isPdfFile(f: File) {
  return f.type === 'application/pdf' || f.name.toLowerCase().endsWith('.pdf')
}

export function FormulaFormFilesField({
  files,
  onFilesChange,
  existingFiles,
  onRemoveExisting,
  labels,
  maxFiles = FORMULA_FORM_MAX,
  required,
  portalUI = false,
  onPreviewExisting,
}: Props) {
  const inputId = useId()
  const [stagingQueue, setStagingQueue] = useState<File[]>([])
  const [stagingIndex, setStagingIndex] = useState(0)
  const [reviewFile, setReviewFile] = useState<File | null>(null)

  const totalCount = existingFiles.length + files.length
  const canAddMore = totalCount < maxFiles
  const fileRequired = Boolean(required && totalCount === 0)
  const stagingFile = stagingQueue[stagingIndex] ?? null
  const previewOpen = stagingFile != null
  const reviewOpen = reviewFile != null

  const labelClass = portalUI ? 'portal-subheading block font-medium' : 'block font-medium text-slate-700'
  const inputClass = portalUI ? 'portal-input-file w-full' : 'w-full rounded-lg border border-slate-300 px-3 py-2 text-sm'
  const hintClass = portalUI ? 'portal-muted text-xs' : 'text-xs text-slate-500'
  const rowClass = portalUI
    ? 'portal-card-sm flex flex-wrap items-center gap-2 rounded-lg border px-3 py-2'
    : 'flex flex-wrap items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50/80 px-3 py-2'

  const clearStaging = useCallback(() => {
    setStagingQueue([])
    setStagingIndex(0)
  }, [])

  const confirmStaging = useCallback(() => {
    if (!stagingFile) return
    onFilesChange([...files, stagingFile])
    const nextIndex = stagingIndex + 1
    if (nextIndex < stagingQueue.length) {
      setStagingIndex(nextIndex)
    } else {
      clearStaging()
    }
  }, [clearStaging, files, onFilesChange, stagingFile, stagingIndex, stagingQueue.length])

  const onInputChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const picked = Array.from(event.target.files ?? [])
      event.target.value = ''
      if (picked.length === 0) return

      const valid = picked.filter(isPdfFile)
      if (valid.length < picked.length) {
        window.alert(labels.invalidFile)
      }
      if (valid.length === 0) return

      const room = maxFiles - totalCount
      if (room <= 0) return
      setStagingQueue(valid.slice(0, room))
      setStagingIndex(0)
    },
    [labels.invalidFile, maxFiles, totalCount],
  )

  const countLabel = labels.count.replace('{count}', String(totalCount)).replace('{max}', String(maxFiles))

  const previewLabels = {
    confirmFile: labels.confirmFile,
    cancelPick: labels.cancelPick,
    previewUnavailable: labels.previewUnavailable,
    queueProgress: labels.queueProgress,
  }

  return (
    <div className={`space-y-2 text-sm ${portalUI ? 'md:col-span-2' : ''}`}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <label htmlFor={inputId} className={labelClass}>
          {labels.choose}
        </label>
        <span className={hintClass}>{countLabel}</span>
      </div>

      {canAddMore ? (
        <input
          id={inputId}
          type="file"
          accept=".pdf,application/pdf"
          multiple
          required={fileRequired}
          onChange={onInputChange}
          className={inputClass}
        />
      ) : null}

      <p className={hintClass}>{labels.hint}</p>
      <p className={hintClass}>{labels.maxHint}</p>

      {existingFiles.map((item) => (
        <div key={`existing-${item.originalIndex}`} className={rowClass}>
          <span className="min-w-0 flex-1 truncate text-xs font-medium text-emerald-900">
            {labels.currentFile} {item.name}
          </span>
          {item.previewUrl && onPreviewExisting ? (
            <button
              type="button"
              onClick={() => onPreviewExisting(item.previewUrl!, item.name)}
              className="inline-flex items-center gap-1 rounded-md border border-emerald-200 bg-white px-2.5 py-1 text-xs font-semibold text-emerald-800 hover:bg-emerald-50"
            >
              <Eye className="h-3 w-3" aria-hidden strokeWidth={1.75} />
              {labels.preview}
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => {
              if (labels.deleteExistingConfirm && !window.confirm(labels.deleteExistingConfirm)) return
              onRemoveExisting(item.originalIndex)
            }}
            className="inline-flex items-center gap-1 rounded-md border border-red-200 bg-white px-2.5 py-1 text-xs font-semibold text-red-700 hover:bg-red-50"
          >
            <Trash2 className="h-3 w-3" aria-hidden strokeWidth={1.75} />
            {labels.deleteExisting}
          </button>
        </div>
      ))}

      {files.map((file, index) => (
        <div key={`${file.name}-${file.lastModified}-${index}`} className={rowClass}>
          <span className="min-w-0 flex-1 truncate text-xs font-medium text-emerald-900">
            {labels.selected} {file.name}
          </span>
          <button
            type="button"
            onClick={() => setReviewFile(file)}
            className="rounded-md border border-emerald-200 bg-white px-2.5 py-1 text-xs font-semibold text-emerald-800 hover:bg-emerald-50"
          >
            {labels.preview}
          </button>
          <button
            type="button"
            onClick={() => onFilesChange(files.filter((_, i) => i !== index))}
            className="inline-flex items-center gap-1 rounded-md border border-slate-300 bg-white px-2.5 py-1 text-xs font-medium text-slate-600 hover:bg-slate-100"
          >
            <X className="h-3 w-3" aria-hidden strokeWidth={1.75} />
            {labels.remove}
          </button>
        </div>
      ))}

      <StagedFilePreviewModal
        open={previewOpen}
        file={stagingFile}
        queuePosition={
          stagingQueue.length > 1
            ? { current: stagingIndex + 1, total: stagingQueue.length }
            : undefined
        }
        labels={previewLabels}
        portalUI={portalUI}
        accent="emerald"
        onConfirm={confirmStaging}
        onCancel={clearStaging}
      />

      <StagedFilePreviewModal
        open={reviewOpen}
        file={reviewFile}
        viewOnly
        closeLabel={labels.close}
        labels={{
          confirmFile: labels.confirmFile,
          cancelPick: labels.cancelPick,
          previewUnavailable: labels.previewUnavailable,
        }}
        portalUI={portalUI}
        accent="emerald"
        onConfirm={() => setReviewFile(null)}
        onCancel={() => setReviewFile(null)}
      />
    </div>
  )
}
