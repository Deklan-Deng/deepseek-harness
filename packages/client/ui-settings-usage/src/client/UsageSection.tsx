import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type CSSProperties,
  type ReactNode,
} from 'react'
import type { UsageKey } from './locales.ts'
import styles from './UsageSection.module.css'

/** The desktop shell's usage bridge (Dcode main process). */
interface DshDesktopBridge {
  usageGet?: () => Promise<UsageSnapshot | null>
}

declare global {
  interface Window {
    dshDesktop?: DshDesktopBridge
  }
}

interface UsageBucket {
  input: number
  output: number
  cacheRead: number
  cacheWrite: number
  total: number
}

interface UsageDay extends UsageBucket {
  date: string
}

interface UsageSnapshot {
  ok: boolean
  today: UsageBucket
  week: UsageBucket
  month: UsageBucket
  total: UsageBucket
  days: UsageDay[]
}

export interface UsageSectionInjected {
  t: (key: UsageKey) => string
}

type Dim = 'day' | 'week' | 'month'

interface GridCell {
  key: string
  date: string
  bucket: UsageBucket | null
}

interface TooltipState {
  x: number
  y: number
  title: string
  bucket: UsageBucket
}

/** Heat levels over the DeepSeek brand blue, following the theme token. */
const LEVEL_STOPS = [0, 0.25, 0.45, 0.7, 1] as const

const heatColor = (level: number): string =>
  `color-mix(in srgb, var(--dsw-static-deepseek-450) ${(LEVEL_STOPS[level] ?? 0) * 100}%, transparent)`

