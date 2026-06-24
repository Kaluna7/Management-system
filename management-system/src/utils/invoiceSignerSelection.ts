import { INVOICE_SIGNER_TITLES } from '../data/invoiceSigners'
import { EMPTY_SIGNER_SELECTION, type InvoiceSignerSelection } from '../types/invoiceSigner'
import type { InvoiceData } from '../types/workflow'

export function signerSelectionFromInvoice(invoice?: InvoiceData | null): InvoiceSignerSelection {
  if (!invoice) return { ...EMPTY_SIGNER_SELECTION }
  const storedTitle = invoice.signerTitle?.trim() ?? ''
  const storedName = invoice.signer?.trim() ?? ''
  if (storedTitle && storedName) {
    return { title: storedTitle, name: storedName }
  }
  if (storedName && (INVOICE_SIGNER_TITLES as readonly string[]).includes(storedName)) {
    return { title: storedName, name: '' }
  }
  if (storedName) {
    return { title: 'Finance Manager', name: storedName }
  }
  return { ...EMPTY_SIGNER_SELECTION }
}
