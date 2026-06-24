/** Keep digits only for bank account numbers (storage / API). */
export function sanitizeBankAccountNo(raw: string): string {
  return String(raw ?? '').replace(/\D/g, '')
}

/** Display: dot every 4 digits, e.g. 10030022025 → 1003.0022.0025 */
export function formatBankAccountNo(digits: string): string {
  const d = sanitizeBankAccountNo(digits)
  if (!d) return ''
  return d.match(/.{1,4}/g)?.join('.') ?? d
}
