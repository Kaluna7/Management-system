import type { InvoiceData } from '../types/workflow'

export const FORMULA_FORM_MAX = 5

export function formulaFormFileNamesFromInvoice(invoice?: InvoiceData | null): string[] {
  if (!invoice) return []
  const names = invoice.formulaFormFileNames
  if (Array.isArray(names) && names.length > 0) {
    return names.map((n) => String(n).trim()).filter(Boolean)
  }
  const single = invoice.formulaFormFileName?.trim()
  return single ? [single] : []
}

export function formulaFormFileNamesForSave(
  existingNames: string[],
  keptOriginalIndices: number[],
  newFileNames: string[],
): string[] {
  const kept = keptOriginalIndices.map((i) => existingNames[i]?.trim() ?? '').filter(Boolean)
  return [...kept, ...newFileNames.map((n) => n.trim()).filter(Boolean)]
}
