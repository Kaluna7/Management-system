/** Keep digits only (0–9). */
export function sanitizeDigitsOnly(raw: string): string {
  return String(raw ?? '').replace(/\D/g, '')
}
