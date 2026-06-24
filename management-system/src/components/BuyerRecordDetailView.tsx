import { type ReactNode } from 'react'
import { FiCalendar, FiClock, FiDownload, FiFileText, FiHash, FiUser } from 'react-icons/fi'
import type { StringKey } from '../i18n/strings'
import type { BuyerRecord } from '../types/workflow'
import { resolveInvoiceNumberForRecord } from '../utils/invoiceNumberFromRecord'
import {
  canBuyerRequestEditPermission,
  hasApprovedBuyerEditRequest,
  hasPendingBuyerEditRequest,
  isBuyerEditRequestDenied,
  isBuyerPortalRecordEditable,
  isBuyerRecordInFinanceTask,
} from '../utils/recordBuyerEdit'
import type { RecordFileKind } from './RecordDocumentPreviewModal'

import { agreementFileNamesFromRecord } from '../utils/agreementFiles'

type DocItem = { kind: RecordFileKind; fileName: string; fileIndex?: number }

type Props = {
  record: BuyerRecord
  allRecords: BuyerRecord[]
  t: (key: StringKey) => string
  dateLocale: string
  formatAmount: (amount: number) => string
  formatDate: (isoDate: string, dateLocale: string) => string
  documents: DocItem[]
  apiConnected?: boolean
  onDocDownload?: (kind: RecordFileKind, fileIndex?: number) => void | Promise<void>
  onDownloadSummary?: () => void | Promise<void>
  recordDocLabel: (kind: RecordFileKind) => string
  requestingEdit?: boolean
  onRequestEdit?: () => void
  onEdit?: () => void
}

function stripLabelColon(label: string) {
  return label.replace(/:$/, '')
}

function DetailField({
  label,
  value,
  fullWidth,
  mono,
}: {
  label: string
  value: string
  fullWidth?: boolean
  mono?: boolean
}) {
  if (!value.trim()) return null
  return (
    <div className={fullWidth ? 'sm:col-span-2' : undefined}>
      <dt className="text-[10px] font-semibold uppercase tracking-wider text-app-muted">{label}</dt>
      <dd className={`mt-1 text-sm font-medium leading-snug text-app-text ${mono ? 'font-mono text-[13px]' : ''}`}>
        {value}
      </dd>
    </div>
  )
}

function HeaderBadge({ children, tone }: { children: ReactNode; tone: 'violet' | 'emerald' | 'amber' | 'slate' }) {
  const toneClass =
    tone === 'emerald'
      ? 'bg-emerald-100 text-emerald-800 ring-emerald-200/80'
      : tone === 'amber'
        ? 'bg-amber-100 text-amber-800 ring-amber-200/80'
        : tone === 'slate'
          ? 'bg-slate-200 text-slate-700 ring-slate-300/80'
          : 'bg-violet-100 text-violet-800 ring-violet-200/80'

  return (
    <span
      className={`inline-flex shrink-0 items-center rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide ring-1 ring-inset ${toneClass}`}
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
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-violet-100 text-violet-700">
        {icon}
      </span>
      <div className="min-w-0 pt-0.5">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-app-muted">{label}</p>
        <p
          className={`mt-0.5 text-sm font-medium leading-snug text-app-text ${mono ? 'break-all font-mono text-[13px]' : ''}`}
          title={value}
        >
          {value}
        </p>
      </div>
    </li>
  )
}

function FinanceTaskPanel({
  record,
  allRecords,
  t,
  requestingEdit,
  onRequestEdit,
}: {
  record: BuyerRecord
  allRecords: BuyerRecord[]
  t: (key: StringKey) => string
  requestingEdit?: boolean
  onRequestEdit?: () => void
}) {
  const invoiceNo = record.invoice ? resolveInvoiceNumberForRecord(record, allRecords) : ''
  const pending = hasPendingBuyerEditRequest(record)
  const approved = hasApprovedBuyerEditRequest(record)
  const denied = isBuyerEditRequestDenied(record)
  const canRequest = canBuyerRequestEditPermission(record)

  return (
    <section className="rounded-2xl border border-violet-200/80 bg-linear-to-br from-violet-50/80 to-white px-4 py-4 sm:px-5">
      <h4 className="text-xs font-semibold uppercase tracking-wider text-violet-800">
        {t('detailSectionFinanceTask')}
      </h4>
      {invoiceNo ? (
        <div className="mt-3 rounded-xl border border-violet-200/60 bg-white/80 px-3.5 py-3">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-app-muted">
            {stripLabelColon(t('detailInvoiceNumber'))}
          </p>
          <p className="mt-1 break-all font-mono text-sm font-semibold text-violet-900">{invoiceNo}</p>
        </div>
      ) : null}
      <p className="portal-muted mt-3 text-sm leading-relaxed">{t('buyerAskEditPermissionHint')}</p>
      {pending ? (
        <p className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-sm font-medium text-amber-900">
          {t('buyerEditRequestPending')}
        </p>
      ) : approved ? (
        <p className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50 px-3.5 py-2.5 text-sm font-medium text-emerald-900">
          {t('buyerEditRequestApproved')}
        </p>
      ) : denied ? (
        <p className="portal-muted mt-3 text-sm">{t('buyerEditRequestDenied')}</p>
      ) : null}
      {canRequest && onRequestEdit ? (
        <div className="mt-4 flex justify-end">
          <button
            type="button"
            disabled={requestingEdit}
            onClick={onRequestEdit}
            className="portal-btn-primary px-4 py-2 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {requestingEdit ? t('loadingData') : t('buyerAskEditPermission')}
          </button>
        </div>
      ) : null}
    </section>
  )
}

