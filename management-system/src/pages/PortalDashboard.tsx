import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type FormEvent,
  type KeyboardEvent as ReactKeyboardEvent,
} from 'react'
import { Calendar, Download, FileUp, Pencil, RotateCcw, Search } from 'lucide-react'
import { Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import { AgreementFilesField } from '../components/AgreementFilesField'
import { FormulaFormFilesField } from '../components/FormulaFormFilesField'
import { FormLoadingOverlay } from '../components/FormLoadingOverlay'
import { InputIconWrap } from '../components/InputIconWrap'
import { BuyerRecordDetailView } from '../components/BuyerRecordDetailView'
import { FinanceRecordDetailFooter, FinanceRecordDetailView } from '../components/FinanceRecordDetailView'
import { InvoiceBankAccountFields } from '../components/InvoiceBankAccountFields'
import { InvoicePrintModal } from '../components/InvoicePrintModal'
import { ModalCloseButton } from '../components/ModalCloseButton'
import { InvoiceSignerFields } from '../components/InvoiceSignerFields'
import { StampedPaperUploadButton } from '../components/StampedPaperUploadButton'
import { PeriodRangePicker, todayIsoDateLocal, type PeriodRangeValue } from '../components/PeriodRangePicker'
import { RevenueLineChart } from '../components/RevenueLineChart'
import { useAuth } from '../context/AuthContext'
import { useLanguage } from '../context/LanguageContext'
import { useWorkflow } from '../context/WorkflowContext'
import type { StringKey } from '../i18n/strings'
import { EMPTY_BANK_DETAILS, type InvoiceBankDetails } from '../types/invoiceBank'
import { EMPTY_SIGNER_SELECTION, type InvoiceSignerSelection } from '../types/invoiceSigner'
import { signerSelectionFromInvoice } from '../utils/invoiceSignerSelection'
import type { BuyerRecord, InvoiceData } from '../types/workflow'
import {
  defaultDownloadFileName,
  downloadPublishedRecordTextSummary,
  downloadRecordFileFromApi,
  type ArchiveFileKind,
} from '../utils/recordFileDownload'
import { formatIdrAmountInputValue, formatIdrWhileTyping, parseIdrAmountInput } from '../utils/idrAmountInput'
import {
  canBuyerRequestEditPermission,
  hasApprovedBuyerEditRequest,
  hasPendingBuyerEditRequest,
  isBuyerEditRequestDenied,
  isBuyerPortalRecordEditable,
  isBuyerRecordInFinanceTask,
  isFinanceTaskPausedForBuyerEdit,
  periodIsoToDateInput,
} from '../utils/recordBuyerEdit'
import { INVOICE_COMPANY } from '../data/invoiceCompany'
import { PortalLayout } from '../components/PortalLayout'
import { recordFileUrl } from '../utils/apiClient'
import {
  FORMULA_FORM_MAX,
  formulaFormFileNamesForSave,
  formulaFormFileNamesFromInvoice,
} from '../utils/formulaFormFiles'
import {
  AGREEMENT_MAX,
  agreementFileNamesForSave,
  agreementFileNamesFromRecord,
} from '../utils/agreementFiles'
import {
  financeInvoiceNotDone,
  financeNeedsStampUpload,
  financeStampReadyToPublish,
  filterFinanceOverviewRecords,
  filterFinanceTaskRecords,
  isRecordFinishedOffOverview,
} from '../utils/financeRecordScope'
import { countPeriodExpiryReminders, daysUntilPeriodEnd } from '../utils/periodExpiryReminders'
import type { PortalNotificationItem } from '../utils/portalNotifications'
import { RecordListFilterBar, type RecordListFilterOption } from '../components/RecordListFilterBar'
import { RecordListPagination } from '../components/RecordListPagination'
import { RecordWorkingOverlay } from '../components/RecordWorkingOverlay'
import { PortalSummaryIcon, summaryIconKind } from '../components/PortalSummaryIcon'
import { RecordPublishSuccessModal } from '../components/RecordPublishSuccessModal'
import {
  listRecordDocuments,
  RecordDocumentPreviewModal,
  type RecordFileKind,
} from '../components/RecordDocumentPreviewModal'
import { useRealtime } from '../context/RealtimeContext'
import { useRecordPublishCelebration } from '../hooks/useRecordPublishCelebration'
import { recordWorkingByOther } from '../utils/recordWorking'
import {
  previewInvoiceNumberForRecord,
  resolveInvoiceNumberForRecord,
} from '../utils/invoiceNumberFromRecord'
import { VendorPickerField } from '../components/VendorPickerField'
import { useVendors } from '../hooks/useVendors'
import { useListPagination } from '../hooks/useListPagination'
import {
  filterRecordList,
  recordMatchesSearch,
  type RecordListStatusFilter,
} from '../utils/recordListFilter'

function formatDate(isoDate: string, dateLocale: string) {
  const date = new Date(isoDate)
  if (Number.isNaN(date.getTime())) return '-'
  return date.toLocaleDateString(dateLocale, {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })
}

function parseNumberInput(value: string) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

function invoiceFieldDefaults(invoice: InvoiceData | undefined, userName: string) {
  if (!invoice) {
    return {
      number: '',
      attn: userName,
      paymentMethod: 'Transfer' as InvoiceData['paymentMethod'],
      dueDate: '',
      memo: '',
      vatPercent: 11,
      taxType: 'Tax art 23' as InvoiceData['taxType'],
      taxPercent: 2,
      transferTo: 'Bank Mayapada',
      bankBranch: '',
      accountNo: '',
      beneficiaryName: '',
      signer: '',
      signerTitle: '',
      formulaFormFileName: '',
      pphEmail: INVOICE_COMPANY.pphNoteEmail,
    }
  }
  return {
    number: invoice.number,
    attn: invoice.attn,
    paymentMethod: invoice.paymentMethod,
    dueDate: invoice.dueDate,
    memo: invoice.memo,
    vatPercent: invoice.vatPercent,
    taxType: invoice.taxType,
    taxPercent: invoice.taxPercent,
    transferTo: invoice.bankName ?? invoice.transferTo,
    bankBranch: invoice.bankBranch,
    accountNo: invoice.accountNo,
    beneficiaryName: invoice.beneficiaryName,
    signer: invoice.signer,
    signerTitle: invoice.signerTitle ?? '',
    formulaFormFileName: invoice.formulaFormFileName,
    pphEmail: invoice.pphEmail?.trim() || INVOICE_COMPANY.pphNoteEmail,
  }
}

function summaryFrom(records: BuyerRecord[], userRole: 'buyers' | 'finance') {
  const dashboardPool =
    userRole === 'finance'
      ? filterFinanceOverviewRecords(records)
      : records.filter((r) => !isRecordFinishedOffOverview(r))

  const reminderCount = countPeriodExpiryReminders(dashboardPool)
  return [
    { labelKey: 'summaryTotalBuyerData' as const, value: String(dashboardPool.length) },
    { labelKey: 'summaryReminder' as const, value: String(reminderCount) },
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

function FinanceTaskRow({
  record,
  onPickFile,
  onPublishStamp,
  onEdit,
  onDownloadInvoice,
  onEngage,
  uploadLabel,
  stampUploadLabels,
  editLabel,
  downloadInvoiceLabel,
  financeByText,
  zebraClass,
  hasInvoice,
  blocked,
  remoteWorking,
  processingLabel,
  overlayTitle,
  editRequestTitle,
  editRequestHint,
  approveEditLabel,
  denyEditLabel,
  onApproveEditRequest,
  onDenyEditRequest,
  resolvingEditRequest,
  buyerEditingLocked,
  buyerEditingTitle,
  buyerEditingHint,
}: {
  record: BuyerRecord
  onPickFile: (recordId: string, file: File) => void | Promise<void>
  onPublishStamp: (recordId: string) => void | Promise<void>
  onEdit: (recordId: string) => void
  onDownloadInvoice: () => void
  onEngage: (recordId: string) => void
  uploadLabel: string
  stampUploadLabels: {
    close: string
    confirmUpload: string
    viewStamped: string
    publish: string
    previewUnavailable: string
    uploading: string
    publishing: string
  }
  editLabel: string
  downloadInvoiceLabel: string
  financeByText: string
  zebraClass: string
  hasInvoice: boolean
  blocked: boolean
  remoteWorking: { userName: string; avatarPreset?: string | null } | null
  processingLabel: string
  overlayTitle?: string
  editRequestTitle: string
  editRequestHint: string
  approveEditLabel: string
  denyEditLabel: string
  onApproveEditRequest: (recordId: string) => void | Promise<void>
  onDenyEditRequest: (recordId: string) => void | Promise<void>
  resolvingEditRequest: boolean
  buyerEditingLocked: boolean
  buyerEditingTitle: string
  buyerEditingHint: string
}) {
  const invoiceNo = record.invoice?.number?.trim()
  const stampUploaded = financeStampReadyToPublish(record)
  const pendingBuyerEdit = hasPendingBuyerEditRequest(record)
  const taskPaused = buyerEditingLocked
  const rowBlocked = blocked || taskPaused
  return (
    <div className="portal-table-group">
      {pendingBuyerEdit ? (
        <div className="portal-table-banner border-amber-200 bg-amber-50/90 dark:border-amber-500/30 dark:bg-amber-950/25">
          <p className="text-sm font-semibold text-amber-950 dark:text-amber-100">{editRequestTitle}</p>
          <p className="mt-1 text-xs text-amber-900/85 dark:text-amber-100/80">{editRequestHint}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              disabled={blocked || resolvingEditRequest}
              onClick={() => void onApproveEditRequest(record.id)}
              className="portal-btn-primary px-3 py-2 text-xs disabled:cursor-not-allowed disabled:opacity-50"
            >
              {approveEditLabel}
            </button>
            <button
              type="button"
              disabled={blocked || resolvingEditRequest}
              onClick={() => void onDenyEditRequest(record.id)}
              className="portal-btn-secondary px-3 py-2 text-xs disabled:cursor-not-allowed disabled:opacity-50"
            >
              {denyEditLabel}
            </button>
          </div>
        </div>
      ) : null}
      {taskPaused ? (
        <div className="portal-table-banner border-slate-300 bg-slate-200/60 dark:border-slate-600/50 dark:bg-slate-900/40">
          <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">{buyerEditingTitle}</p>
          <p className="mt-1 text-xs text-slate-600 dark:text-slate-300">{buyerEditingHint}</p>
        </div>
      ) : null}
      <div
        className={`portal-table-row portal-table-row--task relative ${zebraClass} ${rowBlocked ? 'z-20 opacity-60' : ''} ${pendingBuyerEdit ? '!border-amber-200 dark:!border-amber-500/30' : ''} ${taskPaused ? 'bg-slate-100/90 dark:bg-slate-800/40' : ''}`}
      >
        <div className="portal-table-td min-w-0">
          <p className="truncate font-semibold portal-heading">{record.vendorName}</p>
          <p className="portal-muted truncate text-xs">{record.vendorCode}</p>
        </div>
        <div className="portal-table-td min-w-0">
          {invoiceNo ? (
            <p className="truncate text-xs portal-muted" title={invoiceNo}>
              {invoiceNo}
            </p>
          ) : (
            <span className="text-xs portal-muted">—</span>
          )}
        </div>
        <div className="portal-table-td min-w-0">
          <p className="truncate text-xs portal-muted">{financeByText}</p>
        </div>
        <div className={`portal-table-td flex min-w-0 flex-wrap gap-1.5 ${rowBlocked ? 'pointer-events-none' : ''}`}>
          <button
            type="button"
            onClick={() => {
              onEngage(record.id)
              onDownloadInvoice()
            }}
            disabled={!hasInvoice || rowBlocked}
            className="portal-btn-secondary inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Download className="h-3.5 w-3.5" aria-hidden strokeWidth={1.75} />
            {downloadInvoiceLabel}
          </button>
          <button
            type="button"
            onClick={() => {
              onEngage(record.id)
              onEdit(record.id)
            }}
            disabled={rowBlocked}
            className="portal-btn-secondary inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Pencil className="h-3.5 w-3.5" aria-hidden strokeWidth={1.75} />
            {editLabel}
          </button>
          <StampedPaperUploadButton
            recordId={record.id}
            disabled={rowBlocked}
            onConfirm={async (id, file) => {
              onEngage(id)
              await onPickFile(id, file)
            }}
            onPublish={async (id) => {
              onEngage(id)
              await onPublishStamp(id)
            }}
            stampUploaded={stampUploaded}
            uploadedFileName={record.stampedPaperFileName ?? ''}
            serverPreviewUrl={
              stampUploaded ? recordFileUrl(record.id, 'stamped-paper') : undefined
            }
            labels={{
              pickFile: uploadLabel,
              viewStamped: stampUploadLabels.viewStamped,
              close: stampUploadLabels.close,
              confirmUpload: stampUploadLabels.confirmUpload,
              publish: stampUploadLabels.publish,
              previewUnavailable: stampUploadLabels.previewUnavailable,
              uploading: stampUploadLabels.uploading,
              publishing: stampUploadLabels.publishing,
            }}
            icon={<FileUp className="h-3.5 w-3.5" aria-hidden strokeWidth={1.75} />}
          />
        </div>
        {remoteWorking ? (
          <RecordWorkingOverlay
            processingLabel={processingLabel}
            userName={remoteWorking.userName}
            avatarPreset={remoteWorking.avatarPreset}
            title={overlayTitle}
          />
        ) : null}
      </div>
    </div>
  )
}

export function PortalDashboard() {
  const { t, dateLocale, locale } = useLanguage()
  const { user, authToken } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const {
    records,
    isLoading,
    apiConnected,
    createBuyerData,
    updateBuyerData,
    createInvoice,
    uploadStampedPaper,
    publishPaper,
    requestBuyerEditPermission,
    resolveBuyerEditRequest,
  } = useWorkflow()
  const { invoiceEditing, emitInvoiceEditingStart, emitInvoiceEditingStop } = useRealtime()
  const {
    success: publishSuccess,
    dismissSuccess,
    celebrate: celebratePublish,
  } = useRecordPublishCelebration(records)

  const { vendors, loading: vendorsLoading, getVendorNameByCode, createVendor, deleteVendor } = useVendors()

  const userName = user?.name ?? 'User'
  const currentUserId = user?.id
  const userRole = user?.role ?? 'buyers'
  const userDepartment = user?.departmentLabel ?? 'Department'

  useEffect(() => {
    const root = document.documentElement
    root.classList.remove('portal-shell--finance', 'portal-shell--buyers')
    if (userRole === 'finance') {
      root.classList.add('portal-shell--finance')
    } else if (userRole === 'buyers') {
      root.classList.add('portal-shell--buyers')
    }
    return () => root.classList.remove('portal-shell--finance', 'portal-shell--buyers')
  }, [userRole])

  const summaryCards = useMemo(() => summaryFrom(records, userRole), [records, userRole])

  const financeTaskRecords = useMemo(
    () => (userRole === 'finance' ? filterFinanceTaskRecords(records) : []),
    [records, userRole],
  )

  const activeDashboardRecords = useMemo(() => {
    if (userRole === 'finance') return filterFinanceOverviewRecords(records)
    return records.filter((r) => !isRecordFinishedOffOverview(r))
  }, [records, userRole])

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
    async (record: BuyerRecord, kind: ArchiveFileKind, fileIndex = 0) => {
      try {
        if (apiConnected) {
          await downloadRecordFileFromApi({
            recordId: record.id,
            kind,
            authToken,
            fallbackFileName: defaultDownloadFileName(record, kind, fileIndex),
            fileIndex,
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
      await uploadStampedPaper(recordId, file)
    },
    [uploadStampedPaper],
  )

  const handleTaskStampPublish = useCallback(
    async (recordId: string) => {
      const record = records.find((r) => r.id === recordId)
      await publishPaper(recordId)
      if (record) celebratePublish(recordId, record.vendorName)
      navigate('/dashboard/archive')
    },
    [publishPaper, navigate, records, celebratePublish],
  )

  const handleAskBuyerEditPermission = useCallback(
    async (recordId: string) => {
      setRequestingEditId(recordId)
      try {
        await requestBuyerEditPermission(recordId, userName)
      } catch (err) {
        window.alert(err instanceof Error ? err.message : 'Request failed')
      } finally {
        setRequestingEditId(null)
      }
    },
    [requestBuyerEditPermission, userName, t],
  )

  const handleResolveBuyerEditRequest = useCallback(
    async (recordId: string, decision: 'approve' | 'deny') => {
      setResolvingEditRequestId(recordId)
      try {
        await resolveBuyerEditRequest(recordId, decision, userName)
      } catch (err) {
        window.alert(err instanceof Error ? err.message : 'Failed')
      } finally {
        setResolvingEditRequestId(null)
      }
    },
    [resolveBuyerEditRequest, userName],
  )
  const financeInvoiceFormRecords = useMemo(
    () =>
      records.filter(
        (record) => financeInvoiceNotDone(record) || financeNeedsStampUpload(record),
      ),
    [records],
  )

  const [selectedRecordId, setSelectedRecordId] = useState<string>('')
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false)
  const [editingBuyerRecordId, setEditingBuyerRecordId] = useState<string | null>(null)
  const [detailRecordId, setDetailRecordId] = useState<string | null>(null)
  const [taskInvoicePrintRecordId, setTaskInvoicePrintRecordId] = useState<string | null>(null)
  const [financeEngagedRecordId, setFinanceEngagedRecordId] = useState<string | null>(null)
  const [requestingEditId, setRequestingEditId] = useState<string | null>(null)
  const [resolvingEditRequestId, setResolvingEditRequestId] = useState<string | null>(null)
  const [selectedVendorCode, setSelectedVendorCode] = useState('')
  const [agreementFiles, setAgreementFiles] = useState<File[]>([])
  const [removedExistingAgreementSlots, setRemovedExistingAgreementSlots] = useState<Set<number>>(
    () => new Set(),
  )
  const [amountEarnedInput, setAmountEarnedInput] = useState('')
  const [buyerIncomeType, setBuyerIncomeType] = useState('')
  const [buyerDescription, setBuyerDescription] = useState('')
  const [periodRange, setPeriodRange] = useState<PeriodRangeValue>({ start: '', end: '' })
  const [isInvoiceModalOpen, setIsInvoiceModalOpen] = useState(false)
  const [buyerFormBusy, setBuyerFormBusy] = useState(false)
  const [invoiceFormBusy, setInvoiceFormBusy] = useState(false)
  const [invoiceBankDetails, setInvoiceBankDetails] = useState<InvoiceBankDetails>({
    ...EMPTY_BANK_DETAILS,
  })
  const [invoiceSignerSelection, setInvoiceSignerSelection] = useState<InvoiceSignerSelection>({
    ...EMPTY_SIGNER_SELECTION,
  })
  const [formulaFormFiles, setFormulaFormFiles] = useState<File[]>([])
  const [removedExistingFormulaSlots, setRemovedExistingFormulaSlots] = useState<Set<number>>(
    () => new Set(),
  )
  const [archiveFilterYear, setArchiveFilterYear] = useState('')
  const [archiveFilterDate, setArchiveFilterDate] = useState('')
  const [listSearchQuery, setListSearchQuery] = useState('')
  const [listStatusFilter, setListStatusFilter] = useState<RecordListStatusFilter>('all')
  const [docPreview, setDocPreview] = useState<{
    recordId: string
    kind: RecordFileKind
    fileName: string
    fileIndex?: number
  } | null>(null)

  useEffect(() => {
    if (vendors.length === 0 || selectedVendorCode || editingBuyerRecordId) return
    setSelectedVendorCode(vendors[0].code)
  }, [vendors, selectedVendorCode, editingBuyerRecordId])

  const openDocPreview = useCallback(
    (recordId: string, kind: RecordFileKind, fileName: string, fileIndex = 0) => {
      setDocPreview({ recordId, kind, fileName, fileIndex })
    },
    [],
  )

  const recordDocLabel = useCallback(
    (kind: RecordFileKind) => {
      if (kind === 'agreement') return t('archiveDocAgreement')
      if (kind === 'formula-form') return t('archiveDocFormulaForm')
      return t('archiveDocStampedPaper')
    },
    [t],
  )

  const resetListFilters = useCallback(() => {
    setListSearchQuery('')
    setListStatusFilter('all')
  }, [])

  const overviewStatusOptions = useMemo((): RecordListFilterOption[] => {
    const opts: RecordListFilterOption[] = [
      { value: 'all', label: t('recordFilterStatusAll') },
      { value: 'reminder', label: t('recordFilterStatusReminder') },
      { value: 'normal', label: t('recordFilterStatusNormal') },
    ]
    if (userRole === 'buyers') {
      opts.push(
        { value: 'in_finance_task', label: t('recordFilterStatusInFinanceTask') },
        { value: 'edit_request', label: t('recordFilterStatusEditRequest') },
      )
    }
    return opts
  }, [userRole, t])

  const taskStatusOptions = useMemo(
    (): RecordListFilterOption[] => [
      { value: 'all', label: t('recordFilterStatusAll') },
      { value: 'edit_request', label: t('recordFilterStatusEditRequest') },
      { value: 'stamp_upload', label: t('recordFilterStatusStampUpload') },
    ],
    [t],
  )

  const activeDashboardFiltered = useMemo(
    () =>
      filterRecordList(activeDashboardRecords, {
        query: listSearchQuery,
        status: listStatusFilter,
        role: userRole,
      }),
    [activeDashboardRecords, listSearchQuery, listStatusFilter, userRole],
  )

  const financeTaskFiltered = useMemo(
    () =>
      filterRecordList(financeTaskRecords, {
        query: listSearchQuery,
        status: listStatusFilter,
        role: userRole,
      }),
    [financeTaskRecords, listSearchQuery, listStatusFilter, userRole],
  )

  const buyerHistoryFiltered = useMemo(
    () =>
      filterRecordList(buyerHistoryRecords, {
        query: listSearchQuery,
        status: 'all',
        role: userRole,
      }),
    [buyerHistoryRecords, listSearchQuery, userRole],
  )

  const overviewListKey = `${listSearchQuery}|${listStatusFilter}|overview`
  const overviewPagination = useListPagination(activeDashboardFiltered, overviewListKey)

  const financeTaskListKey = `${listSearchQuery}|${listStatusFilter}|task`
  const financeTaskPagination = useListPagination(financeTaskFiltered, financeTaskListKey)

  const financeArchiveFiltered = useMemo(() => {
    const ySel = archiveFilterYear === '' ? null : Number(archiveFilterYear)
    return financeArchiveSourceList.filter((r) => {
      if (!recordMatchesSearch(r, listSearchQuery)) return false
      const ms = buyerHistorySortKey(r)
      if (ySel !== null) {
        if (!Number.isFinite(ms) || new Date(ms).getFullYear() !== ySel) return false
      }
      if (archiveFilterDate !== '' && !calendarDayMatchesTimestamp(ms, archiveFilterDate)) return false
      return true
    })
  }, [financeArchiveSourceList, archiveFilterYear, archiveFilterDate, listSearchQuery])

  useEffect(() => {
    resetListFilters()
  }, [location.pathname, resetListFilters])

  useEffect(() => {
    const p = location.pathname.replace(/\/+$/, '') || '/'
    if (!p.endsWith('/archive')) {
      setArchiveFilterYear('')
      setArchiveFilterDate('')
    }
  }, [location.pathname])

  const selectedRecord =
    financeInvoiceFormRecords.find((record) => record.id === selectedRecordId) ??
    financeInvoiceFormRecords[0] ??
    null
  useEffect(() => {
    if (!selectedRecord?.invoice) {
      setInvoiceBankDetails({ ...EMPTY_BANK_DETAILS })
      setInvoiceSignerSelection({ ...EMPTY_SIGNER_SELECTION })
      return
    }
    const inv = selectedRecord.invoice
    setInvoiceBankDetails({
      beneficiaryName: inv.beneficiaryName ?? '',
      bankName: inv.bankName ?? inv.transferTo ?? '',
      bankBranch: inv.bankBranch ?? '',
      accountNo: inv.accountNo ?? '',
    })
    setInvoiceSignerSelection(signerSelectionFromInvoice(inv))
    setFormulaFormFiles([])
    setRemovedExistingFormulaSlots(new Set())
  }, [selectedRecord?.id, selectedRecord?.invoice])

  useEffect(() => {
    if (!isInvoiceModalOpen) {
      setFormulaFormFiles([])
      setRemovedExistingFormulaSlots(new Set())
    }
  }, [isInvoiceModalOpen])

  const existingFormulaNames = useMemo(
    () => formulaFormFileNamesFromInvoice(selectedRecord?.invoice),
    [selectedRecord?.invoice],
  )

  const visibleExistingFormulaFiles = useMemo(
    () =>
      existingFormulaNames
        .map((name, originalIndex) => ({ originalIndex, name }))
        .filter(({ originalIndex }) => !removedExistingFormulaSlots.has(originalIndex)),
    [existingFormulaNames, removedExistingFormulaSlots],
  )

  const selectedInvoiceDefaults = useMemo(
    () => invoiceFieldDefaults(selectedRecord?.invoice, userName),
    [selectedRecord?.invoice, selectedRecord?.id, userName],
  )
  const isEditingInvoice = Boolean(
    selectedRecord && financeNeedsStampUpload(selectedRecord) && selectedRecord.invoice,
  )
  const detailRecord = records.find((record) => record.id === detailRecordId) ?? null
  const taskInvoicePrintRecord =
    taskInvoicePrintRecordId != null
      ? records.find((record) => record.id === taskInvoicePrintRecordId) ?? null
      : null
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

  const financePresenceRecordId = useMemo(() => {
    if (userRole !== 'finance') return null
    if (isInvoiceModalOpen && selectedRecord) return selectedRecord.id
    if (detailRecordId) return detailRecordId
    if (taskInvoicePrintRecordId) return taskInvoicePrintRecordId
    if (financeEngagedRecordId) return financeEngagedRecordId
    return null
  }, [
    userRole,
    isInvoiceModalOpen,
    selectedRecord,
    detailRecordId,
    taskInvoicePrintRecordId,
    financeEngagedRecordId,
  ])

  const financeWorkingPresence = useMemo(
    () => ({
      userName,
      avatarPreset: user?.avatarPreset ?? null,
    }),
    [userName, user?.avatarPreset],
  )

  useEffect(() => {
    if (!financePresenceRecordId) return
    emitInvoiceEditingStart(financePresenceRecordId, financeWorkingPresence)
    return () => {
      emitInvoiceEditingStop(financePresenceRecordId)
    }
  }, [
    financePresenceRecordId,
    financeWorkingPresence,
    emitInvoiceEditingStart,
    emitInvoiceEditingStop,
  ])

  useEffect(() => {
    if (!location.pathname.replace(/\/+$/, '').endsWith('/task')) {
      setFinanceEngagedRecordId(null)
    }
  }, [location.pathname])

  const engageFinanceRecord = useCallback((recordId: string) => {
    setFinanceEngagedRecordId(recordId)
  }, [])

  const isRecordBlockedByOther = useCallback(
    (recordId: string) =>
      userRole === 'finance' &&
      Boolean(recordWorkingByOther(recordId, currentUserId, invoiceEditing)),
    [userRole, currentUserId, invoiceEditing],
  )

  const tryOpenDetail = useCallback(
    (recordId: string) => {
      if (isRecordBlockedByOther(recordId)) return
      setDetailRecordId(recordId)
    },
    [isRecordBlockedByOther],
  )

  useEffect(() => {
    if (userRole !== 'finance') return
    if (detailRecordId && isRecordBlockedByOther(detailRecordId)) {
      setDetailRecordId(null)
    }
    if (isInvoiceModalOpen && selectedRecord && isRecordBlockedByOther(selectedRecord.id)) {
      setIsInvoiceModalOpen(false)
    }
    if (taskInvoicePrintRecordId && isRecordBlockedByOther(taskInvoicePrintRecordId)) {
      setTaskInvoicePrintRecordId(null)
    }
  }, [
    userRole,
    detailRecordId,
    isInvoiceModalOpen,
    selectedRecord,
    taskInvoicePrintRecordId,
    isRecordBlockedByOther,
  ])

  if (!user) return null

  function goToInvoiceForRecord(recordId: string) {
    if (isRecordBlockedByOther(recordId)) return
    const record = records.find((r) => r.id === recordId)
    if (record && isFinanceTaskPausedForBuyerEdit(record)) return
    setSelectedRecordId(recordId)
    setDetailRecordId(null)
    setIsInvoiceModalOpen(true)
  }

  function closeBuyerFormModal() {
    if (buyerFormBusy) return
    setIsCreateModalOpen(false)
    setEditingBuyerRecordId(null)
    setSelectedVendorCode(vendors[0]?.code ?? '')
    setAgreementFiles([])
    setRemovedExistingAgreementSlots(new Set())
    setAmountEarnedInput('')
    setBuyerIncomeType('')
    setBuyerDescription('')
    setPeriodRange({ start: '', end: '' })
  }

  function openBuyerCreateModal() {
    setEditingBuyerRecordId(null)
    setSelectedVendorCode(vendors[0]?.code ?? '')
    setAgreementFiles([])
    setRemovedExistingAgreementSlots(new Set())
    setAmountEarnedInput('')
    setBuyerIncomeType('')
    setBuyerDescription('')
    setPeriodRange({ start: '', end: '' })
    setIsCreateModalOpen(true)
  }

  function openBuyerEditModal(record: BuyerRecord) {
    setEditingBuyerRecordId(record.id)
    setSelectedVendorCode(record.vendorCode)
    setAmountEarnedInput(formatIdrAmountInputValue(record.amount))
    setBuyerIncomeType(record.incomeType ?? '')
    setBuyerDescription(record.description ?? '')
    setPeriodRange({
      start: periodIsoToDateInput(record.periodStart),
      end: periodIsoToDateInput(record.periodEnd),
    })
    setAgreementFiles([])
    setRemovedExistingAgreementSlots(new Set())
    setDetailRecordId(null)
    setIsCreateModalOpen(true)
  }

  const editingBuyerRecord = editingBuyerRecordId
    ? records.find((r) => r.id === editingBuyerRecordId) ?? null
    : null

  const existingAgreementNames = useMemo(
    () => agreementFileNamesFromRecord(editingBuyerRecord),
    [editingBuyerRecord],
  )

  const visibleExistingAgreementFiles = useMemo(
    () =>
      existingAgreementNames
        .map((name, originalIndex) => ({ originalIndex, name }))
        .filter(({ originalIndex }) => !removedExistingAgreementSlots.has(originalIndex)),
    [existingAgreementNames, removedExistingAgreementSlots],
  )

  function handleRemoveExistingAgreementSlot(originalIndex: number) {
    setRemovedExistingAgreementSlots((prev) => new Set(prev).add(originalIndex))
  }

  function handleRemoveExistingFormulaSlot(originalIndex: number) {
    setRemovedExistingFormulaSlots((prev) => new Set(prev).add(originalIndex))
  }

  const buyerVendors = useMemo(() => {
    if (!editingBuyerRecord) return vendors
    if (vendors.some((v) => v.code === editingBuyerRecord.vendorCode)) return vendors
    return [
      { code: editingBuyerRecord.vendorCode, name: editingBuyerRecord.vendorName },
      ...vendors,
    ]
  }, [vendors, editingBuyerRecord])

  const buyerVendorDisplayName =
    getVendorNameByCode(selectedVendorCode) ||
    editingBuyerRecord?.vendorName ||
    ''

  async function submitBuyerForm(event: FormEvent) {
    event.preventDefault()
    if (buyerFormBusy) return
    const form = event.currentTarget as HTMLFormElement
    const formData = new FormData(form)
    const vendorCode = String(formData.get('vendorCode') ?? selectedVendorCode).trim()
    if (!vendorCode) {
      window.alert(t('vendorsEmpty'))
      return
    }
    const vendorName =
      getVendorNameByCode(vendorCode) || editingBuyerRecord?.vendorName || ''
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
    const today = todayIsoDateLocal()
    const originalStart = editingBuyerRecord
      ? periodIsoToDateInput(editingBuyerRecord.periodStart)
      : ''
    const originalEnd = editingBuyerRecord
      ? periodIsoToDateInput(editingBuyerRecord.periodEnd)
      : ''
    const periodChanged =
      periodRange.start !== originalStart || periodRange.end !== originalEnd
    if (
      periodChanged &&
      (periodRange.start < today || periodRange.end < today)
    ) {
      window.alert(t('periodRangePastInvalid'))
      return
    }
    const keepSlots = existingAgreementNames
      .map((_, index) => index)
      .filter((index) => !removedExistingAgreementSlots.has(index))
    const totalAgreementDocs = keepSlots.length + agreementFiles.length
    const agreementFilesChanged =
      agreementFiles.length > 0 || removedExistingAgreementSlots.size > 0

    const savedAgreementNames = agreementFileNamesForSave(
      existingAgreementNames,
      keepSlots,
      agreementFiles.map((f) => f.name),
    )

    const payload = {
      vendorCode,
      vendorName,
      incomeType: buyerIncomeType.trim(),
      agreementFileName: savedAgreementNames[0] ?? '',
      agreementFileNames: savedAgreementNames,
      amount: amountParsed,
      periodStart: periodRange.start,
      periodEnd: periodRange.end,
      description: buyerDescription.trim(),
    }

    setBuyerFormBusy(true)
    try {
      if (editingBuyerRecordId) {
        if (agreementFilesChanged) {
          if (totalAgreementDocs === 0) {
            window.alert(t('agreementFileRequired'))
            return
          }
          if (totalAgreementDocs > AGREEMENT_MAX) {
            window.alert(t('agreementFileMax'))
            return
          }
        } else if (totalAgreementDocs === 0) {
          window.alert(t('agreementFileRequired'))
          return
        }
        await updateBuyerData(
          editingBuyerRecordId,
          payload,
          agreementFilesChanged ? { newFiles: agreementFiles, keepSlots } : null,
        )
        form.reset()
        closeBuyerFormModal()
        return
      }

      if (agreementFiles.length === 0) {
        window.alert(t('agreementFileRequired'))
        return
      }
      if (agreementFiles.length > AGREEMENT_MAX) {
        window.alert(t('agreementFileMax'))
        return
      }
      await createBuyerData(payload, userName, 'buyers', { newFiles: agreementFiles })
      form.reset()
      closeBuyerFormModal()
      navigate('/dashboard')
    } catch (err) {
      window.alert(err instanceof Error ? err.message : t('agreementFileMax'))
    } finally {
      setBuyerFormBusy(false)
    }
  }

  async function submitInvoice(event: FormEvent) {
    event.preventDefault()
    if (!selectedRecord || invoiceFormBusy) return
    const form = event.currentTarget as HTMLFormElement
    const formData = new FormData(form)

    const keepSlots = existingFormulaNames
      .map((_, index) => index)
      .filter((index) => !removedExistingFormulaSlots.has(index))
    const totalDocs = keepSlots.length + formulaFormFiles.length
    const filesChanged =
      formulaFormFiles.length > 0 || removedExistingFormulaSlots.size > 0

    if (!isEditingInvoice || filesChanged) {
      if (totalDocs === 0) {
        window.alert(t('invFormulaPdfRequired'))
        return
      }
      if (totalDocs > FORMULA_FORM_MAX) {
        window.alert(t('invFormulaPdfMax'))
        return
      }
      for (const file of formulaFormFiles) {
        if (!file.name.toLowerCase().endsWith('.pdf')) {
          window.alert(t('invFormulaPdfRequired'))
          return
        }
      }
    }

    const bankName = String(formData.get('bankName') ?? formData.get('transferTo') ?? '').trim()
    const bankBranch = String(formData.get('bankBranch') ?? '').trim()
    const accountNo = String(formData.get('accountNo') ?? '').trim()
    const beneficiaryName = String(formData.get('beneficiaryName') ?? '').trim()
    if (!bankName || !bankBranch || !accountNo || !beneficiaryName) {
      window.alert(t('invBankNoneSelected'))
      return
    }
    const signerName = String(formData.get('signer') ?? '').trim()
    const signerTitle = String(formData.get('signerTitle') ?? '').trim()
    if (!signerName || !signerTitle) {
      window.alert(t('invSignerNoneSelected'))
      return
    }
    const savedFormulaNames = formulaFormFileNamesForSave(
      existingFormulaNames,
      keepSlots,
      formulaFormFiles.map((f) => f.name),
    )
    const invoice: InvoiceData = {
      number: previewInvoiceNumberForRecord(selectedRecord, records),
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
      bankName,
      transferTo: bankName,
      bankBranch,
      accountNo,
      beneficiaryName,
      formulaFormFileName: savedFormulaNames[0] ?? '',
      formulaFormFileNames: savedFormulaNames,
      signer: signerName,
      signerTitle,
      pphEmail: String(formData.get('pphEmail') ?? INVOICE_COMPANY.pphNoteEmail).trim(),
    }
    const editing = financeNeedsStampUpload(selectedRecord)
    const formulaUpload =
      !isEditingInvoice || filesChanged
        ? { newFiles: formulaFormFiles, keepSlots }
        : undefined
    setInvoiceFormBusy(true)
    try {
      await createInvoice(selectedRecord.id, invoice, userName, formulaUpload)
      setIsInvoiceModalOpen(false)
      navigate(editing ? '/dashboard/task' : '/dashboard')
    } catch {
      /* keep modal open */
    } finally {
      setInvoiceFormBusy(false)
    }
  }

  function preventEnterSubmit(event: ReactKeyboardEvent<HTMLFormElement>) {
    if (event.key === 'Enter') {
      const target = event.target as HTMLElement
      if (target.tagName !== 'TEXTAREA') {
        event.preventDefault()
      }
    }
  }

  const userInitial = (userName.trim()[0] ?? 'U').toUpperCase()
  const financeTaskCount = financeTaskRecords.length

  const portalNavItems =
    userRole === 'buyers'
      ? [
          { to: '/dashboard', labelKey: 'navOverview' as const, end: true, icon: 'overview' as const },
          { to: '/dashboard/history', labelKey: 'navHistory' as const, icon: 'history' as const },
        ]
      : [
          { to: '/dashboard', labelKey: 'navOverview' as const, end: true, icon: 'overview' as const },
          {
            to: '/dashboard/task',
            labelKey: 'navTask' as const,
            icon: 'task' as const,
            badgeCount: financeTaskCount,
          },
          { to: '/dashboard/archive', labelKey: 'navArchive' as const, icon: 'archive' as const },
        ]
  const portalRoleLabelKey = userRole === 'buyers' ? ('roleBuyers' as const) : ('roleFinance' as const)

  const handleNotificationRecordSelect = useCallback(
    (recordId: string, kind?: PortalNotificationItem['kind']) => {
      if (userRole === 'finance' && isRecordBlockedByOther(recordId)) return
      const record = records.find((r) => r.id === recordId)
      if (
        userRole === 'finance' &&
        (kind === 'stamp_upload' ||
          kind === 'buyer_edit_request' ||
          record?.status === 'document_generated')
      ) {
        setDetailRecordId(null)
        navigate('/dashboard/task')
        return
      }
      const path = location.pathname.replace(/\/+$/, '') || '/'
      if (path !== '/dashboard') {
        navigate('/dashboard')
      }
      tryOpenDetail(recordId)
    },
    [location.pathname, navigate, records, userRole, isRecordBlockedByOther, tryOpenDetail],
  )

  return (
    <>
      <PortalLayout
        userName={userName}
        userDepartment={userDepartment}
        userInitial={userInitial}
        roleLabelKey={portalRoleLabelKey}
        navItems={portalNavItems}
        t={t}
        onNotificationRecordSelect={handleNotificationRecordSelect}
      >
          {!hideDashboardSummary ? (
            <section className={`portal-card p-6`}>
              <h2 className="mb-4 text-base font-semibold portal-heading">{t('summaryTitle')}</h2>
              <div className="grid gap-3 sm:grid-cols-2">
                {summaryCards.map((card) => {
                  const iconKind = summaryIconKind(card.labelKey)
                  return (
                    <article
                      key={card.labelKey}
                      className={`flex items-center gap-4 portal-card-sm p-4`}
                    >
                      <div
                        className={`portal-stat-icon ${
                          iconKind === 'reminder'
                            ? 'portal-stat-icon-reminder'
                            : 'portal-stat-icon-records'
                        }`}
                      >
                        <PortalSummaryIcon kind={iconKind} role={userRole} />
                      </div>
                      <div className="min-w-0">
                        <p className="portal-heading font-mono text-2xl font-bold leading-none">
                          {card.value}
                        </p>
                        <p className="portal-body mt-1 text-sm leading-snug">{t(card.labelKey)}</p>
                      </div>
                    </article>
                  )
                })}
              </div>
            </section>
          ) : null}

          {!hideArchiveRevenueChart ? (
            <section className={`portal-card p-6`}>
              <div className="mb-4">
                <h2 className="text-base font-semibold portal-heading">{t('chartArchiveRevenueTitle')}</h2>
                <p className="portal-muted mt-1 text-xs sm:text-sm">{t('chartArchiveRevenueSubtitle')}</p>
                <p className="portal-accent mt-0.5 text-[10px] font-medium uppercase tracking-wide sm:text-xs">
                  {t('chartCumulativeLabel')}
                </p>
              </div>
              <RevenueLineChart records={records} t={t} dateLocale={dateLocale} role={userRole} />
            </section>
          ) : null}

          <Routes>
            <Route
              index
              element={
                <section className={`portal-card p-6`}>
                  <h2 className="mb-4 text-base font-semibold portal-heading">
                    {userRole === 'buyers' ? t('listBuyersLatest') : t('listBuyersFinance')}
                  </h2>
                  <RecordListFilterBar
                    searchQuery={listSearchQuery}
                    onSearchChange={setListSearchQuery}
                    searchLabel={t('recordFilterSearchLabel')}
                    searchPlaceholder={t('recordFilterSearchPlaceholder')}
                    statusFilter={listStatusFilter}
                    onStatusFilterChange={setListStatusFilter}
                    statusLabel={t('recordFilterStatusLabel')}
                    statusOptions={overviewStatusOptions}
                    resetLabel={t('recordFilterReset')}
                    onReset={resetListFilters}
                    showReset={listSearchQuery.trim() !== '' || listStatusFilter !== 'all'}
                  />
                  <div className="portal-table-wrap">
                    {activeDashboardRecords.length === 0 ? (
                      <p className={`portal-empty m-4`}>
                        {userRole === 'buyers' ? t('buyerDashboardListEmpty') : t('financeDashboardListEmpty')}
                      </p>
                    ) : activeDashboardFiltered.length === 0 ? (
                      <p className="portal-chart-warn m-4 p-6 text-sm text-amber-950/90 dark:text-amber-200">
                        {t('recordFilterNoResults')}
                      </p>
                    ) : (
                      <div className="portal-table">
                        <div
                          className={`portal-table-head portal-table-row ${userRole === 'buyers' ? 'portal-table-row--overview-buyer' : 'portal-table-row--overview-finance'}`}
                        >
                          <div className="portal-table-th">{t('vendorName')}</div>
                          <div className="portal-table-th">{t('periodEndField')}</div>
                          <div className="portal-table-th">{t('statusLabel')}</div>
                          {userRole === 'buyers' ? (
                            <div className="portal-table-th">{t('recordTableColDocuments')}</div>
                          ) : null}
                        </div>
                        <div className="portal-table-body">
                          {overviewPagination.pageItems.map((record, index) => {
                            const reminder = daysUntilPeriodEnd(record.periodEnd)
                            const zebraClass = index % 2 === 0 ? 'portal-list-zebra-a' : 'portal-list-zebra-b'
                            const inFinanceTask =
                              userRole === 'buyers' && isBuyerRecordInFinanceTask(record)
                            const editPending = hasPendingBuyerEditRequest(record)
                            const editApproved = hasApprovedBuyerEditRequest(record)
                            const editDenied = isBuyerEditRequestDenied(record)
                            const statusBadge = inFinanceTask ? (
                              <span className="inline-flex flex-wrap items-center gap-1">
                                <span className="rounded-full bg-violet-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-violet-700 dark:bg-violet-600/20 dark:text-violet-200">
                                  {t('buyerInFinanceTaskBadge')}
                                </span>
                                {editPending ? (
                                  <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-800 dark:bg-amber-600/20 dark:text-amber-200">
                                    {t('buyerEditRequestPending')}
                                  </span>
                                ) : null}
                                {editApproved ? (
                                  <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-800 dark:bg-emerald-600/20 dark:text-emerald-200">
                                    {t('buyerEditApprovedBadge')}
                                  </span>
                                ) : null}
                                {editDenied ? (
                                  <span className="rounded-full bg-slate-200 px-2 py-0.5 text-[10px] font-semibold text-slate-700 dark:bg-slate-700/50 dark:text-slate-200">
                                    {t('buyerEditRequestDenied')}
                                  </span>
                                ) : null}
                              </span>
                            ) : reminder <= 5 ? (
                              <span className="portal-badge-reminder">{t('emailReminder')}</span>
                            ) : (
                              <span className="portal-badge-normal">{t('normal')}</span>
                            )
                            const remoteWorking =
                              userRole === 'finance'
                                ? recordWorkingByOther(record.id, currentUserId, invoiceEditing)
                                : null
                            const blocked = Boolean(remoteWorking)
                            const recordDocuments =
                              userRole === 'buyers' ? listRecordDocuments(record) : []
                            const rowClass = `${zebraClass} ${userRole === 'buyers' ? 'portal-table-row--overview-buyer' : 'portal-table-row--overview-finance'} ${blocked ? 'z-20 opacity-60' : 'portal-table-row--clickable'}`
                            return (
                              <div
                                key={record.id}
                                role="button"
                                tabIndex={blocked ? -1 : 0}
                                aria-disabled={blocked}
                                className={`portal-table-row relative ${rowClass}`}
                                onClick={() => {
                                  if (!blocked) tryOpenDetail(record.id)
                                }}
                                onKeyDown={(e) => {
                                  if (blocked) return
                                  if (e.key === 'Enter' || e.key === ' ') {
                                    e.preventDefault()
                                    tryOpenDetail(record.id)
                                  }
                                }}
                              >
                                <div className="portal-table-td">
                                  <p className="truncate font-semibold portal-heading">{record.vendorName}</p>
                                  <p className="portal-muted truncate text-xs">{record.vendorCode}</p>
                                </div>
                                <div className="portal-table-td text-sm portal-body">
                                  {formatDate(record.periodEnd, dateLocale)}
                                </div>
                                <div className="portal-table-td">{statusBadge}</div>
                                {userRole === 'buyers' ? (
                                  <div
                                    className="portal-table-td"
                                    onClick={(e) => e.stopPropagation()}
                                    onKeyDown={(e) => e.stopPropagation()}
                                  >
                                    {recordDocuments.length > 0 ? (
                                      <div className="flex flex-wrap gap-1">
                                        {recordDocuments.map((doc) => (
                                          <button
                                            key={`${doc.kind}-${doc.fileIndex ?? 0}-${doc.fileName}`}
                                            type="button"
                                            disabled={blocked}
                                            onClick={() => openDocPreview(record.id, doc.kind, doc.fileName, doc.fileIndex ?? 0)}
                                            className="portal-btn-secondary px-2 py-1 text-[10px] font-semibold disabled:cursor-not-allowed disabled:opacity-50"
                                          >
                                            {recordDocLabel(doc.kind)}
                                          </button>
                                        ))}
                                      </div>
                                    ) : (
                                      <span className="text-xs portal-muted">—</span>
                                    )}
                                  </div>
                                ) : null}
                                {remoteWorking ? (
                                  <RecordWorkingOverlay
                                    processingLabel={t('recordProcessing')}
                                    userName={remoteWorking.userName}
                                    avatarPreset={remoteWorking.avatarPreset}
                                    title={t('recordWorkingBy').replace('{name}', remoteWorking.userName)}
                                  />
                                ) : null}
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    )}
                    <RecordListPagination
                      page={overviewPagination.page}
                      totalPages={overviewPagination.totalPages}
                      totalItems={overviewPagination.totalItems}
                      pageSize={overviewPagination.pageSize}
                      onPageChange={overviewPagination.setPage}
                      previousLabel={t('paginationPrevious')}
                      nextLabel={t('paginationNext')}
                      slideLabel={t('listPaginationSlide')}
                      rangeLabel={t('listPaginationRange')}
                    />
                  </div>
                </section>
              }
            />


            <Route path="invoice" element={<Navigate to="/dashboard" replace />} />

            <Route
              path="task"
              element={
                userRole === 'finance' ? (
                  <section className={`portal-card p-6`}>
                    <h2 className="mb-4 text-base font-semibold portal-heading">{t('taskPageTitle')}</h2>
                    <p className="portal-body mb-4 text-sm">
                      {t('taskPageSubtitle')}
                    </p>
                    <RecordListFilterBar
                      searchQuery={listSearchQuery}
                      onSearchChange={setListSearchQuery}
                      searchLabel={t('recordFilterSearchLabel')}
                      searchPlaceholder={t('recordFilterSearchPlaceholder')}
                      statusFilter={listStatusFilter}
                      onStatusFilterChange={setListStatusFilter}
                      statusLabel={t('recordFilterStatusLabel')}
                      statusOptions={taskStatusOptions}
                      resetLabel={t('recordFilterReset')}
                      onReset={resetListFilters}
                      showReset={listSearchQuery.trim() !== '' || listStatusFilter !== 'all'}
                    />
                    <div className="portal-table-wrap">
                      {financeTaskRecords.length === 0 ? (
                        <p className={`portal-empty m-4`}>
                          {t('taskPageEmpty')}
                        </p>
                      ) : financeTaskFiltered.length === 0 ? (
                        <p className="portal-chart-warn m-4 p-6 text-sm text-amber-950/90 dark:text-amber-200">
                          {t('recordFilterNoResults')}
                        </p>
                      ) : (
                        <div className="portal-table">
                          <div className={`portal-table-head portal-table-row portal-table-row--task`}>
                            <div className="portal-table-th">{t('vendorName')}</div>
                            <div className="portal-table-th">{t('recordTableColInvoice')}</div>
                            <div className="portal-table-th">{t('financeDownloadBy')}</div>
                            <div className="portal-table-th">{t('recordTableColActions')}</div>
                          </div>
                          <div className="portal-table-body">
                            {financeTaskPagination.pageItems.map((record, index) => {
                              const remoteWorking = recordWorkingByOther(
                                record.id,
                                currentUserId,
                                invoiceEditing,
                              )
                              return (
                                <FinanceTaskRow
                                  key={record.id}
                                  record={record}
                                  zebraClass={index % 2 === 0 ? 'portal-list-zebra-a' : 'portal-list-zebra-b'}
                                  blocked={Boolean(remoteWorking)}
                                  remoteWorking={remoteWorking}
                                  processingLabel={t('recordProcessing')}
                                  overlayTitle={
                                    remoteWorking
                                      ? t('recordWorkingBy').replace('{name}', remoteWorking.userName)
                                      : undefined
                                  }
                                  onEngage={engageFinanceRecord}
                                  onPickFile={handleTaskStampUpload}
                                  onPublishStamp={handleTaskStampPublish}
                                  onEdit={goToInvoiceForRecord}
                                  onDownloadInvoice={() => {
                                    engageFinanceRecord(record.id)
                                    setTaskInvoicePrintRecordId(record.id)
                                  }}
                                  editLabel={t('financeEditInvoice')}
                                  uploadLabel={t('uploadStampedPaper')}
                                  stampUploadLabels={{
                                    close: t('close'),
                                    confirmUpload: t('taskStampConfirmUpload'),
                                    viewStamped: t('taskStampViewUploaded'),
                                    publish: t('taskStampPublish'),
                                    previewUnavailable: t('taskStampPreviewUnavailable'),
                                    uploading: t('loadingData'),
                                    publishing: t('taskStampPublishing'),
                                  }}
                                  downloadInvoiceLabel={t('taskDownloadInvoice')}
                                  hasInvoice={Boolean(record.invoice)}
                                  financeByText={record.generatedBy ?? '-'}
                                  editRequestTitle={t('financeBuyerEditRequestTitle')}
                                  editRequestHint={t('financeBuyerEditRequestHint')}
                                  approveEditLabel={t('financeBuyerEditApprove')}
                                  denyEditLabel={t('financeBuyerEditDeny')}
                                  onApproveEditRequest={(id) => handleResolveBuyerEditRequest(id, 'approve')}
                                  onDenyEditRequest={(id) => handleResolveBuyerEditRequest(id, 'deny')}
                                  resolvingEditRequest={resolvingEditRequestId === record.id}
                                  buyerEditingLocked={isFinanceTaskPausedForBuyerEdit(record)}
                                  buyerEditingTitle={t('financeBuyerEditApprovedTitle')}
                                  buyerEditingHint={t('financeBuyerEditApprovedHint')}
                                />
                              )
                            })}
                          </div>
                        </div>
                      )}
                      <RecordListPagination
                        page={financeTaskPagination.page}
                        totalPages={financeTaskPagination.totalPages}
                        totalItems={financeTaskPagination.totalItems}
                        pageSize={financeTaskPagination.pageSize}
                        onPageChange={financeTaskPagination.setPage}
                        previousLabel={t('paginationPrevious')}
                        nextLabel={t('paginationNext')}
                        slideLabel={t('listPaginationSlide')}
                        rangeLabel={t('listPaginationRange')}
                      />
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
                  <section className={`portal-card p-6`}>
                    <h2 className="mb-4 text-base font-semibold portal-heading">{t('archivePageTitle')}</h2>
                    <p className="portal-body mb-4 text-sm">{t('archivePageSubtitle')}</p>
                    <div className="portal-filter-panel mb-5 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
                      <label className="portal-subheading flex min-w-0 flex-1 flex-col gap-1 text-xs font-medium sm:min-w-[12rem]">
                        {t('recordFilterSearchLabel')}
                        <InputIconWrap icon={Search}>
                          <input
                            type="search"
                            value={listSearchQuery}
                            onChange={(e) => setListSearchQuery(e.target.value)}
                            placeholder={t('recordFilterSearchPlaceholder')}
                            className="portal-input pl-9"
                            autoComplete="off"
                          />
                        </InputIconWrap>
                      </label>
                      <label className="portal-subheading flex min-w-[10rem] flex-col gap-1 text-xs font-medium">
                        {t('archiveFilterYearLabel')}
                        <InputIconWrap icon={Calendar}>
                          <select
                            value={archiveFilterYear}
                            onChange={(e) => setArchiveFilterYear(e.target.value)}
                            className="portal-select pl-9"
                          >
                            <option value="">{t('archiveFilterYearAll')}</option>
                            {financeArchiveYearOptions.map((y) => (
                              <option key={y} value={String(y)}>
                                {y}
                              </option>
                            ))}
                          </select>
                        </InputIconWrap>
                      </label>
                      <label className="portal-subheading flex min-w-[10rem] flex-col gap-1 text-xs font-medium">
                        {t('archiveFilterDateLabel')}
                        <InputIconWrap icon={Calendar}>
                          <input
                            type="date"
                            value={archiveFilterDate}
                            onChange={(e) => setArchiveFilterDate(e.target.value)}
                            className="portal-select pl-9"
                          />
                        </InputIconWrap>
                      </label>
                      {(archiveFilterYear !== '' || archiveFilterDate !== '' || listSearchQuery.trim() !== '') && (
                        <button
                          type="button"
                          onClick={() => {
                            setArchiveFilterYear('')
                            setArchiveFilterDate('')
                            setListSearchQuery('')
                          }}
                          className="portal-btn-secondary inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold sm:mb-0.5"
                        >
                          <RotateCcw className="h-3.5 w-3.5" aria-hidden strokeWidth={1.75} />
                          {t('archiveFilterReset')}
                        </button>
                      )}
                    </div>
                    <div className="portal-table-wrap">
                      {financeArchiveSourceList.length === 0 ? (
                        <p className={`portal-empty m-4`}>{t('archivePageEmpty')}</p>
                      ) : financeArchiveFiltered.length === 0 ? (
                        <p className="portal-chart-warn m-4 p-6 text-sm text-amber-950/90 dark:text-amber-200">
                          {t('archiveFilterNoResults')}
                        </p>
                      ) : (
                        <div className="portal-table">
                          <div className={`portal-table-head portal-table-row portal-table-row--archive`}>
                            <div className="portal-table-th">{t('vendorName')}</div>
                            <div className="portal-table-th">{t('recordTableColAmount')}</div>
                            <div className="portal-table-th">{t('recordTableColDate')}</div>
                            <div className="portal-table-th">{t('statusLabel')}</div>
                            <div className="portal-table-th">{t('recordTableColActions')}</div>
                          </div>
                          <div className="portal-table-body">
                            {financeArchiveFiltered.map((record, index) => {
                              const isPublished = record.status === 'history'
                              const zebraClass =
                                index % 2 === 0 ? 'portal-list-zebra-a' : 'portal-list-zebra-b'
                              const remoteWorking = recordWorkingByOther(
                                record.id,
                                currentUserId,
                                invoiceEditing,
                              )
                              const blocked = Boolean(remoteWorking)
                              const rowClass = `${zebraClass} ${blocked ? 'z-20 opacity-60' : 'portal-table-row--clickable'}`
                              return (
                                <div
                                  key={record.id}
                                  role="button"
                                  tabIndex={blocked ? -1 : 0}
                                  aria-disabled={blocked}
                                  className={`portal-table-row portal-table-row--archive relative ${rowClass}`}
                                  onClick={() => {
                                    if (!blocked) tryOpenDetail(record.id)
                                  }}
                                  onKeyDown={(e) => {
                                    if (blocked) return
                                    if (e.key === 'Enter' || e.key === ' ') {
                                      e.preventDefault()
                                      tryOpenDetail(record.id)
                                    }
                                  }}
                                >
                                  <div className="portal-table-td">
                                    <p className="truncate font-semibold portal-heading">{record.vendorName}</p>
                                    <p className="portal-muted truncate text-xs">{record.vendorCode}</p>
                                  </div>
                                  <div className="portal-table-td text-sm portal-body">
                                    {formatIdr.format(record.amount)}
                                  </div>
                                  <div className="portal-table-td text-sm portal-body">
                                    <p>
                                      {record.archivedAt
                                        ? formatDate(record.archivedAt, dateLocale)
                                        : '—'}
                                    </p>
                                    {isPublished && record.publishedAt ? (
                                      <p className="portal-muted mt-0.5 text-[10px]">
                                        {t('publishedLabel')} {formatDate(record.publishedAt, dateLocale)}
                                      </p>
                                    ) : null}
                                  </div>
                                  <div className="portal-table-td">
                                    {isPublished ? (
                                      <span className="inline-flex rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-800 dark:bg-emerald-600/20 dark:text-emerald-200">
                                        {t('archivePublishedBadge')}
                                      </span>
                                    ) : (
                                      <span className="inline-flex rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-900 dark:bg-amber-600/20 dark:text-amber-200">
                                        {t('archiveStatusPendingPublish')}
                                      </span>
                                    )}
                                  </div>
                                  <div
                                    className="portal-table-td flex min-w-0 flex-wrap gap-1"
                                    onClick={(e) => e.stopPropagation()}
                                    onKeyDown={(e) => e.stopPropagation()}
                                  >
                                    {isPublished ? (
                                      apiConnected ? (
                                        <>
                                          <button
                                            type="button"
                                            disabled={blocked}
                                            onClick={() =>
                                              void handleArchivePublishedDownload(record, 'stamped-paper')
                                            }
                                            className="portal-btn-secondary px-2 py-1 text-[10px] font-semibold disabled:cursor-not-allowed disabled:opacity-50"
                                          >
                                            {t('archiveDocStampedPaper')}
                                          </button>
                                          {record.invoice
                                            ? formulaFormFileNamesFromInvoice(record.invoice).map(
                                                (name, formulaIndex) => (
                                                  <button
                                                    key={`formula-${formulaIndex}`}
                                                    type="button"
                                                    disabled={blocked}
                                                    onClick={() =>
                                                      void handleArchivePublishedDownload(
                                                        record,
                                                        'formula-form',
                                                        formulaIndex,
                                                      )
                                                    }
                                                    className="portal-btn-secondary px-2 py-1 text-[10px] font-semibold disabled:cursor-not-allowed disabled:opacity-50"
                                                  >
                                                    {formulaFormFileNamesFromInvoice(record.invoice).length > 1
                                                      ? `${t('archiveDocFormulaForm')} ${formulaIndex + 1}`
                                                      : t('archiveDocFormulaForm')}
                                                  </button>
                                                ),
                                              )
                                            : null}
                                          {agreementFileNamesFromRecord(record).map((name, agreementIndex) => (
                                            <button
                                              key={`agreement-${agreementIndex}`}
                                              type="button"
                                              disabled={blocked}
                                              onClick={() =>
                                                void handleArchivePublishedDownload(
                                                  record,
                                                  'agreement',
                                                  agreementIndex,
                                                )
                                              }
                                              className="portal-btn-secondary px-2 py-1 text-[10px] font-semibold disabled:cursor-not-allowed disabled:opacity-50"
                                            >
                                              {agreementFileNamesFromRecord(record).length > 1
                                                ? `${t('archiveDocAgreement')} ${agreementIndex + 1}`
                                                : t('archiveDocAgreement')}
                                            </button>
                                          ))}
                                        </>
                                      ) : (
                                        <button
                                          type="button"
                                          disabled={blocked}
                                          onClick={() =>
                                            void handleArchivePublishedDownload(record, 'stamped-paper')
                                          }
                                          className="portal-btn-secondary px-2 py-1 text-[10px] font-semibold disabled:cursor-not-allowed disabled:opacity-50"
                                        >
                                          {t('archiveDownloadSummaryOffline')}
                                        </button>
                                      )
                                    ) : (
                                      <button
                                        type="button"
                                        disabled={blocked}
                                        onClick={() => {
                                          void publishPaper(record.id).then(() =>
                                            celebratePublish(record.id, record.vendorName),
                                          )
                                        }}
                                        className="portal-btn-primary px-2.5 py-1 text-[10px] font-semibold disabled:cursor-not-allowed disabled:opacity-50"
                                      >
                                        {t('publishPaperForm')}
                                      </button>
                                    )}
                                  </div>
                                  {remoteWorking ? (
                                    <RecordWorkingOverlay
                                      processingLabel={t('recordProcessing')}
                                      userName={remoteWorking.userName}
                                      avatarPreset={remoteWorking.avatarPreset}
                                      title={t('recordWorkingBy').replace('{name}', remoteWorking.userName)}
                                    />
                                  ) : null}
                                </div>
                              )
                            })}
                          </div>
                        </div>
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
                  <section className={`portal-card p-6`}>
                    <h2 className="mb-4 text-base font-semibold portal-heading">{t('historyPageTitle')}</h2>
                    <p className="portal-body mb-4 text-sm">{t('historyPageSubtitleBuyers')}</p>
                    <RecordListFilterBar
                      searchQuery={listSearchQuery}
                      onSearchChange={setListSearchQuery}
                      searchLabel={t('recordFilterSearchLabel')}
                      searchPlaceholder={t('recordFilterSearchPlaceholder')}
                      statusFilter="all"
                      onStatusFilterChange={() => {}}
                      statusLabel=""
                      statusOptions={[]}
                      resetLabel={t('recordFilterReset')}
                      onReset={resetListFilters}
                      showReset={listSearchQuery.trim() !== ''}
                    />
                    <div className="portal-table-wrap">
                      {buyerHistoryRecords.length === 0 ? (
                        <p className={`portal-empty m-4`}>{t('historyPageEmptyBuyers')}</p>
                      ) : buyerHistoryFiltered.length === 0 ? (
                        <p className="portal-chart-warn m-4 p-6 text-sm text-amber-950/90 dark:text-amber-200">
                          {t('recordFilterNoResults')}
                        </p>
                      ) : (
                        <div className="portal-table">
                          <div className={`portal-table-head portal-table-row portal-table-row--history`}>
                            <div className="portal-table-th">{t('vendorName')}</div>
                            <div className="portal-table-th">{t('recordTableColDate')}</div>
                            <div className="portal-table-th">{t('statusLabel')}</div>
                            <div className="portal-table-th">{t('recordTableColDocuments')}</div>
                          </div>
                          <div className="portal-table-body">
                            {buyerHistoryFiltered.map((record, index) => {
                              const isPublished = record.status === 'history'
                              const dateIso = isPublished
                                ? record.publishedAt
                                : record.archivedAt
                              const recordDocuments = listRecordDocuments(record)
                              const zebraClass =
                                index % 2 === 0 ? 'portal-list-zebra-a' : 'portal-list-zebra-b'
                              return (
                                <div
                                  key={record.id}
                                  role="button"
                                  tabIndex={0}
                                  className={`portal-table-row portal-table-row--history portal-table-row--clickable ${zebraClass}`}
                                  onClick={() => tryOpenDetail(record.id)}
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter' || e.key === ' ') {
                                      e.preventDefault()
                                      tryOpenDetail(record.id)
                                    }
                                  }}
                                >
                                  <div className="portal-table-td">
                                    <p className="truncate font-semibold portal-heading">{record.vendorName}</p>
                                    <p className="portal-muted truncate text-xs">{record.vendorCode}</p>
                                  </div>
                                  <div className="portal-table-td text-sm portal-body">
                                    {dateIso ? formatDate(dateIso, dateLocale) : '—'}
                                  </div>
                                  <div className="portal-table-td">
                                    {isPublished ? (
                                      <span className="inline-flex rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-800 dark:bg-emerald-600/20 dark:text-emerald-200">
                                        {t('archivePublishedBadge')}
                                      </span>
                                    ) : (
                                      <span className="inline-flex rounded-full bg-slate-200 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-700 dark:bg-slate-700/50 dark:text-slate-200">
                                        {t('historyStatusArchived')}
                                      </span>
                                    )}
                                  </div>
                                  <div
                                    className="portal-table-td"
                                    onClick={(e) => e.stopPropagation()}
                                    onKeyDown={(e) => e.stopPropagation()}
                                  >
                                    {recordDocuments.length > 0 ? (
                                      <div className="flex flex-wrap gap-1">
                                        {recordDocuments.map((doc) => (
                                          <button
                                            key={`${doc.kind}-${doc.fileIndex ?? 0}-${doc.fileName}`}
                                            type="button"
                                            onClick={() => openDocPreview(record.id, doc.kind, doc.fileName, doc.fileIndex ?? 0)}
                                            className="portal-btn-secondary px-2 py-1 text-[10px] font-semibold"
                                          >
                                            {recordDocLabel(doc.kind)}
                                          </button>
                                        ))}
                                      </div>
                                    ) : (
                                      <span className="text-xs portal-muted">—</span>
                                    )}
                                  </div>
                                </div>
                              )
                            })}
                          </div>
                        </div>
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

      </PortalLayout>
      {isLoading ? (
        <div className="portal-toast">
          {t('loadingData')}
        </div>
      ) : null}

      {userRole === 'finance' && isInvoiceModalOpen ? (
        <div className="fixed inset-0 z-[100] flex items-center justify-center portal-overlay p-4">
          <div className="relative portal-modal max-h-[92vh] w-full max-w-3xl overflow-y-auto p-6">
            <FormLoadingOverlay active={invoiceFormBusy} label={t('savingData')} />
            <div className="mb-4 flex items-center justify-between gap-3">
              <h2 className="portal-heading text-lg font-semibold">
                {isEditingInvoice ? t('financeEditInvoice') : t('invoiceFormTitle')}
              </h2>
              <ModalCloseButton
                onClick={() => setIsInvoiceModalOpen(false)}
                disabled={invoiceFormBusy}
                label={t('close')}
              />
            </div>
            <label className="mb-4 block space-y-1 text-sm">
              <span>{t('invoiceSelectHint')}</span>
              <select
                value={selectedRecordId}
                disabled
                className="portal-input cursor-not-allowed opacity-70"
                aria-disabled
              >
                <option value="">{t('invoiceSelectPlaceholder')}</option>
                {financeInvoiceFormRecords.map((record) => (
                  <option key={record.id} value={record.id}>
                    {record.vendorCode} - {record.vendorName}
                  </option>
                ))}
              </select>
            </label>

            {financeInvoiceFormRecords.length === 0 ? (
              <div className="portal-empty text-sm">
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
                    value={previewInvoiceNumberForRecord(selectedRecord, records)}
                    readOnly
                    aria-readonly
                    required
                    className="portal-input-readonly"
                  />
                  <span className="portal-muted block text-xs">{t('invNoAuto')}</span>
                </label>
                <label className="space-y-1 text-sm">
                  <span>{t('invParty')}</span>
                  <input
                    value={selectedRecord.vendorName}
                    readOnly
                    aria-readonly
                    className="portal-input-readonly"
                  />
                </label>
                <label className="space-y-1 text-sm">
                  <span>{t('invAttn')}</span>
                  <input
                    name="attn"
                    defaultValue={selectedInvoiceDefaults.attn}
                    required
                    className="portal-input"
                  />
                </label>
                <label className="space-y-1 text-sm">
                  <span>{t('invPaymentMethod')}</span>
                  <select
                    name="paymentMethod"
                    defaultValue={selectedInvoiceDefaults.paymentMethod}
                    className="portal-input"
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
                    defaultValue={selectedInvoiceDefaults.dueDate}
                    min={
                      isEditingInvoice &&
                      selectedInvoiceDefaults.dueDate < todayIsoDateLocal()
                        ? undefined
                        : todayIsoDateLocal()
                    }
                    required
                    className="portal-input"
                  />
                </label>
                <label className="space-y-1 text-sm md:col-span-2">
                  <span>{t('invPphEmail')}</span>
                  <input
                    type="text"
                    name="pphEmail"
                    defaultValue={selectedInvoiceDefaults.pphEmail}
                    required
                    className="portal-input"
                    placeholder={INVOICE_COMPANY.pphNoteEmail}
                  />
                  <span className="portal-muted block text-xs">{t('invPphEmailHint')}</span>
                </label>
                <label className="space-y-1 text-sm">
                  <span>{t('invMemo')}</span>
                  <input name="memo" defaultValue={selectedInvoiceDefaults.memo} className="portal-input" />
                </label>
                <label className="space-y-1 text-sm">
                  <span>{t('invVat')}</span>
                  <input
                    type="number"
                    name="vatPercent"
                    defaultValue={selectedInvoiceDefaults.vatPercent}
                    className="portal-input"
                  />
                </label>
                <label className="space-y-1 text-sm">
                  <span>{t('invTaxType')}</span>
                  <select
                    name="taxType"
                    defaultValue={selectedInvoiceDefaults.taxType}
                    className="portal-input"
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
                    defaultValue={selectedInvoiceDefaults.taxPercent}
                    className="portal-input"
                  />
                </label>
                <InvoiceBankAccountFields
                  forRole="finance"
                  value={invoiceBankDetails}
                  onChange={setInvoiceBankDetails}
                  labels={{
                    bankName: t('invBankName'),
                    bankNamePlaceholder: t('invBankNamePlaceholder'),
                    bankAccountVariant: t('invBankAccountVariant'),
                    bankAccountVariantPlaceholder: t('invBankAccountVariantPlaceholder'),
                    beneficiary: t('invBeneficiary'),
                    bankBranch: t('invBankBranch'),
                    accountNo: t('invAccountNo'),
                    accountNoDigitsOnly: t('invAccountNoDigitsOnly'),
                    addNew: t('invBankAddNew'),
                    addNewTitle: t('invBankAddNewTitle'),
                    addNewSave: t('invBankAddNewSave'),
                    cancel: t('cancel'),
                    loading: t('loadingData'),
                    noneSelected: t('invBankNoneSelected'),
                    delete: t('invBankDelete'),
                    deleteConfirm: t('invBankDeleteConfirm'),
                    deleteFailed: t('invBankDeleteFailed'),
                  }}
                />
                <FormulaFormFilesField
                  portalUI
                  files={formulaFormFiles}
                  onFilesChange={setFormulaFormFiles}
                  existingFiles={
                    isEditingInvoice && selectedRecord && apiConnected
                      ? visibleExistingFormulaFiles.map((item) => ({
                          originalIndex: item.originalIndex,
                          name: item.name,
                          previewUrl: recordFileUrl(
                            selectedRecord.id,
                            'formula-form',
                            item.originalIndex,
                          ),
                        }))
                      : []
                  }
                  onRemoveExisting={handleRemoveExistingFormulaSlot}
                  required={!isEditingInvoice || removedExistingFormulaSlots.size > 0}
                  onPreviewExisting={(_url, name) => {
                    const item = visibleExistingFormulaFiles.find((f) => f.name === name)
                    if (!selectedRecord || !item) return
                    setDocPreview({
                      recordId: selectedRecord.id,
                      kind: 'formula-form',
                      fileName: name,
                      fileIndex: item.originalIndex,
                    })
                  }}
                  labels={{
                    choose: t('invFormulaForm'),
                    hint: t('invFormulaPreviewHint'),
                    maxHint: t('invFormulaFormMax'),
                    count: t('invFormulaFormCount'),
                    selected: t('invFormulaSelected'),
                    currentFile: t('invFormulaCurrentFile'),
                    preview: t('agreementPreview'),
                    confirmFile: t('invFormulaConfirmFile'),
                    cancelPick: t('agreementCancelPick'),
                    previewUnavailable: t('agreementPreviewUnavailable'),
                    queueProgress: t('fileUploadQueueProgress'),
                    remove: t('agreementRemoveFile'),
                    deleteExisting: t('agreementDeleteFile'),
                    deleteExistingConfirm: t('invFormulaDeleteConfirm'),
                    invalidFile: t('invFormulaPdfRequired'),
                    close: t('close'),
                  }}
                />
                <InvoiceSignerFields
                  forRole="finance"
                  value={invoiceSignerSelection}
                  onChange={setInvoiceSignerSelection}
                  labels={{
                    section: t('invSignerSection'),
                    title: t('invSignerTitle'),
                    titlePlaceholder: t('invSignerTitlePlaceholder'),
                    name: t('invSignerName'),
                    namePlaceholder: t('invSignerNamePlaceholder'),
                    addNew: t('invSignerAddNew'),
                    addNewTitle: t('invSignerAddNewTitle'),
                    addNewSave: t('invSignerAddNewSave'),
                    cancel: t('cancel'),
                    loading: t('loadingData'),
                    noneSelected: t('invSignerNoneSelected'),
                    delete: t('invSignerDelete'),
                    deleteConfirm: t('invSignerDeleteConfirm'),
                    deleteTitle: t('invSignerDeleteTitle'),
                    deleteTitleConfirm: t('invSignerDeleteTitleConfirm'),
                    deleteFailed: t('invSignerDeleteFailed'),
                  }}
                />
                <div className="md:col-span-2 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => setIsInvoiceModalOpen(false)}
                    disabled={invoiceFormBusy}
                    className="portal-btn-secondary disabled:opacity-60"
                  >
                    {t('cancel')}
                  </button>
                  <button
                    type="submit"
                    disabled={invoiceFormBusy}
                    className="portal-btn-primary disabled:opacity-60"
                  >
                    {invoiceFormBusy ? t('savingData') : t('saveInvoice')}
                  </button>
                </div>
              </form>
            ) : (
              <p className="portal-empty">
                {t('invoicePickHint')}
              </p>
            )}
          </div>
        </div>
      ) : null}

      {userRole === 'buyers' && isCreateModalOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center portal-overlay p-4 backdrop-blur-sm">
          <div className="relative portal-modal max-h-[90vh] w-full max-w-3xl overflow-y-auto p-6">
            <FormLoadingOverlay active={buyerFormBusy} label={t('savingData')} />
            <div className="mb-4 flex items-center justify-between gap-3">
              <h2 className="portal-heading text-lg font-semibold">
                {editingBuyerRecordId ? t('modalEditTitle') : t('modalAddTitle')}
              </h2>
              <ModalCloseButton
                onClick={closeBuyerFormModal}
                disabled={buyerFormBusy}
                label={t('close')}
              />
            </div>
            <form
              key={editingBuyerRecordId ?? 'create'}
              onSubmit={submitBuyerForm}
              className="grid gap-4 md:grid-cols-2"
            >
              <label className="space-y-1 text-sm md:col-span-2">
                <span>{t('vendorCode')}</span>
                <VendorPickerField
                  vendors={buyerVendors}
                  value={selectedVendorCode}
                  onChange={setSelectedVendorCode}
                  loading={vendorsLoading}
                  name="vendorCode"
                  labels={{
                    loading: t('vendorsLoading'),
                    empty: t('vendorsEmpty'),
                    searchPlaceholder: t('vendorSearchPlaceholder'),
                    noResults: t('vendorSearchNoResults'),
                    listCount: t('vendorSearchListCount'),
                  }}
                  addVendorLabel={t('vendorAdd')}
                  addVendorTitle={t('vendorAddTitle')}
                  addVendorCodeLabel={t('vendorCode')}
                  addVendorNameLabel={t('vendorName')}
                  saveLabel={t('vendorAddSave')}
                  savingLabel={t('savingData')}
                  deleteVendorLabel={t('vendorDelete')}
                  deleteVendorTitle={t('vendorDeleteTitle')}
                  deleteVendorButtonLabel={t('vendorDeleteButton')}
                  deleteVendorSelectHint={t('vendorDeleteSelectHint')}
                  deleteVendorConfirm={(code, name) =>
                    t('vendorDeleteConfirm').replace('{code}', code).replace('{name}', name)
                  }
                  closeLabel={t('close')}
                  onCreateVendor={createVendor}
                  onDeleteVendor={deleteVendor}
                />
              </label>
              <label className="space-y-1 text-sm">
                <span>{t('vendorName')}</span>
                <input
                  value={buyerVendorDisplayName}
                  readOnly
                  className="portal-input-readonly"
                />
              </label>
              <label className="space-y-1 text-sm">
                <span>{t('incomeType')}</span>
                <input
                  name="incomeType"
                  value={buyerIncomeType}
                  onChange={(e) => setBuyerIncomeType(e.target.value)}
                  required
                  className="portal-input"
                />
              </label>
              <AgreementFilesField
                portalUI
                files={agreementFiles}
                onFilesChange={setAgreementFiles}
                existingFiles={
                  editingBuyerRecordId && apiConnected
                    ? visibleExistingAgreementFiles.map((item) => ({
                        originalIndex: item.originalIndex,
                        name: item.name,
                        previewUrl: recordFileUrl(
                          editingBuyerRecordId,
                          'agreement',
                          item.originalIndex,
                        ),
                      }))
                    : []
                }
                onRemoveExisting={handleRemoveExistingAgreementSlot}
                required={
                  !editingBuyerRecordId ||
                  removedExistingAgreementSlots.size > 0 ||
                  existingAgreementNames.length === 0
                }
                onPreviewExisting={(_url, name) => {
                  const item = visibleExistingAgreementFiles.find((f) => f.name === name)
                  if (!editingBuyerRecordId || !item) return
                  setDocPreview({
                    recordId: editingBuyerRecordId,
                    kind: 'agreement',
                    fileName: name,
                    fileIndex: item.originalIndex,
                  })
                }}
                labels={{
                  choose: t('agreementFile'),
                  hint: t('agreementPreviewHint'),
                  maxHint: t('agreementFormMax'),
                  count: t('agreementFormCount'),
                  selected: t('selectedFile'),
                  currentFile: t('agreementCurrentFile'),
                  preview: t('agreementPreview'),
                  confirmFile: t('agreementConfirmFile'),
                  cancelPick: t('agreementCancelPick'),
                  previewUnavailable: t('agreementPreviewUnavailable'),
                  queueProgress: t('fileUploadQueueProgress'),
                  invalidFile: t('agreementPreviewUnavailable'),
                  deleteExisting: t('agreementDeleteFile'),
                  deleteExistingConfirm: t('agreementDeleteConfirm'),
                  remove: t('agreementRemoveFile'),
                  close: t('close'),
                }}
              />
              <label className="space-y-1 text-sm">
                <span>{t('amountEarned')}</span>
                <div className="portal-input-group">
                  <span className="portal-input-group-prefix">
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
                    className="min-w-0 flex-1 border-0 bg-transparent px-3 py-2 text-sm text-slate-900 outline-none dark:text-violet-50"
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
                  value={buyerDescription}
                  onChange={(e) => setBuyerDescription(e.target.value)}
                  required
                  className="portal-input min-h-24"
                />
              </label>
              <div className="md:col-span-2 flex flex-wrap justify-end gap-2">
                <button
                  type="button"
                  onClick={closeBuyerFormModal}
                  disabled={buyerFormBusy}
                  className="portal-btn-secondary disabled:opacity-60"
                >
                  {t('cancel')}
                </button>
                <button
                  type="submit"
                  disabled={buyerFormBusy}
                  className="portal-btn-primary disabled:opacity-60"
                >
                  {buyerFormBusy
                    ? t('savingData')
                    : editingBuyerRecordId
                      ? t('saveChanges')
                      : t('save')}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {detailRecord ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center portal-overlay p-4 backdrop-blur-sm">
          <div className="portal-modal flex max-h-[min(92vh,820px)] w-full max-w-3xl flex-col overflow-hidden">
            <div className="portal-divider flex shrink-0 items-center justify-between border-b px-5 py-4 sm:px-6">
              <h3 className="portal-heading text-lg font-semibold">{t('detailTitle')}</h3>
              <ModalCloseButton onClick={() => setDetailRecordId(null)} label={t('close')} />
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5 sm:px-6">
              {userRole === 'buyers' ? (
                <BuyerRecordDetailView
                  record={detailRecord}
                  allRecords={records}
                  t={t}
                  dateLocale={dateLocale}
                  formatAmount={(amount) => formatIdr.format(amount)}
                  formatDate={formatDate}
                  apiConnected={apiConnected}
                  documents={listRecordDocuments(detailRecord)}
                  onDocDownload={(kind, fileIndex = 0) =>
                    void handleArchivePublishedDownload(detailRecord, kind, fileIndex)
                  }
                  onDownloadSummary={() =>
                    void handleArchivePublishedDownload(detailRecord, 'stamped-paper')
                  }
                  recordDocLabel={recordDocLabel}
                  requestingEdit={requestingEditId === detailRecord.id}
                  onRequestEdit={() => void handleAskBuyerEditPermission(detailRecord.id)}
                  onEdit={() => openBuyerEditModal(detailRecord)}
                />
              ) : (
                <FinanceRecordDetailView
                  record={detailRecord}
                  allRecords={records}
                  t={t}
                  dateLocale={dateLocale}
                  formatAmount={(amount) => formatIdr.format(amount)}
                  formatDate={formatDate}
                  apiConnected={apiConnected}
                  onDownloadKind={(kind, fileIndex) =>
                    void handleArchivePublishedDownload(detailRecord, kind, fileIndex ?? 0)
                  }
                  onDownloadSummary={() => void handleArchivePublishedDownload(detailRecord, 'stamped-paper')}
                  recordDocLabel={recordDocLabel}
                  footer={
                    financeInvoiceNotDone(detailRecord) ||
                    financeNeedsStampUpload(detailRecord) ||
                    isFinanceTaskPausedForBuyerEdit(detailRecord) ? (
                      <FinanceRecordDetailFooter record={detailRecord} t={t}>
                        {isFinanceTaskPausedForBuyerEdit(detailRecord) ? (
                          <p className="portal-body w-full rounded-xl border border-slate-300 bg-slate-100/80 px-3.5 py-2.5 text-sm text-slate-700">
                            {t('financeBuyerEditApprovedHint')}
                          </p>
                        ) : financeInvoiceNotDone(detailRecord) ? (
                          <div className="flex justify-end">
                            <button
                              type="button"
                              onClick={() => goToInvoiceForRecord(detailRecord.id)}
                              className="portal-btn-primary px-4 py-2"
                            >
                              {t('financeContinueInvoice')}
                            </button>
                          </div>
                        ) : financeNeedsStampUpload(detailRecord) ? (
                          <div className="flex w-full flex-col items-stretch gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-end">
                            <p className="portal-body text-sm sm:mr-auto">
                              {financeStampReadyToPublish(detailRecord)
                                ? t('financeStampPublishHint')
                                : t('financeStampUploadHint')}
                            </p>
                            <button
                              type="button"
                              onClick={() => goToInvoiceForRecord(detailRecord.id)}
                              className="portal-btn-secondary px-4 py-2"
                            >
                              {t('financeEditInvoice')}
                            </button>
                            {financeStampReadyToPublish(detailRecord) ? (
                              <StampedPaperUploadButton
                                recordId={detailRecord.id}
                                onConfirm={handleTaskStampUpload}
                                onPublish={async (id) => {
                                  await handleTaskStampPublish(id)
                                  setDetailRecordId(null)
                                }}
                                stampUploaded
                                uploadedFileName={detailRecord.stampedPaperFileName ?? ''}
                                serverPreviewUrl={recordFileUrl(detailRecord.id, 'stamped-paper')}
                                labels={{
                                  pickFile: t('uploadStampedPaper'),
                                  viewStamped: t('taskStampViewUploaded'),
                                  close: t('close'),
                                  confirmUpload: t('taskStampConfirmUpload'),
                                  publish: t('taskStampPublish'),
                                  previewUnavailable: t('taskStampPreviewUnavailable'),
                                  uploading: t('loadingData'),
                                  publishing: t('taskStampPublishing'),
                                }}
                              />
                            ) : (
                              <button
                                type="button"
                                onClick={() => {
                                  setDetailRecordId(null)
                                  navigate('/dashboard/task')
                                }}
                                className="portal-btn-primary px-4 py-2"
                              >
                                {t('financeGoToTaskUpload')}
                              </button>
                            )}
                          </div>
                        ) : null}
                      </FinanceRecordDetailFooter>
                    ) : undefined
                  }
                />
              )}
            </div>
          </div>
        </div>
      ) : null}

      {taskInvoicePrintRecord?.invoice ? (
        <InvoicePrintModal
          record={taskInvoicePrintRecord}
          invoice={taskInvoicePrintRecord.invoice}
          allRecords={records}
          issuedAt={taskInvoicePrintRecord.generatedAt}
          title={t('invoicePrintTitle')}
          printLabel={t('invoicePrint')}
          closeLabel={t('close')}
          onClose={() => setTaskInvoicePrintRecordId(null)}
        />
      ) : null}

      <RecordPublishSuccessModal
        open={publishSuccess != null}
        title={t('recordPublishSuccessTitle')}
        subtitle={
          publishSuccess
            ? `${publishSuccess.vendorName} — ${t('recordPublishSuccessSubtitle')}`
            : t('recordPublishSuccessSubtitle')
        }
        onClose={dismissSuccess}
      />

      <RecordDocumentPreviewModal
        open={docPreview != null}
        fileName={docPreview?.fileName ?? ''}
        previewUrl={
          docPreview
            ? recordFileUrl(docPreview.recordId, docPreview.kind, docPreview.fileIndex ?? 0)
            : ''
        }
        closeLabel={t('close')}
        previewUnavailableLabel={t('agreementPreviewUnavailable')}
        onClose={() => setDocPreview(null)}
      />

      {userRole === 'buyers' && !isCreateModalOpen && !editingBuyerRecordId ? (
        <button
          type="button"
          onClick={openBuyerCreateModal}
          className="portal-fab-add"
          aria-label={t('addData')}
        >
          <span className="portal-fab-add-icon" aria-hidden>
            +
          </span>
          <span>{t('addData')}</span>
        </button>
      ) : null}
    </>
  )
}
