import { noLimitReasons, unknownLimitReason } from './limit-choice.ts'
import type { ChosenLimit, Limit, LoadedData, RawSeries } from './load.ts'
import {
  HOUR_MS,
  dayOf,
  msStamp,
  yearHours,
  yearStamps,
  yearsOf,
} from './time.ts'

export type Gap = { start: string; end: string; hours: number }

export type DailyVerdict = 'within' | 'over' | 'insufficient'
export type Daily = {
  day: string
  value: number | null
  readings: number
  verdict: DailyVerdict
}

export type Verdict =
  | {
      kind: 'hourly'
      limit: Limit
      judgedHours: number
      overHours: number
      withinHours: number
      maxValue: number | null
      maxAt: string | null
    }
  | {
      kind: 'daily'
      limit: Limit
      statistic: 'daily mean' | 'daily maximum 8-hour average'
      days: number
      judgedDays: number
      overDays: number
      withinDays: number
      insufficientDays: number
      maxValue: number | null
      maxDay: string | null
    }
  | { kind: 'none'; reason: string }

export type Outage = { hours: number; start: string; end: string }

// The summary of one series in one year, as the page shows it. The page builds
// it from a YearSummary and the limit of the series.
export type SeriesSummary = {
  pollutant: string
  label: string
  unit: string
  datasetId: string
  expected: number
  reported: number
  missing: number
  reportedShare: number
  gapCount: number
  longestOutage: Outage | null
  verdict: Verdict
}

export type StationHealth = {
  expected: number
  reported: number
  reportedShare: number
  longestOutage: (Outage & { pollutant: string }) | null
}

// A verdict of one year. The limit is the same for every year, so the series
// holds it once.
export type YearVerdict =
  | Omit<Extract<Verdict, { kind: 'hourly' }>, 'limit'>
  | Omit<Extract<Verdict, { kind: 'daily' }>, 'limit'>
  | { kind: 'none' }

// The hours of a year that a series reported is `reported`. The expected hours
// are the hours of the year, so a year before the series began has none
// reported, and all its hours are missing.
export type YearSummary = {
  year: number
  reported: number
  gapCount: number
  longestOutage: Outage | null
  verdict: YearVerdict
}

export type SeriesOverview = {
  pollutant: string
  label: string
  unit: string
  datasetId: string
  // The current limit, the same for every year. Null when none is official.
  limit: Limit | null
  reason: string | null
  // The first and the last stamp that the series reported, or null for none.
  first: string | null
  last: string | null
  years: YearSummary[]
}

export type YearHealth = {
  year: number
  expected: number
  reported: number
  longestOutage: (Outage & { pollutant: string }) | null
}

export type Overview = {
  project: string
  source: {
    name: string
    site: string
    licence: { name: string; url: string }
    fetchedFirst: string
    fetchedLast: string
    // The corrections that the build made to the source rows, one sentence
    // each.
    corrections: string[]
  }
  window: { start: string; end: string; hours: number; timeNote: string }
  years: number[]
  stations: {
    station: string
    health: YearHealth[]
    series: SeriesOverview[]
  }[]
}

export type SeriesReadings = {
  pollutant: string
  label: string
  unit: string
  limit: Limit | null
  values: (number | null)[]
  gaps: Gap[]
  daily?: Daily[]
}

// The readings of one station in one year. A series with no reading in the
// year is not listed.
export type StationReadings = {
  station: string
  year: number
  start: string
  end: string
  stepHours: 1
  hours: number
  series: SeriesReadings[]
}

export type Derived = {
  overview: Overview
  // By the key `station/year`.
  readings: Map<string, StationReadings>
}

export const PROJECT = 'NS Air Quality Dashboard'
export const SOURCE_NAME =
  'Nova Scotia Provincial Ambient Hourly air quality data'
export const TIME_NOTE =
  'Times are as published. The source states no time zone.'
export const MIN_8H_READINGS = 6
export const MIN_8H_PER_DAY = 18

const labels: [string, string][] = [
  ['O3', 'Ozone'],
  ['PM2.5', 'Fine particulate matter (PM2.5)'],
  ['NO2', 'Nitrogen dioxide'],
  ['NO', 'Nitric oxide'],
  ['NOX', 'Nitrogen oxides'],
  ['SO2', 'Sulphur dioxide'],
  ['CO', 'Carbon monoxide'],
  ['TRS', 'Total reduced sulphur'],
]

