import { ListFilter, RotateCcw, Search } from 'lucide-react'
import type { RecordListStatusFilter } from '../utils/recordListFilter'
import { InputIconWrap } from './InputIconWrap'

export type RecordListFilterOption = {
  value: RecordListStatusFilter
  label: string
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
}: Props) {
  return (
    <div className="portal-filter-panel mb-5 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
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
  )
}
