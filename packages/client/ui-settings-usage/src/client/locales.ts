export type UsageKey =
  | 'nav'
  | 'title'
  | 'today'
  | 'week'
  | 'month'
  | 'total'
  | 'input'
  | 'output'
  | 'cacheRead'
  | 'gridTitle'
  | 'barsTitle'
  | 'daily'
  | 'weekly'
  | 'monthly'
  | 'weeklyGrid'
  | 'monthlyGrid'
  | 'weeklyBars'
  | 'monthlyBars'
  | 'weekdayLabels'
  | 'less'
  | 'more'
  | 'unavailable'
  | 'empty'

export const zh: Record<UsageKey, string> = {
  nav: '用量',
  title: 'Token 用量',
  today: '今日',
  week: '本周',
  month: '本月',
  total: '总计',
  input: '输入',
  output: '输出',
  cacheRead: '缓存读',
  gridTitle: '过去 26 周',
  barsTitle: '最近 30 天',
  daily: '日',
  weekly: '周',
  monthly: '月',
  weeklyGrid: '按周',
  monthlyGrid: '按月',
  weeklyBars: '每周用量',
  monthlyBars: '每月用量',
  weekdayLabels: '一 三 五',
  less: '少',
  more: '多',
  unavailable: '用量面板仅在 Dcode 桌面端可用。',
  empty: '暂无用量数据，开始使用后这里会显示统计。',
}

export const en: Record<UsageKey, string> = {
  nav: 'Usage',
  title: 'Token Usage',
  today: 'Today',
  week: 'This week',
  month: 'This month',
  total: 'Total',
  input: 'Input',
  output: 'Output',
  cacheRead: 'Cache read',
  gridTitle: 'Last 26 weeks',
  barsTitle: 'Last 30 days',
  daily: 'Day',
  weekly: 'Week',
  monthly: 'Month',
  weeklyGrid: 'By week',
  monthlyGrid: 'By month',
  weeklyBars: 'Weekly',
  monthlyBars: 'Monthly',
  weekdayLabels: 'M W F',
  less: 'Less',
  more: 'More',
  unavailable: 'Usage is available in the Dcode desktop app only.',
  empty: 'No usage yet — statistics will appear once you start working.',
}
