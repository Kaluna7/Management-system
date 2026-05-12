import { useMemo, useState } from 'react'
import ReactECharts from 'echarts-for-react'
import * as echarts from 'echarts'
import type { EChartsOption } from 'echarts'
import type { StringKey } from '../i18n/strings'
import type { BuyerRecord } from '../types/workflow'
import {
  buildArchiveRevenuePoints,
  filterRecordsForArchiveRevenueChart,
  type ArchiveRevenueChartRange,
} from '../utils/archiveRevenueSeries'
import { formatRpId } from '../utils/formatRpId'

type Props = {
  records: BuyerRecord[]
  t: (key: StringKey) => string
  dateLocale: string
}

/** Point shape for chart rows; chart series uses `[tsMs, amount]`. */
type ChartRow = {
  ts: number
  cumulative: number
  amountStep: number
}

function escapeTooltipText(s: string) {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function buildChartOption(opts: {
  seriesData: [number, number][]
  xMin: number
  xMax: number
  yMin: number
  yMax: number
  dateLocale: string
  amountLabel: string
}): EChartsOption {
  const { seriesData, xMin, xMax, yMin, yMax, dateLocale, amountLabel } = opts
  const labelSafe = escapeTooltipText(amountLabel)

  const fmtDate = (v: number | string) => {
    const ms =
      typeof v === 'number' && Number.isFinite(v)
        ? v
        : typeof v === 'string'
          ? Date.parse(v)
          : NaN
    if (Number.isNaN(ms)) return ''
    return new Date(ms).toLocaleDateString(dateLocale, {
      day: 'numeric',
      month: 'short',
      year: '2-digit',
    })
  }

  return {
    animation: true,
    animationDuration: 1100,
    animationEasing: 'cubicOut',
    animationDurationUpdate: 450,
    grid: { left: 8, right: 14, top: 22, bottom: 26, containLabel: true },
    tooltip: {
      trigger: 'axis',
      axisPointer: {
        type: 'line',
        lineStyle: { color: '#a78bfa', width: 2, opacity: 0.55 },
      },
      backgroundColor: 'rgba(255,255,255,0.96)',
      borderColor: '#e2e8f0',
      borderWidth: 1,
      borderRadius: 10,
      padding: [11, 15],
      textStyle: { color: '#334155', fontSize: 12 },
      formatter(raw: unknown) {
        const list = Array.isArray(raw) ? raw : [raw]
        const item = list[0] as { value?: unknown } | undefined
        if (!item?.value || !Array.isArray(item.value)) return ''
        const [tsMs, amount] = item.value as [number, number]
        const when = new Date(tsMs).toLocaleString(dateLocale, {
          month: 'short',
          day: 'numeric',
          year: '2-digit',
          hour: '2-digit',
          minute: '2-digit',
        })
        const money = escapeTooltipText(formatRpId(amount))
        return `<div style="min-width:176px;line-height:1.35;">
          <div style="font-size:10px;font-weight:600;letter-spacing:0.06em;text-transform:uppercase;color:#7c3aed;">${labelSafe}</div>
          <div style="font-size:18px;font-weight:700;margin-top:6px;color:#0f172a;">${money}</div>
          <div style="margin-top:10px;padding-top:10px;border-top:1px solid #f1f5f9;font-size:11px;color:#64748b;">${escapeTooltipText(when)}</div>
        </div>`
      },
    },
    xAxis: {
      type: 'time',
      min: xMin,
      max: xMax,
      axisLine: { lineStyle: { color: '#cbd5e1' } },
      axisLabel: { color: '#64748b', fontSize: 10, formatter: fmtDate },
      splitLine: { show: false },
    },
    yAxis: {
      type: 'value',
      min: yMin,
      max: yMax,
      axisLabel: {
        color: '#64748b',
        fontSize: 10,
        formatter: (val: number) => formatRpId(val),
      },
      splitLine: {
        lineStyle: { color: '#e2e8f0', type: 'dashed', dashOffset: 0, opacity: 0.72 },
      },
    },
    series: [
      {
        id: 'archiveRevenue',
        type: 'line',
        data: seriesData,
        /** Curve “hidup”: numeric smooth (≈Catmull feel); set `true` for max softness. */
        smooth: 0.62,
        smoothMonotone: 'x',
        symbol: 'none',
        sampling: 'none',
        lineStyle: {
          width: 2.6,
          color: '#6d28d9',
          cap: 'round',
          join: 'round',
          shadowBlur: 6,
          shadowColor: 'rgba(109, 40, 217, 0.18)',
        },
        emphasis: {
          focus: 'series',
          lineStyle: { width: 3.2 },
        },
        areaStyle: {
          color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
            { offset: 0, color: 'rgba(124, 58, 237, 0.30)' },
            { offset: 0.52, color: 'rgba(139, 92, 246, 0.095)' },
            { offset: 1, color: 'rgba(139, 92, 246, 0.025)' },
          ]),
        },
      },
    ],
  }
}

