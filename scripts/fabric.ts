import type { FabricLayer } from '../shared/contract.ts'
import type { LoadedData, RawSeries } from './load.ts'
import {
  dayIndex,
  dayWindow,
  roundTo,
  seriesOf,
  type DayWindow,
} from './series.ts'
import { HOUR_MS } from './time.ts'

export const LAYER_POLLUTANT = { pm25: 'PM2.5', o3: 'O3', trs: 'TRS' } as const

// The CAAQS rule of a valid 8-hour ozone average and of a valid day.
export const MIN_8H_READINGS = 6
export const MIN_8H_PER_DAY = 18

// No official ppb limit exists for TRS. A spike is an hour at or above this
// line, the line of the research of the story.
export const TRS_SPIKE_PPB = 3

export const VALUE_PLACES = 2

// The hours reported on each day of the window.
export const dailyHours = (series: RawSeries, window: DayWindow) => {
  const hours = new Array<number>(window.dayCount).fill(0)
  for (const ms of series.readings.keys()) hours[dayIndex(ms, window)]!++
  return hours
}

// The mean of each day with at least minHours readings, else null.
export const dailyMeans = (
  series: RawSeries,
  window: DayWindow,
  minHours: number
) => {
  const sums = new Array<number>(window.dayCount).fill(0)
  for (const [ms, value] of series.readings)
    sums[dayIndex(ms, window)]! += value
  const hours = dailyHours(series, window)
  return hours.map((n, i) => (n >= minHours ? sums[i]! / n : null))
}

// The greatest valid 8-hour average that ends in each day, valid with at
// least 18 valid averages. An average ends at hour J and holds hours J-7 to
// J, valid with at least 6 readings. Hours before the window count as missing.
export const dailyMaxEightHour = (
  series: RawSeries,
  window: DayWindow,
  startMs: number
) => {
  const hourCount = window.dayCount * 24
  const grid = new Array<number | null>(hourCount).fill(null)
  for (const [ms, value] of series.readings) {
    grid[(ms - startMs) / HOUR_MS] = value
  }
  const maxes = new Array<number | null>(window.dayCount).fill(null)
  const valid = new Array<number>(window.dayCount).fill(0)
  for (let j = 0; j < hourCount; j++) {
    let sum = 0
    let n = 0
    for (let k = Math.max(0, j - 7); k <= j; k++) {
      const value = grid[k]
      if (value === null || value === undefined) continue
      sum += value
      n++
    }
    if (n < MIN_8H_READINGS) continue
    const day = dayIndex(startMs + j * HOUR_MS, window)
    valid[day]!++
    maxes[day] = Math.max(maxes[day] ?? -Infinity, sum / n)
  }
  return maxes.map((max, i) => (valid[i]! >= MIN_8H_PER_DAY ? max : null))
}

// The hours at or above the spike line on each day with a reading, else null.
export const dailySpikeHours = (series: RawSeries, window: DayWindow) => {
  const spikes = new Array<number>(window.dayCount).fill(0)
  for (const [ms, value] of series.readings) {
    if (value >= TRS_SPIKE_PPB) spikes[dayIndex(ms, window)]!++
  }
  const hours = dailyHours(series, window)
  return hours.map((n, i) => (n > 0 ? spikes[i]! : null))
}

export const dailyValues = (
  data: LoadedData,
  layer: FabricLayer['layer'],
  series: RawSeries,
  window: DayWindow
) => {
  if (layer === 'pm25') {
    return dailyMeans(series, window, data.minCompleteHours)
  }
  if (layer === 'o3') {
    return dailyMaxEightHour(series, window, data.startMs)
  }
  return dailySpikeHours(series, window)
}

const layerLimit = (data: LoadedData, layer: FabricLayer['layer']) => {
  if (layer === 'trs') return null
  const chosen = data.limits.get(LAYER_POLLUTANT[layer])
  if (chosen === undefined) {
    throw new Error(`no limit chosen for ${LAYER_POLLUTANT[layer]}`)
  }
  return chosen.limit.value
}

export const deriveLayer = (
  data: LoadedData,
  layer: FabricLayer['layer']
): FabricLayer => {
  const window = dayWindow(data)
  const series = seriesOf(data, LAYER_POLLUTANT[layer])
  const units = new Set(series.map(s => s.unit))
  if (units.size !== 1) {
    throw new Error(`the ${layer} series have the units ${[...units]}`)
  }

  return {
    layer,
    firstDay: window.firstDay,
    dayCount: window.dayCount,
    unit:
      layer === 'trs'
        ? `hours at or above ${TRS_SPIKE_PPB} ${[...units][0]}`
        : [...units][0]!,
    limit: layerLimit(data, layer),
    stations: series.map(s => ({
      station: s.station,
      values: dailyValues(data, layer, s, window).map(v =>
        v === null ? null : roundTo(v, VALUE_PLACES)
      ),
      hours: dailyHours(s, window),
    })),
  }
}
