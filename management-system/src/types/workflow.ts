export type RecordStatus =
  | 'created'
  | 'invoice_pending'
  | 'invoice_created'
  | 'document_generated'
  | 'archived'
  | 'history'

export interface BuyerRecord {
  id: string
  vendorCode: string
  vendorName: string
  incomeType: string
  agreementFileName: string
  amount: number
  periodStart: string
  periodEnd: string
  description: string
  createdBy: string
  createdAt: string
  status: RecordStatus
  invoiceReceived: boolean
  invoice?: InvoiceData
  generatedBy?: string
  generatedAt?: string
  stampedPaperFileName?: string
  /** Set when finance uploads stamped paper and the record enters archive. */
  archivedAt?: string
  publishedAt?: string
  /** Backend sets when deadline reminder email was sent to buyers. */
  buyerDeadlineNotifiedAt?: string
  /** Backend sets when deadline reminder email was sent to finance. */
  financeDeadlineNotifiedAt?: string
}

export interface InvoiceData {
  number: string
  party: string
  attn: string
  paymentMethod: 'Transfer' | 'Reduce the bill'
  dueDate: string
  memo: string
  vatPercent: number
  taxType: 'Tax art 23' | 'Tax art 4(2)'
  taxPercent: number
  transferTo: string
  bankBranch: string
  accountNo: string
  beneficiaryName: string
  formulaFormFileName: string
  signer: string
}

export interface BuyerInput {
  vendorCode: string
  vendorName: string
  incomeType: string
  agreementFileName: string
  amount: number
  periodStart: string
  periodEnd: string
  description: string
}
