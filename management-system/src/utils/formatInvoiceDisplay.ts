const MONTHS_ID = [
  'Januari',
  'Februari',
  'Maret',
  'April',
  'Mei',
  'Juni',
  'Juli',
  'Agustus',
  'September',
  'Oktober',
  'November',
  'Desember',
] as const

function parseIsoDate(iso: string): Date | null {
  if (!iso) return null
  const d = new Date(iso.includes('T') ? iso : `${iso}T12:00:00`)
  return Number.isNaN(d.getTime()) ? null : d
}

/** e.g. 13 February 2026 */
export function formatInvoiceDateEn(iso: string): string {
  const d = parseIsoDate(iso)
  if (!d) return iso || '—'
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
}

/** e.g. Jakarta, 13 February 2026 */
export function formatInvoiceSignatureDateEn(iso: string, place = 'Jakarta'): string {
  const d = parseIsoDate(iso)
  if (!d) return place
  return `${place}, ${formatInvoiceDateEn(iso)}`
}

/** e.g. 13 Februari 2026 */
export function formatInvoiceDateId(iso: string): string {
  const d = parseIsoDate(iso)
  if (!d) return iso || '—'
  return `${d.getDate()} ${MONTHS_ID[d.getMonth()]} ${d.getFullYear()}`
}

/** e.g. Jakarta, 13 Januari 2026 */
export function formatInvoiceSignatureDate(iso: string, place = 'Jakarta'): string {
  const d = parseIsoDate(iso)
  if (!d) return place
  return `${place}, ${d.getDate()} ${MONTHS_ID[d.getMonth()]} ${d.getFullYear()}`
}

export function formatPaymentMethodLabel(method: string): string {
  if (method === 'Reduce the bill') return 'Reduce the bill'
  return 'Transfer'
}

export function taxRowLabel(taxType: string, taxPercent: number): string {
  if (taxType === 'Tax art 4(2)') return `Tax Art 4(2) (${taxPercent}%)`
  return `Tax Art 23 (${taxPercent}%)`
}
