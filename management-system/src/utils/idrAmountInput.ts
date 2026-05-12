/**
 * Parse nilai uang dari input pengguna (format Indonesia: titik ribuan, koma desimal).
 * Contoh: "10.000", "Rp 100.000", "1.234.567,50" → angka.
 */
export function parseIdrAmountInput(raw: string): number {
  let s = raw
    .trim()
    .replace(/^rp\.?\s*/i, '')
    .replace(/\s/g, '')
  if (!s) return 0

  const withDecimalComma = /^(.+),(\d{1,2})$/
  const m = withDecimalComma.exec(s)
  if (m) {
    const intPart = m[1].replace(/\./g, '').replace(/[^\d]/g, '')
    const frac = m[2].replace(/[^\d]/g, '')
    if (!intPart && !frac) return 0
    const n = Number(intPart ? `${intPart}.${frac || '0'}` : `0.${frac}`)
    return Number.isFinite(n) ? n : 0
  }

  const digitsOnly = s.replace(/\./g, '').replace(/,/g, '').replace(/[^\d]/g, '')
  if (!digitsOnly) return 0
  const n = Number(digitsOnly)
  return Number.isFinite(n) ? n : 0
}

/** Tampilan ribuan id-ID tanpa simbol mata uang (nilai sudah pasti > 0). */
export function formatIdrAmountInputValue(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return ''
  return new Intl.NumberFormat('id-ID', { maximumFractionDigits: 2 }).format(n)
}

/**
 * Format langsung saat mengetik: titik ribuan (id-ID), koma untuk desimal.
 * Hanya angka/titik/koma yang dipakai; "Rp" di depan boleh ditempel lalu diabaikan.
 */
export function formatIdrWhileTyping(raw: string): string {
  let s = raw
    .trim()
    .replace(/^rp\.?\s*/i, '')
    .replace(/\s/g, '')
  if (!s) return ''
  s = s.replace(/[^\d.,]/g, '')
  if (!s) return ''
  while ((s.match(/,/g) ?? []).length > 1) {
    const i = s.indexOf(',')
    s = s.slice(0, i) + s.slice(i + 1)
  }

  const lastComma = s.lastIndexOf(',')
  const hasComma = lastComma >= 0
  const intRaw = hasComma ? s.slice(0, lastComma) : s
  const afterComma = hasComma ? s.slice(lastComma + 1) : ''
  const intDigits = intRaw.replace(/\D/g, '')
  const fracDigits = afterComma.replace(/\D/g, '').slice(0, 2)

  if (hasComma && fracDigits.length === 0) {
    const intNum = intDigits ? Number(intDigits) : 0
    if (!Number.isFinite(intNum)) return ''
    const head = new Intl.NumberFormat('id-ID', { maximumFractionDigits: 0 }).format(intNum)
    return `${head},`
  }

  if (fracDigits.length > 0) {
    const intNum = intDigits ? Number(intDigits) : 0
    if (!Number.isFinite(intNum)) return ''
    const full = Number(`${intNum}.${fracDigits}`)
    if (!Number.isFinite(full)) {
      return new Intl.NumberFormat('id-ID', { maximumFractionDigits: 0 }).format(intNum)
    }
    return new Intl.NumberFormat('id-ID', {
      minimumFractionDigits: fracDigits.length,
      maximumFractionDigits: 2,
    }).format(full)
  }

  if (!intDigits) return ''
  const n = Number(intDigits)
  if (!Number.isFinite(n)) return ''
  return new Intl.NumberFormat('id-ID', { maximumFractionDigits: 0 }).format(n)
}
