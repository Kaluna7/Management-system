import { PercentInputField } from './PercentInputField'
import { normalizeTaxType, taxPercentForType, type InvoiceTaxType } from '../utils/invoiceTax'

export type InvoiceTaxFieldsLabels = {
  taxType: string
  taxPercent: string
  optionArt23: string
  optionArt42: string
}

type Props = {
  taxType: InvoiceTaxType
  taxPercent: number
  onChange: (taxType: InvoiceTaxType, taxPercent: number) => void
  labels: InvoiceTaxFieldsLabels
  /** Hidden inputs for native form submit */
  taxTypeName?: string
  taxPercentName?: string
}

export function InvoiceTaxFields({
  taxType,
  taxPercent,
  onChange,
  labels,
  taxTypeName,
  taxPercentName,
}: Props) {
  function onTaxTypeChange(raw: string) {
    const nextType = normalizeTaxType(raw)
    onChange(nextType, taxPercentForType(nextType))
  }

  return (
    <>
      {taxTypeName ? <input type="hidden" name={taxTypeName} value={taxType} /> : null}
      {taxPercentName ? <input type="hidden" name={taxPercentName} value={taxPercent} /> : null}

      <label className="space-y-1 text-sm">
        <span>{labels.taxType}</span>
        <select
          value={taxType}
          onChange={(e) => onTaxTypeChange(e.target.value)}
          className="w-full rounded-lg border border-slate-300 px-3 py-2"
        >
          <option value="Tax art 23">{labels.optionArt23}</option>
          <option value="Tax art 4(2)">{labels.optionArt42}</option>
        </select>
      </label>

      <PercentInputField
        label={labels.taxPercent}
        value={taxPercent}
        onChange={(nextPercent) => onChange(taxType, nextPercent)}
      />
    </>
  )
}
