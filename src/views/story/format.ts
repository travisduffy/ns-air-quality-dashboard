export const DAY_MS = 86_400_000
const HOUR_MS = 3_600_000

const NUMBER = new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 })

const DATE = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  timeZone: 'UTC',
})

const SHORT_DATE = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  timeZone: 'UTC',
})

const WEEKDAY = new Intl.DateTimeFormat('en-GB', {
  weekday: 'long',
  timeZone: 'UTC',
})

const WORDS = [
  'No',
  'One',
  'Two',
  'Three',
  'Four',
  'Five',
  'Six',
  'Seven',
  'Eight',
  'Nine',
  'Ten',
]

export const formatNumber = (value: number) => NUMBER.format(value)

// A day is a calendar day with no time zone, so every day reads in UTC.
export const formatDay = (day: string) => DATE.format(Date.parse(day))

export const formatShortDay = (day: string) =>
  SHORT_DATE.format(Date.parse(day)).replace('Sept', 'Sep')

export const formatLongDay = (day: string) =>
  `${WEEKDAY.format(Date.parse(day))} ${formatDay(day)}`

export const formatCountWord = (count: number) =>
  WORDS[count] ?? formatNumber(count)

export const dayIndex = (firstDay: string, day: string) =>
  Math.round((Date.parse(day) - Date.parse(firstDay)) / DAY_MS)

export const dayAt = (firstDay: string, index: number) =>
  new Date(Date.parse(firstDay) + index * DAY_MS).toISOString().slice(0, 10)

// The source stamps each reading at the end of its hour, so the reading of
// 00:00 belongs to the day before.
export const hourDay = (stamp: string) =>
  new Date(Date.parse(`${stamp.slice(0, 19)}Z`) - HOUR_MS)
    .toISOString()
    .slice(0, 10)

export const formatUnit = (unit: string) => (unit === 'ug/m3' ? 'µg/m³' : unit)