export const pollutantLabel = (pollutant: string) =>
  labels.find(([p]) => p === pollutant)?.[1] ?? pollutant

const pollutantRank = (pollutant: string) => {
  const i = labels.findIndex(([p]) => p === pollutant)
  return i < 0 ? labels.length : i
}

// Every hour from the window start to the data end, inclusive.
export const gridHours = (startMs: number, endMs: number) =>
  (endMs - startMs) / HOUR_MS + 1

export const toValues = (
  readings: Map<number, number>,
  startMs: number,
  hours: number
) => {
  const values: (number | null)[] = new Array(hours).fill(null)
  for (const [ms, v] of readings) {
    const i = (ms - startMs) / HOUR_MS
    if (!Number.isInteger(i) || i < 0 || i >= hours) {
      throw new Error(`reading at ${msStamp(ms)} is off the grid`)
    }
    values[i] = v
  }
  return values
}

// A gap is a maximal run of consecutive missing hours.
export const findGaps = (values: (number | null)[], startMs: number) => {
  const gaps: Gap[] = []
  let from = -1
  for (let i = 0; i <= values.length; i++) {
    const missing = i < values.length && values[i] === null
    if (missing && from < 0) from = i
    if (!missing && from >= 0) {
      gaps.push({
        start: msStamp(startMs + from * HOUR_MS),
        end: msStamp(startMs + (i - 1) * HOUR_MS),
        hours: i - from,
      })
      from = -1
    }
  }
  return gaps
}

// The longest gap, the earliest one on a tie.
export const longestGap = (gaps: Gap[]): Outage | null => {
  let best: Gap | null = null
  for (const g of gaps) if (best === null || g.hours > best.hours) best = g
  return best === null
    ? null
    : { hours: best.hours, start: best.start, end: best.end }
}

export const hourlyVerdict = (
  values: (number | null)[],
  startMs: number,
  limit: Limit
): Verdict => {
  let over = 0
  let within = 0
  let maxValue: number | null = null
  let maxAt: string | null = null
  values.forEach((v, i) => {
    if (v === null) return
    if (v > limit.value) over++
    else within++
    if (maxValue === null || v > maxValue) {
      maxValue = v
      maxAt = msStamp(startMs + i * HOUR_MS)
    }
  })
  return {
    kind: 'hourly',
    limit,
    judgedHours: over + within,
    overHours: over,
    withinHours: within,
    maxValue,
    maxAt,
  }
}

const groupByDay = (hours: number, startMs: number) => {
  const days = new Map<string, number[]>()
  for (let i = 0; i < hours; i++) {
    const day = dayOf(startMs + i * HOUR_MS)
    const list = days.get(day)
    if (list === undefined) days.set(day, [i])
    else list.push(i)
  }
  return days
}

const judge = (value: number | null, limit: Limit): DailyVerdict => {
  if (value === null) return 'insufficient'
  return value > limit.value ? 'over' : 'within'
}

// Daily mean of the readings of each day. A day with fewer than minHours
// readings has no value.
export const dailyMeans = (
  values: (number | null)[],
  startMs: number,
  limit: Limit,
  minHours: number
) => {
  const out: Daily[] = []
  for (const [day, idx] of groupByDay(values.length, startMs)) {
    let sum = 0
    let n = 0
    for (const i of idx) {
      const v = values[i]
      if (v !== null && v !== undefined) {
        sum += v
        n++
      }
    }
    const value = n >= minHours ? sum / n : null
    out.push({ day, value, readings: n, verdict: judge(value, limit) })
  }
  return out
}

// The 8-hour average at each hour J: the mean of hours J-7 to J, valid with at
// least 6 readings. Hours before the window start count as missing.
export const eightHourAverages = (values: (number | null)[]) =>
  values.map((_, j) => {
    let sum = 0
    let n = 0
    for (let k = Math.max(0, j - 7); k <= j; k++) {
      const v = values[k]
      if (v !== null && v !== undefined) {
        sum += v
        n++
      }
    }
    return n >= MIN_8H_READINGS ? sum / n : null
  })

