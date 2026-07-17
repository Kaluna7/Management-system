import { type ReactNode } from 'react'
import { Calendar, Clock, Download, FileText, Hash, User } from 'lucide-react'
import type { StringKey } from '../i18n/strings'
import type { BuyerRecord } from '../types/workflow'
import { hasPendingBuyerEditRequest, isFinanceTaskPausedForBuyerEdit } from '../utils/recordBuyerEdit'
import type { ArchiveFileKind } from '../utils/recordFileDownload'
import {
  financeInvoiceNotDone,
  financeNeedsStampUpload,
} from '../utils/financeRecordScope'
import { resolveInvoiceNumberForRecord } from '../utils/invoiceNumberFromRecord'
import {
  listRecordDocuments,
  type RecordDocumentItem,
  type RecordFileKind,
} from './RecordDocumentPreviewModal'

type Props = {
  record: BuyerRecord
  allRecords: BuyerRecord[]
  t: (key: StringKey) => string
  dateLocale: string
  formatAmount: (amount: number) => string
  formatDate: (isoDate: string, dateLocale: string) => string
  apiConnected: boolean
  onDownloadKind: (kind: ArchiveFileKind, fileIndex?: number) => void | Promise<void>
  onDownloadSummary: () => void
  recordDocLabel: (kind: RecordFileKind) => string
  footer?: ReactNode
}

function stripLabelColon(label: string) {
  return label.replace(/:$/, '')
}

function DetailField({
  label,
  value,
  mono,
  multiline,
}: {
  label: string
  value: string
  fullWidth?: boolean
  mono?: boolean
  multiline?: boolean
}) {
  if (!value.trim()) return null
  return (
    <div className="min-w-0">
      <dt className="text-[11px] font-normal text-app-muted">{label}</dt>
      <dd
        className={`mt-1.5 text-sm font-normal leading-relaxed text-app-text/90 ${
          mono ? 'break-all font-mono text-[13px]' : 'break-words'
        } ${multiline ? 'whitespace-pre-wrap' : ''}`}
      >
        {value}
      </dd>
    </div>
  )
}

function HeaderBadge({ children, tone }: { children: ReactNode; tone: 'emerald' | 'amber' | 'slate' | 'violet' }) {
  const toneClass =
    tone === 'amber'
      ? 'bg-amber-100 text-amber-800 ring-amber-200/80'
      : tone === 'slate'
        ? 'bg-slate-200 text-slate-700 ring-slate-300/80'
        : tone === 'violet'
          ? 'bg-violet-100 text-violet-800 ring-violet-200/80'
          : 'bg-emerald-100 text-emerald-800 ring-emerald-200/80'

  return (
    <span
      className={`inline-flex shrink-0 items-center rounded-full px-2.5 py-1 text-[10px] font-medium uppercase tracking-wide ring-1 ring-inset ${toneClass}`}
    >
      {children}
    </span>
  )
}

function TimelineRow({
  icon,
  label,
  value,
  mono,
}: {
  icon: ReactNode
  label: string
  value: string
  mono?: boolean
}) {
  if (!value.trim()) return null
  return (
    <li className="flex gap-3">
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-700 sm:h-9 sm:w-9">
        {icon}
      </span>
      <div className="min-w-0 flex-1 pt-0.5">
        <p className="text-[11px] font-normal text-app-muted">{label}</p>
        <p
          className={`mt-0.5 text-sm font-normal leading-snug text-app-text/90 ${
            mono ? 'break-all font-mono text-[13px]' : 'break-words'
          }`}
          title={value}
        >
          {value}
        </p>
      </div>
    </li>
  )
}

function docCardLabel(
  doc: RecordDocumentItem,
  documents: RecordDocumentItem[],
  recordDocLabel: (kind: RecordFileKind) => string,
) {
  const sameKind = documents.filter((d) => d.kind === doc.kind)
  const base = recordDocLabel(doc.kind)
  if (sameKind.length > 1) return `${base} ${(doc.fileIndex ?? 0) + 1}`
  return base
}

