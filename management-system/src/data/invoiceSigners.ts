/** Job titles for invoice signature line (person names are stored per title in API). */
export const INVOICE_SIGNER_TITLES = [
  'Finance Manager',
  'Head of Finance',
  'Controller',
] as const

export type InvoiceSignerTitle = (typeof INVOICE_SIGNER_TITLES)[number]
