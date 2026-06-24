/** PT Karya Prima Unggulan — header, bank, and signatory defaults for printable invoice. */
export const INVOICE_COMPANY = {
  legalName: 'PT Karya Prima Unggulan',
  officeAddress:
    'Office WHSmith, Jl. By Pass Ngurah Rai No. 24X, Kel. Temacun, Kec. Kuta, Kab. Badung - 80361',
  signaturePlace: 'Jakarta',
  pphNoteEmail: 'yeni.purwasih@ptkpu.com',
  defaultAttn: 'Finance Department',
  defaultBank: {
    bankName: 'PT. Bank Mayapada, Tbk',
    transferTo: 'PT. Bank Mayapada, Tbk',
    bankBranch: 'Mayapada Tower',
    accountNo: '10030022025',
    beneficiaryName: 'PT. Karya Prima Unggulan',
  },
} as const

export const INVOICE_SIGNERS = [
  { name: 'Christine Mariana', title: 'Finance Department' },
  { name: 'Finance Manager', title: 'Finance Department' },
  { name: 'Head of Finance', title: 'Finance Department' },
  { name: 'Controller', title: 'Finance Department' },
] as const
