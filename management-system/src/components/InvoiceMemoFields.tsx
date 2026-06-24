import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { ModalCloseButton } from './ModalCloseButton'
import { useInvoiceMemoOptions, type InvoiceOptionsRole } from '../hooks/useInvoiceMemoOptions'
import type { InvoiceMemoSelection } from '../types/invoiceMemo'
import { formatMemoOptionLabel, selectionFromOption } from '../utils/invoiceMemoDisplay'

export type InvoiceMemoFieldsLabels = {
  memo: string
  savedMemo: string
  savedMemoPlaceholder: string
  addNew: string
  addNewTitle: string
  addNewLabel: string
  addNewSave: string
  cancel: string
  loading: string
  noneSelected: string
}

type Props = {
  value: InvoiceMemoSelection
  onChange: (next: InvoiceMemoSelection) => void
  labels: InvoiceMemoFieldsLabels
  memoName?: string
  memoTemplateName?: string
  memoOptionIdName?: string
  /** Scope saved memo dropdown to department (default finance). */
  forRole?: InvoiceOptionsRole
}

function hasMemoSelection(v: InvoiceMemoSelection) {
  return Boolean(v.optionId.trim())
}

export function InvoiceMemoFields({
  value,
  onChange,
  labels,
  memoName,
  memoTemplateName,
  memoOptionIdName,
  forRole = 'finance',
}: Props) {
  const { options, loading, addOption } = useInvoiceMemoOptions(forRole)
  const [selectedId, setSelectedId] = useState('')
  const [addOpen, setAddOpen] = useState(false)
  const [draftLabel, setDraftLabel] = useState('')
  const [saveBusy, setSaveBusy] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  const profileOptions = useMemo(
    () =>
      options.map((o) => ({
        id: o.id,
        label: formatMemoOptionLabel(o),
        option: o,
      })),
    [options],
  )

  useEffect(() => {
    if (!hasMemoSelection(value)) {
      setSelectedId('')
      return
    }
    if (value.optionId) setSelectedId(value.optionId)
  }, [value])

  useEffect(() => {
    if (loading || options.length === 0 || hasMemoSelection(value)) return
    const rebate = options.find((o) => o.template === 'rebate_bonus_tier') ?? options[0]
    onChange(selectionFromOption(rebate))
    setSelectedId(rebate.id)
  }, [loading, options, value, onChange])

  function openAddNew() {
    setDraftLabel('')
    setSaveError(null)
    setAddOpen(true)
  }

  async function saveNewMemo() {
    if (saveBusy) return
    const label = draftLabel.trim()
    if (!label) {
      setSaveError(labels.noneSelected)
      return
    }
    setSaveBusy(true)
    setSaveError(null)
    try {
      const saved = await addOption(label)
      const next = selectionFromOption(saved)
      onChange(next)
      setSelectedId(saved.id)
      setAddOpen(false)
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Failed to save')
    } finally {
      setSaveBusy(false)
    }
  }

  const displayLabel = value.optionId
    ? profileOptions.find((p) => p.id === value.optionId)?.label
    : null

  const addModal =
    addOpen &&
    createPortal(
      <div
        className="fixed inset-0 z-[200] flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-sm"
        role="dialog"
        aria-modal="true"
        onMouseDown={(e) => {
          if (e.target === e.currentTarget) setAddOpen(false)
        }}
      >
        <div
          className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-xl"
          onMouseDown={(e) => e.stopPropagation()}
        >
          <div className="mb-4 flex items-start justify-between gap-3">
            <h3 className="text-lg font-semibold text-slate-900">{labels.addNewTitle}</h3>
            <ModalCloseButton onClick={() => setAddOpen(false)} label={labels.cancel} />
          </div>
          <label className="block space-y-1 text-sm">
            <span>{labels.addNewLabel}</span>
            <input
              value={draftLabel}
              onChange={(e) => setDraftLabel(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2"
            />
          </label>
          {saveError ? <p className="mt-3 text-sm text-red-600">{saveError}</p> : null}
          <div className="mt-5 flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setAddOpen(false)}
              className="rounded-lg border border-slate-300 px-4 py-2 text-sm"
            >
              {labels.cancel}
            </button>
            <button
              type="button"
              disabled={saveBusy}
              onClick={() => void saveNewMemo()}
              className="portal-btn-primary disabled:opacity-60"
            >
              {saveBusy ? labels.loading : labels.addNewSave}
            </button>
          </div>
        </div>
      </div>,
      document.body,
    )

  return (
    <>
      {memoName ? <input type="hidden" name={memoName} value={value.memo} /> : null}
      {memoTemplateName ? (
        <input type="hidden" name={memoTemplateName} value={value.template} />
      ) : null}
      {memoOptionIdName ? (
        <input type="hidden" name={memoOptionIdName} value={value.optionId} />
      ) : null}

      <div className="space-y-1 text-sm">
        <span className="block">{labels.memo}</span>
        <select
          value={selectedId}
          disabled={loading}
          onChange={(e) => {
            const id = e.target.value
            if (id === '__add_new__') {
              openAddNew()
              return
            }
            setSelectedId(id)
            const picked = profileOptions.find((p) => p.id === id)
            if (picked) onChange(selectionFromOption(picked.option))
          }}
          className="w-full rounded-lg border border-slate-300 px-3 py-2 disabled:bg-slate-100"
        >
          <option value="">{loading ? labels.loading : labels.savedMemoPlaceholder}</option>
          {profileOptions.map((p) => (
            <option key={p.id} value={p.id}>
              {p.label}
            </option>
          ))}
          <option value="__add_new__">{labels.addNew}</option>
        </select>
        {displayLabel ? (
          <p className="text-xs text-slate-500">
            {labels.savedMemo}: {displayLabel}
          </p>
        ) : (
          <p className="text-xs text-slate-500">{labels.noneSelected}</p>
        )}
      </div>

      {addModal}
    </>
  )
}
