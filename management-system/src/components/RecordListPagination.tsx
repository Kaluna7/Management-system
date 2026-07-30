import { useMemo } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'

type Props = {
  page: number
  totalPages: number
  totalItems: number
  pageSize: number
  onPageChange: (page: number) => void
  previousLabel: string
  nextLabel: string
  /** @deprecated Kept for callers; page numbers replace the slide text. */
  slideLabel?: string
  rangeLabel?: string
}

/** Build page indices (0-based) with null = ellipsis gap. */
function pageWindow(current: number, total: number): Array<number | null> {
  if (total <= 7) {
    return Array.from({ length: total }, (_, i) => i)
  }

  const pages = new Set<number>()
  pages.add(0)
  pages.add(total - 1)
  for (let i = current - 1; i <= current + 1; i++) {
    if (i >= 0 && i < total) pages.add(i)
  }

  const sorted = [...pages].sort((a, b) => a - b)
  const out: Array<number | null> = []
  for (let i = 0; i < sorted.length; i++) {
    const p = sorted[i]!
    if (i > 0) {
      const prev = sorted[i - 1]!
      if (p - prev > 1) out.push(null)
    }
    out.push(p)
  }
  return out
}

export function RecordListPagination({
  page,
  totalPages,
  totalItems,
  pageSize,
  onPageChange,
  previousLabel,
  nextLabel,
  rangeLabel,
}: Props) {
  const windowPages = useMemo(() => pageWindow(page, totalPages), [page, totalPages])

  if (totalItems <= pageSize) return null

  const start = page * pageSize + 1
  const end = Math.min(totalItems, (page + 1) * pageSize)
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
      <nav
        className="flex flex-wrap items-center justify-center gap-1.5 sm:justify-end"
        aria-label="Pagination"
      >
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

        {windowPages.map((item, idx) =>
          item == null ? (
            <span
              key={`gap-${idx}`}
              className="portal-muted px-1 text-xs tabular-nums"
              aria-hidden
            >
              …
            </span>
          ) : (
            <button
              key={item}
              type="button"
              onClick={() => onPageChange(item)}
              aria-label={`Page ${item + 1}`}
              aria-current={item === page ? 'page' : undefined}
              className={
                item === page
                  ? 'inline-flex min-w-8 items-center justify-center rounded-lg bg-primary px-2.5 py-1.5 text-xs font-semibold text-white shadow-sm'
                  : 'portal-btn-secondary inline-flex min-w-8 items-center justify-center px-2.5 py-1.5 text-xs font-semibold tabular-nums'
              }
            >
              {item + 1}
            </button>
          ),
        )}

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
      </nav>
    </div>
  )
}
