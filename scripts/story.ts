import type { Highlight, Story } from '../shared/contract.ts'
import { dailyMaxEightHour, dailyMeans, TRS_SPIKE_PPB } from './fabric.ts'
import type { LoadedData, RawSeries } from './load.ts'
import {
  dayAt,
  dayWindow,
  extent,
  findSeries,
  roundTo,
  seriesOf,
  sortedReadings,
} from './series.ts'
import { HOUR_MS, dayOf, yearHours, yearOf, yearStamps } from './time.ts'

// A day counts for the whole province when at least this many stations have
// a valid daily mean, the rule of the research of the story.
export const PROVINCE_MIN_STATIONS = 4

export const STORY_PLACES = 2

const SMOKE_YEAR = 2023
const TRS_YEARS = [2016, 2017, 2018, 2019, 2020, 2021, 2022, 2023, 2024, 2025]
const TRS_BEFORE = [2016, 2019]
const TRS_AFTER = [2020, 2025]

type StationDay = { station: string; day: string; value: number }

const limitOf = (data: LoadedData, pollutant: string) => {
  const chosen = data.limits.get(pollutant)
  if (chosen === undefined) throw new Error(`no limit chosen for ${pollutant}`)
  return chosen.limit.value
}

const mean = (values: number[]) =>
  values.reduce((sum, v) => sum + v, 0) / values.length

const percent = (part: number, whole: number) =>
  roundTo((part / whole) * 100, STORY_PLACES)

// The valid days of a set of daily rows, one entry for each station-day.
const stationDays = (
  rows: { station: string; values: (number | null)[] }[],
  data: LoadedData
) => {
  const window = dayWindow(data)
  return rows.flatMap(({ station, values }) =>
    values.flatMap((value, i) =>
      value === null ? [] : [{ station, day: dayAt(i, window), value }]
    )
  )
}

// The rise of the mean of the June hours of the smoke year above the mean of
// the June hours of every other year, pooled, in percent. A June hour is an
// hour of a day of June, by the day of the stamp.
const juneRise = (series: RawSeries) => {
  const smoke: number[] = []
  const others: number[] = []
  for (const [ms, value] of series.readings) {
    const day = dayOf(ms)
    if (day.slice(5, 7) !== '06') continue
    if (day.startsWith(`${SMOKE_YEAR}-`)) smoke.push(value)
    else others.push(value)
  }
  if (smoke.length === 0) return null
  return percent(mean(smoke) - mean(others), mean(others))
}

// The longest run of missing hours inside one year, between two readings.
const longestGapInYear = (series: RawSeries, year: number) => {
  const { first, last } = yearStamps(year)
  const stamps = sortedReadings(series)
    .map(([ms]) => ms)
    .filter(ms => ms >= first && ms <= last)
  let best = { hours: 0, startMs: first }
  for (let i = 1; i < stamps.length; i++) {
    const hours = (stamps[i]! - stamps[i - 1]!) / HOUR_MS - 1
    if (hours > best.hours) {
      best = { hours, startMs: stamps[i - 1]! + HOUR_MS }
    }
  }
  return best
}

const spikeHoursByYear = (series: RawSeries) => {
  const counts = new Map<number, number>(TRS_YEARS.map(y => [y, 0]))
  for (const [ms, value] of series.readings) {
    if (value < TRS_SPIKE_PPB) continue
    const year = yearOf(ms)
    counts.set(year, (counts.get(year) ?? 0) + 1)
  }
  return counts
}

const sumYears = (counts: Map<number, number>, [from, to]: number[]) =>
  TRS_YEARS.filter(y => y >= from! && y <= to!).reduce(
    (sum, y) => sum + counts.get(y)!,
    0
  )

// The pooled mean of every ozone reading of one month of the year.
const ozoneMonthMean = (data: LoadedData, month: number) => {
  let sum = 0
  let n = 0
  for (const s of seriesOf(data, 'O3')) {
    for (const [ms, value] of s.readings) {
      if (Number(dayOf(ms).slice(5, 7)) !== month) continue
      sum += value
      n++
    }
  }
  return roundTo(sum / n, STORY_PLACES)
}

