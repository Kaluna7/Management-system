import { useState } from 'react'
import { Plus } from 'lucide-react'
import type { VendorOption } from '../data/vendors'
import { AddVendorModal } from './AddVendorModal'
import { DeleteVendorModal } from './DeleteVendorModal'
import { VendorSearchSelect, type VendorSearchSelectLabels } from './VendorSearchSelect'

export type VendorPickerFieldProps = {
  vendors: VendorOption[]
  value: string
  onChange: (code: string) => void
  loading?: boolean
  name?: string
  labels: VendorSearchSelectLabels
  addVendorLabel: string
  addVendorTitle: string
  addVendorCodeLabel: string
  addVendorNameLabel: string
  saveLabel: string
  savingLabel?: string
  deleteVendorLabel?: string
  deleteVendorTitle?: string
  deleteVendorButtonLabel?: string
  deleteVendorSelectHint?: string
  deleteVendorConfirm?: (code: string, name: string) => string
  closeLabel: string
  onCreateVendor: (code: string, name: string) => Promise<VendorOption>
  onDeleteVendor?: (code: string) => Promise<string>
}

export function VendorPickerField({
  vendors,
  value,
  onChange,
  loading = false,
  name,
  labels,
  addVendorLabel,
  addVendorTitle,
  addVendorCodeLabel,
  addVendorNameLabel,
  saveLabel,
  savingLabel,
  deleteVendorLabel,
  deleteVendorTitle,
  deleteVendorButtonLabel,
  deleteVendorSelectHint,
  deleteVendorConfirm,
  closeLabel,
  onCreateVendor,
  onDeleteVendor,
}: VendorPickerFieldProps) {
  const [addOpen, setAddOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [addBusy, setAddBusy] = useState(false)
  const [deleteBusy, setDeleteBusy] = useState(false)
  const [addError, setAddError] = useState<string | null>(null)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  async function handleSave(code: string, vendorName: string) {
    setAddBusy(true)
    setAddError(null)
    try {
      const created = await onCreateVendor(code, vendorName)
      onChange(created.code)
      setAddOpen(false)
    } catch (e) {
      setAddError(e instanceof Error ? e.message : 'Failed to save vendor')
    } finally {
      setAddBusy(false)
    }
  }

  async function handleDelete(code: string) {
    if (!onDeleteVendor) return
    setDeleteBusy(true)
    setDeleteError(null)
    try {
      await onDeleteVendor(code)
      if (value === code) {
        const next = vendors.find((v) => v.code !== code)
        onChange(next?.code ?? '')
      }
      setDeleteOpen(false)
    } catch (e) {
      setDeleteError(e instanceof Error ? e.message : 'Failed to delete vendor')
    } finally {
      setDeleteBusy(false)
    }
  }

  return (
    <>
      <VendorSearchSelect
        vendors={vendors}
        value={value}
        onChange={onChange}
        loading={loading}
        name={name}
        labels={labels}
        inputClassName="portal-input"
      />
      <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1">
        <button
          type="button"
          onClick={() => {
            setAddError(null)
            setAddOpen(true)
          }}
          className="portal-accent inline-flex items-center gap-1 text-sm font-medium hover:underline"
        >
          <Plus className="h-3.5 w-3.5" aria-hidden strokeWidth={2} />
          {addVendorLabel}
        </button>
        {onDeleteVendor && deleteVendorLabel && deleteVendorTitle ? (
          <a
            href="#"
            className="portal-accent text-sm font-medium hover:underline"
            onClick={(e) => {
              e.preventDefault()
              setDeleteError(null)
              setDeleteOpen(true)
            }}
          >
            {deleteVendorLabel}
          </a>
        ) : null}
      </div>
      <AddVendorModal
        open={addOpen}
        title={addVendorTitle}
        codeLabel={addVendorCodeLabel}
        nameLabel={addVendorNameLabel}
        saveLabel={saveLabel}
        savingLabel={savingLabel}
        closeLabel={closeLabel}
        busy={addBusy}
        error={addError}
        onClose={() => {
          if (!addBusy) setAddOpen(false)
        }}
        onSave={handleSave}
      />
      {onDeleteVendor && deleteVendorTitle && deleteVendorButtonLabel ? (
        <DeleteVendorModal
          open={deleteOpen}
          title={deleteVendorTitle}
          searchPlaceholder={labels.searchPlaceholder}
          noResults={labels.noResults}
          listCount={labels.listCount}
          deleteLabel={deleteVendorButtonLabel}
          deletingLabel={savingLabel}
          closeLabel={closeLabel}
          selectHint={deleteVendorSelectHint ?? ''}
          confirmMessage={
            deleteVendorConfirm ??
            ((code, vendorName) => `Delete vendor ${code} — ${vendorName}?`)
          }
          busy={deleteBusy}
          error={deleteError}
          vendors={vendors}
          onClose={() => {
            if (!deleteBusy) setDeleteOpen(false)
          }}
          onDelete={handleDelete}
        />
      ) : null}
    </>
  )
}
