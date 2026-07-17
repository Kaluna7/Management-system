import { useEffect, useMemo, useState } from 'react'
import ReactECharts from 'echarts-for-react'
import * as echarts from 'echarts'
import type { EChartsOption } from 'echarts'
import type { StringKey } from '../i18n/strings'
import type { BuyerRecord } from '../types/workflow'
import { useTheme } from '../context/ThemeContext'
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
  role?: 'buyers' | 'finance'
}

type ChartPalette = {
  line: string
  lineShadow: string
  areaStops: [number, string][]
  axisPointer: string
  axisLine: string
  axisLabel: string
  splitLine: string
  tooltipBorder: string
  tooltipLabel: string
}

function chartPalette(role: 'buyers' | 'finance', isDark: boolean): ChartPalette {
  if (role === 'finance') {
    return isDark
      ? {
          line: '#34d399',
          lineShadow: 'rgba(52, 211, 153, 0.35)',
          areaStops: [
            [0, 'rgba(52, 211, 153, 0.35)'],
            [0.52, 'rgba(16, 185, 129, 0.12)'],
            [1, 'rgba(6, 78, 59, 0.04)'],
          ],
          axisPointer: '#34d399',
          axisLine: 'rgba(16, 185, 129, 0.28)',
          axisLabel: 'rgba(167, 243, 208, 0.82)',
          splitLine: 'rgba(16, 185, 129, 0.1)',
          tooltipBorder: 'rgba(16, 185, 129, 0.28)',
          tooltipLabel: '#6ee7b7',
        }
      : {
          line: '#059669',
          lineShadow: 'rgba(5, 150, 105, 0.18)',
          areaStops: [
            [0, 'rgba(5, 150, 105, 0.30)'],
            [0.52, 'rgba(16, 185, 129, 0.095)'],
            [1, 'rgba(5, 150, 105, 0.025)'],
          ],
          axisPointer: '#10b981',
          axisLine: '#cbd5e1',
          axisLabel: '#64748b',
          splitLine: '#e2e8f0',
          tooltipBorder: '#e2e8f0',
          tooltipLabel: '#059669',
        }
  }

  return isDark
    ? {
        line: '#a78bfa',
        lineShadow: 'rgba(167, 139, 250, 0.35)',
        areaStops: [
          [0, 'rgba(167, 139, 250, 0.35)'],
          [0.52, 'rgba(139, 92, 246, 0.12)'],
          [1, 'rgba(88, 28, 135, 0.04)'],
        ],
        axisPointer: '#a78bfa',
        axisLine: 'rgba(139, 92, 246, 0.28)',
        axisLabel: 'rgba(221, 214, 254, 0.82)',
        splitLine: 'rgba(139, 92, 246, 0.1)',
        tooltipBorder: 'rgba(139, 92, 246, 0.28)',
        tooltipLabel: '#c4b5fd',
      }
    : {
        line: '#6d28d9',
        lineShadow: 'rgba(109, 40, 217, 0.18)',
        areaStops: [
          [0, 'rgba(124, 58, 237, 0.30)'],
          [0.52, 'rgba(139, 92, 246, 0.095)'],
          [1, 'rgba(139, 92, 246, 0.025)'],
        ],
        axisPointer: '#a78bfa',
        axisLine: '#cbd5e1',
        axisLabel: '#64748b',
        splitLine: '#e2e8f0',
        tooltipBorder: '#e2e8f0',
        tooltipLabel: '#7c3aed',
      }
}

/** Compact axis labels so long Rupiah strings do not crush the chart on small screens. */
function formatRpAxis(value: number, compact: boolean) {
  if (!Number.isFinite(value)) return ''
  if (!compact) return formatRpId(value)
  const abs = Math.abs(value)
  const sign = value < 0 ? '-' : ''
  if (abs >= 1_000_000_000) {
    const n = abs / 1_000_000_000
    return `${sign}${n >= 10 ? n.toFixed(0) : n.toFixed(1).replace(/\.0$/, '')}M`
  }
  if (abs >= 1_000_000) {
    const n = abs / 1_000_000
    return `${sign}${n >= 10 ? n.toFixed(0) : n.toFixed(1).replace(/\.0$/, '')}jt`
  }
  if (abs >= 1_000) {
    return `${sign}${Math.round(abs / 1_000)}rb`
  }
  return `${sign}${Math.round(abs)}`
}

