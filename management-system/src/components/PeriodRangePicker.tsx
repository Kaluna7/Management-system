import { useEffect, useId, useRef, useState } from 'react'

export type PeriodRangeValue = { start: string; end: string }

function pad2(n: number) {
  return String(n).padStart(2, '0')
}

export function toIsoDateLocal(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
}

function parseIsoLocal(s: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s.trim())
  if (!m) return null
  const y = Number(m[1])
  const mo = Number(m[2]) - 1
  const day = Number(m[3])
  const d = new Date(y, mo, day)
  if (d.getFullYear() !== y || d.getMonth() !== mo || d.getDate() !== day) return null
  return d
}

function addMonths(base: Date, delta: number): Date {
  return new Date(base.getFullYear(), base.getMonth() + delta, 1)
}

function monthTitle(d: Date, locale: string) {
  return d.toLocaleDateString(locale, { month: 'long', year: 'numeric' })
}

function buildMonthGrid(year: number, month: number): (Date | null)[] {
  const last = new Date(year, month + 1, 0)
  const cells: (Date | null)[] = []
  const first = new Date(year, month, 1)
  const startPad = first.getDay()
  for (let i = 0; i < startPad; i++) cells.push(null)
  for (let d = 1; d <= last.getDate(); d++) cells.push(new Date(year, month, d))
  while (cells.length % 7 !== 0) cells.push(null)
  while (cells.length < 42) cells.push(null)
  return cells
}

function weekdayLabels(locale: string): string[] {
  const base = new Date(2024, 0, 7) // Sunday
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(base)
    d.setDate(base.getDate() + i)
    return d.toLocaleDateString(locale, { weekday: 'narrow' })
  })
}

type Labels = {
  combined: string
  start: string
  end: string
  hint: string
  apply: string
}

type PeriodRangePickerProps = {
  value: PeriodRangeValue
  onChange: (next: PeriodRangeValue) => void
  displayLocale: string
  labels: Labels
}

