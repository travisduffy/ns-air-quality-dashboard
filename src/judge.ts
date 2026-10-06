export type Reading = { time: string; value: number }

export type Limit = {
  id: string
  pollutant: string
  value: number
  unit: string
  hours: number
  framework: string
  url: string
}

export type Result = {
  limitId: string
  peak: number | null
  over: number
  periods: number
}

export type Band = 'none' | 'low' | 'mid' | 'over'

export const BAND_COLORS = {
  none: '#9aa3ad',
  low: '#2e9e5b',
  mid: '#e5b43c',
  over: '#d64541',
}

// Rules of the official guidance: an 8-hour average needs 6 of its 8 hours,
// and a daily average needs 18 of its 24 hours.
const MIN_HOURS_8H = 6
const MIN_HOURS_DAY = 18
const HOUR_MS = 3_600_000

export const normalizeUnit = (unit: string) => unit.replace('µ', 'u')

const roundTenth = (value: number) => Math.round(value * 10) / 10

const average = (values: number[]) =>
  values.reduce((sum, value) => sum + value, 0) / values.length

const summarize = (limitId: string, values: number[], limit: number) => ({
  limitId,
  peak: values.length ? roundTenth(Math.max(...values)) : null,
  over: values.filter(value => value > limit).length,
  periods: values.length,
})

// The source times carry no zone, so each one is read as UTC. That keeps the
// hour arithmetic exact and the calendar day equal to the day in the source.
const toMs = (time: string) => Date.parse(`${time.slice(0, 19)}Z`)

export const dailyAverages = (readings: Reading[]) => {
  const days = new Map<string, number[]>()
  for (const reading of readings) {
    const day = reading.time.slice(0, 10)
    const values = days.get(day) ?? []
    values.push(reading.value)
    days.set(day, values)
  }

  const averages: number[] = []
  for (const values of days.values()) {
    if (values.length < MIN_HOURS_DAY) continue
    averages.push(average(values))
  }
  return averages
}

export const dailyMax8h = (readings: Reading[]) => {
  const byHour = new Map<number, number>()
  for (const reading of readings) byHour.set(toMs(reading.time), reading.value)

  const days = new Map<string, number>()
  for (const [endMs] of byHour) {
    const window: number[] = []
    for (let i = 0; i < 8; i++) {
      const value = byHour.get(endMs - i * HOUR_MS)
      if (value !== undefined) window.push(value)
    }
    if (window.length < MIN_HOURS_8H) continue

    const day = new Date(endMs).toISOString().slice(0, 10)
    days.set(day, Math.max(days.get(day) ?? -Infinity, average(window)))
  }
  return [...days.values()]
}

export const judge = (readings: Reading[], limit: Limit): Result => {
  if (limit.hours === 1) {
    const values = readings.map(reading => reading.value)
    return summarize(limit.id, values, limit.value)
  }
  if (limit.hours === 8) {
    return summarize(limit.id, dailyMax8h(readings), limit.value)
  }
  if (limit.hours === 24) {
    return summarize(limit.id, dailyAverages(readings), limit.value)
  }
  throw new Error(`no rule for a ${limit.hours}-hour limit: ${limit.id}`)
}

export const getBand = (ratio: number | null): Band => {
  if (ratio === null) {
    return 'none'
  }
  if (ratio > 1) {
    return 'over'
  }
  return ratio >= 0.5 ? 'mid' : 'low'
}
