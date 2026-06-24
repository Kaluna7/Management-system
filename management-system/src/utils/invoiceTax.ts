import type { InvoiceData } from '../types/workflow'

export type InvoiceTaxType = InvoiceData['taxType']

/** Rates aligned with printed invoice / formula form (PPh 23 vs 4(2)). */
export const TAX_PERCENT_BY_TYPE: Record<InvoiceTaxType, number> = {
  'Tax art 23': 2,
  'Tax art 4(2)': 10,
}

export function normalizeTaxType(raw: string): InvoiceTaxType {
  return raw === 'Tax art 4(2)' ? 'Tax art 4(2)' : 'Tax art 23'
}

export function taxPercentForType(type: InvoiceTaxType): number {
  return TAX_PERCENT_BY_TYPE[type]
}
