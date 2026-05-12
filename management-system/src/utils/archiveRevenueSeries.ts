import type { BuyerRecord } from '../types/workflow'

/** Nominal chart: always from the record's `amount` (handles API string/number). */
export function nominalFromRecordAmount(record: BuyerRecord): number {
  const raw = record.amount as unknown
  if (typeof raw === 'number' && Number.isFinite(raw)) return Math.max(0, raw)
  if (typeof raw === 'string') {
    const n = Number(raw.trim().replace(/\s/g, ''))
    if (Number.isFinite(n)) return Math.max(0, n)
  }
  return 0
}

/** Archive milestone timestamp (ms) for chart / filters; same source as `buildArchiveRevenuePoints`. */
export function recordArchiveTimeMs(record: BuyerRecord): number | null {
  const iso = record.archivedAt || record.generatedAt || record.createdAt
  const t = new Date(iso).getTime()
  return Number.isNaN(t) ? null : t
}

const MS_PER_YEAR = 365.25 * 24 * 60 * 60 * 1000

export type ArchiveRevenueChartRange = '1y' | '2y' | '5y' | 'all'

/**
 * Keeps non-archive rows unchanged; filters archived/history to the last N calendar years
 * relative to the latest archive time (or today, whichever is later).
 */
export function filterRecordsForArchiveRevenueChart(
  records: BuyerRecord[],
  range: ArchiveRevenueChartRange,
): BuyerRecord[] {
  if (range === 'all') return records

  const eligibleTimes = records
    .filter((r) => r.status === 'archived' || r.status === 'history')
    .map(recordArchiveTimeMs)
    .filter((t): t is number => t !== null)

  if (eligibleTimes.length === 0) return records

  const maxT = Math.max(...eligibleTimes, Date.now())
  const years = range === '1y' ? 1 : range === '2y' ? 2 : 5
  const cutoff = maxT - years * MS_PER_YEAR

  return records.filter((r) => {
    if (r.status !== 'archived' && r.status !== 'history') return true
    const t = recordArchiveTimeMs(r)
    if (t === null) return true
    return t >= cutoff
  })
}

export type ArchiveRevenuePoint = {
  /** Archive milestone time (ms) */
  t: number
  /** Point value shown on the line (the record's amount at archive time). */
  cumulative: number
  /** Same as `cumulative` (kept for tooltip/back-compat). */
  amountStep: number
}

const ONE_HOUR_MS = 60 * 60 * 1000
const ONE_DAY_MS = 24 * ONE_HOUR_MS
const FORTY_FIVE_MIN_MS = 45 * 60 * 1000

/** Target minimum X distance between points: wide when data is dense, but capped by real deltas. */
function gapBudgetMs(timesMs: readonly number[]): number {
  const n = timesMs.length
  const rawSpan = Math.max(timesMs[n - 1] - timesMs[0], 0)

  let minPositiveDelta = Number.POSITIVE_INFINITY
  for (let i = 1; i < n; i++) {
    const d = timesMs[i] - timesMs[i - 1]
    if (d > 0) minPositiveDelta = Math.min(minPositiveDelta, d)
  }

  /** When everything lands on ~the same timestamp, widen the imaginary span used for budgeting. */
  const layoutSpan = Math.max(rawSpan, ONE_DAY_MS * 3)
  const divisor = Math.max(n * 2 + 10, 12)

  let gap = layoutSpan / divisor
  gap = Math.max(gap, 2 * ONE_HOUR_MS)
  gap = Math.min(gap, 5 * ONE_DAY_MS)

  if (Number.isFinite(minPositiveDelta)) {
    gap = Math.min(gap, Math.max(2 * ONE_HOUR_MS, minPositiveDelta * 0.42))
  }

  return Math.max(FORTY_FIVE_MIN_MS, gap)
}

/** Records that reached archive (or history after archive); sorted by archive time. */
export function buildArchiveRevenuePoints(records: BuyerRecord[]): ArchiveRevenuePoint[] {
  const eligible = records.filter((r) => r.status === 'archived' || r.status === 'history')
  const withTime = eligible
    .map((r) => {
      const t = recordArchiveTimeMs(r)
      if (t === null) return null
      return { id: r.id, t, amount: nominalFromRecordAmount(r) }
    })
    .filter((x): x is NonNullable<typeof x> => x !== null)
    .sort((a, b) => (a.t - b.t) || String(a.id).localeCompare(String(b.id)))

  if (withTime.length === 0) return []

  const sortedTimes = withTime.map((w) => w.t)
  const gap = gapBudgetMs(sortedTimes)

  let prevX = Number.NaN
  const stepped = withTime.map(({ t, amount }) => {
    let x = t
    if (!Number.isNaN(prevX) && x < prevX + gap) {
      x = prevX + gap
    }
    prevX = x
    return { t: x, cumulative: amount, amountStep: amount }
  })

  /** X strictly increasing; baseline (0) anchor is added in `RevenueLineChart` at padded x-min. */
  return stepped
}
