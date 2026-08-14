import { useCallback, useEffect, useState, type CSSProperties, type ReactNode } from 'react'
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

/** Heat levels over the DeepSeek brand blue, following the theme token. */
const LEVEL_STOPS = [0, 0.25, 0.45, 0.7, 1]

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
 * Token-usage settings page: GitHub-style daily grid plus day/week/month/
 * total cards and a 30-day bar chart. Styled with the shared design-platform
 * tokens so it sits naturally inside the settings shell. Data comes from the
 * desktop shell's usage bridge; in a plain web build the section renders an
 * unavailable note.
 */
export function UsageSection({ t }: UsageSectionInjected): ReactNode {
  const [data, setData] = useState<UsageSnapshot | null>(null)
  const [state, setState] = useState<'loading' | 'ready' | 'unavailable'>('loading')

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

  if (state === 'unavailable') return <div className={styles.note}>{t('unavailable')}</div>

  const cards = [
    [t('today'), data?.today],
    [t('week'), data?.week],
    [t('month'), data?.month],
    [t('total'), data?.total],
  ] as Array<[string, UsageBucket | undefined]>

  const days = data?.days ?? []
  const maxTotal = days.reduce((max, day) => Math.max(max, day.total), 0)
  const startWeekday = days.length > 0 ? new Date(`${days[0]?.date ?? ''}T00:00:00`).getDay() : 0
  const cells: Array<UsageDay | null> = [...Array<null>(startWeekday).fill(null), ...days]

  const bars = days.slice(-30)
  const barMax = bars.reduce((max, day) => Math.max(max, day.total), 0)
  const barWidth = 100 / Math.max(bars.length, 1)

  return (
    <div className={styles.root}>
      <div className={styles.header}>
        <div className={styles.title}>{t('title')}</div>
        <div className={styles.legend}>
          <span>{t('less')}</span>
          {LEVEL_STOPS.map((_, level) => (
            <span key={level} className={styles.legendCell} style={{ background: heatColor(level) }} />
          ))}
          <span>{t('more')}</span>
        </div>
      </div>

      <div className={styles.cards}>
        {cards.map(([label, bucket]) => (bucket === undefined ? null : card(label, bucket, t)))}
      </div>

      <div>
        <div className={styles.sectionTitle}>{t('gridTitle')}</div>
        <div className={styles.grid}>
          {cells.map((day, index) =>
            day === null ? (
              <span key={`pad-${index}`} className={styles.cell} style={{ opacity: 0 }} />
            ) : (
              <span
                key={day.date}
                className={styles.cell}
                style={{ background: heatColor(levelOf(day.total, maxTotal)) }}
                title={`${day.date} · ${fmt(day.total)} tokens`}
              />
            ),
          )}
        </div>
      </div>

      <div>
        <div className={styles.sectionTitle}>{t('barsTitle')}</div>
        <div className={styles.barsWrap}>
          <svg viewBox="0 0 100 88" preserveAspectRatio="none" className={styles.bars}>
            {bars.map((day, index) => {
              const h = barMax > 0 ? Math.max(2, (day.total / barMax) * 78) : 2
              const barStyle: CSSProperties =
                day.total > 0
                  ? { fill: 'var(--dsw-static-deepseek-450)' }
                  : { fill: 'var(--dsw-alias-bg-layer-3)' }
              return (
                <rect
                  key={day.date}
                  x={index * barWidth + barWidth * 0.22}
                  y={88 - h}
                  width={barWidth * 0.56}
                  height={h}
                  rx={1.5}
                  style={barStyle}
                >
                  <title>{`${day.date} · ${fmt(day.total)} tokens`}</title>
                </rect>
              )
            })}
          </svg>
        </div>
      </div>

      {maxTotal === 0 ? <div className={styles.note}>{t('empty')}</div> : null}
    </div>
  )
}
