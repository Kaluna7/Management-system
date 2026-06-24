export type InvoiceSigner = {
  id: string
  title: string
  name: string
}

export type InvoiceSignerSelection = {
  title: string
  name: string
}

export const EMPTY_SIGNER_SELECTION: InvoiceSignerSelection = {
  title: '',
  name: '',
}
