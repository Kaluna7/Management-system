import kpuLogo from '../assets/kpu.png'
import { INVOICE_COMPANY, INVOICE_SIGNERS } from '../data/invoiceCompany'
import { formatBankAccountNo } from '../utils/bankAccountNo'
import type { BuyerRecord, InvoiceData } from '../types/workflow'
import { amountInWordsEnRupiah } from '../utils/amountInWordsEn'
import {
  computeInvoiceAmounts,
  formatInvoiceAmountCell,
  formatInvoiceDeductionCell,
} from '../utils/invoiceAmounts'
import {
  formatInvoiceDateEn,
  formatInvoiceSignatureDateEn,
  formatPaymentMethodLabel,
  taxRowLabel,
} from '../utils/formatInvoiceDisplay'
import { formatInvoiceMemoLine } from '../utils/invoiceMemoDisplay'
import { resolveInvoiceNumberForRecord } from '../utils/invoiceNumberFromRecord'

export type InvoicePrintPaperProps = {
  record: BuyerRecord
  invoice: InvoiceData
  /** All records — used to resolve legacy invoice numbers for print. */
  allRecords?: BuyerRecord[]
  /** ISO date for signature line; defaults to today. */
  issuedAt?: string
}

function resolveSigner(signerName: string, signerTitle?: string) {
  const title = signerTitle?.trim()
  if (title) {
    return { name: signerName, title }
  }
  return (
    INVOICE_SIGNERS.find((s) => s.name === signerName) ?? {
      name: signerName,
      title: 'Finance Department',
    }
  )
}