// The share of the hours reported, where a series is expected to report every
// hour of each year in which it sent at least one reading.
const reportedShare = (data: LoadedData) => {
  let reported = 0
  let expected = 0
  for (const s of data.series) {
    const years = new Set<number>()
    for (const ms of s.readings.keys()) years.add(yearOf(ms))
    for (const year of years) expected += yearHours(year)
    reported += s.readings.size
  }
  return percent(reported, expected)
}

const byDayThenStation = (
  a: { station: string; day: string },
  b: { station: string; day: string }
) => (a.day < b.day ? -1 : a.day > b.day ? 1 : a.station < b.station ? -1 : 1)

export const deriveStory = (data: LoadedData): Story => {
  const window = dayWindow(data)
  const lastDay = dayAt(window.dayCount - 1, window)
  const pm25Limit = limitOf(data, 'PM2.5')
  const o3Limit = limitOf(data, 'O3')

  const pm25Series = seriesOf(data, 'PM2.5')
  const pm25Days = stationDays(
    pm25Series.map(s => ({
      station: s.station,
      values: dailyMeans(s, window, data.minCompleteHours),
    })),
    data
  )
  const o3Days = stationDays(
    seriesOf(data, 'O3').map(s => ({
      station: s.station,
      values: dailyMaxEightHour(s, window, data.startMs),
    })),
    data
  )
  const pm25Over = pm25Days.filter(d => d.value > pm25Limit)
  const o3Over = o3Days.filter(d => d.value > o3Limit)
  const judged = pm25Days.length + o3Days.length
  const over = pm25Over.length + o3Over.length

  const so2Max = extent(
    seriesOf(data, 'SO2').flatMap(s => [...s.readings.values()])
  ).max

  const ranked = [...pm25Days].sort(
    (a, b) => b.value - a.value || (a.day < b.day ? -1 : 1)
  )
  const top = (rank: number) => ranked[rank - 1]!

  const byDay = new Map<string, StationDay[]>()
  for (const d of pm25Days) byDay.set(d.day, [...(byDay.get(d.day) ?? []), d])
  const province = [...byDay]
    .filter(([, list]) => list.length >= PROVINCE_MIN_STATIONS)
    .map(([day, list]) => ({
      day,
      mean: mean(list.map(d => d.value)),
      stations: list.length,
    }))
    .sort((a, b) => b.mean - a.mean || (a.day < b.day ? -1 : 1))[0]!

  const rises = Object.fromEntries(
    pm25Series.flatMap(s => {
      const rise = juneRise(s)
      return rise === null ? [] : [[`c2_june2023_rise_${s.station}`, rise]]
    })
  )

  const johnston = findSeries(data, 'Halifax Johnston', 'PM2.5')
  const johnstonJune = [...johnston.readings.keys()].filter(ms =>
    dayOf(ms).startsWith(`${SMOKE_YEAR}-06`)
  ).length
  const gap = longestGapInYear(johnston, SMOKE_YEAR)
  // The Halifax row of chapter 6 starts on the first day after the last
  // report of Halifax, the day that Halifax Johnston took over.
  const halifaxLastMs = extent(
    data.series
      .filter(s => s.station === 'Halifax')
      .flatMap(s => [...s.readings.keys()])
  ).max
  const gapLastMs = gap.startMs + (gap.hours - 1) * HOUR_MS

  const pictou = findSeries(data, 'Pictou', 'TRS')
  const spikes = spikeHoursByYear(pictou)
  const spikeValues = Object.fromEntries(
    TRS_YEARS.map(y => [`c1_trs_hours_ge3_${y}`, spikes.get(y)!])
  )

  const stationDayText = (rank: number) =>
    `${top(rank).station} ${top(rank).day}`

  const values = {
    c14_o3_pm25_station_days_judged: judged,
    c14_o3_pm25_station_days_over: over,
    c14_o3_pm25_pct_over: percent(over, judged),
    c14_SO2_max_pct_of_limit: percent(so2Max, limitOf(data, 'SO2')),
    c4_station_days_judged: pm25Days.length,
    c4_station_days_gt27: pm25Over.length,
    c4_province_top1_day: province.day,
    c4_province_top1_mean: roundTo(province.mean, STORY_PLACES),
    c4_province_top1_stations: province.stations,
    c4_top1_station_day: stationDayText(1),
    c4_top2_station_day: stationDayText(2),
    c4_top3_station_day: stationDayText(3),
    c4_top4_station_day: stationDayText(4),
    c4_top1_daily_mean: roundTo(top(1).value, STORY_PLACES),
    c4_top2_daily_mean: roundTo(top(2).value, STORY_PLACES),
    c4_top3_daily_mean: roundTo(top(3).value, STORY_PLACES),
    c4_top4_daily_mean: roundTo(top(4).value, STORY_PLACES),
    ...rises,
    c2_halifax_johnston_pm25_june2023_readings: johnstonJune,
    ...spikeValues,
    c1_trs_hours_ge3_2016_2019: sumYears(spikes, TRS_BEFORE),
    c1_trs_hours_ge3_2020_2025: sumYears(spikes, TRS_AFTER),
    c3_o3_month_mean_3: ozoneMonthMean(data, 3),
    c3_o3_month_mean_9: ozoneMonthMean(data, 9),
    c5_pct_total: reportedShare(data),
    c2_halifax_johnston_pm25_longest_gap_2023_hours: gap.hours,
  }

  const allStations = pm25Series.map(s => s.station)
  const decade = { from: window.firstDay, to: lastDay }
  const mark = ({ station, day }: { station: string; day: string }) => ({
    station,
    day,
  })
  const juneFrom = `${SMOKE_YEAR}-06-01`
  const juneTo = `${SMOKE_YEAR}-06-30`
  // A station is in the June highlight when its record spans any of June.
  const juneStations = pm25Series
    .filter(s => {
      const { min, max } = extent(s.readings.keys())
      return dayOf(min) <= juneTo && dayOf(max) >= juneFrom
    })
    .map(s => s.station)
  const spikeDays = [
    ...new Set(
      [...pictou.readings]
        .filter(([, value]) => value >= TRS_SPIKE_PPB)
        .map(([ms]) => dayOf(ms))
    ),
  ].sort()

  // Chapter 4 marks each day with a spike hour. Chapter 6 marks the first and
  // the last day of the longest Halifax Johnston gap of 2023.
  const highlights: Highlight[] = [
    {
      layer: 'pm25',
      ...decade,
      stations: allStations,
      marks: [...pm25Over, ...o3Over].map(mark).sort(byDayThenStation),
    },
    {
      layer: 'pm25',
      ...decade,
      stations: allStations,
      marks: ranked.slice(0, pm25Over.length).map(mark),
    },
    { layer: 'pm25', from: juneFrom, to: juneTo, stations: juneStations },
    {
      layer: 'trs',
      ...decade,
      stations: [pictou.station],
      marks: spikeDays.map(day => ({ station: pictou.station, day })),
    },
    {
      layer: 'o3',
      ...decade,
      stations: seriesOf(data, 'O3').map(s => s.station),
      months: [3, 9],
    },
    {
      layer: 'pm25-hours',
      from: dayOf(halifaxLastMs + HOUR_MS),
      to: lastDay,
      stations: ['Halifax', johnston.station],
      marks: [
        { station: johnston.station, day: dayOf(gap.startMs) },
        { station: johnston.station, day: dayOf(gapLastMs) },
      ],
    },
  ]

  return {
    values: values as Story['values'],
    chapters: highlights.map((highlight, i) => ({
      chapter: (i + 1) as Story['chapters'][number]['chapter'],
      highlight,
    })),
  }
}