// Daily maximum 8-hour average: the greatest valid average that ends in the
// day, valid with at least 18 valid averages.
export const dailyMaxEightHour = (
  values: (number | null)[],
  startMs: number,
  limit: Limit
) => {
  const avgs = eightHourAverages(values)
  const out: Daily[] = []
  for (const [day, idx] of groupByDay(values.length, startMs)) {
    let valid = 0
    let max: number | null = null
    let readings = 0
    for (const i of idx) {
      if (values[i] !== null) readings++
      const a = avgs[i]
      if (a === null || a === undefined) continue
      valid++
      if (max === null || a > max) max = a
    }
    const value = valid >= MIN_8H_PER_DAY ? max : null
    out.push({ day, value, readings, verdict: judge(value, limit) })
  }
  return out
}

export const dailyVerdict = (
  daily: Daily[],
  limit: Limit,
  statistic: 'daily mean' | 'daily maximum 8-hour average'
): Verdict => {
  let over = 0
  let within = 0
  let insufficient = 0
  let maxValue: number | null = null
  let maxDay: string | null = null
  for (const d of daily) {
    if (d.verdict === 'insufficient') insufficient++
    else if (d.verdict === 'over') over++
    else within++
    if (d.value !== null && (maxValue === null || d.value > maxValue)) {
      maxValue = d.value
      maxDay = d.day
    }
  }
  return {
    kind: 'daily',
    limit,
    statistic,
    days: daily.length,
    judgedDays: over + within,
    overDays: over,
    withinDays: within,
    insufficientDays: insufficient,
    maxValue,
    maxDay,
  }
}

type Derivation = { verdict: Verdict; limit: Limit | null; daily?: Daily[] }

// The kind of verdict follows the averaging hours of the chosen limit: 1, 8, or
// 24.
export const judgeSeries = (
  pollutant: string,
  unit: string,
  values: (number | null)[],
  startMs: number,
  limits: Map<string, ChosenLimit>,
  minCompleteHours: number
): Derivation => {
  const chosen = limits.get(pollutant)
  if (chosen === undefined) {
    return {
      verdict: {
        kind: 'none',
        reason: noLimitReasons[pollutant] ?? unknownLimitReason,
      },
      limit: null,
    }
  }
  const { limit, averagingHours } = chosen
  if (limit.unit !== unit) {
    throw new Error(
      `limit of ${pollutant} is in ${limit.unit}, the data is in ${unit}`
    )
  }
  if (averagingHours === 1) {
    return { verdict: hourlyVerdict(values, startMs, limit), limit }
  }
  if (averagingHours === 8) {
    const daily = dailyMaxEightHour(values, startMs, limit)
    return {
      verdict: dailyVerdict(daily, limit, 'daily maximum 8-hour average'),
      limit,
      daily,
    }
  }
  if (averagingHours === 24) {
    const daily = dailyMeans(values, startMs, limit, minCompleteHours)
    return { verdict: dailyVerdict(daily, limit, 'daily mean'), limit, daily }
  }
  throw new Error(
    `limit of ${pollutant} has averaging hours that are not handled: ${averagingHours}`
  )
}

type HealthRow = {
  pollutant: string
  expected: number
  reported: number
  gaps: Gap[]
}

export const stationHealth = (rows: HealthRow[]): StationHealth => {
  let expected = 0
  let reported = 0
  let longest: (Outage & { pollutant: string }) | null = null
  for (const r of rows) {
    expected += r.expected
    reported += r.reported
    const g = longestGap(r.gaps)
    if (
      g !== null &&
      (longest === null ||
        g.hours > longest.hours ||
        (g.hours === longest.hours && g.start < longest.start))
    ) {
      longest = { ...g, pollutant: r.pollutant }
    }
  }
  return {
    expected,
    reported,
    reportedShare: expected === 0 ? 0 : reported / expected,
    longestOutage: longest,
  }
}

export const readingsKey = (station: string, year: number) =>
  `${station}/${year}`

const withoutLimit = (verdict: Verdict): YearVerdict => {
  if (verdict.kind === 'none') return { kind: 'none' }
  const { limit: _limit, ...rest } = verdict
  return rest
}