function RecordDocumentsSection({
  documents,
  apiConnected,
  t,
  recordDocLabel,
  onDownloadKind,
  onDownloadSummary,
}: {
  documents: RecordDocumentItem[]
  apiConnected: boolean
  t: (key: StringKey) => string
  recordDocLabel: (kind: RecordFileKind) => string
  onDownloadKind: (kind: ArchiveFileKind, fileIndex?: number) => void | Promise<void>
  onDownloadSummary: () => void
}) {
  if (documents.length === 0) return null

  return (
    <section className="rounded-2xl border border-emerald-200/80 bg-linear-to-br from-emerald-50/70 to-white px-3.5 py-3.5 sm:px-5 sm:py-4">
      <h4 className="text-[11px] font-normal text-emerald-800/90">{t('recordDocumentsTitle')}</h4>
      <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
        {documents.map((doc) => (
          <div
            key={`${doc.kind}-${doc.fileIndex ?? 0}-${doc.fileName}`}
            className="flex min-w-0 flex-col gap-2.5 rounded-xl border border-emerald-200/70 bg-white px-3 py-3 sm:px-3.5"
          >
            <div className="flex min-w-0 items-start gap-2.5">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
                <FileText className="h-4 w-4" aria-hidden strokeWidth={1.75} />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-normal text-emerald-900/90">
                  {docCardLabel(doc, documents, recordDocLabel)}
                </p>
                <p className="mt-0.5 truncate text-[11px] font-normal text-app-muted" title={doc.fileName}>
                  {doc.fileName}
                </p>
              </div>
            </div>
            {apiConnected ? (
              <button
                type="button"
                onClick={() => void onDownloadKind(doc.kind, doc.fileIndex ?? 0)}
                className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg border border-emerald-300 bg-white px-2.5 py-2 text-[11px] font-medium text-emerald-800 shadow-sm transition hover:border-emerald-400 hover:bg-emerald-50"
              >
                <Download className="h-3.5 w-3.5" aria-hidden strokeWidth={1.75} />
                {t('recordDocDownload')}
              </button>
            ) : null}
          </div>
        ))}
      </div>
      {!apiConnected ? (
        <button
          type="button"
          onClick={() => void onDownloadSummary()}
          className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-xl border border-emerald-300/70 bg-white px-3.5 py-2.5 text-xs font-medium text-emerald-900 shadow-sm transition hover:border-emerald-400 hover:bg-emerald-50 sm:w-auto"
        >
          <Download className="h-4 w-4" aria-hidden strokeWidth={1.75} />
          {t('archiveDownloadSummaryOffline')}
        </button>
      ) : null}
    </section>
  )
}

function FinanceCompletedNote({ t }: { t: (key: StringKey) => string }) {
  return (
    <p className="rounded-xl border border-emerald-200/60 bg-emerald-50/50 px-3.5 py-2.5 text-sm text-emerald-900/80">
      {t('financeInvoiceAlreadyDone')}
    </p>
  )
}

