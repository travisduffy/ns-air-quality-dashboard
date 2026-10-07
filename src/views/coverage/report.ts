import type { Manifest, Station } from '../../../shared/contract.ts'

// A station that reported its last hour more than a day before the data ends
// has stopped.
const STOPPED_AFTER_HOURS = 24
const HOUR_MS = 3_600_000
const DAY_MS = 24 * HOUR_MS
const AVERAGE_MONTH_DAYS = 30.4375
const MONTHS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
]

const HOUR_PATTERN = /^(\d{4})-(\d{2})-(\d{2})T(\d{2})/

// The hours in the data are wall-clock hours with no zone, so the parts are
// read from the text and no time zone can move them.
const parseHour = (hour: string) => {
  const match = HOUR_PATTERN.exec(hour)
  if (match === null) {
    throw new Error(`coverage: ${hour} is not an hour`)
  }
  const [year, month, day, clock] = match.slice(1).map(Number)
  return { year, month, day, clock, ms: Date.UTC(year, month - 1, day, clock) }
}

// An hour of the data ends at its stamp, so the hour 2018-01-01T00 began on
// 31 December 2017 at 23:00. Each day and clock on screen is the one at which
// the hour began.
const getHourStart = (hour: string) => new Date(parseHour(hour).ms - HOUR_MS)

const formatDate = (date: Date) =>
  `${date.getUTCDate()} ${MONTHS[date.getUTCMonth()]} ${date.getUTCFullYear()}`

const formatClock = (clock: number) => `${String(clock).padStart(2, '0')}:00`

export const formatDay = (hour: string) => formatDate(getHourStart(hour))

export const formatHour = (hour: string) => {
  const start = getHourStart(hour)
  const clock = start.getUTCHours()
  return `${formatDate(start)}, ${formatClock(clock)} to ${formatClock(clock + 1)}`
}

// The fetch time is an instant in UTC, and the day is the one in its text.
export const formatFetchDay = (fetchedAt: string) =>
  formatDate(new Date(parseHour(fetchedAt.slice(0, 10) + 'T00').ms))

const plural = (count: number, unit: string) =>
  `${count} ${unit}${count === 1 ? '' : 's'}`

export const formatDuration = (from: string, to: string) => {
  const days = (parseHour(to).ms - parseHour(from).ms) / DAY_MS
  const months = Math.round(days / AVERAGE_MONTH_DAYS)
  if (months < 1) {
    return plural(Math.max(1, Math.round(days)), 'day')
  }
  const years = Math.floor(months / 12)
  const rest = months % 12
  if (years === 0) {
    return plural(rest, 'month')
  }
  return rest === 0
    ? plural(years, 'year')
    : `${plural(years, 'year')} ${plural(rest, 'month')}`
}

// The data ends at the latest last report of any station.
export const getDataRange = (stations: Station[]) => {
  if (stations.length === 0) {
    throw new Error('coverage: stations.json holds no station')
  }
  let first = stations[0].firstReport
  let last = stations[0].lastReport
  for (const station of stations) {
    if (station.firstReport < first) {
      first = station.firstReport
    }
    if (station.lastReport > last) {
      last = station.lastReport
    }
  }
  return { first, last }
}

export const isStopped = (station: Station, dataEnd: string) =>
  (parseHour(dataEnd).ms - parseHour(station.lastReport).ms) / HOUR_MS >
  STOPPED_AFTER_HOURS

export type CountyStatus = 'reporting' | 'stopped' | 'none'

export const getCountyStatus = (stations: Station[], dataEnd: string) => {
  if (stations.length === 0) {
    return 'none'
  }
  return stations.some(station => !isStopped(station, dataEnd))
    ? 'reporting'
    : 'stopped'
}

export const getSourceLine = (manifest: Manifest) =>
  `${manifest.source.name}, fetched ${formatFetchDay(manifest.fetchedAt)}`
