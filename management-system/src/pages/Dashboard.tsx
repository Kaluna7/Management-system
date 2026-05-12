import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { PeriodRangePicker } from '../components/PeriodRangePicker'
import { useAuth } from '../context/AuthContext'
import { useWorkflow } from '../context/WorkflowContext'
import type { BuyerInput, BuyerRecord, InvoiceData } from '../types/workflow'
import { formatIdrWhileTyping, parseIdrAmountInput } from '../utils/idrAmountInput'

const vendorOptions = [
  { code: 'V001', name: 'PT Sumber Retail Utama' },
  { code: 'V002', name: 'PT Prima Logistic Nusantara' },
  { code: 'V003', name: 'PT Mitra Promosi Indonesia' },
]

const signerOptions = ['Finance Manager', 'Head of Finance', 'Controller']

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

function parseNumberInput(value: string) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

function TaskStampRow({
  record,
  onPickFile,
}: {
  record: BuyerRecord
  onPickFile: (recordId: string, file: File) => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  return (
    <article className="rounded-xl border border-slate-200 p-4">
      <p className="font-medium">{record.vendorName}</p>
      <p className="text-xs text-slate-500">Finance download by {record.generatedBy ?? '-'}</p>
      <input
        ref={inputRef}
        type="file"
        className="sr-only"
        accept=".pdf,application/pdf,image/*"
        onChange={(e) => {
          const f = e.target.files?.[0]
          if (f) onPickFile(record.id, f)
          e.target.value = ''
        }}
      />
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        className="mt-3 rounded-lg bg-slate-800 px-3 py-2 text-xs font-semibold text-white"
      >
        Upload paper with stamp
      </button>
    </article>
  )
}

function financeInvoiceNotDone(record: BuyerRecord) {
  return !['document_generated', 'archived', 'history'].includes(record.status)
}

function summaryFrom(records: BuyerRecord[], role: 'buyers' | 'finance') {
  const reminderCount = records.filter(
    (record) => daysUntil(record.periodEnd) <= 5 && record.status !== 'history',
  ).length
  return [
    { label: 'Total data buyer', value: String(records.length) },
    { label: 'Perlu reminder (<=5 hari)', value: String(reminderCount) },
    {
      label: role === 'buyers' ? 'Data selesai diproses finance' : 'Invoice finance selesai',
      value: String(
        records.filter((record) =>
          role === 'buyers'
            ? record.status === 'history'
            : ['document_generated', 'archived', 'history'].includes(record.status),
        ).length,
      ),
    },
  ]
}

export function Dashboard() {
  const { user, logout } = useAuth()
  const { records, createBuyerData, setInvoiceReceived, createInvoice, uploadStampedPaper, publishPaper } =
    useWorkflow()
  const userName = user?.name ?? 'User'
  const userRole = user?.role ?? 'buyers'
  const userDepartment = user?.departmentLabel ?? 'Department'

  const [tab, setTab] = useState<'dashboard' | 'invoice' | 'task' | 'archive' | 'history'>(
    'dashboard',
  )
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false)
  const [amountEarnedInput, setAmountEarnedInput] = useState('')
  const [selectedRecordId, setSelectedRecordId] = useState<string>('')
  const [buyerForm, setBuyerForm] = useState<BuyerInput>({
    vendorCode: vendorOptions[0].code,
    vendorName: vendorOptions[0].name,
    incomeType: '',
    agreementFileName: '',
    amount: 0,
    periodStart: '',
    periodEnd: '',
    description: '',
  })
  const [invoiceForm, setInvoiceForm] = useState<Omit<InvoiceData, 'party'>>({
    number: '',
    attn: userName,
    paymentMethod: 'Transfer',
    dueDate: '',
    memo: '',
    vatPercent: 11,
    taxType: 'Tax art 23',
    taxPercent: 2,
    transferTo: 'Bank Mayapada',
    bankBranch: '',
    accountNo: '',
    beneficiaryName: '',
    formulaFormFileName: '',
    signer: signerOptions[0],
  })

  const selectedRecord = records.find((record) => record.id === selectedRecordId)
  const summaryCards = useMemo(() => summaryFrom(records, userRole), [records, userRole])

  const handleTaskStampUpload = useCallback(
    async (recordId: string, file: File) => {
      try {
        await uploadStampedPaper(recordId, file.name)
        setTab('archive')
      } catch {
        /* stay on task */
      }
    },
    [uploadStampedPaper],
  )
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

  if (!user) return null

  function onChangeVendor(nextCode: string) {
    const selected = vendorOptions.find((option) => option.code === nextCode)
    if (!selected) return
    setBuyerForm((prev) => ({ ...prev, vendorCode: selected.code, vendorName: selected.name }))
  }

  function submitBuyerForm(event: FormEvent) {
    event.preventDefault()
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
    createBuyerData({ ...buyerForm, amount: amountParsed }, userName)
    setBuyerForm({
      vendorCode: vendorOptions[0].code,
      vendorName: vendorOptions[0].name,
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
    createInvoice(
      selectedRecord.id,
      {
        ...invoiceForm,
        party: selectedRecord.vendorName,
      },
      userName,
    )
    setTab('task')
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
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
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
                  {records.map((record) => {
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
                {records
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
                <label className="space-y-1 text-sm">
                  <span>No (auto take vendor code)</span>
                  <input
                    value={invoiceForm.number}
                    onChange={(event) =>
                      setInvoiceForm((prev) => ({ ...prev, number: event.currentTarget.value }))
                    }
                    placeholder={`${selectedRecord.vendorCode}-001`}
                    required
                    className="w-full rounded-lg border border-slate-300 px-3 py-2"
                  />
                </label>
                <label className="space-y-1 text-sm">
                  <span>Party (auto)</span>
                  <input
                    value={selectedRecord.vendorName}
                    readOnly
                    className="w-full rounded-lg border border-slate-300 bg-slate-100 px-3 py-2"
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
                    onChange={(event) =>
                      setInvoiceForm((prev) => ({ ...prev, dueDate: event.currentTarget.value }))
                    }
                    required
                    className="w-full rounded-lg border border-slate-300 px-3 py-2"
                  />
                </label>
                <label className="space-y-1 text-sm">
                  <span>Memo</span>
                  <input
                    value={invoiceForm.memo}
                    onChange={(event) =>
                      setInvoiceForm((prev) => ({ ...prev, memo: event.currentTarget.value }))
                    }
                    className="w-full rounded-lg border border-slate-300 px-3 py-2"
                  />
                </label>
                <label className="space-y-1 text-sm">
                  <span>Value add tax (%)</span>
                  <input
                    type="number"
                    value={invoiceForm.vatPercent}
                    onChange={(event) =>
                      setInvoiceForm((prev) => ({
                        ...prev,
                        vatPercent: parseNumberInput(event.currentTarget.value),
                      }))
                    }
                    className="w-full rounded-lg border border-slate-300 px-3 py-2"
                  />
                </label>
                <label className="space-y-1 text-sm">
                  <span>Tax type</span>
                  <select
                    value={invoiceForm.taxType}
                    onChange={(event) =>
                      setInvoiceForm((prev) => ({
                        ...prev,
                        taxType: event.currentTarget.value as InvoiceData['taxType'],
                      }))
                    }
                    className="w-full rounded-lg border border-slate-300 px-3 py-2"
                  >
                    <option>Tax art 23</option>
                    <option>Tax art 4(2)</option>
                  </select>
                </label>
                <label className="space-y-1 text-sm">
                  <span>Tax percent</span>
                  <input
                    type="number"
                    value={invoiceForm.taxPercent}
                    onChange={(event) =>
                      setInvoiceForm((prev) => ({
                        ...prev,
                        taxPercent: parseNumberInput(event.currentTarget.value),
                      }))
                    }
                    className="w-full rounded-lg border border-slate-300 px-3 py-2"
                  />
                </label>
                <label className="space-y-1 text-sm">
                  <span>Transfer to</span>
                  <input
                    value={invoiceForm.transferTo}
                    onChange={(event) =>
                      setInvoiceForm((prev) => ({ ...prev, transferTo: event.currentTarget.value }))
                    }
                    className="w-full rounded-lg border border-slate-300 px-3 py-2"
                  />
                </label>
                <label className="space-y-1 text-sm">
                  <span>Bank branch</span>
                  <input
                    value={invoiceForm.bankBranch}
                    onChange={(event) =>
                      setInvoiceForm((prev) => ({ ...prev, bankBranch: event.currentTarget.value }))
                    }
                    required
                    className="w-full rounded-lg border border-slate-300 px-3 py-2"
                  />
                </label>
                <label className="space-y-1 text-sm">
                  <span>Account no</span>
                  <input
                    value={invoiceForm.accountNo}
                    onChange={(event) =>
                      setInvoiceForm((prev) => ({ ...prev, accountNo: event.currentTarget.value }))
                    }
                    required
                    className="w-full rounded-lg border border-slate-300 px-3 py-2"
                  />
                </label>
                <label className="space-y-1 text-sm">
                  <span>Beneficiary name</span>
                  <input
                    value={invoiceForm.beneficiaryName}
                    onChange={(event) =>
                      setInvoiceForm((prev) => ({
                        ...prev,
                        beneficiaryName: event.currentTarget.value,
                      }))
                    }
                    required
                    className="w-full rounded-lg border border-slate-300 px-3 py-2"
                  />
                </label>
                <label className="space-y-1 text-sm">
                  <span>Formula form (required)</span>
                  <input
                    value={invoiceForm.formulaFormFileName}
                    onChange={(event) =>
                      setInvoiceForm((prev) => ({
                        ...prev,
                        formulaFormFileName: event.currentTarget.value,
                      }))
                    }
                    placeholder="formula-form.pdf"
                    required
                    className="w-full rounded-lg border border-slate-300 px-3 py-2"
                  />
                </label>
                <label className="space-y-1 text-sm">
                  <span>Signature name</span>
                  <select
                    value={invoiceForm.signer}
                    onChange={(event) =>
                      setInvoiceForm((prev) => ({ ...prev, signer: event.currentTarget.value }))
                    }
                    className="w-full rounded-lg border border-slate-300 px-3 py-2"
                  >
                    {signerOptions.map((name) => (
                      <option key={name}>{name}</option>
                    ))}
                  </select>
                </label>
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
              {records.filter((record) => record.status === 'document_generated').length === 0 ? (
                <p className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-6 text-sm text-slate-500">
                  Belum ada tugas. Data muncul setelah invoice disimpan.
                </p>
              ) : (
                records
                  .filter((record) => record.status === 'document_generated')
                  .map((record) => (
                    <TaskStampRow
                      key={record.id}
                      record={record}
                      onPickFile={handleTaskStampUpload}
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
              {records
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
              {records
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
              <button
                type="button"
                onClick={() => setIsCreateModalOpen(false)}
                className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50"
              >
                Close
              </button>
            </div>
            <form onSubmit={submitBuyerForm} className="grid gap-4 md:grid-cols-2">
              <label className="space-y-1 text-sm">
                <span>Vendor Code</span>
                <select
                  value={buyerForm.vendorCode}
                  onChange={(event) => onChangeVendor(event.currentTarget.value)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2"
                >
                  {vendorOptions.map((option) => (
                    <option key={option.code} value={option.code}>
                      {option.code} - {option.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="space-y-1 text-sm">
                <span>Vendor Name</span>
                <input
                  value={buyerForm.vendorName}
                  readOnly
                  className="w-full rounded-lg border border-slate-300 bg-slate-100 px-3 py-2"
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
              <label className="space-y-1 text-sm">
                <span>Agreement File Name</span>
                <input
                  type="file"
                  onChange={(event) =>
                    setBuyerForm((prev) => ({
                      ...prev,
                      agreementFileName: event.currentTarget.files?.[0]?.name ?? '',
                    }))
                  }
                  required
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm file:mr-3 file:rounded-md file:border-0 file:bg-violet-50 file:px-3 file:py-1.5 file:font-medium file:text-violet-700"
                />
                {buyerForm.agreementFileName ? (
                  <p className="text-xs text-slate-500">Selected: {buyerForm.agreementFileName}</p>
                ) : null}
              </label>
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
    </div>
  )
}
