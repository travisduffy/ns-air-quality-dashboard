import type { LoadedData, RawSeries } from './load.ts'
import { HOUR_MS, dayOf } from './time.ts'

export const DAY_MS = 24 * HOUR_MS

// The row order of the fabric sheet. Halifax sits above Halifax Johnston, the
// station that replaced it on 1 January 2018.
export const STATION_ORDER = [
  'Halifax',
  'Halifax Johnston',
  'Lake Major',
  'Kentville',
  'Aylesford',
  'Pictou',
  'Port Hawkesbury',
  'Sydney',
]

// The days of the data: from the day of the first stamp to the day of the
// last stamp, both inclusive.
export const dayWindow = (data: LoadedData) => {
  const firstDay = dayOf(data.startMs)
  const lastDay = dayOf(data.endMs)
  const firstDayMs = Date.parse(`${firstDay}T00:00:00Z`)
  const dayCount =
    (Date.parse(`${lastDay}T00:00:00Z`) - firstDayMs) / DAY_MS + 1
  return { firstDay, firstDayMs, dayCount }
}

export type DayWindow = ReturnType<typeof dayWindow>

// The index of the day that a stamp closes an hour of.
export const dayIndex = (ms: number, window: DayWindow) =>
  Math.floor((ms - HOUR_MS - window.firstDayMs) / DAY_MS)

export const dayAt = (index: number, window: DayWindow) =>
  new Date(window.firstDayMs + index * DAY_MS).toISOString().slice(0, 10)

export const stationRank = (station: string) => {
  const rank = STATION_ORDER.indexOf(station)
  if (rank < 0) {
    throw new Error(`station ${station} has no place in the station order`)
  }
  return rank
}

// The series of one pollutant that hold at least one reading, in station
// order. A dataset row with no value makes a series with no reading.
export const seriesOf = (data: LoadedData, pollutant: string) =>
  data.series
    .filter(s => s.pollutant === pollutant && s.readings.size > 0)
    .sort((a, b) => stationRank(a.station) - stationRank(b.station))

export const findSeries = (
  data: LoadedData,
  station: string,
  pollutant: string
) => {
  const found = seriesOf(data, pollutant).find(s => s.station === station)
  if (found === undefined) {
    throw new Error(`no ${pollutant} series at ${station}`)
  }
  return found
}

// The readings of a series, in stamp order.
export const sortedReadings = (series: RawSeries) =>
  [...series.readings].sort(([a], [b]) => a - b)

// Round half away from zero, to a fixed count of decimal places.
export const roundTo = (value: number, places: number) => {
  const scale = 10 ** places
  return (Math.sign(value) * Math.round(Math.abs(value) * scale)) / scale
}

// The least and the greatest of many numbers. A spread into Math.max fails on
// an array of this size, so the loop reads one value at a time.
export const extent = (values: Iterable<number>) => {
  let min = Infinity
  let max = -Infinity
  for (const v of values) {
    if (v < min) min = v
    if (v > max) max = v
  }
  return { min, max }
}
