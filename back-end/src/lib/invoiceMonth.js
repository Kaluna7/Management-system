/**
 * Invoice issuance month helpers (YYYY-MM).
 */

function pad2(n) {
  return String(n).padStart(2, "0");
}

/** Normalize to YYYY-MM or empty string. */
function normalizeInvoiceMonth(raw) {
  const s = String(raw ?? "").trim();
  if (!/^\d{4}-\d{2}$/.test(s)) return "";
  const y = Number(s.slice(0, 4));
  const m = Number(s.slice(5, 7));
  if (!Number.isFinite(y) || m < 1 || m > 12) return "";
  return `${y}-${pad2(m)}`;
}

function yearMonthFromDate(d) {
  if (!(d instanceof Date) || Number.isNaN(d.getTime())) return "";
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`;
}

/**
 * Inclusive list of YYYY-MM between two dates (local calendar months).
 * @param {Date|string} start
 * @param {Date|string} end
 * @returns {string[]}
 */
function monthsBetweenInclusive(start, end) {
  const a = start instanceof Date ? start : new Date(start);
  const b = end instanceof Date ? end : new Date(end);
  if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) return [];
  let y = a.getFullYear();
  let m = a.getMonth();
  const endY = b.getFullYear();
  const endM = b.getMonth();
  if (y > endY || (y === endY && m > endM)) return [];
  const out = [];
  while (y < endY || (y === endY && m <= endM)) {
    out.push(`${y}-${pad2(m + 1)}`);
    m += 1;
    if (m > 11) {
      m = 0;
      y += 1;
    }
  }
  return out;
}

function isInvoiceMonthInPeriod(invoiceMonth, periodStart, periodEnd) {
  const month = normalizeInvoiceMonth(invoiceMonth);
  if (!month) return false;
  const allowed = monthsBetweenInclusive(periodStart, periodEnd);
  return allowed.includes(month);
}

/** Last calendar day of YYYY-MM as YYYY-MM-DD (local). */
function lastDayOfInvoiceMonth(invoiceMonth) {
  const month = normalizeInvoiceMonth(invoiceMonth);
  if (!month) return "";
  const y = Number(month.slice(0, 4));
  const m = Number(month.slice(5, 7));
  const last = new Date(y, m, 0);
  return `${y}-${pad2(m)}-${pad2(last.getDate())}`;
}

function currentInvoiceMonth() {
  const now = new Date();
  return `${now.getFullYear()}-${pad2(now.getMonth() + 1)}`;
}

/** True when calendar has reached the buyer-selected issuance month. */
function isInvoiceMonthOpen(invoiceMonth) {
  const month = normalizeInvoiceMonth(invoiceMonth);
  if (!month) return true;
  return currentInvoiceMonth() >= month;
}

module.exports = {
  normalizeInvoiceMonth,
  yearMonthFromDate,
  monthsBetweenInclusive,
  isInvoiceMonthInPeriod,
  lastDayOfInvoiceMonth,
  currentInvoiceMonth,
  isInvoiceMonthOpen,
};
