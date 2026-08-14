import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
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
  level === 0
    ? 'var(--dsw-alias-bg-layer-3)'
    : `color-mix(in srgb, var(--dsw-static-deepseek-450) ${(LEVEL_STOPS[level] ?? 0) * 100}%, var(--dsw-alias-bg-layer-3))`

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

/** Gap between the cursor and the tooltip, in px (each axis). */
const TIP_GAP = 14

/**
 * Hover tooltip with viewport-aware placement. Renders at `position: fixed`,
 * measures its own box, then flips across the cursor and clamps into the
 * viewport so a cell on the calendar's right edge (or a bar on the chart's
 * last column) still shows fully instead of spilling past the window edge.
 */
function UsageTooltip(props: { tip: TooltipState; t: (key: UsageKey) => string }): ReactNode {
  const { tip, t } = props
  const ref = useRef<HTMLDivElement | null>(null)
  const [pos, setPos] = useState<{ left: number; top: number }>({ left: tip.x, top: tip.y })

  useLayoutEffect(() => {
    const el = ref.current
    if (el === null) return
    const width = el.offsetWidth
    const height = el.offsetHeight
    const vw = window.innerWidth
    const vh = window.innerHeight

    // Prefer right-below the cursor; flip to left when it would overflow, and
    // flip above when the bottom edge would overflow. Final clamp keeps it
    // always fully on-screen.
    let left = tip.x + TIP_GAP
    if (left + width > vw - 4) left = tip.x - width - TIP_GAP
    let top = tip.y + TIP_GAP
    if (top + height > vh - 4) top = tip.y - height - TIP_GAP
    left = Math.min(Math.max(4, left), vw - width - 4)
    top = Math.min(Math.max(4, top), vh - height - 4)
    setPos({ left, top })
  }, [tip])

  return (
    <div ref={ref} className={styles.tooltip} style={{ left: pos.left, top: pos.top }}>
      <div className={styles.tooltipTitle}>{tip.title}</div>
      <div className={styles.tooltipRow}>
        <span>{t('input')}</span>
        <b>{fmt(tip.bucket.input)}</b>
      </div>
      <div className={styles.tooltipRow}>
        <span>{t('output')}</span>
        <b>{fmt(tip.bucket.output)}</b>
      </div>
      <div className={styles.tooltipRow}>
        <span>{t('cacheRead')}</span>
        <b>{fmt(tip.bucket.cacheRead)}</b>
      </div>
      <div className={`${styles.tooltipRow} ${styles.tooltipTotal}`}>
        <span>{t('total')}</span>
        <b>{fmt(tip.bucket.total)}</b>
      </div>
    </div>
  )
}

const monthShort = (date: string): string =>
  new Intl.DateTimeFormat(undefined, { month: 'short' }).format(new Date(`${date}T00:00:00`))

/** Compact axis label: MM-DD for days. */
const axisDate = (_dim: Dim, date: string): string => date.slice(5)

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
    const startWeekday = days.length > 0 ? new Date(`${days[0]?.date ?? ''}T00:00:00`).getDay() : 0
    // Exactly 26 weeks × 7 days: padding trimmed to the grid, so the CSS grid
    // never creates an implicit extra column that overflows the container.
    const padded: Array<UsageDay | null> = [...Array<null>(startWeekday).fill(null), ...days].slice(0, 182)
    const gridCells: GridCell[] = padded.map((day, index) =>
      day === null ? { key: `pad-${index}`, date: '', bucket: null } : { key: day.date, date: day.date, bucket: day },
    )
    const weekColumns: GridCell[][] = []
    for (let i = 0; i < gridCells.length; i += 7) weekColumns.push(gridCells.slice(i, i + 7))
    return { series: days.slice(-30), cells: gridCells, columns: weekColumns }
  }, [data])

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

  const bars = series
  const barWidth = 100 / Math.max(bars.length, 1)

  return (
    <div className={styles.root}>
      <div className={styles.title}>{t('title')}</div>

      <div className={styles.cards}>
        {cards.map(([label, bucket]) => (bucket === undefined ? null : card(label, bucket, t)))}
      </div>

      <div>
        <div className={styles.sectionTitle}>{t('gridTitle')}</div>
        <div className={styles.calendar}>
          <div className={styles.monthRow}>
            {monthLabels.map((label, index) => (
              <div key={index} className={styles.monthLabel}>
                {label}
              </div>
            ))}
          </div>
          <div className={styles.gridBody}>
            <div className={styles.weekdayCol}>
              {weekdayRows.map(row => (
                <span key={row} style={{ gridRowStart: row }}>
                  {weekdayLabels[(row - 1) / 2]}
                </span>
              ))}
            </div>
            <div className={styles.gridDay}>
              {cells.map((cell) => {
                const bucket = cell.bucket
                if (bucket === null) return <span key={cell.key} className={styles.cell} />
                return (
                  <span
                    key={cell.key}
                    className={styles.cell}
                    style={{ background: heatColor(levelOf(bucket.total, cellsMax)) }}
                    onMouseEnter={event => showTip(event, cell.date, bucket)}
                    onMouseMove={moveTip}
                    onMouseLeave={hideTip}
                  />
                )
              })}
            </div>
          </div>
          <div className={styles.calendarFooter}>
            <div className={styles.legend}>
              <span>{t('less')}</span>
              {LEVEL_STOPS.map((_, level) => (
                <span key={level} className={styles.legendCell} style={{ background: heatColor(level) }} />
              ))}
              <span>{t('more')}</span>
            </div>
          </div>
        </div>
      </div>

      <div>
        <div className={styles.sectionTitle}>{t('barsTitle')}</div>
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
                  onMouseEnter={event => showTip(event, bucket.date, bucket)}
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
                  {show ? axisDate('day', bucket.date) : ''}
                </span>
              )
            })}
          </div>
        </div>
      </div>

      {cellsMax === 0 && barMax === 0 ? <div className={styles.note}>{t('empty')}</div> : null}

      {tooltip !== null && <UsageTooltip tip={tooltip} t={t} />}
    </div>
  )
}
