import type { DepartmentRole } from '../types/user'
import type { BuyerRecord } from '../types/workflow'
import {
  hasPendingBuyerEditRequest,
  isBuyerRecordInFinanceTask,
} from './recordBuyerEdit'
import { daysUntilPeriodEnd } from './periodExpiryReminders'
import { currentInvoiceMonth, normalizeInvoiceMonth } from './invoiceMonth'

export type RecordListStatusFilter =
  | 'all'
  | 'reminder'
  | 'normal'
  | 'in_finance_task'
  | 'edit_request'
  | 'stamp_upload'
  | 'invoice_month'

export type InvoiceMonthScopeFilter = 'all' | 'this_month' | 'next_month' | 'last_month'

function shiftYearMonth(ym: string, deltaMonths: number): string {
  const month = normalizeInvoiceMonth(ym)
  if (!month) return ''
  const y = Number(month.slice(0, 4))
  const m = Number(month.slice(5, 7)) - 1 + deltaMonths
  const d = new Date(y, m, 1)
  const yy = d.getFullYear()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  return `${yy}-${mm}`
}

export function invoiceMonthForScope(scope: InvoiceMonthScopeFilter): string | null {
  if (scope === 'all') return null
  const current = currentInvoiceMonth()
  if (scope === 'this_month') return current
  if (scope === 'next_month') return shiftYearMonth(current, 1)
  if (scope === 'last_month') return shiftYearMonth(current, -1)
  return null
}

export function recordMatchesSearch(record: BuyerRecord, query: string): boolean {
  const q = query.trim().toLowerCase()
  if (!q) return true
  return (
    record.vendorName.toLowerCase().includes(q) ||
    record.vendorCode.toLowerCase().includes(q) ||
    (record.description ?? '').toLowerCase().includes(q) ||
    (record.incomeType ?? '').toLowerCase().includes(q) ||
    (record.invoiceMonth ?? '').toLowerCase().includes(q) ||
    (record.createdBy ?? '').toLowerCase().includes(q)
  )
}

export function recordMatchesStatusFilter(
  record: BuyerRecord,
  filter: RecordListStatusFilter,
  role: DepartmentRole,
): boolean {
  if (filter === 'all') return true

  if (filter === 'reminder') {
    if (role === 'buyers' && isBuyerRecordInFinanceTask(record)) return false
    return daysUntilPeriodEnd(record.periodEnd) <= 5
  }

  if (filter === 'normal') {
    if (role === 'buyers' && isBuyerRecordInFinanceTask(record)) return false
    return daysUntilPeriodEnd(record.periodEnd) > 5
  }

  if (filter === 'in_finance_task') {
    return isBuyerRecordInFinanceTask(record)
  }

  if (filter === 'edit_request') {
    return hasPendingBuyerEditRequest(record)
  }

  if (filter === 'stamp_upload') {
    return !hasPendingBuyerEditRequest(record)
  }

  if (filter === 'invoice_month') {
    return Boolean(normalizeInvoiceMonth(record.invoiceMonth))
  }

  return true
}

export function recordMatchesInvoiceMonthScope(
  record: BuyerRecord,
  scope: InvoiceMonthScopeFilter,
): boolean {
  const target = invoiceMonthForScope(scope)
  if (!target) return true
  return normalizeInvoiceMonth(record.invoiceMonth) === target
}

export function filterRecordList(
  records: BuyerRecord[],
  opts: {
    query: string
    status: RecordListStatusFilter
    role: DepartmentRole
    invoiceMonthScope?: InvoiceMonthScopeFilter
  },
): BuyerRecord[] {
  return records.filter((record) => {
    if (!recordMatchesSearch(record, opts.query)) return false
    if (!recordMatchesStatusFilter(record, opts.status, opts.role)) return false
    if (opts.status === 'invoice_month') {
      return recordMatchesInvoiceMonthScope(record, opts.invoiceMonthScope ?? 'all')
    }
    return true
  })
}
