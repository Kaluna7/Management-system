import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import { PeriodRangePicker, todayIsoDateLocal } from '../components/PeriodRangePicker'
import { useAuth } from '../context/AuthContext'
import { useWorkflow } from '../context/WorkflowContext'
import type { BuyerInput, BuyerRecord, InvoiceData } from '../types/workflow'
import { AgreementFileField } from '../components/AgreementFileField'
import { ModalCloseButton } from '../components/ModalCloseButton'
import { InvoicePrintModal } from '../components/InvoicePrintModal'
import { InvoiceBankAccountFields } from '../components/InvoiceBankAccountFields'
import { InvoiceSignerFields } from '../components/InvoiceSignerFields'
import { StampedPaperUploadButton } from '../components/StampedPaperUploadButton'
import { InvoiceMemoFields } from '../components/InvoiceMemoFields'
import { InvoiceTaxFields } from '../components/InvoiceTaxFields'
import { PercentInputField } from '../components/PercentInputField'
import { taxPercentForType } from '../utils/invoiceTax'
import { VendorPickerField } from '../components/VendorPickerField'
import { useVendors } from '../hooks/useVendors'
import { formatIdrWhileTyping, parseIdrAmountInput } from '../utils/idrAmountInput'
import { invoiceNumberFromRecord } from '../utils/invoiceNumberFromRecord'
import { filterRecordsForPortal } from '../utils/recordPortalScope'
import { signerSelectionFromInvoice } from '../utils/invoiceSignerSelection'

function formatDate(isoDate: string) {
  const date = new Date(isoDate)
  if (Number.isNaN(date.getTime())) return '-'
  return date.toLocaleDateString('id-ID', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })
}

function daysUntil(endDate: string) {
  const today = new Date()
  const end = new Date(endDate)
  const ms = end.getTime() - today.setHours(0, 0, 0, 0)
  return Math.ceil(ms / (1000 * 60 * 60 * 24))
}

function TaskStampRow({
  record,
  onPickFile,
  onDownloadInvoice,
  hasInvoice,
}: {
  record: BuyerRecord
  onPickFile: (recordId: string, file: File) => void | Promise<void>
  onDownloadInvoice: () => void
  hasInvoice: boolean
}) {
  const invoiceNo = record.invoice?.number?.trim()
  return (
    <article className="rounded-xl border border-slate-200 p-4">
      <p className="font-medium">{record.vendorName}</p>
      <p className="text-xs text-slate-500">Finance download by {record.generatedBy ?? '-'}</p>
      {invoiceNo ? (
        <p className="mt-1 truncate text-xs text-slate-500" title={invoiceNo}>
          {invoiceNo}
        </p>
      ) : null}
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={onDownloadInvoice}
          disabled={!hasInvoice}
          className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <svg className="h-4 w-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M7 10l5 5 5-5" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M12 15V3" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          Download invoice
        </button>
        <StampedPaperUploadButton
          recordId={record.id}
          onConfirm={onPickFile}
          buttonClassName="inline-flex items-center gap-2 rounded-lg bg-slate-800 px-3 py-2 text-xs font-semibold text-white disabled:opacity-60"
          labels={{
            pickFile: 'Upload paper with stamp',
            viewStamped: 'View stamped paper',
            close: 'Close',
            confirmUpload: 'Upload',
            publish: 'Publish',
            previewUnavailable: 'Preview not available for this file type.',
            uploading: 'Uploading…',
            publishing: 'Publishing…',
          }}
        />
      </div>
    </article>
  )
}

function financeInvoiceNotDone(record: BuyerRecord) {
  return !['document_generated', 'archived', 'history'].includes(record.status)
}

function summaryFrom(records: BuyerRecord[]) {
  const reminderCount = records.filter(
    (record) => daysUntil(record.periodEnd) <= 5 && record.status !== 'history',
  ).length
  return [
    { label: 'Total data buyer', value: String(records.length) },
    { label: 'Perlu reminder (<=5 hari)', value: String(reminderCount) },
  ]
}

