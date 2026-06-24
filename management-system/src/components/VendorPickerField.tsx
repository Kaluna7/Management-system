import { useState } from 'react'
import { Plus } from 'lucide-react'
import type { VendorOption } from '../data/vendors'
import { AddVendorModal } from './AddVendorModal'
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
  closeLabel: string
  onCreateVendor: (code: string, name: string) => Promise<VendorOption>
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
  closeLabel,
  onCreateVendor,
}: VendorPickerFieldProps) {
  const [addOpen, setAddOpen] = useState(false)
  const [addBusy, setAddBusy] = useState(false)
  const [addError, setAddError] = useState<string | null>(null)

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
    </>
  )
}
