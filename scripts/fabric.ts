import type {
  FabricRow,
  FabricStatistic,
  StationFabric,
} from '../shared/contract.ts'
import { HOUR_MS, dayOf, msStamp, yearHours } from '../shared/time.ts'
import {
  dailyMaxEightHour,
  percentile98,
  pollutantLabel,
  gridHours,
  toValues,
  type Derived,
} from './derive.ts'
import type { LoadedData, RawSeries } from './load.ts'
import { mergeFabrics } from './merge.ts'

const DAY_HOURS = 24

export const roundHundredth = (v: number) => Math.round(v * 100) / 100

const dailyBy = (
  values: (number | null)[],
  startMs: number,
  reduce: (hours: number[]) => number | null
) => {
  const byDay = new Map<string, number[]>()
  values.forEach((v, i) => {
    if (v === null) {
      return
    }
    const day = dayOf(startMs + i * HOUR_MS)
    const list = byDay.get(day)
    if (list === undefined) {
      byDay.set(day, [v])
      return
    }
    list.push(v)
  })
  return new Map([...byDay].map(([day, hours]) => [day, reduce(hours)]))
}

export const dailyValues = (
  data: LoadedData,
  raw: RawSeries
): { statistic: FabricStatistic; days: Map<string, number | null> } => {
  const values = toValues(
    raw.readings,
    data.startMs,
    gridHours(data.startMs, data.endMs)
  )
  const chosen = data.limits.get(raw.pollutant)
  if (chosen?.averagingHours === 8) {
    const daily = dailyMaxEightHour(values, data.startMs, chosen.limit)
    return {
      statistic: 'daily maximum 8-hour average',
      days: new Map(daily.map(d => [d.day, d.value])),
    }
  }
  if (chosen?.averagingHours === 1) {
    return {
      statistic: 'daily maximum hourly value',
      days: dailyBy(values, data.startMs, hours => Math.max(...hours)),
    }
  }
  return {
    statistic: 'daily mean',
    days: dailyBy(values, data.startMs, hours =>
      hours.length >= data.minCompleteHours
        ? hours.reduce((a, b) => a + b, 0) / hours.length
        : null
    ),
  }
}

const rowOf = (
  year: number,
  days: Map<string, number | null>,
  limit: number | null
): FabricRow => {
  const values: (number | null)[] = []
  const overDays: number[] = []
  for (let i = 0; i < yearHours(year) / DAY_HOURS; i++) {
    const value =
      days.get(msStamp(Date.UTC(year, 0, 1 + i)).slice(0, 10)) ?? null
    if (value !== null && limit !== null && value > limit) {
      overDays.push(i)
    }
    values.push(value === null ? null : roundHundredth(value))
  }
  return { year, values, overDays }
}

export const deriveFabrics = (data: LoadedData, derived: Derived) => {
  const daily = data.series.map(raw => ({ raw, ...dailyValues(data, raw) }))
  const fabrics: StationFabric[] = []
  for (const pollutant of derived.overview.pollutants) {
    const group = daily.filter(d => d.raw.pollutant === pollutant.code)
    const limit = data.limits.get(pollutant.code)?.limit ?? null
    const all = group.flatMap(d => [...d.days.values()]).filter(v => v !== null)
    const max = limit?.value ?? roundHundredth(percentile98(all) ?? 0)
    for (const { raw, statistic, days } of group) {
      fabrics.push({
        station: raw.station,
        pollutant: raw.pollutant,
        label: pollutantLabel(raw.pollutant),
        unit: raw.unit,
        statistic,
        limit,
        scale: { max },
        rows: derived.overview.years.map(year =>
          rowOf(year, days, limit?.value ?? null)
        ),
      })
    }
  }
  return mergeFabrics(fabrics, derived.overview.handovers)
}
