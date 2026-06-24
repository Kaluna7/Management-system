import type { BuyerRecord, RecordStatus } from '../types/workflow'

/** Records that have entered finance task (invoice saved). */
export const FINANCE_INVOICE_TASK_STATUSES: RecordStatus[] = [
  'document_generated',
  'archived',
  'history',
]

const ROMAN_MONTHS = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII']

const FINANCE_INVOICE_NUMBER_PATTERN =
  /^KPU\/FINANCE-INV\/([IVXLC]+)\/(\d{4})\/NO-(\d+)$/i

function romanMonth(date: Date) {
  return ROMAN_MONTHS[date.getMonth()]
}

/** KPU/FINANCE-INV/{roman month}/{year}/NO-0001 */
export function formatFinanceInvoiceNumber(sequence: number, date = new Date()) {
  const seq = String(Math.max(1, sequence)).padStart(4, '0')
  return `KPU/FINANCE-INV/${romanMonth(date)}/${date.getFullYear()}/NO-${seq}`
}

export function parseFinanceInvoiceSequence(number?: string) {
  const m = String(number ?? '').trim().match(FINANCE_INVOICE_NUMBER_PATTERN)
  return m ? parseInt(m[3], 10) : 0
}

function isTaskRecord(record: BuyerRecord) {
  return FINANCE_INVOICE_TASK_STATUSES.includes(record.status)
}

function taskRecordsChronological(allRecords: BuyerRecord[]) {
  return allRecords
    .filter(isTaskRecord)
    .sort((a, b) => {
      const ta = new Date(a.generatedAt ?? a.createdAt).getTime()
      const tb = new Date(b.generatedAt ?? b.createdAt).getTime()
      if (ta !== tb) return ta - tb
      return a.id.localeCompare(b.id)
    })
}

function issueDateForRecord(record: BuyerRecord, at?: Date) {
  if (at) return at
  if (record.generatedAt) {
    const raw = record.generatedAt
    return new Date(raw.includes('T') ? raw : `${raw}T12:00:00`)
  }
  return new Date()
}

/**
 * Preview next invoice number for finance form (server assigns the same on save).
 * Valid stored numbers are kept; legacy values get a slot by task order.
 */
export function previewInvoiceNumberForRecord(
  record: BuyerRecord,
  allRecords: BuyerRecord[],
  at: Date = new Date(),
): string {
  const stored = record.invoice?.number?.trim()
  if (stored && parseFinanceInvoiceSequence(stored) > 0) return stored

  let maxSeq = 0
  for (const r of taskRecordsChronological(allRecords)) {
    const validSeq = parseFinanceInvoiceSequence(r.invoice?.number)
    if (r.id === record.id) {
      return formatFinanceInvoiceNumber(maxSeq + 1, at)
    }
    if (validSeq > 0) {
      maxSeq = Math.max(maxSeq, validSeq)
    } else {
      maxSeq += 1
    }
  }

  return formatFinanceInvoiceNumber(maxSeq + 1, at)
}

/** Printed / displayed invoice number — only accept KPU/FINANCE-INV format. */
export function resolveInvoiceNumber(stored?: string): string {
  const trimmed = String(stored ?? '').trim()
  if (trimmed && parseFinanceInvoiceSequence(trimmed) > 0) return trimmed
  return formatFinanceInvoiceNumber(1)
}

/** Resolve invoice number for a record, replacing legacy stored values. */
export function resolveInvoiceNumberForRecord(
  record: BuyerRecord,
  allRecords: BuyerRecord[],
  at?: Date,
): string {
  const stored = record.invoice?.number?.trim()
  if (stored && parseFinanceInvoiceSequence(stored) > 0) return stored
  return previewInvoiceNumberForRecord(record, allRecords, issueDateForRecord(record, at))
}

/** @deprecated Use previewInvoiceNumberForRecord — kept for legacy Dashboard page. */
export function invoiceNumberFromRecord(): string {
  return formatFinanceInvoiceNumber(1)
}

/** Due date = buyer period end (YYYY-MM-DD for forms and invoice print). */
export function invoiceDueDateFromRecord(record: { periodEnd: string }): string {
  const raw = String(record.periodEnd ?? '').trim()
  if (!raw) return ''
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw
  const d = new Date(raw.includes('T') ? raw : `${raw}T12:00:00`)
  if (Number.isNaN(d.getTime())) return ''
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}
