export type RecordStatus =
  | 'created'
  | 'invoice_pending'
  | 'invoice_created'
  | 'document_generated'
  | 'archived'
  | 'history'

export type BuyerEditRequestStatus = 'pending' | 'denied' | 'approved'

export interface BuyerRecord {
  id: string
  vendorCode: string
  vendorName: string
  incomeType: string
  agreementFileName: string
  /** Up to 5 agreement files (buyers). */
  agreementFileNames?: string[]
  amount: number
  periodStart: string
  periodEnd: string
  description: string
  createdBy: string
  createdByAdmin?: boolean
  createdByRole?: string
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
  /** Buyer asked finance to unlock edits after invoice entered task. */
  buyerEditRequestStatus?: BuyerEditRequestStatus
  buyerEditRequestedAt?: string
  buyerEditRequestedBy?: string
  buyerEditResolvedAt?: string
  buyerEditResolvedBy?: string
}

export interface InvoiceData {
  number: string
  party: string
  attn: string
  paymentMethod: 'Transfer' | 'Reduce the bill'
  dueDate: string
  memo: string
  /** rebate_bonus_tier → print uses current calendar year. */
  memoTemplate?: 'rebate_bonus_tier' | 'custom'
  memoOptionId?: string
  vatPercent: number
  taxType: 'Tax art 23' | 'Tax art 4(2)'
  taxPercent: number
  /** Bank name on printed invoice (legacy field `transferTo` is the same value). */
  bankName?: string
  transferTo: string
  bankBranch: string
  accountNo: string
  beneficiaryName: string
  formulaFormFileName: string
  /** Up to 5 additional document PDFs (finance). */
  formulaFormFileNames?: string[]
  /** Person name on signature line. */
  signer: string
  /** Job title on signature line (e.g. Finance Manager). */
  signerTitle?: string
  /** Email for withholding tax slip (PPh) — shown on printed invoice. */
  pphEmail?: string
}

export interface BuyerInput {
  vendorCode: string
  vendorName: string
  incomeType: string
  agreementFileName: string
  /** Up to 5 agreement files (buyers). */
  agreementFileNames?: string[]
  amount: number
  periodStart: string
  periodEnd: string
  description: string
}