const fmt = (n: number): string => {
  if (!Number.isFinite(n) || n <= 0) return '0'
  if (n >= 1e9) return `${(n / 1e9).toFixed(2)}B`
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`
  if (n >= 1e3) return `${(n / 1e3).toFixed(1)}k`
  return String(Math.round(n))
}

const levelOf = (value: number, max: number): number => {
  if (value <= 0) return 0
  return Math.min(4, 1 + Math.floor((value / Math.max(max, 1)) * 4))
}

const pad2 = (n: number): string => String(n).padStart(2, '0')

/** Monday of the week containing the given YYYY-MM-DD date. */
const mondayOf = (date: string): string => {
  const d = new Date(`${date}T00:00:00`)
  const offset = (d.getDay() + 6) % 7
  d.setDate(d.getDate() - offset)
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
}

const add = (target: UsageBucket, source: UsageBucket): void => {
  target.input += source.input
  target.output += source.output
  target.cacheRead += source.cacheRead
  target.cacheWrite += source.cacheWrite
  target.total += source.total
}

const aggregateWeekly = (days: UsageDay[]): UsageDay[] => {
  const weeks = new Map<string, UsageDay>()
  for (const day of days) {
    const monday = mondayOf(day.date)
    const bucket = weeks.get(monday)
    if (bucket === undefined) {
      weeks.set(monday, { ...day, date: monday })
    } else {
      add(bucket, day)
    }
  }
  return [...weeks.values()]
}

const aggregateMonthly = (days: UsageDay[]): UsageDay[] => {
  const months = new Map<string, UsageDay>()
  for (const day of days) {
    const key = day.date.slice(0, 7)
    const bucket = months.get(key)
    if (bucket === undefined) {
      months.set(key, { ...day, date: key })
    } else {
      add(bucket, day)
    }
  }
  return [...months.values()]
}

const periodTitle = (dim: Dim, date: string, t: (key: UsageKey) => string): string => {
  if (dim === 'month') {
    const [year, month] = date.split('-')
    return `${t('monthly')} ${year}-${month}`
  }
  if (dim === 'week') return `${t('weekly')} ${date}`
  return date
}

const monthShort = (date: string): string =>
  new Intl.DateTimeFormat(undefined, { month: 'short' }).format(new Date(`${date}T00:00:00`))

/** Compact axis label: MM-DD for days/weeks, YY-MM for months. */
const axisDate = (dim: Dim, date: string): string =>
  dim === 'month' ? date.slice(2, 7) : date.slice(5)

const card = (label: string, bucket: UsageBucket, t: (key: UsageKey) => string): ReactNode => (
  <div key={label} className={styles.card}>
    <div className={styles.cardLabel}>{label}</div>
    <div className={styles.cardValue}>{fmt(bucket.total)}</div>
    <div className={styles.cardSub}>
      {`${t('input')} ${fmt(bucket.input)} · ${t('output')} ${fmt(bucket.output)}${bucket.cacheRead > 0 ? ` · ${t('cacheRead')} ${fmt(bucket.cacheRead)}` : ''}`}
    </div>
  </div>
)

/**
 * Token-usage settings page: GitHub-style calendar grid plus day/week/month/
 * total cards and a bar chart, switchable between daily / weekly / monthly
 * aggregation. Styled with the shared design-platform tokens so it sits
 * naturally inside the settings shell. Data comes from the desktop shell's
 * usage bridge; in a plain web build the section renders an unavailable note.
 */
export function UsageSection({ t }: UsageSectionInjected): ReactNode {
  const [data, setData] = useState<UsageSnapshot | null>(null)
  const [state, setState] = useState<'loading' | 'ready' | 'unavailable'>('loading')
  const [dim, setDim] = useState<Dim>('day')
  const [tooltip, setTooltip] = useState<TooltipState | null>(null)

  const load = useCallback(() => {
    const bridge = window.dshDesktop
    if (bridge === undefined || bridge.usageGet === undefined) {
      setState('unavailable')
      return
    }
    void bridge
      .usageGet()
      .then((snapshot) => {
        if (snapshot !== null && snapshot.ok) {
          setData(snapshot)
          setState('ready')
        } else {
          setState('unavailable')
        }
      })
      .catch(() => setState('unavailable'))
  }, [])

  useEffect(() => {
    load()
    const timer = setInterval(load, 30000)
    return () => clearInterval(timer)
  }, [load])

  const { series, cells, columns } = useMemo(() => {
    const days = data?.days ?? []
    if (dim === 'week') {
      const buckets = aggregateWeekly(days)
      const gridCells: GridCell[] = buckets.map(bucket => ({ key: bucket.date, date: bucket.date, bucket }))
      return { series: buckets, cells: gridCells, columns: null }
    }
    if (dim === 'month') {
      const buckets = aggregateMonthly(days)
      const gridCells: GridCell[] = buckets.map(bucket => ({ key: bucket.date, date: bucket.date, bucket }))
      return { series: buckets, cells: gridCells, columns: null }
    }
    const startWeekday = days.length > 0 ? new Date(`${days[0]?.date ?? ''}T00:00:00`).getDay() : 0
    const padded: Array<UsageDay | null> = [...Array<null>(startWeekday).fill(null), ...days]
    const gridCells: GridCell[] = padded.map((day, index) =>
      day === null ? { key: `pad-${index}`, date: '', bucket: null } : { key: day.date, date: day.date, bucket: day },
    )
    const weekColumns: GridCell[][] = []
    for (let i = 0; i < gridCells.length; i += 7) weekColumns.push(gridCells.slice(i, i + 7))
    return { series: days.slice(-30), cells: gridCells, columns: weekColumns }
  }, [data, dim])

  const cellsMax = cells.reduce((max, cell) => Math.max(max, cell.bucket?.total ?? 0), 0)
  const barMax = series.reduce((max, bucket) => Math.max(max, bucket.total), 0)

  const showTip = (event: { clientX: number; clientY: number }, title: string, bucket: UsageBucket): void => {
    setTooltip({ x: event.clientX, y: event.clientY, title, bucket })
  }
  const moveTip = (event: { clientX: number; clientY: number }): void => {
    setTooltip(previous => (previous === null ? previous : { ...previous, x: event.clientX, y: event.clientY }))
  }
  const hideTip = (): void => setTooltip(null)

  if (state === 'unavailable') return <div className={styles.note}>{t('unavailable')}</div>

  const cards = [
    [t('today'), data?.today],
    [t('week'), data?.week],
    [t('month'), data?.month],
    [t('total'), data?.total],
  ] as Array<[string, UsageBucket | undefined]>

  const dims: Array<[Dim, string]> = [
    ['day', t('daily')],
    ['week', t('weekly')],
    ['month', t('monthly')],
  ]

  const weekdayLabels = t('weekdayLabels').split(' ')
  const weekdayRows = [1, 3, 5]

  const monthLabels: string[] = []
  if (columns !== null) {
    let previous = ''
    for (const column of columns) {
      const first = column.find(cell => cell.bucket !== null)
      const label = first === undefined ? '' : monthShort(first.date)
      monthLabels.push(label !== previous ? label : '')
      previous = label
    }
  }

  const gridLabel = dim === 'day' ? t('gridTitle') : dim === 'week' ? t('weeklyGrid') : t('monthlyGrid')
  const barsLabel = dim === 'day' ? t('barsTitle') : dim === 'week' ? t('weeklyBars') : t('monthlyBars')

  const bars = series
  const barWidth = 100 / Math.max(bars.length, 1)

  return (
    <div className={styles.root}>
      <div className={styles.header}>
        <div className={styles.title}>{t('title')}</div>
        <div className={styles.tabs}>
          {dims.map(([value, label]) => (
            <button
              key={value}
              type="button"
              className={dim === value ? `${styles.tab} ${styles.tabActive}` : styles.tab}
              onClick={() => setDim(value)}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className={styles.cards}>
        {cards.map(([label, bucket]) => (bucket === undefined ? null : card(label, bucket, t)))}
      </div>

      <div>
        <div className={styles.sectionHead}>
          <div className={styles.sectionTitle}>{gridLabel}</div>
          <div className={styles.legend}>
            <span>{t('less')}</span>
            {LEVEL_STOPS.map((_, level) => (
              <span key={level} className={styles.legendCell} style={{ background: heatColor(level) }} />
            ))}
            <span>{t('more')}</span>
          </div>
        </div>
        <div className={styles.calendar}>
          {columns !== null && (
            <div className={styles.monthRow}>
              {monthLabels.map((label, index) => (
                <div key={index} className={styles.monthLabel}>
                  {label}
                </div>
              ))}
            </div>
          )}
          <div className={styles.gridBody}>
            {columns !== null && (
              <div className={styles.weekdayCol}>
                {weekdayRows.map(row => (
                  <span key={row} style={{ gridRowStart: row }}>
                    {weekdayLabels[(row - 1) / 2]}
                  </span>
                ))}
              </div>
            )}
            {columns !== null ? (
              <div className={styles.gridDay}>
                {cells.map((cell) => {
                  const bucket = cell.bucket
                  if (bucket === null) return <span key={cell.key} className={styles.cell} style={{ opacity: 0 }} />
                  return (
                    <span
                      key={cell.key}
                      className={styles.cell}
                      style={{ background: heatColor(levelOf(bucket.total, cellsMax)) }}
                      onMouseEnter={event => showTip(event, periodTitle('day', cell.date, t), bucket)}
                      onMouseMove={moveTip}
                      onMouseLeave={hideTip}
                    />
                  )
                })}
              </div>
            ) : (
              <div
                className={styles.gridFlat}
                style={{
                  aspectRatio: `${Math.max(cells.length, 1)} / 1`,
                  gridTemplateColumns: `repeat(${Math.max(cells.length, 1)}, 1fr)`,
                }}
              >
                {cells.map((cell) => {
                  const bucket = cell.bucket
                  if (bucket === null) return <span key={cell.key} className={styles.cell} style={{ opacity: 0 }} />
                  return (
                    <span
                      key={cell.key}
                      className={styles.cell}
                      style={{ background: heatColor(levelOf(bucket.total, cellsMax)) }}
                      onMouseEnter={event => showTip(event, periodTitle(dim, cell.date, t), bucket)}
                      onMouseMove={moveTip}
                      onMouseLeave={hideTip}
                    />
                  )
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      <div>
        <div className={styles.sectionTitle}>{barsLabel}</div>
        <div className={styles.barsWrap}>
          <svg viewBox="0 0 100 88" preserveAspectRatio="none" className={styles.bars}>
            <defs>
              <linearGradient id="dshu-bar-gradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" style={{ stopColor: 'var(--dsw-static-deepseek-300)' }} />
                <stop offset="100%" style={{ stopColor: 'var(--dsw-static-deepseek-500)' }} />
              </linearGradient>
            </defs>
            {bars.map((bucket, index) => {
              const h = barMax > 0 ? Math.max(2, (bucket.total / barMax) * 78) : 2
              const fill: CSSProperties =
                bucket.total > 0
                  ? { fill: 'url(#dshu-bar-gradient)' }
                  : { fill: 'var(--dsw-alias-bg-layer-3)' }
              return (
                <rect
                  key={bucket.date}
                  x={index * barWidth + barWidth * 0.22}
                  y={88 - h}
                  width={barWidth * 0.56}
                  height={h}
                  rx={1.5}
                  style={{ ...fill, animationDelay: `${index * 18}ms` }}
                  onMouseEnter={event => showTip(event, periodTitle(dim, bucket.date, t), bucket)}
                  onMouseMove={moveTip}
                  onMouseLeave={hideTip}
                />
              )
            })}
          </svg>
          <div className={styles.barsAxis}>
            {bars.map((bucket, index) => {
              const show = index % 5 === 0 || index === bars.length - 1
              return (
                <span
                  key={bucket.date}
                  className={styles.axisLabel}
                  style={{
                    left: `${(index + 0.5) * barWidth}%`,
                    transform: index === 0 ? 'none' : 'translateX(-50%)',
                  }}
                >
                  {show ? axisDate(dim, bucket.date) : ''}
                </span>
              )
            })}
          </div>
        </div>
      </div>

      {cellsMax === 0 && barMax === 0 ? <div className={styles.note}>{t('empty')}</div> : null}

      {tooltip !== null && (
        <div className={styles.tooltip} style={{ left: tooltip.x + 14, top: tooltip.y + 14 }}>
          <div className={styles.tooltipTitle}>{tooltip.title}</div>
          <div className={styles.tooltipRow}>
            <span>{t('input')}</span>
            <b>{fmt(tooltip.bucket.input)}</b>
          </div>
          <div className={styles.tooltipRow}>
            <span>{t('output')}</span>
            <b>{fmt(tooltip.bucket.output)}</b>
          </div>
          <div className={styles.tooltipRow}>
            <span>{t('cacheRead')}</span>
            <b>{fmt(tooltip.bucket.cacheRead)}</b>
          </div>
          <div className={`${styles.tooltipRow} ${styles.tooltipTotal}`}>
            <span>{t('total')}</span>
            <b>{fmt(tooltip.bucket.total)}</b>
          </div>
        </div>
      )}
    </div>
  )
}