export function InvoicePrintPaper({ record, invoice, allRecords, issuedAt }: InvoicePrintPaperProps) {
  const amounts = computeInvoiceAmounts(record.amount, invoice.vatPercent, invoice.taxPercent)
  const memoLine = formatInvoiceMemoLine(invoice)
  const signDateIso = issuedAt ?? invoice.dueDate ?? new Date().toISOString().slice(0, 10)
  const signatureDate =
    record.generatedAt != null && record.generatedAt !== ''
      ? formatInvoiceSignatureDateEn(record.generatedAt, INVOICE_COMPANY.signaturePlace)
      : formatInvoiceSignatureDateEn(signDateIso, INVOICE_COMPANY.signaturePlace)
  const pphEmail = invoice.pphEmail?.trim() || INVOICE_COMPANY.pphNoteEmail
  const signer = resolveSigner(invoice.signer, invoice.signerTitle)
  const issueAt = issuedAt
    ? new Date(issuedAt.includes('T') ? issuedAt : `${issuedAt}T12:00:00`)
    : undefined
  const invoiceNo = allRecords
    ? resolveInvoiceNumberForRecord(record, allRecords, issueAt)
    : resolveInvoiceNumberForRecord(record, [record], issueAt)

  return (
    <article id="invoice-print-sheet" className="invoice-print-sheet">
      <div className="invoice-print-header-zone">
        <div className="invoice-print-header-wrap">
          <header className="invoice-print-header">
            <table className="invoice-print-header-table">
              <tbody>
                <tr>
                  <td className="invoice-print-header-logo-cell">
                    <img
                      src={kpuLogo}
                      alt="KPU"
                      className="invoice-print-logo"
                      width={76}
                      height={76}
                    />
                  </td>
                  <td className="invoice-print-header-company-cell">
                    <h1 className="invoice-print-company">{INVOICE_COMPANY.legalName}</h1>
                  </td>
                </tr>
              </tbody>
            </table>
          </header>
        </div>
        <h2 className="invoice-print-title">INVOICE</h2>
      </div>

      <div className="invoice-print-body">
        <div className="invoice-print-core">
          <table className="invoice-print-meta">
            <tbody>
              <tr>
                <td className="invoice-print-meta-label">No</td>
                <td className="invoice-print-meta-colon">:</td>
                <td className="invoice-print-meta-value">{invoiceNo}</td>
              </tr>
              <tr>
                <td className="invoice-print-meta-label">Party</td>
                <td className="invoice-print-meta-colon">:</td>
                <td className="invoice-print-meta-value">{invoice.party || record.vendorName}</td>
              </tr>
              <tr>
                <td className="invoice-print-meta-label">Attn</td>
                <td className="invoice-print-meta-colon">:</td>
                <td className="invoice-print-meta-value">
                  {invoice.attn || INVOICE_COMPANY.defaultAttn}
                </td>
              </tr>
              <tr>
                <td className="invoice-print-meta-label">Method of Payment</td>
                <td className="invoice-print-meta-colon">:</td>
                <td className="invoice-print-meta-value">
                  {formatPaymentMethodLabel(invoice.paymentMethod)}
                </td>
              </tr>
              <tr>
                <td className="invoice-print-meta-label">Due Date</td>
                <td className="invoice-print-meta-colon">:</td>
                <td className="invoice-print-meta-value">{formatInvoiceDateEn(invoice.dueDate)}</td>
              </tr>
            </tbody>
          </table>

          <table className="invoice-print-table">
            <thead>
              <tr className="invoice-print-double-line-row" aria-hidden>
                <td colSpan={2}>
                  <div className="invoice-print-double-h" />
                </td>
              </tr>
              <tr>
                <th>Particulars</th>
                <th className="col-amount">Amount (IDR)</th>
              </tr>
              <tr className="invoice-print-double-line-row" aria-hidden>
                <td colSpan={2}>
                  <div className="invoice-print-double-h" />
                </td>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>{memoLine}</td>
                <td className="col-amount">{formatInvoiceAmountCell(amounts.subtotal)}</td>
              </tr>
              <tr>
                <td>Value Add Tax</td>
                <td className="col-amount">{formatInvoiceAmountCell(amounts.vat)}</td>
              </tr>
              <tr className="invoice-print-row-tax">
                <td>{taxRowLabel(invoice.taxType, invoice.taxPercent)}</td>
                <td className="col-amount col-amount--deduction">
                  {formatInvoiceDeductionCell(amounts.withholding)}
                </td>
              </tr>
              <tr className="invoice-print-row-total">
                <td colSpan={2} className="invoice-print-total-row-cell">
                  <div className="invoice-print-total-inner">
                    <span className="invoice-print-total-label">Total</span>
                    <div className="invoice-print-total-amount-block">
                      <hr className="invoice-print-total-line" aria-hidden />
                      <span className="invoice-print-total-amount">
                        {formatInvoiceAmountCell(amounts.total)}
                      </span>
                    </div>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>

          <div className="invoice-print-double-h" aria-hidden />
          <div className="invoice-print-words-block">
            <p className="invoice-print-words">
              <span className="invoice-print-words-label">Amount in Words :</span>{' '}
              <span className="invoice-print-words-amount">{amountInWordsEnRupiah(amounts.total)}</span>
            </p>
          </div>
          <div className="invoice-print-double-h" aria-hidden />
          <p className="invoice-print-pph-note">
            *Bukti Potong PPh (Bila ada) mohon dikirimkan setelah ada pembayaran ke email{' '}
            {pphEmail}
          </p>
        </div>

        <table className="invoice-print-footer-table">
          <tbody>
            <tr>
              <td className="invoice-print-footer-bank">
                <p className="invoice-print-bank-title">
                  All Payment should be paid in bank transfer to :
                </p>
                <table className="invoice-print-bank-table">
                  <tbody>
                    <tr>
                      <td className="invoice-print-bank-label">Bank Name</td>
                      <td className="invoice-print-bank-colon">:</td>
                      <td className="invoice-print-bank-value">
                        {invoice.bankName ?? invoice.transferTo}
                      </td>
                    </tr>
                    <tr>
                      <td className="invoice-print-bank-label">Bank Branch</td>
                      <td className="invoice-print-bank-colon">:</td>
                      <td className="invoice-print-bank-value">{invoice.bankBranch}</td>
                    </tr>
                    <tr>
                      <td className="invoice-print-bank-label">Account No</td>
                      <td className="invoice-print-bank-colon">:</td>
                      <td className="invoice-print-bank-value">
                        {formatBankAccountNo(invoice.accountNo)}
                      </td>
                    </tr>
                    <tr>
                      <td className="invoice-print-bank-label">Beneficiary Name</td>
                      <td className="invoice-print-bank-colon">:</td>
                      <td className="invoice-print-bank-value">{invoice.beneficiaryName}</td>
                    </tr>
                  </tbody>
                </table>
              </td>
              <td className="invoice-print-footer-sign">
                <div className="invoice-print-sign">
                  <p className="invoice-print-sign-date">{signatureDate}</p>
                  <div className="invoice-print-meterai" aria-hidden>
                    METERAI TEMPEL
                  </div>
                  <p className="invoice-print-sign-name">{signer.name}</p>
                  <p className="invoice-print-sign-title">{signer.title}</p>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <footer className="invoice-print-address">{INVOICE_COMPANY.officeAddress}</footer>
    </article>
  )
}




