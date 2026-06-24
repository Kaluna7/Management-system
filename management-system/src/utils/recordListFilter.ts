import type { DepartmentRole } from '../types/user'
import type { BuyerRecord } from '../types/workflow'
import {
  hasPendingBuyerEditRequest,
  isBuyerRecordInFinanceTask,
} from './recordBuyerEdit'
import { daysUntilPeriodEnd } from './periodExpiryReminders'

export type RecordListStatusFilter =
  | 'all'
  | 'reminder'
  | 'normal'
  | 'in_finance_task'
  | 'edit_request'
  | 'stamp_upload'

export function recordMatchesSearch(record: BuyerRecord, query: string): boolean {
  const q = query.trim().toLowerCase()
  if (!q) return true
  return (
    record.vendorName.toLowerCase().includes(q) ||
    record.vendorCode.toLowerCase().includes(q) ||
    (record.description ?? '').toLowerCase().includes(q) ||
    (record.incomeType ?? '').toLowerCase().includes(q)
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

  return true
}

export function filterRecordList(
  records: BuyerRecord[],
  opts: {
    query: string
    status: RecordListStatusFilter
    role: DepartmentRole
  },
): BuyerRecord[] {
  return records.filter(
    (record) =>
      recordMatchesSearch(record, opts.query) &&
      recordMatchesStatusFilter(record, opts.status, opts.role),
  )
}
