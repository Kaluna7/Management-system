import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { ConfirmDialog } from './ConfirmDialog'
import { ModalCloseButton } from './ModalCloseButton'
import { INVOICE_SIGNER_TITLES } from '../data/invoiceSigners'
import { useInvoiceSigners } from '../hooks/useInvoiceSigners'
import type { InvoiceOptionsRole } from '../hooks/useInvoiceMemoOptions'
import type { InvoiceSignerSelection } from '../types/invoiceSigner'

export type InvoiceSignerFieldsLabels = {
  section: string
  title: string
  titlePlaceholder: string
  name: string
  namePlaceholder: string
  addNew: string
  addNewTitle: string
  addNewSave: string
  cancel: string
  loading: string
  noneSelected: string
  delete: string
  deleteConfirm: string
  deleteTitle: string
  deleteTitleConfirm: string
  deleteFailed: string
}

type Props = {
  value: InvoiceSignerSelection
  onChange: (next: InvoiceSignerSelection) => void
  labels: InvoiceSignerFieldsLabels
  forRole?: InvoiceOptionsRole
}

function hasSignerSelection(v: InvoiceSignerSelection) {
  return Boolean(v.title.trim() && v.name.trim())
}

export function InvoiceSignerFields({ value, onChange, labels, forRole = 'finance' }: Props) {
  const { signers, loading, addSigner, removeSigner, removeSignersByTitle } =
    useInvoiceSigners(forRole)
  const [selectedTitle, setSelectedTitle] = useState('')
  const [selectedSignerId, setSelectedSignerId] = useState('')
  const [addOpen, setAddOpen] = useState(false)
  const [draftTitle, setDraftTitle] = useState<string>(INVOICE_SIGNER_TITLES[0])
  const [draftName, setDraftName] = useState('')
  const [saveBusy, setSaveBusy] = useState(false)
  const [deleteBusy, setDeleteBusy] = useState(false)
  const [deletePending, setDeletePending] = useState<'title' | 'signer' | null>(null)
  const [saveError, setSaveError] = useState<string | null>(null)

  const titleOptions = useMemo(() => {
    const titles = new Set(signers.map((s) => s.title))
    return [...titles].sort((a, b) => a.localeCompare(b))
  }, [signers])

  const signersForTitle = useMemo(
    () => signers.filter((s) => s.title === selectedTitle),
    [signers, selectedTitle],
  )

  const canDeleteTitle = selectedTitle !== '' && signersForTitle.length > 0

  useEffect(() => {
    if (!hasSignerSelection(value)) {
      if (!value.title.trim()) {
        setSelectedTitle('')
        setSelectedSignerId('')
      } else {
        setSelectedTitle(value.title)
        setSelectedSignerId('')
      }
      return
    }
    setSelectedTitle(value.title)
    const match = signers.find((s) => s.title === value.title && s.name === value.name)
    setSelectedSignerId(match?.id ?? '')
  }, [value, signers])

  function openAddNew(prefillTitle?: string) {
    setDraftTitle(prefillTitle?.trim() || selectedTitle || INVOICE_SIGNER_TITLES[0])
    setDraftName('')
    setSaveError(null)
    setAddOpen(true)
  }

  function pickTitle(title: string) {
    if (title === '__add_new__') {
      openAddNew()
      return
    }
    setSelectedTitle(title)
    const forTitle = signers.filter((s) => s.title === title)
    if (forTitle.length === 1) {
      setSelectedSignerId(forTitle[0].id)
      onChange({ title, name: forTitle[0].name })
      return
    }
    setSelectedSignerId('')
    onChange({ title, name: '' })
  }

  function pickName(signerId: string) {
    setSelectedSignerId(signerId)
    const picked = signers.find((s) => s.id === signerId)
    if (picked) onChange({ title: picked.title, name: picked.name })
  }

  function requestDeleteTitle() {
    if (!canDeleteTitle || deleteBusy) return
    setDeletePending('title')
  }

  async function deleteSelectedTitle() {
    if (!canDeleteTitle || deleteBusy) return
    setDeletePending(null)
    setDeleteBusy(true)
    setSaveError(null)
    try {
      await removeSignersByTitle(selectedTitle)
      setSelectedTitle('')
      setSelectedSignerId('')
      onChange({ title: '', name: '' })
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : labels.deleteFailed)
    } finally {
      setDeleteBusy(false)
    }
  }

  function requestDeleteSigner() {
    if (!selectedSignerId || deleteBusy) return
    setDeletePending('signer')
  }

  async function deleteSelectedSigner() {
    if (!selectedSignerId || deleteBusy) return
    setDeletePending(null)
    setDeleteBusy(true)
    setSaveError(null)
    try {
      await removeSigner(selectedSignerId)
      setSelectedSignerId('')
      const remaining = signers.filter(
        (s) => s.title === selectedTitle && s.id !== selectedSignerId,
      )
      if (remaining.length === 1) {
        setSelectedSignerId(remaining[0].id)
        onChange({ title: selectedTitle, name: remaining[0].name })
      } else {
        onChange({ title: selectedTitle, name: '' })
      }
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : labels.deleteFailed)
    } finally {
      setDeleteBusy(false)
    }
  }

  async function saveNewSigner() {
    if (saveBusy) return
    const title = draftTitle.trim()
    const name = draftName.trim()
    if (!title || !name) {
      setSaveError(labels.noneSelected)
      return
    }
    setSaveBusy(true)
    setSaveError(null)
    try {
      const saved = await addSigner(title, name)
      setSelectedTitle(saved.title)
      setSelectedSignerId(saved.id)
      onChange({ title: saved.title, name: saved.name })
      setAddOpen(false)
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Failed to save')
    } finally {
      setSaveBusy(false)
    }
  }

  const deleteBtnClass =
    'portal-btn-secondary shrink-0 text-sm text-red-700 dark:text-red-300 disabled:opacity-50'

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
          className="portal-modal w-full max-w-md p-6"
          onMouseDown={(e) => e.stopPropagation()}
        >
          <div className="mb-4 flex items-start justify-between gap-3">
            <h3 className="portal-heading text-lg font-semibold">{labels.addNewTitle}</h3>
            <ModalCloseButton onClick={() => setAddOpen(false)} label={labels.cancel} />
          </div>
          <div className="grid gap-3">
            <label className="block space-y-1 text-sm">
              <span>{labels.title}</span>
              <input
                list="invoice-signer-title-suggestions"
                value={draftTitle}
                onChange={(e) => setDraftTitle(e.target.value)}
                className="portal-input w-full"
              />
              <datalist id="invoice-signer-title-suggestions">
                {INVOICE_SIGNER_TITLES.map((t) => (
                  <option key={t} value={t} />
                ))}
                {titleOptions.map((t) => (
                  <option key={t} value={t} />
                ))}
              </datalist>
            </label>
            <label className="block space-y-1 text-sm">
              <span>{labels.name}</span>
              <input
                value={draftName}
                onChange={(e) => setDraftName(e.target.value)}
                className="portal-input w-full"
                autoFocus
              />
            </label>
          </div>
          {saveError ? <p className="mt-3 text-sm text-red-600">{saveError}</p> : null}
          <div className="mt-5 flex justify-end gap-2">
            <button type="button" onClick={() => setAddOpen(false)} className="portal-btn-secondary">
              {labels.cancel}
            </button>
            <button
              type="button"
              disabled={saveBusy}
              onClick={() => void saveNewSigner()}
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
      <input type="hidden" name="signer" value={value.name} />
      <input type="hidden" name="signerTitle" value={value.title} />

      <div className="space-y-2 md:col-span-2">
        <p className="portal-subheading text-xs font-semibold uppercase tracking-wide">{labels.section}</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1 text-sm">
            <span className="font-medium">{labels.title}</span>
            <select
              value={selectedTitle}
              disabled={loading}
              onChange={(e) => pickTitle(e.target.value)}
              className="portal-select w-full disabled:opacity-60"
            >
              <option value="">{loading ? labels.loading : labels.titlePlaceholder}</option>
              {titleOptions.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
              <option value="__add_new__">{labels.addNew}</option>
            </select>
            {canDeleteTitle ? (
              <div className="flex justify-end pt-1">
                <button
                  type="button"
                  disabled={deleteBusy || loading}
                  onClick={() => requestDeleteTitle()}
                  className={deleteBtnClass}
                >
                  {deleteBusy ? labels.loading : labels.deleteTitle}
                </button>
              </div>
            ) : null}
          </div>

          <div className="space-y-1 text-sm">
            <span className="font-medium">{labels.name}</span>
            <select
              value={selectedSignerId}
              disabled={loading || !selectedTitle}
              onChange={(e) => {
                if (e.target.value === '__add_new__') {
                  openAddNew(selectedTitle)
                  return
                }
                pickName(e.target.value)
              }}
              className="portal-select w-full disabled:opacity-60"
            >
              <option value="">
                {!selectedTitle ? labels.titlePlaceholder : labels.namePlaceholder}
              </option>
              {signersForTitle.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
              {selectedTitle ? <option value="__add_new__">{labels.addNew}</option> : null}
            </select>
            {selectedSignerId ? (
              <div className="flex justify-end pt-1">
                <button
                  type="button"
                  disabled={deleteBusy || loading}
                  onClick={() => requestDeleteSigner()}
                  className={deleteBtnClass}
                >
                  {deleteBusy ? labels.loading : labels.delete}
                </button>
              </div>
            ) : null}
          </div>
        </div>

        {hasSignerSelection(value) ? (
          <p className="portal-muted text-xs">
            {value.title} — {value.name}
          </p>
        ) : (
          <p className="portal-muted text-xs">{labels.noneSelected}</p>
        )}
        {saveError ? <p className="text-sm text-red-600">{saveError}</p> : null}
      </div>

      {addModal}

      <ConfirmDialog
        open={deletePending !== null}
        title={
          deletePending === 'title' ? labels.deleteTitle : deletePending === 'signer' ? labels.delete : undefined
        }
        message={
          deletePending === 'title' ? labels.deleteTitleConfirm : labels.deleteConfirm
        }
        confirmLabel={deletePending === 'title' ? labels.deleteTitle : labels.delete}
        cancelLabel={labels.cancel}
        busy={deleteBusy}
        onCancel={() => setDeletePending(null)}
        onConfirm={() =>
          void (deletePending === 'title' ? deleteSelectedTitle() : deleteSelectedSigner())
        }
      />
    </>
  )
}
