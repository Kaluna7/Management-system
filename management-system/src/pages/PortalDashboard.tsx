import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent as ReactKeyboardEvent,
} from 'react'
import { Navigate, NavLink, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import { LanguageToggle } from '../components/LanguageToggle'
import { PeriodRangePicker, type PeriodRangeValue } from '../components/PeriodRangePicker'
import { RevenueLineChart } from '../components/RevenueLineChart'
import { useAuth } from '../context/AuthContext'
import { useLanguage } from '../context/LanguageContext'
import { useWorkflow } from '../context/WorkflowContext'
import type { StringKey } from '../i18n/strings'
import type { BuyerRecord, InvoiceData } from '../types/workflow'
import {
  defaultDownloadFileName,
  downloadPublishedRecordTextSummary,
  downloadRecordFileFromApi,
  type ArchiveFileKind,
} from '../utils/recordFileDownload'
import { formatIdrWhileTyping, parseIdrAmountInput } from '../utils/idrAmountInput'

const vendorOptions = [
  { code: 'V001', name: 'PT Sumber Retail Utama' },
  { code: 'V002', name: 'PT Prima Logistic Nusantara' },
  { code: 'V003', name: 'PT Mitra Promosi Indonesia' },
]

const signerOptions = ['Finance Manager', 'Head of Finance', 'Controller']

function formatDate(isoDate: string, dateLocale: string) {
  const date = new Date(isoDate)
  if (Number.isNaN(date.getTime())) return '-'
  return date.toLocaleDateString(dateLocale, {
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

const FINANCE_INVOICE_DONE_STATUSES = ['document_generated', 'archived', 'history'] as const

function financeInvoiceNotDone(record: BuyerRecord) {
  return !FINANCE_INVOICE_DONE_STATUSES.includes(record.status as (typeof FINANCE_INVOICE_DONE_STATUSES)[number])
}

function parseNumberInput(value: string) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

/** Archived / published — hidden from Overview for both Buyers and Finance. */
function isRecordFinishedOffOverview(record: BuyerRecord) {
  return record.status === 'archived' || record.status === 'history'
}

function summaryFrom(records: BuyerRecord[]) {
  const dashboardPool = records.filter((r) => !isRecordFinishedOffOverview(r))

  const reminderCount = dashboardPool.filter(
    (record) => daysUntil(record.periodEnd) <= 5 && record.status !== 'history',
  ).length
  /** Invoice saved by finance (document out) through archive/history — not only rows still in Task. */
  const financeInvoicesDone = records.filter((record) =>
    ['document_generated', 'archived', 'history'].includes(record.status),
  ).length
  return [
    { labelKey: 'summaryTotalBuyerData' as const, value: String(dashboardPool.length) },
    { labelKey: 'summaryReminder' as const, value: String(reminderCount) },
    {
      labelKey: 'summaryFinanceInvoicesDone' as const,
      value: String(financeInvoicesDone),
    },
  ] satisfies { labelKey: StringKey; value: string }[]
}

function buyerHistorySortKey(record: BuyerRecord) {
  const iso = record.publishedAt ?? record.archivedAt ?? record.createdAt
  return new Date(iso).getTime()
}

/** Local calendar day match for `<input type="date">` value `YYYY-MM-DD`. */
function calendarDayMatchesTimestamp(ms: number, ymd: string) {
  if (!ymd) return true
  if (!Number.isFinite(ms)) return false
  const d = new Date(ms)
  const parts = ymd.split('-').map(Number)
  if (parts.length !== 3 || parts.some((x) => !Number.isFinite(x))) return true
  const [y, m, day] = parts
  return d.getFullYear() === y && d.getMonth() + 1 === m && d.getDate() === day
}

function navLinkClass(isActive: boolean, layout: 'row' | 'stack') {
  const active = isActive ? 'bg-violet-600 text-white' : 'text-slate-600 hover:bg-violet-50 hover:text-violet-700'
  const layoutCls =
    layout === 'stack'
      ? 'block w-full text-left'
      : 'inline-flex items-center justify-center whitespace-nowrap'
  return `rounded-lg px-3 py-2 text-sm font-medium transition ${active} ${layoutCls}`
}

function ArchivePublishedDownloadButtons({
  record,
  apiConnected,
  t,
  onDownloadKind,
  onDownloadSummary,
}: {
  record: BuyerRecord
  apiConnected: boolean
  t: (key: StringKey) => string
  onDownloadKind: (kind: ArchiveFileKind) => void | Promise<void>
  onDownloadSummary: () => void
}) {
  const btnClass =
    'rounded-lg border border-emerald-400/80 bg-white px-2.5 py-1.5 text-xs font-semibold text-emerald-950 transition hover:bg-emerald-100/80'

  return (
    <div className="mt-3 flex flex-col gap-2 border-t border-emerald-200/80 pt-3">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-emerald-900">
        {t('archivePublishedDocumentsLabel')}
      </p>
      <div className="flex flex-wrap gap-2">
        {apiConnected ? (
          <>
            <button type="button" className={btnClass} onClick={() => void onDownloadKind('stamped-paper')}>
              {t('archiveDownloadStampedPaper')}
            </button>
            {record.invoice ? (
              <button type="button" className={btnClass} onClick={() => void onDownloadKind('formula-form')}>
                {t('archiveDownloadFormulaForm')}
              </button>
            ) : null}
            {record.agreementFileName ? (
              <button type="button" className={btnClass} onClick={() => void onDownloadKind('agreement')}>
                {t('archiveDownloadAgreement')}
              </button>
            ) : null}
          </>
        ) : (
          <button type="button" className={btnClass} onClick={onDownloadSummary}>
            {t('archiveDownloadSummaryOffline')}
          </button>
        )}
      </div>
    </div>
  )
}

function FinanceTaskRow({
  record,
  onPickFile,
  uploadLabel,
  financeByText,
}: {
  record: BuyerRecord
  onPickFile: (recordId: string, file: File) => void
  uploadLabel: string
  financeByText: string
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  return (
    <article className="rounded-xl border border-slate-200 p-4">
      <p className="font-medium">{record.vendorName}</p>
      <p className="text-xs text-slate-500">{financeByText}</p>
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
        {uploadLabel}
      </button>
    </article>
  )
}

export function PortalDashboard() {
  const { t, dateLocale, locale } = useLanguage()
  const { user, logout, authToken } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const {
    records,
    isLoading,
    apiConnected,
    createBuyerData,
    createInvoice,
    uploadStampedPaper,
    publishPaper,
  } = useWorkflow()

  const userName = user?.name ?? 'User'
  const userRole = user?.role ?? 'buyers'
  const userDepartment = user?.departmentLabel ?? 'Department'
  const summaryCards = useMemo(() => summaryFrom(records), [records])

  const activeDashboardRecords = useMemo(
    () => records.filter((r) => !isRecordFinishedOffOverview(r)),
    [records],
  )

  const buyerHistoryRecords = useMemo(
    () =>
      [...records.filter((r) => r.status === 'archived' || r.status === 'history')].sort(
        (a, b) => buyerHistorySortKey(b) - buyerHistorySortKey(a),
      ),
    [records],
  )

  const financeArchiveSourceList = useMemo(
    () =>
      [...records.filter((r) => r.status === 'archived' || r.status === 'history')].sort(
        (a, b) => buyerHistorySortKey(b) - buyerHistorySortKey(a),
      ),
    [records],
  )

  const financeArchiveYearOptions = useMemo(() => {
    const years = new Set<number>()
    for (const r of financeArchiveSourceList) {
      const ms = buyerHistorySortKey(r)
      if (!Number.isFinite(ms)) continue
      years.add(new Date(ms).getFullYear())
    }
    return [...years].sort((a, b) => b - a)
  }, [financeArchiveSourceList])

  const formatIdr = useMemo(
    () =>
      new Intl.NumberFormat(dateLocale === 'id' ? 'id-ID' : 'en-GB', {
        style: 'currency',
        currency: 'IDR',
        maximumFractionDigits: 0,
      }),
    [dateLocale],
  )

  const handleArchivePublishedDownload = useCallback(
    async (record: BuyerRecord, kind: ArchiveFileKind) => {
      try {
        if (apiConnected) {
          await downloadRecordFileFromApi({
            recordId: record.id,
            kind,
            authToken,
            fallbackFileName: defaultDownloadFileName(record, kind),
          })
        } else {
          downloadPublishedRecordTextSummary(record, locale)
        }
      } catch {
        window.alert(t('archiveDownloadFailed'))
      }
    },
    [apiConnected, authToken, locale, t],
  )

  const handleTaskStampUpload = useCallback(
    async (recordId: string, file: File) => {
      try {
        await uploadStampedPaper(recordId, file.name)
        navigate('/dashboard/archive')
      } catch {
        /* stay on task */
      }
    },
    [uploadStampedPaper, navigate],
  )
  const financeInvoiceList = useMemo(
    () => records.filter((record) => financeInvoiceNotDone(record)),
    [records],
  )

  const [selectedRecordId, setSelectedRecordId] = useState<string>('')
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false)
  const [detailRecordId, setDetailRecordId] = useState<string | null>(null)
  const [selectedVendorCode, setSelectedVendorCode] = useState(vendorOptions[0].code)
  const [agreementFileName, setAgreementFileName] = useState('')
  const [amountEarnedInput, setAmountEarnedInput] = useState('')
  const [periodRange, setPeriodRange] = useState<PeriodRangeValue>({ start: '', end: '' })
  const [isInvoiceModalOpen, setIsInvoiceModalOpen] = useState(false)
  const [mobileNavOpen, setMobileNavOpen] = useState(false)
  const [archiveFilterYear, setArchiveFilterYear] = useState('')
  const [archiveFilterDate, setArchiveFilterDate] = useState('')

  const financeArchiveFiltered = useMemo(() => {
    const ySel = archiveFilterYear === '' ? null : Number(archiveFilterYear)
    return financeArchiveSourceList.filter((r) => {
      const ms = buyerHistorySortKey(r)
      if (ySel !== null) {
        if (!Number.isFinite(ms) || new Date(ms).getFullYear() !== ySel) return false
      }
      if (archiveFilterDate !== '' && !calendarDayMatchesTimestamp(ms, archiveFilterDate)) return false
      return true
    })
  }, [financeArchiveSourceList, archiveFilterYear, archiveFilterDate])

  useEffect(() => {
    const p = location.pathname.replace(/\/+$/, '') || '/'
    if (!p.endsWith('/archive')) {
      setArchiveFilterYear('')
      setArchiveFilterDate('')
    }
  }, [location.pathname])

  const selectedRecord =
    financeInvoiceList.find((record) => record.id === selectedRecordId) ??
    financeInvoiceList[0] ??
    null
  const detailRecord = records.find((record) => record.id === detailRecordId) ?? null
  const selectedVendor = vendorOptions.find((option) => option.code === selectedVendorCode)
  const pathNormalized = location.pathname.replace(/\/+$/, '') || '/'
  const hideArchiveRevenueChart =
    pathNormalized.endsWith('/task') ||
    pathNormalized.endsWith('/archive') ||
    pathNormalized.endsWith('/history')
  const hideDashboardSummary =
    pathNormalized.endsWith('/task') ||
    pathNormalized.endsWith('/archive') ||
    pathNormalized.endsWith('/history')

  useEffect(() => {
    if (selectedRecord && selectedRecordId !== selectedRecord.id) {
      setSelectedRecordId(selectedRecord.id)
    }
  }, [selectedRecord, selectedRecordId])

  useEffect(() => {
    setMobileNavOpen(false)
  }, [location.pathname])

  useEffect(() => {
    if (isCreateModalOpen) {
      setAmountEarnedInput('')
      setPeriodRange({ start: '', end: '' })
    }
  }, [isCreateModalOpen])

  useEffect(() => {
    if (!location.pathname.endsWith('/invoice')) return
    navigate('/dashboard', { replace: true })
  }, [location.pathname, navigate])

  useEffect(() => {
    setIsInvoiceModalOpen(false)
  }, [location.pathname])

  useEffect(() => {
    if (!isInvoiceModalOpen) return
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === 'Escape') setIsInvoiceModalOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [isInvoiceModalOpen])

  if (!user) return null

  function goToInvoiceForRecord(recordId: string) {
    setSelectedRecordId(recordId)
    setDetailRecordId(null)
    setIsInvoiceModalOpen(true)
  }

  function submitBuyerForm(event: FormEvent) {
    event.preventDefault()
    const form = event.currentTarget as HTMLFormElement
    const formData = new FormData(form)
    const vendorCode = String(formData.get('vendorCode') ?? selectedVendorCode)
    const vendorName =
      vendorOptions.find((option) => option.code === vendorCode)?.name ?? selectedVendor?.name ?? ''
    const amountParsed = parseIdrAmountInput(amountEarnedInput)
    if (!Number.isFinite(amountParsed) || amountParsed <= 0) {
      window.alert(t('amountEarnedInvalid'))
      return
    }
    if (!periodRange.start || !periodRange.end) {
      window.alert(t('periodRangeInvalid'))
      return
    }
    if (periodRange.end < periodRange.start) {
      window.alert(t('periodRangeOrderInvalid'))
      return
    }
    createBuyerData({
      vendorCode,
      vendorName,
      incomeType: String(formData.get('incomeType') ?? ''),
      agreementFileName: agreementFileName || 'agreement-file',
      amount: amountParsed,
      periodStart: periodRange.start,
      periodEnd: periodRange.end,
      description: String(formData.get('description') ?? ''),
    }, userName)
    form.reset()
    setSelectedVendorCode(vendorOptions[0].code)
    setAgreementFileName('')
    setAmountEarnedInput('')
    setPeriodRange({ start: '', end: '' })
    setIsCreateModalOpen(false)
    navigate('/dashboard')
  }

  function submitInvoice(event: FormEvent) {
    event.preventDefault()
    if (!selectedRecord) return
    const form = event.currentTarget as HTMLFormElement
    const formData = new FormData(form)
    const formulaFormFile = formData.get('formulaFormFile')
    const formulaFormFileName =
      formulaFormFile instanceof File ? formulaFormFile.name : ''
    if (!formulaFormFileName.toLowerCase().endsWith('.pdf')) return
    const invoice: InvoiceData = {
      number: String(formData.get('number') ?? ''),
      party: selectedRecord.vendorName,
      attn: String(formData.get('attn') ?? userName),
      paymentMethod: (String(formData.get('paymentMethod') ?? 'Transfer') === 'Reduce the bill'
        ? 'Reduce the bill'
        : 'Transfer') as InvoiceData['paymentMethod'],
      dueDate: String(formData.get('dueDate') ?? ''),
      memo: String(formData.get('memo') ?? ''),
      vatPercent: parseNumberInput(String(formData.get('vatPercent') ?? 11)),
      taxType: (String(formData.get('taxType') ?? 'Tax art 23') === 'Tax art 4(2)'
        ? 'Tax art 4(2)'
        : 'Tax art 23') as InvoiceData['taxType'],
      taxPercent: parseNumberInput(String(formData.get('taxPercent') ?? 2)),
      transferTo: String(formData.get('transferTo') ?? 'Bank Mayapada'),
      bankBranch: String(formData.get('bankBranch') ?? ''),
      accountNo: String(formData.get('accountNo') ?? ''),
      beneficiaryName: String(formData.get('beneficiaryName') ?? ''),
      formulaFormFileName,
      signer: String(formData.get('signer') ?? signerOptions[0]),
    }
    createInvoice(
      selectedRecord.id,
      invoice,
      userName,
    )
    form.reset()
    setIsInvoiceModalOpen(false)
  }

  function preventEnterSubmit(event: ReactKeyboardEvent<HTMLFormElement>) {
    if (event.key === 'Enter') {
      const target = event.target as HTMLElement
      if (target.tagName !== 'TEXTAREA') {
        event.preventDefault()
      }
    }
  }

  const navItems =
    userRole === 'buyers'
      ? [
          { to: '/dashboard', labelKey: 'navOverview' as const, end: true },
          { to: '/dashboard/history', labelKey: 'navHistory' as const },
        ]
      : [
          { to: '/dashboard', labelKey: 'navOverview' as const, end: true },
          { to: '/dashboard/task', labelKey: 'navTask' as const },
          { to: '/dashboard/archive', labelKey: 'navArchive' as const },
        ]

  return (
    <div className="min-h-screen bg-slate-100 text-slate-800">
      <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/95 shadow-sm backdrop-blur">
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <div className="flex items-center gap-3 py-3 md:gap-4 md:py-3.5">
            <div className="min-w-0 flex-1 md:max-w-[13rem] lg:max-w-[16rem] lg:flex-none">
              <p className="text-[10px] font-semibold uppercase tracking-widest text-violet-600 sm:text-xs">
                {t('dashboardLabel')}
              </p>
              <h1 className="truncate text-base font-semibold text-slate-900 sm:text-lg">{userDepartment}</h1>
              <p className="truncate text-xs text-slate-500 sm:text-sm">
                {userName} · {userRole === 'buyers' ? t('roleBuyers') : t('roleFinance')}
              </p>
            </div>

            <nav
              className="hidden min-w-0 flex-1 items-center justify-center md:flex"
              aria-label={t('menuNavigation')}
            >
              <div className="flex max-w-full flex-wrap items-center justify-center gap-1 lg:gap-2">
                {navItems.map((item) => (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    end={item.end}
                    className={({ isActive }) => navLinkClass(isActive, 'row')}
                  >
                    {t(item.labelKey)}
                  </NavLink>
                ))}
              </div>
            </nav>

            <div className="flex shrink-0 items-center gap-2">
              <LanguageToggle className="rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-xs font-semibold text-slate-700 shadow-sm outline-none transition hover:border-violet-400 focus:border-violet-400 focus:ring-2 focus:ring-violet-200 sm:px-2.5" />
              <button
                type="button"
                onClick={logout}
                className="hidden rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 text-sm font-medium text-slate-700 transition hover:border-violet-300 hover:text-violet-700 md:inline-flex"
              >
                {t('logout')}
              </button>
              <button
                type="button"
                className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-slate-300 bg-slate-50 text-slate-700 transition hover:border-violet-300 hover:bg-violet-50 hover:text-violet-700 md:hidden"
                aria-expanded={mobileNavOpen}
                aria-controls="dashboard-mobile-nav"
                onClick={() => setMobileNavOpen((open) => !open)}
                aria-label={mobileNavOpen ? t('closeMenu') : t('openMenu')}
              >
                {mobileNavOpen ? (
                  <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
                  </svg>
                ) : (
                  <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M4 7h16M4 12h16M4 17h16" strokeLinecap="round" />
                  </svg>
                )}
              </button>
            </div>
          </div>

          <div
            id="dashboard-mobile-nav"
            className={`border-t border-slate-100 md:hidden ${mobileNavOpen ? 'block' : 'hidden'}`}
          >
            <nav className="flex flex-col gap-1 px-0 py-3" aria-label={t('menuNavigation')}>
              {navItems.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.end}
                  onClick={() => setMobileNavOpen(false)}
                  className={({ isActive }) => navLinkClass(isActive, 'stack')}
                >
                  {t(item.labelKey)}
                </NavLink>
              ))}
            </nav>
            <div className="border-t border-slate-100 px-0 pb-3">
              <button
                type="button"
                className="mt-3 w-full rounded-lg border border-slate-300 bg-slate-50 px-4 py-2.5 text-sm font-medium text-slate-700 transition hover:border-violet-300 hover:text-violet-700"
                onClick={() => {
                  setMobileNavOpen(false)
                  logout()
                }}
              >
                {t('logout')}
              </button>
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl space-y-6 px-4 py-6 sm:px-6">
          {!hideDashboardSummary ? (
            <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <h2 className="text-base font-semibold text-slate-900">{t('summaryTitle')}</h2>
                <div className="rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-600">
                  {apiConnected ? t('apiConnected') : t('apiOffline')}
                </div>
                {userRole === 'buyers' ? (
                  <button
                    type="button"
                    onClick={() => setIsCreateModalOpen(true)}
                    className="rounded-lg bg-violet-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-violet-500"
                  >
                    + {t('addData')}
                  </button>
                ) : null}
              </div>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {summaryCards.map((card) => (
                  <article key={card.labelKey} className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                    <p className="mb-1 font-mono text-2xl font-bold text-slate-900">{card.value}</p>
                    <p className="text-sm text-slate-600">{t(card.labelKey)}</p>
                  </article>
                ))}
              </div>
            </section>
          ) : null}

          {!hideArchiveRevenueChart ? (
            <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="mb-4">
                <h2 className="text-base font-semibold text-slate-900">{t('chartArchiveRevenueTitle')}</h2>
                <p className="mt-1 text-xs text-slate-500 sm:text-sm">{t('chartArchiveRevenueSubtitle')}</p>
                <p className="mt-0.5 text-[10px] font-medium uppercase tracking-wide text-violet-600 sm:text-xs">
                  {t('chartCumulativeLabel')}
                </p>
              </div>
              <RevenueLineChart records={records} t={t} dateLocale={dateLocale} />
            </section>
          ) : null}

          <Routes>
            <Route
              index
              element={
                <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                  <h2 className="mb-4 text-base font-semibold text-slate-900">
                    {userRole === 'buyers' ? t('listBuyersLatest') : t('listBuyersFinance')}
                  </h2>
                  <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                    {activeDashboardRecords.length === 0 ? (
                      <p className="col-span-full rounded-xl border border-dashed border-slate-300 bg-slate-50 p-6 text-sm text-slate-500">
                        {userRole === 'buyers' ? t('buyerDashboardListEmpty') : t('financeDashboardListEmpty')}
                      </p>
                    ) : null}
                    {activeDashboardRecords.map((record) => {
                      const reminder = daysUntil(record.periodEnd)
                      return (
                        <button
                          key={record.id}
                          type="button"
                          onClick={() => setDetailRecordId(record.id)}
                          className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-left shadow-sm transition hover:border-violet-300 hover:bg-white"
                        >
                          <p className="font-semibold text-slate-900">{record.vendorName}</p>
                          <p className="text-xs text-slate-500">{record.vendorCode}</p>
                          <div className="mt-3 space-y-1 text-xs text-slate-600">
                            <p>
                              <span className="font-medium">{t('periodEnd')}</span>{' '}
                              {formatDate(record.periodEnd, dateLocale)}
                            </p>
                            <p>
                              <span className="font-medium">{t('statusLabel')}</span>{' '}
                              <span className="capitalize">{record.status.replaceAll('_', ' ')}</span>
                            </p>
                          </div>
                          <div className="mt-3 flex items-center gap-2">
                            {reminder <= 5 ? (
                              <span className="rounded-full bg-amber-100 px-2 py-1 text-xs text-amber-700">
                                {t('emailReminder')}
                              </span>
                            ) : (
                              <span className="rounded-full bg-slate-200 px-2 py-1 text-xs text-slate-600">
                                {t('normal')}
                              </span>
                            )}
                          </div>
                        </button>
                      )
                    })}
                  </div>
                </section>
              }
            />


            <Route path="invoice" element={<Navigate to="/dashboard" replace />} />

            <Route
              path="task"
              element={
                userRole === 'finance' ? (
                  <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                    <h2 className="mb-4 text-base font-semibold text-slate-900">{t('taskPageTitle')}</h2>
                    <p className="mb-4 text-sm text-slate-600">
                      {t('taskPageSubtitle')}
                    </p>
                    <div className="space-y-3">
                      {records.filter((record) => record.status === 'document_generated').length === 0 ? (
                        <p className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-6 text-sm text-slate-500">
                          {t('taskPageEmpty')}
                        </p>
                      ) : (
                        records
                          .filter((record) => record.status === 'document_generated')
                          .map((record) => (
                            <FinanceTaskRow
                              key={record.id}
                              record={record}
                              onPickFile={handleTaskStampUpload}
                              uploadLabel={t('uploadStampedPaper')}
                              financeByText={`${t('financeDownloadBy')} ${record.generatedBy ?? '-'}`}
                            />
                          ))
                      )}
                    </div>
                  </section>
                ) : (
                  <Navigate to="/dashboard" replace />
                )
              }
            />

            <Route
              path="archive"
              element={
                userRole === 'finance' ? (
                  <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                    <h2 className="mb-4 text-base font-semibold text-slate-900">{t('archivePageTitle')}</h2>
                    <p className="mb-4 text-sm text-slate-600">{t('archivePageSubtitle')}</p>
                    <div className="mb-5 flex flex-col gap-3 rounded-xl border border-slate-200 bg-slate-50/80 p-4 sm:flex-row sm:flex-wrap sm:items-end">
                      <label className="flex min-w-[10rem] flex-col gap-1 text-xs font-medium text-slate-700">
                        {t('archiveFilterYearLabel')}
                        <select
                          value={archiveFilterYear}
                          onChange={(e) => setArchiveFilterYear(e.target.value)}
                          className="rounded-lg border border-slate-300 bg-white px-2 py-2 text-sm text-slate-900"
                        >
                          <option value="">{t('archiveFilterYearAll')}</option>
                          {financeArchiveYearOptions.map((y) => (
                            <option key={y} value={String(y)}>
                              {y}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="flex min-w-[10rem] flex-col gap-1 text-xs font-medium text-slate-700">
                        {t('archiveFilterDateLabel')}
                        <input
                          type="date"
                          value={archiveFilterDate}
                          onChange={(e) => setArchiveFilterDate(e.target.value)}
                          className="rounded-lg border border-slate-300 bg-white px-2 py-2 text-sm text-slate-900"
                        />
                      </label>
                      {(archiveFilterYear !== '' || archiveFilterDate !== '') && (
                        <button
                          type="button"
                          onClick={() => {
                            setArchiveFilterYear('')
                            setArchiveFilterDate('')
                          }}
                          className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-100 sm:mb-0.5"
                        >
                          {t('archiveFilterReset')}
                        </button>
                      )}
                    </div>
                    <div className="space-y-3">
                      {financeArchiveSourceList.length === 0 ? (
                        <p className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-6 text-sm text-slate-500">
                          {t('archivePageEmpty')}
                        </p>
                      ) : financeArchiveFiltered.length === 0 ? (
                        <p className="rounded-xl border border-dashed border-amber-200 bg-amber-50/60 p-6 text-sm text-amber-950/90">
                          {t('archiveFilterNoResults')}
                        </p>
                      ) : (
                        financeArchiveFiltered.map((record) => {
                          const isPublished = record.status === 'history'
                          return (
                            <article
                              key={record.id}
                              className={`rounded-xl border p-4 ${
                                isPublished
                                  ? 'border-emerald-200 bg-emerald-50/40'
                                  : 'border-slate-200 bg-white'
                              }`}
                            >
                              <div
                                role="button"
                                tabIndex={0}
                                className="cursor-pointer rounded-lg text-left outline-none ring-offset-2 focus-visible:ring-2 focus-visible:ring-violet-400"
                                onClick={() => setDetailRecordId(record.id)}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter' || e.key === ' ') {
                                    e.preventDefault()
                                    setDetailRecordId(record.id)
                                  }
                                }}
                              >
                                <p className="font-medium">{record.vendorName}</p>
                                <p className="text-xs text-slate-500">{record.vendorCode}</p>
                                {isPublished ? (
                                  <p className="mt-2 inline-flex rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-800">
                                    {t('archivePublishedBadge')}
                                  </p>
                                ) : null}
                                <div className="mt-2 space-y-1 text-xs text-slate-600">
                                  <p>
                                    <span className="font-medium">{t('detailAmount')}</span>{' '}
                                    {formatIdr.format(record.amount)}
                                  </p>
                                  <p>
                                    <span className="font-medium">{t('archiveArchivedAtLabel')}</span>{' '}
                                    {record.archivedAt
                                      ? formatDate(record.archivedAt, dateLocale)
                                      : '-'}
                                  </p>
                                  {isPublished ? (
                                    <p>
                                      <span className="font-medium">{t('publishedLabel')}</span>{' '}
                                      {record.publishedAt
                                        ? formatDate(record.publishedAt, dateLocale)
                                        : '-'}
                                    </p>
                                  ) : null}
                                  <p>
                                    <span className="font-medium">{t('fileLabel')}</span>{' '}
                                    {record.stampedPaperFileName ?? '-'}
                                  </p>
                                  <p className="pt-1 text-[11px] text-violet-600">{t('archiveClickForDetail')}</p>
                                </div>
                              </div>
                              {isPublished ? (
                                <ArchivePublishedDownloadButtons
                                  record={record}
                                  apiConnected={apiConnected}
                                  t={t}
                                  onDownloadKind={(kind) => void handleArchivePublishedDownload(record, kind)}
                                  onDownloadSummary={() =>
                                    void handleArchivePublishedDownload(record, 'stamped-paper')
                                  }
                                />
                              ) : null}
                              {isPublished ? null : (
                                <button
                                  type="button"
                                  onClick={() => publishPaper(record.id)}
                                  className="mt-3 rounded-lg bg-violet-600 px-3 py-2 text-xs font-semibold text-white transition hover:bg-violet-500"
                                >
                                  {t('publishPaperForm')}
                                </button>
                              )}
                            </article>
                          )
                        })
                      )}
                    </div>
                  </section>
                ) : (
                  <Navigate to="/dashboard" replace />
                )
              }
            />

            <Route
              path="history"
              element={
                userRole === 'buyers' ? (
                  <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                    <h2 className="mb-4 text-base font-semibold text-slate-900">{t('historyPageTitle')}</h2>
                    <p className="mb-4 text-sm text-slate-600">{t('historyPageSubtitleBuyers')}</p>
                    <div className="space-y-3">
                      {buyerHistoryRecords.length === 0 ? (
                        <p className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-6 text-sm text-slate-500">
                          {t('historyPageEmptyBuyers')}
                        </p>
                      ) : (
                        buyerHistoryRecords.map((record) => (
                          <article key={record.id} className="rounded-xl border border-slate-200 p-4">
                            <p className="font-medium">{record.vendorName}</p>
                            <p className="text-xs text-slate-500">{record.vendorCode}</p>
                            {record.status === 'history' ? (
                              <p className="mt-2 text-xs text-slate-600">
                                {t('publishedLabel')}{' '}
                                {record.publishedAt ? formatDate(record.publishedAt, dateLocale) : '-'}
                              </p>
                            ) : (
                              <p className="mt-2 text-xs text-slate-600">
                                {t('archiveArchivedAtLabel')}{' '}
                                {record.archivedAt ? formatDate(record.archivedAt, dateLocale) : '-'}
                              </p>
                            )}
                          </article>
                        ))
                      )}
                    </div>
                  </section>
                ) : (
                  <Navigate to="/dashboard" replace />
                )
              }
            />

            <Route path="*" element={<Navigate to="/dashboard" replace />} />
          </Routes>

      </main>
      {isLoading ? (
        <div className="fixed inset-x-0 top-20 z-50 mx-auto w-fit rounded-full bg-slate-900 px-4 py-2 text-xs text-white shadow-lg sm:top-24">
          {t('loadingData')}
        </div>
      ) : null}

      {userRole === 'finance' && isInvoiceModalOpen ? (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-sm">
          <div className="max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-2xl border border-slate-200 bg-white p-6 shadow-xl">
            <div className="mb-4 flex items-center justify-between gap-3">
              <h2 className="text-lg font-semibold text-slate-900">{t('invoiceFormTitle')}</h2>
              <button
                type="button"
                onClick={() => setIsInvoiceModalOpen(false)}
                className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50"
              >
                {t('close')}
              </button>
            </div>
            <label className="mb-4 block space-y-1 text-sm">
              <span>{t('invoiceSelectHint')}</span>
              <select
                value={selectedRecordId}
                onChange={(event) => setSelectedRecordId(event.currentTarget.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2"
              >
                <option value="">{t('invoiceSelectPlaceholder')}</option>
                {financeInvoiceList.map((record) => (
                  <option key={record.id} value={record.id}>
                    {record.vendorCode} - {record.vendorName}
                  </option>
                ))}
              </select>
            </label>

            {financeInvoiceList.length === 0 ? (
              <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-6 text-sm text-slate-600">
                {t('invoiceEmptyHint')}
              </div>
            ) : selectedRecord ? (
              <form
                key={selectedRecord.id}
                onSubmit={submitInvoice}
                onKeyDown={preventEnterSubmit}
                className="grid gap-4 md:grid-cols-2"
              >
                <label className="space-y-1 text-sm">
                  <span>{t('invNo')}</span>
                  <input
                    name="number"
                    defaultValue=""
                    placeholder={`${selectedRecord.vendorCode}-001`}
                    required
                    className="w-full rounded-lg border border-slate-300 px-3 py-2"
                  />
                </label>
                <label className="space-y-1 text-sm">
                  <span>{t('invParty')}</span>
                  <input
                    value={selectedRecord.vendorName}
                    readOnly
                    className="w-full rounded-lg border border-slate-300 bg-slate-100 px-3 py-2"
                  />
                </label>
                <label className="space-y-1 text-sm">
                  <span>{t('invAttn')}</span>
                  <input
                    name="attn"
                    defaultValue={userName}
                    required
                    className="w-full rounded-lg border border-slate-300 px-3 py-2"
                  />
                </label>
                <label className="space-y-1 text-sm">
                  <span>{t('invPaymentMethod')}</span>
                  <select
                    name="paymentMethod"
                    defaultValue="Transfer"
                    className="w-full rounded-lg border border-slate-300 px-3 py-2"
                  >
                    <option>Transfer</option>
                    <option>Reduce the bill</option>
                  </select>
                </label>
                <label className="space-y-1 text-sm">
                  <span>{t('invDueDate')}</span>
                  <input
                    type="date"
                    name="dueDate"
                    defaultValue=""
                    required
                    className="w-full rounded-lg border border-slate-300 px-3 py-2"
                  />
                </label>
                <label className="space-y-1 text-sm">
                  <span>{t('invMemo')}</span>
                  <input name="memo" defaultValue="" className="w-full rounded-lg border border-slate-300 px-3 py-2" />
                </label>
                <label className="space-y-1 text-sm">
                  <span>{t('invVat')}</span>
                  <input
                    type="number"
                    name="vatPercent"
                    defaultValue={11}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2"
                  />
                </label>
                <label className="space-y-1 text-sm">
                  <span>{t('invTaxType')}</span>
                  <select
                    name="taxType"
                    defaultValue="Tax art 23"
                    className="w-full rounded-lg border border-slate-300 px-3 py-2"
                  >
                    <option>Tax art 23</option>
                    <option>Tax art 4(2)</option>
                  </select>
                </label>
                <label className="space-y-1 text-sm">
                  <span>{t('invTaxPercent')}</span>
                  <input
                    type="number"
                    name="taxPercent"
                    defaultValue={2}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2"
                  />
                </label>
                <label className="space-y-1 text-sm">
                  <span>{t('invTransferTo')}</span>
                  <input
                    name="transferTo"
                    defaultValue="Bank Mayapada"
                    className="w-full rounded-lg border border-slate-300 px-3 py-2"
                  />
                </label>
                <label className="space-y-1 text-sm">
                  <span>{t('invBankBranch')}</span>
                  <input
                    name="bankBranch"
                    defaultValue=""
                    required
                    className="w-full rounded-lg border border-slate-300 px-3 py-2"
                  />
                </label>
                <label className="space-y-1 text-sm">
                  <span>{t('invAccountNo')}</span>
                  <input
                    name="accountNo"
                    defaultValue=""
                    required
                    className="w-full rounded-lg border border-slate-300 px-3 py-2"
                  />
                </label>
                <label className="space-y-1 text-sm">
                  <span>{t('invBeneficiary')}</span>
                  <input
                    name="beneficiaryName"
                    defaultValue=""
                    required
                    className="w-full rounded-lg border border-slate-300 px-3 py-2"
                  />
                </label>
                <label className="space-y-1 text-sm">
                  <span>{t('invFormulaForm')}</span>
                  <input
                    name="formulaFormFile"
                    type="file"
                    accept=".pdf,application/pdf"
                    required
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm file:mr-3 file:rounded-md file:border-0 file:bg-violet-50 file:px-3 file:py-1.5 file:font-medium file:text-violet-700"
                  />
                </label>
                <label className="space-y-1 text-sm">
                  <span>{t('invSigner')}</span>
                  <select
                    name="signer"
                    defaultValue={signerOptions[0]}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2"
                  >
                    {signerOptions.map((name) => (
                      <option key={name}>{name}</option>
                    ))}
                  </select>
                </label>
                <div className="md:col-span-2 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => setIsInvoiceModalOpen(false)}
                    className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                  >
                    {t('cancel')}
                  </button>
                  <button
                    type="submit"
                    className="rounded-lg bg-violet-600 px-4 py-2 text-sm font-semibold text-white"
                  >
                    {t('saveInvoice')}
                  </button>
                </div>
              </form>
            ) : (
              <p className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-6 text-sm text-slate-500">
                {t('invoicePickHint')}
              </p>
            )}
          </div>
        </div>
      ) : null}

      {userRole === 'buyers' && isCreateModalOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/30 p-4 backdrop-blur-sm">
          <div className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-2xl border border-slate-200 bg-white p-6 shadow-xl">
            <div className="mb-4 flex items-center justify-between gap-3">
              <h2 className="text-lg font-semibold text-slate-900">{t('modalAddTitle')}</h2>
              <button
                type="button"
                onClick={() => setIsCreateModalOpen(false)}
                className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50"
              >
                {t('close')}
              </button>
            </div>
            <form onSubmit={submitBuyerForm} className="grid gap-4 md:grid-cols-2">
              <label className="space-y-1 text-sm">
                <span>{t('vendorCode')}</span>
                <select
                  name="vendorCode"
                  value={selectedVendorCode}
                  onChange={(event) => setSelectedVendorCode(event.currentTarget.value)}
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
                <span>{t('vendorName')}</span>
                <input
                  value={selectedVendor?.name ?? ''}
                  readOnly
                  className="w-full rounded-lg border border-slate-300 bg-slate-100 px-3 py-2"
                />
              </label>
              <label className="space-y-1 text-sm">
                <span>{t('incomeType')}</span>
                <input
                  name="incomeType"
                  required
                  className="w-full rounded-lg border border-slate-300 px-3 py-2"
                />
              </label>
              <label className="space-y-1 text-sm">
                <span>{t('agreementFile')}</span>
                <input
                  type="file"
                  onChange={(event) => setAgreementFileName(event.currentTarget.files?.[0]?.name ?? '')}
                  required
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm file:mr-3 file:rounded-md file:border-0 file:bg-violet-50 file:px-3 file:py-1.5 file:font-medium file:text-violet-700"
                />
                {agreementFileName ? (
                  <p className="text-xs text-slate-500">
                    {t('selectedFile')} {agreementFileName}
                  </p>
                ) : null}
              </label>
              <label className="space-y-1 text-sm">
                <span>{t('amountEarned')}</span>
                <div className="flex w-full items-stretch rounded-lg border border-slate-300 bg-white focus-within:border-violet-400 focus-within:ring-2 focus-within:ring-violet-200">
                  <span className="flex shrink-0 items-center border-r border-slate-200 bg-slate-50 px-3 text-sm font-medium text-slate-600">
                    Rp
                  </span>
                  <input
                    type="text"
                    inputMode="decimal"
                    autoComplete="transaction-amount"
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
                  value={periodRange}
                  onChange={setPeriodRange}
                  displayLocale={dateLocale === 'id' ? 'id-ID' : 'en-GB'}
                  labels={{
                    combined: t('periodRangeLabel'),
                    start: t('periodRangeShortStart'),
                    end: t('periodRangeShortEnd'),
                    hint: t('periodRangeHint'),
                    apply: t('periodRangeApply'),
                  }}
                />
              </div>
              <label className="space-y-1 text-sm md:col-span-2">
                <span>{t('description')}</span>
                <textarea
                  name="description"
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
                  {t('cancel')}
                </button>
                <button
                  type="submit"
                  className="rounded-lg bg-violet-600 px-4 py-2 text-sm font-semibold text-white"
                >
                  {t('save')}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {detailRecord ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/30 p-4 backdrop-blur-sm">
          <div className="w-full max-w-2xl rounded-2xl border border-slate-200 bg-white p-6 shadow-xl">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-slate-900">{t('detailTitle')}</h3>
              <button
                type="button"
                onClick={() => setDetailRecordId(null)}
                className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50"
              >
                {t('close')}
              </button>
            </div>
            <div className="grid gap-3 text-sm sm:grid-cols-2">
              <p>
                <span className="font-medium">{t('detailVendorCode')}</span> {detailRecord.vendorCode}
              </p>
              <p>
                <span className="font-medium">{t('detailVendorName')}</span> {detailRecord.vendorName}
              </p>
              <p>
                <span className="font-medium">{t('detailIncomeType')}</span> {detailRecord.incomeType}
              </p>
              <p>
                <span className="font-medium">{t('detailAmount')}</span>{' '}
                {formatIdr.format(detailRecord.amount)}
              </p>
              <p>
                <span className="font-medium">{t('detailPeriodStart')}</span>{' '}
                {formatDate(detailRecord.periodStart, dateLocale)}
              </p>
              <p>
                <span className="font-medium">{t('detailPeriodEnd')}</span>{' '}
                {formatDate(detailRecord.periodEnd, dateLocale)}
              </p>
              <p className="sm:col-span-2">
                <span className="font-medium">{t('detailAgreementFile')}</span>{' '}
                {detailRecord.agreementFileName}
              </p>
              <p className="sm:col-span-2">
                <span className="font-medium">{t('detailDescription')}</span> {detailRecord.description}
              </p>
            </div>
            {(detailRecord.status === 'archived' || detailRecord.status === 'history') && (
              <div className="mt-4 grid gap-2 border-t border-slate-200 pt-4 text-sm text-slate-700 sm:grid-cols-2">
                <p className="sm:col-span-2">
                  <span className="font-medium text-slate-900">{t('statusLabel')}</span>{' '}
                  <span className="capitalize">{detailRecord.status.replaceAll('_', ' ')}</span>
                </p>
                {detailRecord.archivedAt ? (
                  <p className="sm:col-span-2">
                    <span className="font-medium text-slate-900">{t('archiveArchivedAtLabel')}</span>{' '}
                    {formatDate(detailRecord.archivedAt, dateLocale)}
                  </p>
                ) : null}
                {detailRecord.status === 'history' && detailRecord.publishedAt ? (
                  <p className="sm:col-span-2">
                    <span className="font-medium text-slate-900">{t('publishedLabel')}</span>{' '}
                    {formatDate(detailRecord.publishedAt, dateLocale)}
                  </p>
                ) : null}
                {detailRecord.stampedPaperFileName ? (
                  <p className="sm:col-span-2">
                    <span className="font-medium text-slate-900">{t('detailStampedPaperFile')}</span>{' '}
                    {detailRecord.stampedPaperFileName}
                  </p>
                ) : null}
                {detailRecord.generatedBy ? (
                  <p>
                    <span className="font-medium text-slate-900">{t('detailGeneratedBy')}</span>{' '}
                    {detailRecord.generatedBy}
                  </p>
                ) : null}
                {detailRecord.generatedAt ? (
                  <p>
                    <span className="font-medium text-slate-900">{t('detailGeneratedAt')}</span>{' '}
                    {formatDate(detailRecord.generatedAt, dateLocale)}
                  </p>
                ) : null}
                {detailRecord.invoice?.number ? (
                  <p className="sm:col-span-2">
                    <span className="font-medium text-slate-900">{t('detailInvoiceNumber')}</span>{' '}
                    {detailRecord.invoice.number}
                  </p>
                ) : null}
              </div>
            )}
            {userRole === 'finance' && detailRecord.status === 'history' ? (
              <ArchivePublishedDownloadButtons
                record={detailRecord}
                apiConnected={apiConnected}
                t={t}
                onDownloadKind={(kind) => void handleArchivePublishedDownload(detailRecord, kind)}
                onDownloadSummary={() => void handleArchivePublishedDownload(detailRecord, 'stamped-paper')}
              />
            ) : null}
            {userRole === 'finance' ? (
              <div className="mt-6 flex flex-wrap items-center justify-end gap-3 border-t border-slate-100 pt-4">
                {financeInvoiceNotDone(detailRecord) ? (
                  <button
                    type="button"
                    onClick={() => goToInvoiceForRecord(detailRecord.id)}
                    className="rounded-lg bg-violet-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-violet-500"
                  >
                    {t('financeContinueInvoice')}
                  </button>
                ) : (
                  <p className="text-sm text-slate-500">{t('financeInvoiceAlreadyDone')}</p>
                )}
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  )
}