export function PeriodRangePicker({ value, onChange, displayLocale, labels }: PeriodRangePickerProps) {
  const id = useId()
  const rootRef = useRef<HTMLDivElement>(null)
  const [open, setOpen] = useState(false)
  const [panelAnchor, setPanelAnchor] = useState(() => {
    const t = new Date()
    return new Date(t.getFullYear(), t.getMonth(), 1)
  })

  useEffect(() => {
    if (!open) return
    const t = new Date()
    setPanelAnchor(new Date(t.getFullYear(), t.getMonth(), 1))
  }, [open])

  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent) => {
      const el = rootRef.current
      if (el && !el.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDoc)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const fmt = (iso: string) => {
    const d = parseIsoLocal(iso)
    if (!d) return '—'
    return d.toLocaleDateString(displayLocale, { day: '2-digit', month: 'short', year: 'numeric' })
  }

  const handleDayClick = (d: Date) => {
    const iso = toIsoDateLocal(d)
    const { start, end } = value
    if (!start || (start && end)) {
      onChange({ start: iso, end: '' })
      return
    }
    if (iso < start) {
      onChange({ start: iso, end: start })
    } else if (iso === start) {
      onChange({ start, end: iso })
    } else {
      onChange({ start, end: iso })
    }
    setOpen(false)
  }

  const rightMonth = addMonths(panelAnchor, 1)

  const renderMonth = (view: Date) => {
    const y = view.getFullYear()
    const m = view.getMonth()
    const cells = buildMonthGrid(y, m)
    const wk = weekdayLabels(displayLocale)

    return (
      <div className="min-w-0 flex-1 px-1 sm:px-2">
        <p className="mb-2 text-center text-sm font-semibold capitalize text-slate-800">{monthTitle(view, displayLocale)}</p>
        <div className="grid grid-cols-7 gap-0.5 text-center text-[10px] font-medium uppercase text-slate-500 sm:text-xs">
          {wk.map((w, wi) => (
            <div key={`${y}-${m}-w-${wi}`} className="py-1">
              {w}
            </div>
          ))}
        </div>
        <div className="mt-1 grid grid-cols-7 gap-0.5">
          {cells.map((cell, idx) => {
            if (!cell) {
              return <div key={`e-${y}-${m}-${idx}`} className="aspect-square" />
            }
            const iso = toIsoDateLocal(cell)
            const inRange =
              value.start &&
              value.end &&
              iso >= value.start &&
              iso <= value.end &&
              value.start <= value.end
            const isStart = iso === value.start
            const isEnd = iso === value.end
            const isToday = iso === toIsoDateLocal(new Date())

            return (
              <button
                key={iso}
                type="button"
                onClick={() => handleDayClick(cell)}
                className={`relative flex aspect-square items-center justify-center rounded-lg text-xs font-medium transition sm:text-sm ${
                  inRange && !isStart && !isEnd
                    ? 'bg-violet-100 text-violet-900'
                    : isStart || isEnd
                      ? 'bg-violet-600 text-white shadow-sm'
                      : 'text-slate-700 hover:bg-violet-50'
                } ${isToday && !isStart && !isEnd ? 'ring-1 ring-violet-300 ring-inset' : ''} `}
              >
                {cell.getDate()}
              </button>
            )
          })}
        </div>
      </div>
    )
  }

  return (
    <div ref={rootRef} className="relative space-y-1 text-sm">
      <span className="font-medium text-slate-700" id={`${id}-label`}>
        {labels.combined}
      </span>
      <button
        type="button"
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-labelledby={`${id}-label`}
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-stretch overflow-hidden rounded-xl border border-slate-300 bg-white text-left shadow-sm transition hover:border-violet-400 focus:border-violet-400 focus:outline-none focus:ring-2 focus:ring-violet-200"
      >
        <div className="flex min-w-0 flex-1 flex-col border-r border-slate-200 px-3 py-2.5">
          <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">{labels.start}</span>
          <span className="truncate text-sm font-semibold text-slate-900">{value.start ? fmt(value.start) : '—'}</span>
        </div>
        <div className="flex min-w-0 flex-1 flex-col px-3 py-2.5">
          <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">{labels.end}</span>
          <span className="truncate text-sm font-semibold text-slate-900">{value.end ? fmt(value.end) : '—'}</span>
        </div>
      </button>
      <p className="text-xs text-slate-500">{labels.hint}</p>

      {open ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={labels.combined}
          className="fixed inset-0 z-[200] flex items-end justify-center bg-slate-900/40 p-3 sm:items-center"
          onClick={() => setOpen(false)}
        >
          <div
            className="max-h-[min(90vh,560px)] w-full max-w-lg overflow-y-auto rounded-2xl border border-slate-200 bg-white p-3 shadow-2xl sm:max-w-2xl sm:p-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex items-center justify-between gap-2 border-b border-slate-100 pb-2">
              <button
                type="button"
                className="rounded-lg border border-slate-200 px-2 py-1 text-sm text-slate-600 hover:bg-slate-50"
                onClick={() => setPanelAnchor((d) => addMonths(d, -1))}
                aria-label="Previous months"
              >
                ‹
              </button>
              <button
                type="button"
                className="rounded-lg border border-slate-200 px-2 py-1 text-sm text-slate-600 hover:bg-slate-50"
                onClick={() => setPanelAnchor((d) => addMonths(d, 1))}
                aria-label="Next months"
              >
                ›
              </button>
            </div>
            <div className="flex flex-col gap-4 sm:flex-row sm:gap-2">
              {renderMonth(panelAnchor)}
              {renderMonth(rightMonth)}
            </div>
            <div className="mt-3 flex justify-end border-t border-slate-100 pt-2">
              <button
                type="button"
                className="rounded-lg bg-violet-600 px-4 py-2 text-xs font-semibold text-white hover:bg-violet-500 sm:text-sm"
                onClick={() => setOpen(false)}
              >
                {labels.apply}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
