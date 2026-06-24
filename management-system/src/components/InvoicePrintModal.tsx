import { useCallback, useEffect } from 'react'
import { createPortal } from 'react-dom'
import type { BuyerRecord, InvoiceData } from '../types/workflow'
import { ModalCloseButton } from './ModalCloseButton'
import { InvoicePrintPaper } from './InvoicePrintPaper'

export type InvoicePrintModalProps = {
  record: BuyerRecord
  invoice: InvoiceData
  allRecords?: BuyerRecord[]
  issuedAt?: string
  title: string
  printLabel: string
  closeLabel: string
  onClose: () => void
}

export function InvoicePrintModal({
  record,
  invoice,
  allRecords,
  issuedAt,
  title,
  printLabel,
  closeLabel,
  onClose,
}: InvoicePrintModalProps) {
  useEffect(() => {
    document.body.classList.add('invoice-print-active')
    return () => document.body.classList.remove('invoice-print-active')
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const handlePrint = useCallback(() => {
    const sheet = document.getElementById('invoice-print-sheet')
    sheet?.scrollIntoView({ block: 'start' })
    window.print()
  }, [])

  const modal = (
    <div className="invoice-print-portal" role="dialog" aria-modal="true">
      <div className="invoice-print-overlay">
        <div className="no-print mx-auto mb-4 flex max-w-[210mm] flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
          <div className="flex flex-wrap items-center justify-end gap-2">
            <button
              type="button"
              onClick={handlePrint}
              className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-primary-hover"
            >
              {printLabel}
            </button>
            <ModalCloseButton onClick={onClose} label={closeLabel} />
          </div>
        </div>
        <div className="invoice-print-preview-wrap">
          <InvoicePrintPaper
            record={record}
            invoice={invoice}
            allRecords={allRecords}
            issuedAt={issuedAt}
          />
        </div>
      </div>
    </div>
  )

  return createPortal(modal, document.body)
}