export const derive = (data: LoadedData): Derived => {
  const hours = gridHours(data.startMs, data.endMs)
  const start = msStamp(data.startMs)
  const end = msStamp(data.endMs)
  const years = yearsOf(data.startMs, data.endMs)

  const byStation = new Map<string, RawSeries[]>()
  for (const s of data.series) {
    const list = byStation.get(s.station)
    if (list === undefined) byStation.set(s.station, [s])
    else list.push(s)
  }

  const stations: Overview['stations'] = []
  const readings = new Map<string, StationReadings>()
  for (const station of [...byStation.keys()].sort()) {
    const raws = byStation
      .get(station)!
      .sort(
        (a, b) =>
          pollutantRank(a.pollutant) - pollutantRank(b.pollutant) ||
          (a.pollutant < b.pollutant ? -1 : 1)
      )
    const series: SeriesOverview[] = []
    const yearReads = new Map<number, SeriesReadings[]>(years.map(y => [y, []]))
    const yearRows = new Map<number, HealthRow[]>(years.map(y => [y, []]))
    for (const raw of raws) {
      const values = toValues(raw.readings, data.startMs, hours)
      // The limit judges each year, and a daily value never crosses a year, so
      // the daily values come from the whole grid. The 8-hour average of the
      // first hours of a year then sees the last hours of the year before.
      const whole = judgeSeries(
        raw.pollutant,
        raw.unit,
        values,
        data.startMs,
        data.limits,
        data.minCompleteHours
      )
      const label = pollutantLabel(raw.pollutant)
      let first = Infinity
      let last = -Infinity
      for (const ms of raw.readings.keys()) {
        if (ms < first) first = ms
        if (ms > last) last = ms
      }
      const summaries: YearSummary[] = []
      for (const year of years) {
        const range = yearStamps(year)
        const from = (range.first - data.startMs) / HOUR_MS
        const slice = values.slice(from, from + yearHours(year))
        const gaps = findGaps(slice, range.first)
        const reported = slice.filter(v => v !== null).length
        let verdict: Verdict = whole.verdict
        if (whole.limit !== null && whole.verdict.kind === 'hourly') {
          verdict = hourlyVerdict(slice, range.first, whole.limit)
        } else if (whole.limit !== null && whole.verdict.kind === 'daily') {
          const days = (whole.daily ?? []).filter(d =>
            d.day.startsWith(`${year}-`)
          )
          verdict = dailyVerdict(days, whole.limit, whole.verdict.statistic)
        }
        summaries.push({
          year,
          reported,
          gapCount: gaps.length,
          longestOutage: longestGap(gaps),
          verdict: withoutLimit(verdict),
        })
        yearRows.get(year)!.push({
          pollutant: raw.pollutant,
          expected: slice.length,
          reported,
          gaps,
        })
        if (reported === 0) continue
        const r: SeriesReadings = {
          pollutant: raw.pollutant,
          label,
          unit: raw.unit,
          limit: whole.limit,
          values: slice,
          gaps,
        }
        if (whole.daily !== undefined) {
          r.daily = whole.daily.filter(d => d.day.startsWith(`${year}-`))
        }
        yearReads.get(year)!.push(r)
      }
      series.push({
        pollutant: raw.pollutant,
        label,
        unit: raw.unit,
        datasetId: raw.datasetId,
        limit: whole.limit,
        reason: whole.verdict.kind === 'none' ? whole.verdict.reason : null,
        first: raw.readings.size === 0 ? null : msStamp(first),
        last: raw.readings.size === 0 ? null : msStamp(last),
        years: summaries,
      })
    }
    stations.push({
      station,
      health: years.map(year => {
        // A series with no reading in the year is not a failure of the station
        // in that year, so the health leaves it out. A station with no reading
        // at all keeps every series, and its health is 0.
        const rows = yearRows.get(year)!
        const active = rows.filter(r => r.reported > 0)
        const h = stationHealth(active.length > 0 ? active : rows)
        return {
          year,
          expected: h.expected,
          reported: h.reported,
          longestOutage: h.longestOutage,
        }
      }),
      series,
    })
    for (const year of years) {
      const range = yearStamps(year)
      readings.set(readingsKey(station, year), {
        station,
        year,
        start: msStamp(range.first),
        end: msStamp(range.last),
        stepHours: 1,
        hours: yearHours(year),
        series: yearReads.get(year)!,
      })
    }
  }

  const overview: Overview = {
    project: PROJECT,
    source: {
      name: SOURCE_NAME,
      site: data.site,
      licence: data.licence,
      fetchedFirst: data.fetchedFirst,
      fetchedLast: data.fetchedLast,
      corrections: data.corrections,
    },
    window: { start, end, hours, timeNote: TIME_NOTE },
    years,
    stations,
  }
  return { overview, readings }
}