export function Dashboard() {
  const { user, logout } = useAuth()
  const { records, createBuyerData, setInvoiceReceived, createInvoice, uploadStampedPaper, publishPaper } =
    useWorkflow()
  const { vendors, loading: vendorsLoading, getVendorByCode, getVendorNameByCode, createVendor } = useVendors()
  const userName = user?.name ?? 'User'
  const userRole = user?.role ?? 'buyers'
  const userDepartment = user?.departmentLabel ?? 'Department'
  const portalRecords = useMemo(
    () => filterRecordsForPortal(records, userRole === 'finance' ? 'finance' : 'buyers'),
    [records, userRole],
  )

  const [tab, setTab] = useState<'dashboard' | 'invoice' | 'task' | 'archive' | 'history'>(
    'dashboard',
  )
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false)
  const [amountEarnedInput, setAmountEarnedInput] = useState('')
  const [agreementFile, setAgreementFile] = useState<File | null>(null)
  const [formulaFormFile, setFormulaFormFile] = useState<File | null>(null)
  const [selectedRecordId, setSelectedRecordId] = useState<string>('')
  const [buyerForm, setBuyerForm] = useState<BuyerInput>({
    vendorCode: '',
    vendorName: '',
    incomeType: '',
    agreementFileName: '',
    amount: 0,
    periodStart: '',
    periodEnd: '',
    description: '',
  })
  const [invoiceForm, setInvoiceForm] = useState<InvoiceData>({
    number: '',
    party: '',
    attn: userName,
    paymentMethod: 'Transfer',
    dueDate: '',
    memo: '',
    memoTemplate: 'custom',
    memoOptionId: '',
    vatPercent: 11,
    taxType: 'Tax art 23',
    taxPercent: taxPercentForType('Tax art 23'),
    bankName: '',
    transferTo: '',
    bankBranch: '',
    accountNo: '',
    beneficiaryName: '',
    formulaFormFileName: '',
    signer: '',
    signerTitle: '',
  })

  const selectedRecord = portalRecords.find((record) => record.id === selectedRecordId)
  const summaryCards = useMemo(() => summaryFrom(portalRecords), [portalRecords])

  useEffect(() => {
    if (!selectedRecord) return
    const no = invoiceNumberFromRecord()
    const signerSel = signerSelectionFromInvoice(selectedRecord.invoice)
    setInvoiceForm((prev) => ({
      ...prev,
      number: no,
      party: '',
      dueDate: '',
      memo: '',
      memoOptionId: '',
      memoTemplate: 'custom',
      beneficiaryName: '',
      bankName: '',
      transferTo: '',
      bankBranch: '',
      accountNo: '',
      signer: signerSel.name,
      signerTitle: signerSel.title,
    }))
  }, [selectedRecord])

  const handleTaskStampUpload = useCallback(
    async (recordId: string, file: File) => {
      try {
        await uploadStampedPaper(recordId, file)
        setTab('archive')
      } catch {
        /* stay on task */
      }
    },
    [uploadStampedPaper],
  )

  const [taskInvoicePrintRecordId, setTaskInvoicePrintRecordId] = useState<string | null>(null)
  const taskInvoicePrintRecord =
    taskInvoicePrintRecordId != null
      ? portalRecords.find((record) => record.id === taskInvoicePrintRecordId) ?? null
      : null
  const dashboardTabs =
    userRole === 'buyers'
      ? [
          { id: 'dashboard', label: 'Overview' },
          { id: 'history', label: 'History' },
        ]
      : [
          { id: 'dashboard', label: 'Overview' },
          { id: 'invoice', label: 'Invoice Form' },
          { id: 'task', label: 'Task' },
          { id: 'archive', label: 'Archive' },
        ]
  const visibleTabs = dashboardTabs

  useEffect(() => {
    if (isCreateModalOpen) setAmountEarnedInput('')
  }, [isCreateModalOpen])

  useEffect(() => {
    if (vendors.length === 0 || buyerForm.vendorCode) return
    const first = vendors[0]
    setBuyerForm((prev) => ({ ...prev, vendorCode: first.code, vendorName: first.name }))
  }, [vendors, buyerForm.vendorCode])

  if (!user) return null

  function onChangeVendor(nextCode: string) {
    const selected = getVendorByCode(nextCode)
    if (!selected) return
    setBuyerForm((prev) => ({ ...prev, vendorCode: selected.code, vendorName: selected.name }))
  }

  async function submitBuyerForm(event: FormEvent) {
    event.preventDefault()
    if (!agreementFile) {
      window.alert('Pilih berkas perjanjian.')
      return
    }
    if (!buyerForm.vendorCode || vendors.length === 0) {
      window.alert('Belum ada vendor di database. Isi tabel Vendor terlebih dahulu.')
      return
    }
    const amountParsed = parseIdrAmountInput(amountEarnedInput)
    if (!Number.isFinite(amountParsed) || amountParsed <= 0) {
      window.alert('Masukkan jumlah valid lebih dari nol (mis. 10.000).')
      return
    }
    if (!buyerForm.periodStart || !buyerForm.periodEnd) {
      window.alert('Pilih tanggal awal dan akhir periode.')
      return
    }
    if (buyerForm.periodEnd < buyerForm.periodStart) {
      window.alert('Tanggal akhir tidak boleh sebelum tanggal awal.')
      return
    }
    const today = todayIsoDateLocal()
    if (buyerForm.periodStart < today || buyerForm.periodEnd < today) {
      window.alert('Tanggal yang sudah lewat tidak bisa dipilih. Pilih hari ini atau tanggal mendatang.')
      return
    }
    try {
      await createBuyerData(
        { ...buyerForm, amount: amountParsed, agreementFileName: agreementFile.name },
        userName,
        'buyers',
        { newFiles: [agreementFile] },
      )
    } catch (e) {
      window.alert(e instanceof Error ? e.message : 'Gagal menyimpan.')
      return
    }
    setAgreementFile(null)
    const first = vendors[0]
    setBuyerForm({
      vendorCode: first?.code ?? '',
      vendorName: first?.name ?? '',
      incomeType: '',
      agreementFileName: '',
      amount: 0,
      periodStart: '',
      periodEnd: '',
      description: '',
    })
    setAmountEarnedInput('')
    setTab('dashboard')
    setIsCreateModalOpen(false)
  }

  function submitInvoice(event: FormEvent) {
    event.preventDefault()
    if (!selectedRecord) return
    void (async () => {
      if (!formulaFormFile?.name.toLowerCase().endsWith('.pdf')) {
        window.alert('Formula form must be a PDF.')
        return
      }
      if (!invoiceForm.party.trim()) {
        window.alert('Enter party name for the invoice (finance entry).')
        return
      }
      if (!invoiceForm.signer.trim() || !invoiceForm.signerTitle?.trim()) {
        window.alert('Select signature position and name.')
        return
      }
      try {
        await createInvoice(
          selectedRecord.id,
          {
            ...invoiceForm,
            number: invoiceNumberFromRecord(),
            dueDate: invoiceForm.dueDate,
            bankName: invoiceForm.bankName || invoiceForm.transferTo,
            transferTo: invoiceForm.bankName || invoiceForm.transferTo,
            party: invoiceForm.party.trim(),
            formulaFormFileName: formulaFormFile.name,
          },
          userName,
          formulaFormFile,
        )
        setTab('task')
      } catch (e) {
        window.alert(e instanceof Error ? e.message : 'Gagal menyimpan invoice.')
      }
    })()
  }

  return (
    <div className="min-h-screen bg-slate-100 px-4 py-8 text-slate-800">
      <div className="mx-auto max-w-6xl space-y-6">
        <nav className="sticky top-3 z-20 rounded-2xl border border-slate-200 bg-white/90 p-3 shadow-sm backdrop-blur">
          <div className="mb-3 sm:hidden">
            <label className="block text-xs font-medium text-slate-500">Navigasi</label>
            <select
              value={tab}
              onChange={(event) => setTab(event.currentTarget.value as typeof tab)}
              className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
            >
              {visibleTabs.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.label}
                </option>
              ))}
            </select>
          </div>
          <div className="hidden gap-2 overflow-x-auto pb-1 sm:flex sm:flex-nowrap">
            {visibleTabs.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setTab(item.id as typeof tab)}
                className={`whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium transition ${
                  tab === item.id
                    ? 'bg-violet-600 text-white shadow-sm'
                    : 'border border-slate-200 bg-slate-50 text-slate-600 hover:bg-violet-50 hover:text-violet-700'
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>
        </nav>

        <header className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="mb-1 text-xs font-semibold uppercase tracking-widest text-violet-600">
                Dashboard
              </p>
              <h1 className="text-2xl font-semibold text-slate-900">{userDepartment}</h1>
              <p className="mt-1 text-sm text-slate-500">
                {userName} · {userRole === 'buyers' ? 'Peran: Buyers' : 'Peran: Finance'}
              </p>
            </div>
            <button
              type="button"
              className="rounded-lg border border-slate-300 bg-slate-50 px-4 py-2 text-sm font-medium text-slate-700 transition hover:border-violet-300 hover:text-violet-700"
              onClick={logout}
            >
              Keluar
            </button>
          </div>
        </header>

        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="mb-4 text-base font-semibold text-slate-900">Ringkasan</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {summaryCards.map((t) => (
              <article key={t.label} className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                <p className="mb-1 font-mono text-2xl font-bold text-slate-900">{t.value}</p>
                <p className="text-sm text-slate-600">{t.label}</p>
              </article>
            ))}
          </div>
          {userRole === 'buyers' ? (
            <div className="mt-5 border-t border-slate-200 pt-4">
              <p className="mb-2 text-xs font-medium uppercase tracking-wider text-slate-500">
                Quick Action
              </p>
              <button
                type="button"
                onClick={() => setIsCreateModalOpen(true)}
                className="rounded-lg bg-violet-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-violet-500"
              >
                + Tambah Data
              </button>
            </div>
          ) : null}
        </section>

        {tab === 'dashboard' ? (
          <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="mb-4 text-base font-semibold text-slate-900">
              {userRole === 'buyers' ? 'Come out list in dashboard' : 'View List from buyer before'}
            </h2>
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-left text-slate-500">
                    <th className="py-2 pr-3">Vendor</th>
                    <th className="py-2 pr-3">Period End</th>
                    <th className="py-2 pr-3">Status</th>
                    <th className="py-2 pr-3">Reminder</th>
                    {userRole === 'buyers' ? <th className="py-2 pr-3">Invoice</th> : null}
                  </tr>
                </thead>
                <tbody>
                  {portalRecords.map((record) => {
                    const reminder = daysUntil(record.periodEnd)
                    return (
                      <tr key={record.id} className="border-b border-slate-100">
                        <td className="py-2 pr-3">
                          <p className="font-medium text-slate-800">{record.vendorName}</p>
                          <p className="text-xs text-slate-500">{record.vendorCode}</p>
                        </td>
                        <td className="py-2 pr-3">{formatDate(record.periodEnd)}</td>
                        <td className="py-2 pr-3 capitalize">{record.status.replaceAll('_', ' ')}</td>
                        <td className="py-2 pr-3">
                          {reminder <= 5 ? (
                            <span className="rounded-full bg-amber-100 px-2 py-1 text-xs text-amber-700">
                              Email reminder
                            </span>
                          ) : (
                            <span className="text-xs text-slate-400">Normal</span>
                          )}
                        </td>
                        {userRole === 'buyers' ? (
                          <td className="py-2 pr-3">
                            <label className="inline-flex items-center gap-2 text-xs">
                              <input
                                type="checkbox"
                                checked={record.invoiceReceived}
                                onChange={(event) =>
                                  setInvoiceReceived(record.id, event.currentTarget.checked)
                                }
                              />
                              got invoice
                            </label>
                          </td>
                        ) : null}
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </section>
        ) : null}

        {tab === 'invoice' && userRole === 'finance' ? (
          <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="mb-4 text-base font-semibold text-slate-900">Invoice Form Page</h2>
            <label className="mb-4 block space-y-1 text-sm">
              <span>Click list from dashboard</span>
              <select
                value={selectedRecordId}
                onChange={(event) => setSelectedRecordId(event.currentTarget.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2"
              >
                <option value="">Select one record</option>
                {portalRecords
                  .filter((record) => financeInvoiceNotDone(record))
                  .map((record) => (
                    <option key={record.id} value={record.id}>
                      {record.vendorCode} - {record.vendorName}
                    </option>
                  ))}
              </select>
            </label>

            {selectedRecord ? (
              <form onSubmit={submitInvoice} className="grid gap-4 md:grid-cols-2">
                <p className="md:col-span-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
                  Buyer submission (reference): {selectedRecord.vendorCode} — {selectedRecord.vendorName}
                </p>
                <label className="space-y-1 text-sm">
                  <span>No (from vendor code)</span>
                  <input
                    value={invoiceNumberFromRecord()}
                    readOnly
                    aria-readonly
                    className="w-full rounded-lg border border-slate-300 bg-slate-100 px-3 py-2 text-slate-700"
                  />
                  <span className="block text-xs text-slate-500">
                    Auto-filled from buyer record; cannot be edited.
                  </span>
                </label>
                <label className="space-y-1 text-sm">
                  <span>Party</span>
                  <input
                    value={invoiceForm.party}
                    onChange={(event) =>
                      setInvoiceForm((prev) => ({ ...prev, party: event.currentTarget.value }))
                    }
                    required
                    placeholder="Enter party name (finance)"
                    className="w-full rounded-lg border border-slate-300 px-3 py-2"
                  />
                </label>
                <label className="space-y-1 text-sm">
                  <span>Attn</span>
                  <input
                    value={invoiceForm.attn}
                    onChange={(event) =>
                      setInvoiceForm((prev) => ({ ...prev, attn: event.currentTarget.value }))
                    }
                    required
                    className="w-full rounded-lg border border-slate-300 px-3 py-2"
                  />
                </label>
                <label className="space-y-1 text-sm">
                  <span>Method of payment</span>
                  <select
                    value={invoiceForm.paymentMethod}
                    onChange={(event) =>
                      setInvoiceForm((prev) => ({
                        ...prev,
                        paymentMethod: event.currentTarget.value as InvoiceData['paymentMethod'],
                      }))
                    }
                    className="w-full rounded-lg border border-slate-300 px-3 py-2"
                  >
                    <option>Transfer</option>
                    <option>Reduce the bill</option>
                  </select>
                </label>
                <label className="space-y-1 text-sm">
                  <span>Due date</span>
                  <input
                    type="date"
                    value={invoiceForm.dueDate}
                    min={todayIsoDateLocal()}
                    onChange={(event) =>
                      setInvoiceForm((prev) => ({ ...prev, dueDate: event.currentTarget.value }))
                    }
                    required
                    className="w-full rounded-lg border border-slate-300 px-3 py-2"
                  />
                  <span className="block text-xs text-slate-500">
                    Finance entry only — not prefilled from buyer period.
                  </span>
                </label>
                <InvoiceMemoFields
                  forRole="finance"
                  value={{
                    optionId: invoiceForm.memoOptionId ?? '',
                    memo: invoiceForm.memo,
                    template: invoiceForm.memoTemplate ?? 'custom',
                  }}
                  onChange={(sel) =>
                    setInvoiceForm((prev) => ({
                      ...prev,
                      memoOptionId: sel.optionId,
                      memo: sel.memo,
                      memoTemplate: sel.template,
                    }))
                  }
                  labels={{
                    memo: 'Memo',
                    savedMemo: 'Selected',
                    savedMemoPlaceholder: 'Select a memo line…',
                    addNew: '+ Add new memo',
                    addNewTitle: 'Add memo line',
                    addNewLabel: 'Memo text',
                    addNewSave: 'Save',
                    cancel: 'Cancel',
                    loading: 'Loading…',
                    noneSelected: 'Select a memo from the list or add a new one.',
                  }}
                />
                <PercentInputField
                  label="Value added tax"
                  value={invoiceForm.vatPercent}
                  onChange={(vatPercent) => setInvoiceForm((prev) => ({ ...prev, vatPercent }))}
                />
                <InvoiceTaxFields
                  taxType={invoiceForm.taxType}
                  taxPercent={invoiceForm.taxPercent}
                  onChange={(taxType, taxPercent) =>
                    setInvoiceForm((prev) => ({ ...prev, taxType, taxPercent }))
                  }
                  labels={{
                    taxType: 'Tax type',
                    taxPercent: 'Tax percent',
                    optionArt23: 'Tax art 23',
                    optionArt42: 'Tax art 4(2)',
                  }}
                />
                <InvoiceBankAccountFields
                  forRole="finance"
                  value={{
                    beneficiaryName: invoiceForm.beneficiaryName,
                    bankName: invoiceForm.bankName ?? invoiceForm.transferTo,
                    bankBranch: invoiceForm.bankBranch,
                    accountNo: invoiceForm.accountNo,
                  }}
                  onChange={(bank) =>
                    setInvoiceForm((prev) => ({
                      ...prev,
                      beneficiaryName: bank.beneficiaryName,
                      bankName: bank.bankName,
                      transferTo: bank.bankName,
                      bankBranch: bank.bankBranch,
                      accountNo: bank.accountNo,
                    }))
                  }
                  labels={{
                    bankName: 'Bank name',
                    bankNamePlaceholder: 'Select bank…',
                    bankAccountVariant: 'Account details',
                    bankAccountVariantPlaceholder: 'Select branch / account…',
                    beneficiary: 'Beneficiary name',
                    bankBranch: 'Bank branch',
                    accountNo: 'Account no. (bank account number)',
                    accountNoDigitsOnly: 'Numbers only; dot every 4 digits when displayed.',
                    addNew: '+ Add new bank…',
                    addNewTitle: 'Add new bank account',
                    addNewSave: 'Save bank account',
                    cancel: 'Cancel',
                    loading: 'Loading…',
                    noneSelected: 'Select a bank to fill branch, account number, and beneficiary.',
                    delete: 'Delete',
                    deleteConfirm: 'Remove this saved bank account from the list?',
                    deleteFailed: 'Could not delete bank account.',
                  }}
                />
                <div className="md:col-span-2">
                  <AgreementFileField
                    file={formulaFormFile}
                    onFileChange={setFormulaFormFile}
                    pdfOnly
                    required
                    labels={{
                      choose: 'Formula form (required, PDF)',
                      selected: 'Selected:',
                      preview: 'Preview',
                      closePreview: 'Close',
                      remove: 'Remove',
                      previewUnavailable: 'Preview not available for this file type.',
                      hint: 'After you pick a PDF, a preview opens. Click Save to confirm or Cancel to discard.',
                      confirmFile: 'Upload',
                      cancelPick: 'Close',
                      invalidFile: 'Formula form must be a PDF.',
                    }}
                  />
                </div>
                <InvoiceSignerFields
                  forRole="finance"
                  value={{
                    title: invoiceForm.signerTitle ?? '',
                    name: invoiceForm.signer,
                  }}
                  onChange={(sel) =>
                    setInvoiceForm((prev) => ({
                      ...prev,
                      signer: sel.name,
                      signerTitle: sel.title,
                    }))
                  }
                  labels={{
                    section: 'Signature',
                    title: 'Position / title',
                    titlePlaceholder: 'Select position…',
                    name: 'Name',
                    namePlaceholder: 'Select name…',
                    addNew: '+ Add new name…',
                    addNewTitle: 'Add signatory name',
                    addNewSave: 'Save name',
                    cancel: 'Cancel',
                    loading: 'Loading…',
                    noneSelected: 'Select a position, then choose or add a name.',
                    delete: 'Delete name',
                    deleteConfirm: 'Remove this signatory name from the list?',
                    deleteTitle: 'Delete position',
                    deleteTitleConfirm:
                      'Remove this position and all saved names under it?',
                    deleteFailed: 'Could not delete signatory.',
                  }}
                />
                <div className="md:col-span-2">
                  <button
                    type="submit"
                    className="rounded-lg bg-violet-600 px-4 py-2 text-sm font-semibold text-white"
                  >
                    Add data / Generate
                  </button>
                </div>
              </form>
            ) : (
              <p className="text-sm text-slate-500">
                Pilih list data yang invoice-nya sudah diterima dari dashboard finance.
              </p>
            )}
          </section>
        ) : null}

        {tab === 'task' && userRole === 'finance' ? (
          <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="mb-4 text-base font-semibold text-slate-900">Task Page</h2>
            <p className="mb-4 text-sm text-slate-600">
              Unggah kertas bermaterai per data. Setelah sukses, data pindah ke tab Archive.
            </p>
            <div className="space-y-3">
              {portalRecords.filter((record) => record.status === 'document_generated').length === 0 ? (
                <p className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-6 text-sm text-slate-500">
                  Belum ada tugas. Data muncul setelah invoice disimpan.
                </p>
              ) : (
                portalRecords
                  .filter((record) => record.status === 'document_generated')
                  .map((record) => (
                    <TaskStampRow
                      key={record.id}
                      record={record}
                      onPickFile={handleTaskStampUpload}
                      onDownloadInvoice={() => setTaskInvoicePrintRecordId(record.id)}
                      hasInvoice={Boolean(record.invoice)}
                    />
                  ))
              )}
            </div>
          </section>
        ) : null}

        {tab === 'archive' && userRole === 'finance' ? (
          <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="mb-4 text-base font-semibold text-slate-900">Archive Page</h2>
            <div className="space-y-3">
              {portalRecords
                .filter((record) => record.status === 'archived')
                .map((record) => (
                  <article key={record.id} className="rounded-xl border border-slate-200 p-4">
                    <p className="font-medium">{record.vendorName}</p>
                    <p className="text-xs text-slate-500">
                      File: {record.stampedPaperFileName ?? '-'}
                    </p>
                    <button
                      type="button"
                      onClick={() => publishPaper(record.id)}
                      className="mt-3 rounded-lg bg-violet-600 px-3 py-2 text-xs font-semibold text-white"
                    >
                      Publish paper form
                    </button>
                  </article>
                ))}
            </div>
          </section>
        ) : null}

        {tab === 'history' && userRole === 'buyers' ? (
          <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="mb-4 text-base font-semibold text-slate-900">History Page</h2>
            <div className="space-y-3">
              {portalRecords
                .filter((record) => record.status === 'history')
                .map((record) => (
                  <article key={record.id} className="rounded-xl border border-slate-200 p-4">
                    <p className="font-medium">{record.vendorName}</p>
                    <p className="text-xs text-slate-500">
                      Published: {record.publishedAt ? formatDate(record.publishedAt) : '-'}
                    </p>
                  </article>
                ))}
            </div>
          </section>
        ) : null}

        <section className="rounded-2xl border border-violet-200 bg-violet-50 p-6 shadow-sm">
          <h2 className="mb-3 text-base font-semibold text-violet-900">
              {userRole === 'buyers' ? 'Buyer Department Flow' : 'Finance Department Flow'}
          </h2>
          <p className="text-sm leading-relaxed text-violet-900/80">
            {userRole === 'buyers'
              ? 'Login → Create Data → list tampil di dashboard → reminder email 5 hari sebelum end date.'
              : 'Login → View list buyer → invoice form → task upload paper stamp → archive → history.'}
          </p>
        </section>
      </div>

      {userRole === 'buyers' && isCreateModalOpen ? (
        <div className="fixed inset-0 z-30 flex items-center justify-center bg-slate-900/30 p-4 backdrop-blur-sm">
          <div className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-2xl border border-slate-200 bg-white p-6 shadow-xl">
            <div className="mb-4 flex items-center justify-between gap-3">
              <h2 className="text-lg font-semibold text-slate-900">Tambah Data</h2>
              <ModalCloseButton onClick={() => setIsCreateModalOpen(false)} label="Close" />
            </div>
            <form onSubmit={submitBuyerForm} className="grid gap-4 md:grid-cols-2">
              <label className="space-y-1 text-sm md:col-span-2">
                <span>Vendor Code</span>
                <VendorPickerField
                  vendors={vendors}
                  value={buyerForm.vendorCode}
                  onChange={onChangeVendor}
                  loading={vendorsLoading}
                  labels={{
                    loading: 'Loading vendors…',
                    empty: 'No vendors in database yet',
                    searchPlaceholder: 'Search by code or name…',
                    noResults: 'No vendors match your search.',
                    listCount: '{count} vendors — scroll for all',
                  }}
                  addVendorLabel="Add vendor"
                  addVendorTitle="Add vendor"
                  addVendorCodeLabel="Vendor code"
                  addVendorNameLabel="Vendor name"
                  saveLabel="Save vendor"
                  closeLabel="Close"
                  onCreateVendor={createVendor}
                />
              </label>
              <label className="space-y-1 text-sm">
                <span>Vendor Name (automatic)</span>
                <input
                  value={buyerForm.vendorName || getVendorNameByCode(buyerForm.vendorCode)}
                  readOnly
                  className="w-full rounded-lg border border-slate-300 bg-slate-100 px-3 py-2 text-slate-700"
                />
              </label>
              <label className="space-y-1 text-sm">
                <span>Type Another Income</span>
                <input
                  value={buyerForm.incomeType}
                  onChange={(event) =>
                    setBuyerForm((prev) => ({ ...prev, incomeType: event.currentTarget.value }))
                  }
                  required
                  className="w-full rounded-lg border border-slate-300 px-3 py-2"
                />
              </label>
              <div className="md:col-span-2">
                <AgreementFileField
                  file={agreementFile}
                  onFileChange={(f) => {
                    setAgreementFile(f)
                    setBuyerForm((prev) => ({
                      ...prev,
                      agreementFileName: f?.name ?? '',
                    }))
                  }}
                  required
                  labels={{
                    choose: 'Agreement file',
                    selected: 'Selected:',
                    preview: 'Preview',
                    closePreview: 'Close',
                    remove: 'Remove',
                    previewUnavailable: 'Preview not available for this file type.',
                    hint: 'After you pick a file, a preview opens. Click Save to use it as the agreement file.',
                    confirmFile: 'Save as agreement file',
                    cancelPick: 'Cancel',
                  }}
                />
              </div>
              <label className="space-y-1 text-sm">
                <span>How much earn money</span>
                <div className="flex w-full items-stretch rounded-lg border border-slate-300 bg-white focus-within:border-violet-400 focus-within:ring-2 focus-within:ring-violet-200">
                  <span className="flex shrink-0 items-center border-r border-slate-200 bg-slate-50 px-3 text-sm font-medium text-slate-600">
                    Rp
                  </span>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={amountEarnedInput}
                    onChange={(e) => setAmountEarnedInput(formatIdrWhileTyping(e.target.value))}
                    placeholder="10.000"
                    required
                    className="min-w-0 flex-1 border-0 bg-transparent px-3 py-2 text-sm outline-none"
                  />
                </div>
              </label>
              <div className="space-y-1 md:col-span-2">
                <PeriodRangePicker
                  value={{ start: buyerForm.periodStart, end: buyerForm.periodEnd }}
                  onChange={(range) =>
                    setBuyerForm((prev) => ({
                      ...prev,
                      periodStart: range.start,
                      periodEnd: range.end,
                    }))
                  }
                  displayLocale="id-ID"
                  labels={{
                    combined: 'Periode (awal – akhir)',
                    start: 'Mulai',
                    end: 'Selesai',
                    hint: 'Pilih tanggal mulai, lalu tanggal selesai (seperti tiket pesawat).',
                    apply: 'Selesai',
                  }}
                />
              </div>
              <label className="space-y-1 text-sm md:col-span-2">
                <span>Description</span>
                <textarea
                  value={buyerForm.description}
                  onChange={(event) =>
                    setBuyerForm((prev) => ({ ...prev, description: event.currentTarget.value }))
                  }
                  required
                  className="min-h-24 w-full rounded-lg border border-slate-300 px-3 py-2"
                />
              </label>
              <div className="md:col-span-2 flex flex-wrap justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsCreateModalOpen(false)}
                  className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="rounded-lg bg-violet-600 px-4 py-2 text-sm font-semibold text-white"
                >
                  Create
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {taskInvoicePrintRecord?.invoice ? (
        <InvoicePrintModal
          record={taskInvoicePrintRecord}
          invoice={taskInvoicePrintRecord.invoice}
          allRecords={records}
          issuedAt={taskInvoicePrintRecord.generatedAt}
          title="Invoice — ready to print"
          printLabel="Print invoice"
          closeLabel="Close"
          onClose={() => setTaskInvoicePrintRecordId(null)}
        />
      ) : null}
    </div>
  )
}
