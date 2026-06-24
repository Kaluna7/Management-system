import type { InvoiceData } from '../types/workflow'
import type { InvoiceMemoOption, InvoiceMemoTemplate } from '../types/invoiceMemo'

export const REBATE_BONUS_TIER_BASE = 'Rebate Bonus Tier'

export function currentInvoiceYear(): number {
  return new Date().getFullYear()
}

export function normalizeMemoTemplate(raw: string): InvoiceMemoTemplate {
  return raw === 'rebate_bonus_tier' ? 'rebate_bonus_tier' : 'custom'
}

/** Dropdown / form label (no year — year is added on print for rebate template). */
export function formatMemoOptionLabel(option: Pick<InvoiceMemoOption, 'label' | 'template'>): string {
  if (option.template === 'rebate_bonus_tier') {
    return REBATE_BONUS_TIER_BASE
  }
  return option.label
}

export function selectionFromOption(option: InvoiceMemoOption): {
  optionId: string
  memo: string
  template: InvoiceMemoTemplate
} {
  return {
    optionId: option.id,
    memo: option.template === 'rebate_bonus_tier' ? '' : option.label,
    template: option.template,
  }
}

/** Memo line on printed invoice — rebate tier always uses the current year. */
export function formatInvoiceMemoLine(invoice: Pick<InvoiceData, 'memo' | 'memoTemplate'>): string {
  if (invoice.memoTemplate === 'rebate_bonus_tier') {
    return `${REBATE_BONUS_TIER_BASE} (${currentInvoiceYear()})`
  }
  const memo = String(invoice.memo ?? '').trim()
  if (!memo) return '—'
  if (/^Rebate Bonus Tier\b/i.test(memo)) {
    return `${REBATE_BONUS_TIER_BASE} (${currentInvoiceYear()})`
  }
  return memo
}