function EmptyZeroChart({ t }: { t: (key: StringKey) => string }) {
  return (
    <div
      role="img"
      aria-label={t('chartArchiveRevenueTitle')}
      className="w-full rounded-xl border border-dashed border-slate-200 bg-slate-50/90 px-3 py-3 sm:px-4 sm:py-3.5"
    >
      <p className="text-center text-[11px] leading-snug text-slate-600 sm:text-left">{t('chartArchiveEmpty')}</p>
      <p className="mt-1 text-center text-[10px] leading-snug text-slate-500 sm:text-left">
        {t('chartStartsAtZero')}
      </p>
    </div>
  )
}

function ArchiveRangeEmptyChart({ t }: { t: (key: StringKey) => string }) {
  return (
    <div
      role="status"
      aria-label={t('chartArchiveRangeEmpty')}
      className="w-full rounded-xl border border-dashed border-amber-200/90 bg-amber-50/60 px-3 py-3 sm:px-4 sm:py-3.5"
    >
      <p className="text-center text-[11px] font-medium leading-snug text-amber-950/90 sm:text-left">
        {t('chartArchiveRangeEmpty')}
      </p>
      <p className="mt-1 text-center text-[10px] leading-snug text-amber-900/75 sm:text-left">
        {t('chartArchiveRangeEmptyHint')}
      </p>
    </div>
  )
}

const RANGE_OPTIONS: { value: ArchiveRevenueChartRange; labelKey: StringKey }[] = [
  { value: '1y', labelKey: 'chartRange1y' },
  { value: '2y', labelKey: 'chartRange2y' },
  { value: '5y', labelKey: 'chartRange5y' },
  { value: 'all', labelKey: 'chartRangeAll' },
]

function ChartTimeRangeToolbar({
  range,
  onRangeChange,
  t,
}: {
  range: ArchiveRevenueChartRange
  onRangeChange: (next: ArchiveRevenueChartRange) => void
  t: (key: StringKey) => string
}) {
  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{t('chartTimeRange')}</p>
      <div className="flex flex-wrap gap-1.5" role="group" aria-label={t('chartTimeRange')}>
        {RANGE_OPTIONS.map(({ value, labelKey }) => (
          <button
            key={value}
            type="button"
            onClick={() => onRangeChange(value)}
            aria-pressed={range === value}
            className={`rounded-lg px-2.5 py-1.5 text-xs font-medium transition sm:px-3 ${
              range === value
                ? 'bg-violet-600 text-white shadow-sm'
                : 'border border-slate-200 bg-white text-slate-700 hover:border-violet-200 hover:bg-violet-50/60'
            }`}
          >
            {t(labelKey)}
          </button>
        ))}
      </div>
    </div>
  )
}

