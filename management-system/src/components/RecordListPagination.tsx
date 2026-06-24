import { ChevronLeft, ChevronRight } from 'lucide-react'

type Props = {
  page: number
  totalPages: number
  totalItems: number
  pageSize: number
  onPageChange: (page: number) => void
  previousLabel: string
  nextLabel: string
  slideLabel: string
  rangeLabel?: string
}

export function RecordListPagination({
  page,
  totalPages,
  totalItems,
  pageSize,
  onPageChange,
  previousLabel,
  nextLabel,
  slideLabel,
  rangeLabel,
}: Props) {
  if (totalItems <= pageSize) return null

  const start = page * pageSize + 1
  const end = Math.min(totalItems, (page + 1) * pageSize)
  const slideText = slideLabel
    .replace('{current}', String(page + 1))
    .replace('{total}', String(totalPages))
  const rangeText = rangeLabel
    ?.replace('{start}', String(start))
    .replace('{end}', String(end))
    .replace('{total}', String(totalItems))

  return (
    <div className="portal-divider mt-4 flex flex-col gap-3 border-t pt-4 sm:flex-row sm:items-center sm:justify-between">
      {rangeText ? (
        <p className="portal-muted text-center text-xs sm:text-left">{rangeText}</p>
      ) : (
        <span className="hidden sm:block" aria-hidden />
      )}
      <div className="flex items-center justify-center gap-2 sm:justify-end">
        <button
          type="button"
          disabled={page <= 0}
          onClick={() => onPageChange(page - 1)}
          className="portal-btn-secondary inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold disabled:cursor-not-allowed disabled:opacity-50"
          aria-label={previousLabel}
        >
          <ChevronLeft className="h-4 w-4" aria-hidden strokeWidth={1.75} />
          <span className="sr-only sm:not-sr-only">{previousLabel}</span>
        </button>
        <span className="min-w-[4.5rem] text-center text-xs font-semibold tabular-nums portal-heading">
          {slideText}
        </span>
        <button
          type="button"
          disabled={page >= totalPages - 1}
          onClick={() => onPageChange(page + 1)}
          className="portal-btn-secondary inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold disabled:cursor-not-allowed disabled:opacity-50"
          aria-label={nextLabel}
        >
          <span className="sr-only sm:not-sr-only">{nextLabel}</span>
          <ChevronRight className="h-4 w-4" aria-hidden strokeWidth={1.75} />
        </button>
      </div>
    </div>
  )
}