export function FinanceRecordDetailView({
  record,
  allRecords,
  t,
  dateLocale,
  formatAmount,
  formatDate,
  apiConnected,
  onDownloadKind,
  onDownloadSummary,
  recordDocLabel,
  footer,
}: Props) {
  const periodRange = `${formatDate(record.periodStart, dateLocale)} – ${formatDate(record.periodEnd, dateLocale)}`
  const invoiceNo = record.invoice ? resolveInvoiceNumberForRecord(record, allRecords) : ''
  const isCompleted = record.status === 'archived' || record.status === 'history'
  const documents = listRecordDocuments(record)
  const showCompletedNote =
    isCompleted &&
    !financeInvoiceNotDone(record) &&
    !financeNeedsStampUpload(record) &&
    !isFinanceTaskPausedForBuyerEdit(record)

  const timelineItems: {
    icon: ReactNode
    label: string
    value: string
    mono?: boolean
  }[] = [
    record.archivedAt
      ? {
          icon: <Clock className="h-4 w-4" aria-hidden strokeWidth={1.75} />,
          label: stripLabelColon(t('archiveArchivedAtLabel')),
          value: formatDate(record.archivedAt, dateLocale),
        }
      : null,
    record.status === 'history' && record.publishedAt
      ? {
          icon: <Calendar className="h-4 w-4" aria-hidden strokeWidth={1.75} />,
          label: stripLabelColon(t('publishedLabel')),
          value: formatDate(record.publishedAt, dateLocale),
        }
      : null,
    record.stampedPaperFileName
      ? {
          icon: <FileText className="h-4 w-4" aria-hidden strokeWidth={1.75} />,
          label: stripLabelColon(t('detailStampedPaperFile')),
          value: record.stampedPaperFileName,
        }
      : null,
    record.generatedBy
      ? {
          icon: <User className="h-4 w-4" aria-hidden strokeWidth={1.75} />,
          label: stripLabelColon(t('detailGeneratedBy')),
          value: record.generatedBy,
        }
      : null,
    record.generatedAt
      ? {
          icon: <Calendar className="h-4 w-4" aria-hidden strokeWidth={1.75} />,
          label: stripLabelColon(t('detailGeneratedAt')),
          value: formatDate(record.generatedAt, dateLocale),
        }
      : null,
    invoiceNo
      ? {
          icon: <Hash className="h-4 w-4" aria-hidden strokeWidth={1.75} />,
          label: stripLabelColon(t('detailInvoiceNumber')),
          value: invoiceNo,
          mono: true,
        }
      : null,
  ].filter((item): item is NonNullable<typeof item> => item != null)

  const statusBadge =
    record.status === 'history' ? (
      <HeaderBadge tone="emerald">{t('historyStatusHistory')}</HeaderBadge>
    ) : record.status === 'archived' ? (
      <HeaderBadge tone="emerald">{t('historyStatusArchived')}</HeaderBadge>
    ) : record.status === 'document_generated' ? (
      <HeaderBadge tone="emerald">{t('recordFilterStatusInFinanceTask')}</HeaderBadge>
    ) : (
      <HeaderBadge tone="slate">{record.status.replaceAll('_', ' ')}</HeaderBadge>
    )

  return (
    <div className="space-y-3 sm:space-y-4">
      <div className="rounded-2xl border border-emerald-200/70 bg-linear-to-br from-emerald-50/90 to-white px-3.5 py-3.5 sm:px-5 sm:py-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-start sm:justify-between">
          <div className="min-w-0 flex-1">
            <div className="mb-2 flex flex-wrap items-center gap-1.5">
              {statusBadge}
              {hasPendingBuyerEditRequest(record) ? (
                <HeaderBadge tone="amber">{t('buyerEditRequestPending')}</HeaderBadge>
              ) : null}
              {isFinanceTaskPausedForBuyerEdit(record) ? (
                <HeaderBadge tone="violet">{t('buyerEditApprovedBadge')}</HeaderBadge>
              ) : null}
            </div>
            <h4 className="text-base font-semibold leading-snug break-words text-app-text sm:text-lg">
              {record.vendorName}
            </h4>
            <p className="mt-1 font-mono text-xs font-normal text-app-muted">{record.vendorCode}</p>
          </div>
          <div className="min-w-0 rounded-xl border border-emerald-200/50 bg-white/70 px-3 py-2 sm:shrink-0 sm:border-0 sm:bg-transparent sm:px-0 sm:py-0 sm:text-right">
            <p className="text-[11px] font-normal text-app-muted">{stripLabelColon(t('detailAmount'))}</p>
            <p className="mt-0.5 font-mono text-base font-normal tabular-nums text-emerald-800 sm:text-lg">
              {formatAmount(record.amount)}
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="rounded-2xl border border-app-border bg-app-bg/50 px-3.5 py-3 sm:px-4 sm:py-3.5">
          <DetailField label={stripLabelColon(t('detailIncomeType'))} value={record.incomeType} />
        </div>
        <div className="rounded-2xl border border-app-border bg-app-bg/50 px-3.5 py-3 sm:px-4 sm:py-3.5">
          <DetailField label={t('periodRangeLabel')} value={periodRange} />
        </div>
        <div className="rounded-2xl border border-app-border bg-app-bg/50 px-3.5 py-3 sm:col-span-2 sm:px-4 sm:py-3.5">
          <DetailField
            label={stripLabelColon(t('detailDescription'))}
            value={record.description}
            fullWidth
            multiline
          />
        </div>
      </div>

      <RecordDocumentsSection
        documents={documents}
        apiConnected={apiConnected}
        t={t}
        recordDocLabel={recordDocLabel}
        onDownloadKind={onDownloadKind}
        onDownloadSummary={onDownloadSummary}
      />

      {timelineItems.length > 0 ? (
        <section className="rounded-2xl border border-app-border bg-white px-3.5 py-3.5 sm:px-5 sm:py-4">
          <h4 className="mb-3 text-[11px] font-normal text-app-muted sm:mb-4">{t('detailSectionTimeline')}</h4>
          <ul className="space-y-3.5">
            {timelineItems.map((item) => (
              <TimelineRow
                key={`${item.label}-${item.value}`}
                icon={item.icon}
                label={item.label}
                value={item.value}
                mono={item.mono}
              />
            ))}
          </ul>
        </section>
      ) : null}

      {footer ? <div className="border-t border-emerald-200/60 pt-4">{footer}</div> : null}

      {showCompletedNote && !footer ? <FinanceCompletedNote t={t} /> : null}
    </div>
  )
}

export function FinanceRecordDetailFooter({
  record,
  t,
  children,
}: {
  record: BuyerRecord
  t: (key: StringKey) => string
  children: ReactNode
}) {
  const showCompletedNote =
    (record.status === 'archived' || record.status === 'history') &&
    !financeInvoiceNotDone(record) &&
    !financeNeedsStampUpload(record) &&
    !isFinanceTaskPausedForBuyerEdit(record)

  return (
    <div className="space-y-3">
      {children}
      {showCompletedNote ? <FinanceCompletedNote t={t} /> : null}
    </div>
  )
}
