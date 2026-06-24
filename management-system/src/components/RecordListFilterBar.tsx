import type { RecordListStatusFilter } from '../utils/recordListFilter'

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
        <input
          type="search"
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder={searchPlaceholder}
          className="portal-input"
          autoComplete="off"
        />
      </label>
      {statusOptions.length > 0 ? (
        <label className="portal-subheading flex min-w-[10rem] flex-col gap-1 text-xs font-medium">
          {statusLabel}
          <select
            value={statusFilter}
            onChange={(e) => onStatusFilterChange(e.target.value as RecordListStatusFilter)}
            className="portal-select"
          >
            {statusOptions.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </label>
      ) : null}
      {showReset ? (
        <button
          type="button"
          onClick={onReset}
          className="portal-btn-secondary px-3 py-2 text-xs font-semibold sm:mb-0.5"
        >
          {resetLabel}
        </button>
      ) : null}
    </div>
  )
}
