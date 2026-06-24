import type { BuyerRecord } from '../types/workflow'

const BUYER_LOCKED_STATUSES = ['document_generated', 'archived', 'history'] as const

/** Finance saved invoice — record is on the task queue. */
export function isBuyerRecordInFinanceTask(record: BuyerRecord) {
  return record.status === 'document_generated'
}

export function hasPendingBuyerEditRequest(record: BuyerRecord) {
  return record.buyerEditRequestStatus === 'pending'
}

export function isBuyerEditRequestDenied(record: BuyerRecord) {
  return record.buyerEditRequestStatus === 'denied'
}

/** Finance approved buyer edit — buyer may change data; finance task card is paused. */
export function hasApprovedBuyerEditRequest(record: BuyerRecord) {
  return record.buyerEditRequestStatus === 'approved'
}

/** Finance task row should be read-only while buyer is editing after approval. */
export function isFinanceTaskPausedForBuyerEdit(record: BuyerRecord) {
  return isBuyerRecordInFinanceTask(record) && hasApprovedBuyerEditRequest(record)
}

/** Buyers may edit their portal records until finance generates the invoice document. */
export function isBuyerPortalRecordEditable(record: BuyerRecord) {
  if (record.createdByAdmin) return false
  if (hasApprovedBuyerEditRequest(record)) return true
  return !BUYER_LOCKED_STATUSES.includes(
    record.status as (typeof BUYER_LOCKED_STATUSES)[number],
  )
}

/** Buyer may ask finance to allow edits on a task record (wrong input after invoice). */
export function canBuyerRequestEditPermission(record: BuyerRecord) {
  if (record.createdByAdmin) return false
  if (!isBuyerRecordInFinanceTask(record)) return false
  if (hasPendingBuyerEditRequest(record) || hasApprovedBuyerEditRequest(record)) return false
  return true
}

export function periodIsoToDateInput(iso: string) {
  const m = /^(\d{4}-\d{2}-\d{2})/.exec(iso.trim())
  if (m) return m[1]
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const y = d.getFullYear()
  const mo = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${mo}-${day}`
}
