import {
  CalendarDays,
  CalendarMinus2,
  CalendarPlus2,
  CalendarRange,
  ListFilter,
  RotateCcw,
  Search,
  type LucideIcon,
} from 'lucide-react'
import type {
  InvoiceMonthScopeFilter,
  RecordListStatusFilter,
} from '../utils/recordListFilter'
import { InputIconWrap } from './InputIconWrap'

export type RecordListFilterOption = {
  value: RecordListStatusFilter
  label: string
}

export type InvoiceMonthScopeOption = {
  value: InvoiceMonthScopeFilter
  label: string
}

const MONTH_SCOPE_ICONS: Record<InvoiceMonthScopeFilter, LucideIcon> = {
  all: CalendarRange,
  this_month: CalendarDays,
  next_month: CalendarPlus2,
  last_month: CalendarMinus2,
}

type Props = {
  searchQuery: string
  onSearchChange: (value: string) => void
  searchLabel: string
  searchPlaceholder: string
  statusFilter: RecordListStatusFilter
  onStatusFilterChange: (value: RecordListStatusFilter) => void
  statusLabel: string
  statusOptions: RecordListFilterOption[]
  resetLabel: string
  onReset: () => void
  showReset: boolean
  /** Shown under search when status filter is invoice_month. */
  invoiceMonthScope?: InvoiceMonthScopeFilter
  onInvoiceMonthScopeChange?: (value: InvoiceMonthScopeFilter) => void
  invoiceMonthScopeLabel?: string
  invoiceMonthScopeOptions?: InvoiceMonthScopeOption[]
}

export function RecordListFilterBar({
  searchQuery,
  onSearchChange,
  searchLabel,
  searchPlaceholder,
  statusFilter,
  onStatusFilterChange,
  statusLabel,
  statusOptions,
  resetLabel,
  onReset,
  showReset,
  invoiceMonthScope = 'all',
  onInvoiceMonthScopeChange,
  invoiceMonthScopeLabel,
  invoiceMonthScopeOptions = [],
}: Props) {
  const showMonthScope =
    statusFilter === 'invoice_month' &&
    invoiceMonthScopeOptions.length > 0 &&
    typeof onInvoiceMonthScopeChange === 'function'

  return (
    <div className="portal-filter-panel mb-5 flex flex-col gap-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
        <label className="portal-subheading flex min-w-0 flex-1 flex-col gap-1 text-xs font-medium sm:min-w-[12rem]">
          {searchLabel}
          <InputIconWrap icon={Search}>
            <input
              type="search"
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder={searchPlaceholder}
              className="portal-input pl-9"
              autoComplete="off"
            />
          </InputIconWrap>
        </label>
        {statusOptions.length > 0 ? (
          <label className="portal-subheading flex min-w-[10rem] flex-col gap-1 text-xs font-medium">
            {statusLabel}
            <InputIconWrap icon={ListFilter}>
              <select
                value={statusFilter}
                onChange={(e) => onStatusFilterChange(e.target.value as RecordListStatusFilter)}
                className="portal-select pl-9"
              >
                {statusOptions.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </InputIconWrap>
          </label>
        ) : null}
        {showReset ? (
          <button
            type="button"
            onClick={onReset}
            className="portal-btn-secondary inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold sm:mb-0.5"
          >
            <RotateCcw className="h-3.5 w-3.5" aria-hidden />
            {resetLabel}
          </button>
        ) : null}
      </div>

      {showMonthScope ? (
        <div className="portal-month-scope">
          {invoiceMonthScopeLabel ? (
            <p className="portal-subheading mb-1.5 text-[11px] font-medium text-app-muted">
              {invoiceMonthScopeLabel}
            </p>
          ) : null}
          <div
            className="portal-month-scope__grid"
            role="radiogroup"
            aria-label={invoiceMonthScopeLabel}
          >
            {invoiceMonthScopeOptions.map((opt) => {
              const selected = invoiceMonthScope === opt.value
              const Icon = MONTH_SCOPE_ICONS[opt.value] ?? CalendarDays
              return (
                <button
                  key={opt.value}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  onClick={() => onInvoiceMonthScopeChange(opt.value)}
                  className={`portal-month-scope__card ${
                    selected ? 'portal-month-scope__card--active' : ''
                  }`}
                >
                  <span className="portal-month-scope__icon">
                    <Icon className="h-3 w-3" aria-hidden strokeWidth={2.25} />
                  </span>
                  <span className="portal-month-scope__label">{opt.label}</span>
                </button>
              )
            })}
          </div>
        </div>
      ) : null}
    </div>
  )
}
