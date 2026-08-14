import { useCallback, useEffect, useState, type CSSProperties } from 'react'
import type { ReactNode } from 'react'
import type { UsageKey } from './locales.ts'

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

const CELL_COLORS = ['#1c2431', '#1d3a8a', '#2a54c9', '#4d6bfe', '#8fa8ff'] as const

const fmt = (n: number): string => {
  if (!Number.isFinite(n) || n <= 0) return '0'
  if (n >= 1e9) return `${(n / 1e9).toFixed(2)}B`
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`
  if (n >= 1e3) return `${(n / 1e3).toFixed(1)}k`
  return String(Math.round(n))
}

const cellColor = (value: number, max: number): string => {
  if (value <= 0) return CELL_COLORS[0]
  const level = Math.min(4, 1 + Math.floor((value / Math.max(max, 1)) * 4))
  return CELL_COLORS[level] ?? CELL_COLORS[0]
}

const card = (label: string, bucket: UsageBucket, t: (key: UsageKey) => string): ReactNode => (
  <div key={label} style={styles.card}>
    <div style={styles.cardLabel}>{label}</div>
    <div style={styles.cardValue}>{fmt(bucket.total)}</div>
    <div style={styles.cardSub}>
      {`${t('input')} ${fmt(bucket.input)} · ${t('output')} ${fmt(bucket.output)}${bucket.cacheRead > 0 ? ` · ${t('cacheRead')} ${fmt(bucket.cacheRead)}` : ''}`}
    </div>
  </div>
)

/**
 * Token-usage settings page: GitHub-style daily grid plus day/week/month/
 * total cards and a 30-day bar chart. Data comes from the desktop shell's
 * usage bridge; in a plain web build the section renders an unavailable note.
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

  if (state === 'unavailable') return <div style={styles.note}>{t('unavailable')}</div>

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
    <div style={styles.root}>
      <div style={styles.title}>{t('title')}</div>
      <div style={styles.cards}>
        {cards.map(([label, bucket]) => (bucket === undefined ? null : card(label, bucket, t)))}
      </div>
      <div style={styles.sectionTitle}>{t('gridTitle')}</div>
      <div style={styles.grid}>
        {cells.map((day, index) =>
          day === null ? (
            <span key={`pad-${index}`} style={{ ...styles.cell, opacity: 0 }} />
          ) : (
            <span
              key={day.date}
              style={{ ...styles.cell, background: cellColor(day.total, maxTotal) }}
              title={`${day.date} · ${fmt(day.total)} tokens`}
            />
          ),
        )}
      </div>
      <div style={styles.sectionTitle}>{t('barsTitle')}</div>
      <svg viewBox="0 0 100 88" preserveAspectRatio="none" style={styles.bars}>
        {bars.map((day, index) => {
          const h = barMax > 0 ? Math.max(2, (day.total / barMax) * 78) : 2
          return (
            <rect
              key={day.date}
              x={index * barWidth + barWidth * 0.22}
              y={88 - h}
              width={barWidth * 0.56}
              height={h}
              rx={1.5}
              fill={day.total > 0 ? '#4d6bfe' : '#1c2431'}
            >
              <title>{`${day.date} · ${fmt(day.total)} tokens`}</title>
            </rect>
          )
        })}
      </svg>
      {maxTotal === 0 ? <div style={styles.note}>{t('empty')}</div> : null}
    </div>
  )
}

const styles: Record<string, CSSProperties> = {
  root: {
    color: '#c9d4e3',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    fontSize: 12,
  },
  title: { fontSize: 13, fontWeight: 600, color: '#e6ecf7', marginBottom: 12 },
  cards: {
    display: 'grid',
    gridTemplateColumns: 'repeat(4, 1fr)',
    gap: 10,
    marginBottom: 14,
  },
  card: {
    background: '#161b22',
    border: '1px solid #232c3f',
    borderRadius: 8,
    padding: '10px 12px',
  },
  cardLabel: { fontSize: 11, color: '#7d8aa0', marginBottom: 4 },
  cardValue: { fontSize: 15, fontWeight: 650, color: '#e6ecf7' },
  cardSub: { fontSize: 10, color: '#5d6b85', marginTop: 3 },
  sectionTitle: { fontSize: 11, color: '#7d8aa0', margin: '12px 0 8px' },
  grid: {
    display: 'grid',
    gridAutoFlow: 'column',
    gridTemplateRows: 'repeat(7, 11px)',
    gap: 3,
    width: 'max-content',
    maxWidth: '100%',
    overflow: 'hidden',
  },
  cell: { width: 11, height: 11, borderRadius: 3, background: '#1c2431' },
  bars: { display: 'block', width: '100%', height: 90 },
  note: { color: '#7d8aa0', fontSize: 12, marginTop: 8 },
}
