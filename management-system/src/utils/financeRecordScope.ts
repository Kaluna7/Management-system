import type { BuyerRecord } from '../types/workflow'

export const FINANCE_INVOICE_DONE_STATUSES = ['document_generated', 'archived', 'history'] as const

export function financeInvoiceNotDone(record: BuyerRecord) {
  return !FINANCE_INVOICE_DONE_STATUSES.includes(
    record.status as (typeof FINANCE_INVOICE_DONE_STATUSES)[number],
  )
}

export function financeNeedsStampUpload(record: BuyerRecord) {
  return record.status === 'document_generated'
}

/** Stamped paper uploaded on task; awaiting publish to archive. */
export function financeStampReadyToPublish(record: BuyerRecord) {
  return financeNeedsStampUpload(record) && Boolean(record.stampedPaperFileName?.trim())
}

/** Archived / published — off overview for all roles. */
export function isRecordFinishedOffOverview(record: BuyerRecord) {
  return record.status === 'archived' || record.status === 'history'
}

/** Finance overview: invoice still required (not yet on Task). */
export function isFinanceOverviewRecord(record: BuyerRecord) {
  return !isRecordFinishedOffOverview(record) && financeInvoiceNotDone(record)
}

export function filterFinanceOverviewRecords(records: BuyerRecord[]) {
  return records.filter(isFinanceOverviewRecord)
}

export function filterFinanceTaskRecords(records: BuyerRecord[]) {
  return records.filter(financeNeedsStampUpload)
}
