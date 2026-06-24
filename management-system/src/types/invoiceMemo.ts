export type InvoiceMemoTemplate = 'rebate_bonus_tier' | 'custom'

export type InvoiceMemoOption = {
  id: string
  label: string
  template: InvoiceMemoTemplate
}

export type InvoiceMemoSelection = {
  optionId: string
  memo: string
  template: InvoiceMemoTemplate
}

export const EMPTY_MEMO_SELECTION: InvoiceMemoSelection = {
  optionId: '',
  memo: '',
  template: 'custom',
}