function useIsCompactChart() {
  const [compact, setCompact] = useState(() =>
    typeof window !== 'undefined' ? window.matchMedia('(max-width: 767px)').matches : false,
  )

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 767px)')
    const onChange = () => setCompact(mq.matches)
    onChange()
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])

  return compact
}

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
  isDark: boolean
  role: 'buyers' | 'finance'
  compact: boolean
}): EChartsOption {
  const { seriesData, xMin, xMax, yMin, yMax, dateLocale, amountLabel, isDark, role, compact } =
    opts
  const labelSafe = escapeTooltipText(amountLabel)
  const palette = chartPalette(role, isDark)

  const fmtDate = (v: number | string) => {
    const ms =
      typeof v === 'number' && Number.isFinite(v)
        ? v
        : typeof v === 'string'
          ? Date.parse(v)
          : NaN
    if (Number.isNaN(ms)) return ''
    return new Date(ms).toLocaleDateString(dateLocale, {
      day: compact ? undefined : 'numeric',
      month: 'short',
      year: '2-digit',
    })
  }

  const axisLine = palette.axisLine
  const axisLabel = palette.axisLabel
  const splitLine = palette.splitLine
  const tooltipBg = isDark ? 'rgba(26, 23, 46, 0.94)' : 'rgba(255,255,255,0.96)'
  const tooltipBorder = palette.tooltipBorder
  const tooltipText = isDark ? '#e9d5ff' : '#334155'
  const moneyColor = isDark ? '#f5f3ff' : '#0f172a'
  const whenColor = isDark ? '#c4b5fd99' : '#64748b'
  const dividerColor = isDark ? 'rgba(139, 92, 246, 0.18)' : '#f1f5f9'

  return {
    animation: true,
    animationDuration: 1100,
    animationEasing: 'cubicOut',
    animationDurationUpdate: 450,
    grid: compact
      ? { left: 4, right: 8, top: 16, bottom: 8, containLabel: true }
      : { left: 8, right: 14, top: 22, bottom: 26, containLabel: true },
    tooltip: {
      trigger: 'axis',
      confine: true,
      appendToBody: false,
      axisPointer: {
        type: 'line',
        lineStyle: { color: palette.axisPointer, width: 2, opacity: isDark ? 0.7 : 0.55 },
      },
      backgroundColor: tooltipBg,
      borderColor: tooltipBorder,
      borderWidth: 1,
      borderRadius: 10,
      padding: compact ? [8, 10] : [11, 15],
      textStyle: { color: tooltipText, fontSize: compact ? 11 : 12 },
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
        return `<div style="min-width:${compact ? 140 : 176}px;max-width:220px;line-height:1.35;">
          <div style="font-size:10px;font-weight:600;letter-spacing:0.06em;text-transform:uppercase;color:${palette.tooltipLabel};">${labelSafe}</div>
          <div style="font-size:${compact ? 15 : 18}px;font-weight:700;margin-top:6px;color:${moneyColor};word-break:break-word;">${money}</div>
          <div style="margin-top:10px;padding-top:10px;border-top:1px solid ${dividerColor};font-size:11px;color:${whenColor};">${escapeTooltipText(when)}</div>
        </div>`
      },
    },
    xAxis: {
      type: 'time',
      min: xMin,
      max: xMax,
      axisLine: { lineStyle: { color: axisLine } },
      axisLabel: {
        color: axisLabel,
        fontSize: compact ? 9 : 10,
        hideOverlap: true,
        rotate: compact ? 35 : 0,
        margin: compact ? 10 : 8,
        formatter: fmtDate,
      },
      splitLine: { show: false },
    },
    yAxis: {
      type: 'value',
      min: yMin,
      max: yMax,
      scale: false,
      splitNumber: compact ? 3 : 5,
      axisLabel: {
        color: axisLabel,
        fontSize: compact ? 9 : 10,
        hideOverlap: true,
        width: compact ? 44 : 72,
        overflow: 'truncate',
        formatter: (val: number) => formatRpAxis(val, compact || val >= 100_000),
      },
      splitLine: {
        lineStyle: { color: splitLine, type: 'dashed', dashOffset: 0, opacity: isDark ? 1 : 0.72 },
      },
    },
    series: [
      {
        id: 'archiveRevenue',
        type: 'line',
        data: seriesData,
        smooth: 0.62,
        smoothMonotone: 'x',
        symbol: 'none',
        sampling: 'none',
        lineStyle: {
          width: compact ? 2.2 : 2.6,
          color: palette.line,
          cap: 'round',
          join: 'round',
          shadowBlur: isDark ? 10 : 6,
          shadowColor: palette.lineShadow,
        },
        emphasis: {
          focus: 'series',
          lineStyle: { width: 3.2 },
        },
        areaStyle: {
          color: new echarts.graphic.LinearGradient(
            0,
            0,
            0,
            1,
            palette.areaStops.map(([offset, color]) => ({ offset, color })),
          ),
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
      className="portal-chart-empty w-full px-3 py-3 sm:px-4 sm:py-3.5"
    >
      <p className="portal-body text-center text-[11px] leading-snug sm:text-left">{t('chartArchiveEmpty')}</p>
      <p className="portal-muted mt-1 text-center text-[10px] leading-snug sm:text-left">
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
      className="portal-chart-warn w-full px-3 py-3 sm:px-4 sm:py-3.5"
    >
      <p className="text-center text-[11px] font-medium leading-snug text-amber-950/90 dark:text-amber-200 sm:text-left">
        {t('chartArchiveRangeEmpty')}
      </p>
      <p className="mt-1 text-center text-[10px] leading-snug text-amber-900/75 dark:text-amber-300/70 sm:text-left">
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
    <div className="flex min-w-0 flex-col gap-2">
      <p className="portal-muted text-[11px] font-semibold uppercase tracking-wide">
        {t('chartTimeRange')}
      </p>
      <div
        className="grid w-full grid-cols-2 gap-1.5 sm:grid-cols-4"
        role="group"
        aria-label={t('chartTimeRange')}
      >
        {RANGE_OPTIONS.map(({ value, labelKey }) => (
          <button
            key={value}
            type="button"
            onClick={() => onRangeChange(value)}
            aria-pressed={range === value}
            className={`${
              range === value ? 'portal-chart-toolbar-active' : 'portal-chart-toolbar-idle'
            } w-full justify-center text-center`}
          >
            {t(labelKey)}
          </button>
        ))}
      </div>
    </div>
  )
}

export function RevenueLineChart({ records, t, dateLocale, role = 'buyers' }: Props) {
  const { isDark } = useTheme()
  const compact = useIsCompactChart()
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
      isDark,
      role,
      compact,
    })
  }, [seriesData, xExtent, yExtent, dateLocale, amountLabel, isDark, role, compact])

  const showTimeRangeToolbar = fullArchivePointCount > 0

  const rangeFilterEmpty =
    fullArchivePointCount > 0 && rawSeriesData.length === 0 && range !== 'all'

  if (!option) {
    return (
      <div className="w-full min-w-0 space-y-3">
        {showTimeRangeToolbar ? (
          <ChartTimeRangeToolbar range={range} onRangeChange={setRange} t={t} />
        ) : null}
        {rangeFilterEmpty ? <ArchiveRangeEmptyChart t={t} /> : <EmptyZeroChart t={t} />}
      </div>
    )
  }

  return (
    <div className="w-full min-w-0 space-y-3" role="img" aria-label={t('chartArchiveRevenueTitle')}>
      {showTimeRangeToolbar ? <ChartTimeRangeToolbar range={range} onRangeChange={setRange} t={t} /> : null}
      <div className="portal-chart-canvas h-[240px] w-full min-w-0 overflow-hidden sm:h-[280px] md:h-[300px]">
        <ReactECharts
          option={option}
          style={{ height: '100%', width: '100%' }}
          opts={{ renderer: 'svg' }}
          notMerge
          lazyUpdate
        />
      </div>
    </div>
  )
}
