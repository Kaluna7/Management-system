export type InvoiceLineAmounts = {
  subtotal: number
  vat: number
  withholding: number
  total: number
}

/**
 * Invoice line math (matches paper form):
 * - Subtotal = buyer amount (IDR, rounded)
 * - VAT = subtotal × vat% / 100
 * - Withholding = subtotal × tax% / 100 (shown in parentheses)
 * - Total = subtotal + VAT − withholding
 */
export function computeInvoiceAmounts(
  baseAmount: number,
  vatPercent: number,
  taxPercent: number,
): InvoiceLineAmounts {
  const subtotal = Math.round(Number.isFinite(baseAmount) ? baseAmount : 0)
  const vatRate = Number.isFinite(vatPercent) ? vatPercent : 0
  const taxRate = Number.isFinite(taxPercent) ? taxPercent : 0
  const vat = Math.round((subtotal * vatRate) / 100)
  const withholding = Math.round((subtotal * taxRate) / 100)
  const total = subtotal + vat - withholding
  return { subtotal, vat, withholding, total }
}

/** Amount column on invoice paper (e.g. 1,543,814,801). */
export function formatInvoiceAmountCell(value: number) {
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(Math.round(value))
}

/** Parentheses for withholding deduction. */
export function formatInvoiceDeductionCell(value: number) {
  return `(${formatInvoiceAmountCell(value)})`
}
