export type InvoiceBankAccount = {
  id: string
  beneficiaryName: string
  bankName: string
  bankBranch: string
  accountNo: string
}

export type InvoiceBankDetails = {
  beneficiaryName: string
  bankName: string
  bankBranch: string
  accountNo: string
}

export const EMPTY_BANK_DETAILS: InvoiceBankDetails = {
  beneficiaryName: '',
  bankName: '',
  bankBranch: '',
  accountNo: '',
}