export function RevenueLineChart({ records, t, dateLocale }: Props) {
  const [range, setRange] = useState<ArchiveRevenueChartRange>('all')
  const amountLabel = t('chartTooltipAmountLabel')

  const fullArchivePointCount = useMemo(() => buildArchiveRevenuePoints(records).length, [records])

  const filteredRecords = useMemo(
    () => filterRecordsForArchiveRevenueChart(records, range),
    [records, range],
  )

  const rows = useMemo(() => {
    const points = buildArchiveRevenuePoints(filteredRecords)
    return points.map(
      (p): ChartRow => ({
        ts: p.t,
        cumulative: p.cumulative,
        amountStep: p.amountStep,
      }),
    )
  }, [filteredRecords])

  /** Raw archive points only (no synthetic baseline). */
  const rawSeriesData = useMemo((): [number, number][] => rows.map((d) => [d.ts, d.cumulative]), [rows])

  const xExtent = useMemo(() => {
    if (rawSeriesData.length === 0) return null
    const ts = rawSeriesData.map((d) => d[0])
    const minTs = Math.min(...ts)
    const maxTs = Math.max(...ts)
    const span = Math.max(maxTs - minTs, 12 * 60 * 60 * 1000)
    const pad = Math.max(span * 0.24, 20 * 60 * 60 * 1000)
    return { min: minTs - pad, max: maxTs + pad }
  }, [rawSeriesData])

  /** Left anchor at y=0 so line/area start on the baseline (smooth may still ease upward). */
  const seriesData = useMemo((): [number, number][] => {
    if (rawSeriesData.length === 0 || !xExtent) return rawSeriesData
    return [[xExtent.min, 0], ...rawSeriesData]
  }, [rawSeriesData, xExtent])

  const yExtent = useMemo(() => {
    if (seriesData.length === 0) return null
    const vals = seriesData.map(([, y]) => y).filter(Number.isFinite)
    if (vals.length === 0) return null
    const minData = Math.min(...vals)
    const maxData = Math.max(...vals)
    const spread = Math.max(maxData - minData, Math.max(maxData * 0.06, minData * 0.06, 1))
    let lo = minData - spread * 0.18
    const hi = maxData + spread * 0.2
    lo = Math.max(0, lo)
    if (hi <= lo) return { min: Math.max(0, minData * 0.9), max: maxData > 0 ? maxData * 1.08 : lo + 1 }
    return { min: lo, max: hi }
  }, [seriesData])

  const option = useMemo((): EChartsOption | null => {
    if (seriesData.length === 0 || !xExtent || !yExtent) return null
    return buildChartOption({
      seriesData,
      xMin: xExtent.min,
      xMax: xExtent.max,
      yMin: yExtent.min,
      yMax: yExtent.max,
      dateLocale,
      amountLabel,
    })
  }, [seriesData, xExtent, yExtent, dateLocale, amountLabel])

  const showTimeRangeToolbar = fullArchivePointCount > 0

  const rangeFilterEmpty =
    fullArchivePointCount > 0 && rawSeriesData.length === 0 && range !== 'all'

  if (!option) {
    return (
      <div className="w-full space-y-3">
        {showTimeRangeToolbar ? (
          <ChartTimeRangeToolbar range={range} onRangeChange={setRange} t={t} />
        ) : null}
        {rangeFilterEmpty ? <ArchiveRangeEmptyChart t={t} /> : <EmptyZeroChart t={t} />}
      </div>
    )
  }

  return (
    <div className="w-full space-y-3" role="img" aria-label={t('chartArchiveRevenueTitle')}>
      {showTimeRangeToolbar ? <ChartTimeRangeToolbar range={range} onRangeChange={setRange} t={t} /> : null}
      <div className="h-[220px] min-h-[200px] w-full sm:h-[280px] [&_.echarts-for-react]:min-h-[inherit] [&_.echarts-for-react]:h-full">
        <ReactECharts
          option={option}
          style={{ height: '100%', width: '100%' }}
          opts={{ renderer: 'svg' }}
          notMerge={false}
          lazyUpdate={false}
        />
      </div>
    </div>
  )
}
