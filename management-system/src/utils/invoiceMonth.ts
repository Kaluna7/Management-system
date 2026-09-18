/**
 * Invoice issuance month helpers (YYYY-MM) — frontend.
 */

function pad2(n: number) {
  return String(n).padStart(2, '0')
}

export function normalizeInvoiceMonth(raw: string | null | undefined): string {
  const s = String(raw ?? '').trim()
  if (!/^\d{4}-\d{2}$/.test(s)) return ''
  const y = Number(s.slice(0, 4))
  const m = Number(s.slice(5, 7))
  if (!Number.isFinite(y) || m < 1 || m > 12) return ''
  return `${y}-${pad2(m)}`
}

function parseIsoLocal(s: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(s ?? '').trim())
  if (!m) return null
  const y = Number(m[1])
  const mo = Number(m[2]) - 1
  const day = Number(m[3])
  const d = new Date(y, mo, day)
  if (d.getFullYear() !== y || d.getMonth() !== mo || d.getDate() !== day) return null
  return d
}

/** Inclusive YYYY-MM list from period start–end ISO dates. */
export function monthsBetweenInclusive(startIso: string, endIso: string): string[] {
  const a = parseIsoLocal(startIso.slice(0, 10))
  const b = parseIsoLocal(endIso.slice(0, 10))
  if (!a || !b) return []
  let y = a.getFullYear()
  let m = a.getMonth()
  const endY = b.getFullYear()
  const endM = b.getMonth()
  if (y > endY || (y === endY && m > endM)) return []
  const out: string[] = []
  while (y < endY || (y === endY && m <= endM)) {
    out.push(`${y}-${pad2(m + 1)}`)
    m += 1
    if (m > 11) {
      m = 0
      y += 1
    }
  }
  return out
}

export function isInvoiceMonthInPeriod(
  invoiceMonth: string,
  startIso: string,
  endIso: string,
): boolean {
  const month = normalizeInvoiceMonth(invoiceMonth)
  if (!month) return false
  return monthsBetweenInclusive(startIso, endIso).includes(month)
}

/** Display label e.g. "September 2026". */
export function formatInvoiceMonthLabel(invoiceMonth: string, locale = 'en'): string {
  const month = normalizeInvoiceMonth(invoiceMonth)
  if (!month) return '—'
  const y = Number(month.slice(0, 4))
  const m = Number(month.slice(5, 7))
  const d = new Date(y, m - 1, 1)
  return d.toLocaleDateString(locale === 'id' || locale.startsWith('id') ? 'id-ID' : 'en-GB', {
    month: 'long',
    year: 'numeric',
  })
}

/** Current calendar month as YYYY-MM (local). */
export function currentInvoiceMonth(): string {
  const now = new Date()
  return `${now.getFullYear()}-${pad2(now.getMonth() + 1)}`
}

/**
 * Finance may create/open the invoice form when the calendar has reached
 * the buyer-selected issuance month (current YYYY-MM >= invoiceMonth).
 */
export function isInvoiceMonthOpen(invoiceMonth: string | null | undefined): boolean {
  const month = normalizeInvoiceMonth(invoiceMonth)
  if (!month) return true
  return currentInvoiceMonth() >= month
}

/** First day of month as YYYY-MM-DD for invoice due date bounds. */
export function firstDayOfInvoiceMonth(invoiceMonth: string): string {
  const month = normalizeInvoiceMonth(invoiceMonth)
  if (!month) return ''
  return `${month}-01`
}

/** Last day of month as YYYY-MM-DD for invoice due date default. */
export function lastDayOfInvoiceMonth(invoiceMonth: string): string {
  const month = normalizeInvoiceMonth(invoiceMonth)
  if (!month) return ''
  const y = Number(month.slice(0, 4))
  const m = Number(month.slice(5, 7))
  const last = new Date(y, m, 0)
  return `${y}-${pad2(m)}-${pad2(last.getDate())}`
}