function docCardLabel(doc: DocItem, documents: DocItem[], recordDocLabel: (kind: RecordFileKind) => string) {
  const sameKind = documents.filter((d) => d.kind === doc.kind)
  const base = recordDocLabel(doc.kind)
  if (sameKind.length > 1) {
    return `${base} ${(doc.fileIndex ?? 0) + 1}`
  }
  return base
}

export function BuyerRecordDetailView({
  record,
  allRecords,
  t,
  dateLocale,
  formatAmount,
  formatDate,
  documents,
  apiConnected = false,
  onDocDownload,
  onDownloadSummary,
  recordDocLabel,
  requestingEdit,
  onRequestEdit,
  onEdit,
}: Props) {
  const periodRange = `${formatDate(record.periodStart, dateLocale)} – ${formatDate(record.periodEnd, dateLocale)}`
  const invoiceNo = record.invoice ? resolveInvoiceNumberForRecord(record, allRecords) : ''
  const inFinanceTask = isBuyerRecordInFinanceTask(record)
  const isCompleted = record.status === 'archived' || record.status === 'history'
  const canEdit = isBuyerPortalRecordEditable(record)

  const timelineItems: {
    icon: ReactNode
    label: string
    value: string
    mono?: boolean
  }[] = [
    record.archivedAt
      ? {
          icon: <FiClock className="h-4 w-4" aria-hidden />,
          label: stripLabelColon(t('archiveArchivedAtLabel')),
          value: formatDate(record.archivedAt, dateLocale),
        }
      : null,
    record.status === 'history' && record.publishedAt
      ? {
          icon: <FiCalendar className="h-4 w-4" aria-hidden />,
          label: stripLabelColon(t('publishedLabel')),
          value: formatDate(record.publishedAt, dateLocale),
        }
      : null,
    record.generatedBy
      ? {
          icon: <FiUser className="h-4 w-4" aria-hidden />,
          label: stripLabelColon(t('detailGeneratedBy')),
          value: record.generatedBy,
        }
      : null,
    record.generatedAt
      ? {
          icon: <FiCalendar className="h-4 w-4" aria-hidden />,
          label: stripLabelColon(t('detailGeneratedAt')),
          value: formatDate(record.generatedAt, dateLocale),
        }
      : null,
    isCompleted && invoiceNo
      ? {
          icon: <FiHash className="h-4 w-4" aria-hidden />,
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
      <HeaderBadge tone="violet">{t('historyStatusArchived')}</HeaderBadge>
    ) : inFinanceTask ? (
      <HeaderBadge tone="violet">{t('buyerInFinanceTaskBadge')}</HeaderBadge>
    ) : (
      <HeaderBadge tone="slate">{record.status.replaceAll('_', ' ')}</HeaderBadge>
    )

  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-violet-200/70 bg-linear-to-br from-violet-50/90 to-white px-4 py-4 sm:px-5 sm:py-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="mb-2 flex flex-wrap items-center gap-2">
              {statusBadge}
              {hasPendingBuyerEditRequest(record) ? (
                <HeaderBadge tone="amber">{t('buyerEditRequestPending')}</HeaderBadge>
              ) : null}
              {hasApprovedBuyerEditRequest(record) ? (
                <HeaderBadge tone="emerald">{t('buyerEditApprovedBadge')}</HeaderBadge>
              ) : null}
            </div>
            <h4 className="text-lg font-semibold leading-snug text-app-text">{record.vendorName}</h4>
            <p className="mt-1 font-mono text-xs text-app-muted">{record.vendorCode}</p>
          </div>
          <div className="shrink-0 text-right">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-app-muted">
              {stripLabelColon(t('detailAmount'))}
            </p>
            <p className="mt-0.5 font-mono text-lg font-bold tabular-nums text-violet-800">
              {formatAmount(record.amount)}
            </p>
          </div>
        </div>
      </div>

      <dl className="grid gap-4 rounded-2xl border border-app-border bg-app-bg/50 px-4 py-4 sm:grid-cols-2 sm:px-5">
        <DetailField label={stripLabelColon(t('detailIncomeType'))} value={record.incomeType} />
        <DetailField label={t('periodRangeLabel')} value={periodRange} />
        <DetailField label={stripLabelColon(t('detailDescription'))} value={record.description} fullWidth />
      </dl>

      {documents.length > 0 ? (
        <section className="rounded-2xl border border-violet-200/80 bg-linear-to-br from-violet-50/70 to-white px-4 py-4 sm:px-5">
          <h4 className="text-xs font-semibold uppercase tracking-wider text-violet-800">
            {t('recordDocumentsTitle')}
          </h4>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            {documents.map((doc) => (
              <div
                key={`${doc.kind}-${doc.fileIndex ?? 0}-${doc.fileName}`}
                className="flex min-w-0 flex-col gap-2.5 rounded-xl border border-violet-200/70 bg-white px-3.5 py-3 shadow-sm"
              >
                <div className="flex min-w-0 items-start gap-2.5">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-violet-100 text-violet-700">
                    <FiFileText className="h-4 w-4" aria-hidden />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-semibold text-violet-900">
                      {docCardLabel(doc, documents, recordDocLabel)}
                    </p>
                    <p className="mt-0.5 truncate text-[11px] text-app-muted" title={doc.fileName}>
                      {doc.fileName}
                    </p>
                  </div>
                </div>
                {apiConnected && onDocDownload ? (
                  <button
                    type="button"
                    onClick={() => void onDocDownload(doc.kind, doc.fileIndex ?? 0)}
                    className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg border border-violet-300 bg-white px-2.5 py-2 text-[11px] font-semibold text-violet-800 shadow-sm transition hover:border-violet-400 hover:bg-violet-50"
                  >
                    <FiDownload className="h-3.5 w-3.5" aria-hidden />
                    {t('recordDocDownload')}
                  </button>
                ) : null}
              </div>
            ))}
          </div>
        </section>
      ) : agreementFileNamesFromRecord(record).length > 0 && !apiConnected && onDownloadSummary ? (
        <section className="rounded-2xl border border-violet-200/80 bg-linear-to-br from-violet-50/70 to-white px-4 py-4 sm:px-5">
          <h4 className="text-xs font-semibold uppercase tracking-wider text-violet-800">
            {t('recordDocumentsTitle')}
          </h4>
          <dl className="mt-3 rounded-xl border border-app-border bg-white/80 px-3.5 py-3">
            <DetailField
              label={stripLabelColon(t('detailAgreementFile'))}
              value={agreementFileNamesFromRecord(record).join(', ')}
              fullWidth
            />
          </dl>
          <button
            type="button"
            onClick={() => void onDownloadSummary()}
            className="mt-3 inline-flex items-center gap-2 rounded-xl border border-violet-300/70 bg-white px-3.5 py-2.5 text-xs font-semibold text-violet-900 shadow-sm transition hover:border-violet-400 hover:bg-violet-50"
          >
            <FiDownload className="h-4 w-4" aria-hidden />
            {t('archiveDownloadSummaryOffline')}
          </button>
        </section>
      ) : agreementFileNamesFromRecord(record).length > 0 ? (
        <dl className="rounded-2xl border border-app-border bg-app-bg/50 px-4 py-4 sm:px-5">
          <DetailField
            label={stripLabelColon(t('detailAgreementFile'))}
            value={agreementFileNamesFromRecord(record).join(', ')}
            fullWidth
          />
        </dl>
      ) : null}

      {inFinanceTask ? (
        <FinanceTaskPanel
          record={record}
          allRecords={allRecords}
          t={t}
          requestingEdit={requestingEdit}
          onRequestEdit={onRequestEdit}
        />
      ) : null}

      {timelineItems.length > 0 ? (
        <section className="rounded-2xl border border-app-border bg-white px-4 py-4 sm:px-5">
          <h4 className="mb-4 text-xs font-semibold uppercase tracking-wider text-app-muted">
            {t('detailSectionTimeline')}
          </h4>
          <ul className="space-y-4">
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

      {canEdit && onEdit ? (
        <div className="flex justify-end border-t border-app-border pt-4">
          <button type="button" onClick={onEdit} className="portal-btn-primary px-4 py-2">
            {t('buyerEditRecord')}
          </button>
        </div>
      ) : null}
    </div>
  )
}
