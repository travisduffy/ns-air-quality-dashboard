import {
  handoverSite,
  readingsKey,
  worstVerdict,
  type Handover,
  type StationFabric,
  type StationOverview,
  type StationReadings,
  type SeriesOverview,
} from '../shared/contract.ts'
import { getCounties, type Derived } from './derive.ts'

const FIRST_DAY = /^\d{4}-01-01$/

const check = (handover: Handover, names: string[]) => {
  const { name, oldSite, newSite, firstDay } = handover
  if (!FIRST_DAY.test(firstDay)) {
    throw new Error(`handover ${name} must start on a first of January`)
  }
  if (oldSite === newSite) {
    throw new Error(`handover ${name} names one site twice`)
  }
  for (const site of [oldSite, newSite]) {
    if (!names.includes(site)) {
      throw new Error(`handover ${name} names an unknown site: ${site}`)
    }
  }
  if (name !== oldSite && name !== newSite && names.includes(name)) {
    throw new Error(`handover ${name} is the name of another station`)
  }
}

const getEarliest = (a: string | null, b: string | null) =>
  a === null || b === null ? (a ?? b) : a < b ? a : b

const getLatest = (a: string | null, b: string | null) =>
  a === null || b === null ? (a ?? b) : a > b ? a : b

const mergeStation = (
  handover: Handover,
  old: StationOverview,
  next: StationOverview,
  derived: Derived
): StationOverview => {
  if (old.county !== next.county) {
    throw new Error(`handover ${handover.name} joins two counties`)
  }
  const { years, pollutants } = derived.overview
  const siteOf = (year: number) =>
    handoverSite(handover, year) === handover.newSite ? next : old
  const otherOf = (year: number) => (siteOf(year) === next ? old : next)

  const series = pollutants.flatMap(({ code }) => {
    const before = old.series.find(s => s.pollutant === code)
    const after = next.series.find(s => s.pollutant === code)
    const base = after ?? before
    if (base === undefined) {
      return []
    }
    const summaryOf = (site: StationOverview, year: number) =>
      site.series
        .find(s => s.pollutant === code)
        ?.years.find(y => y.year === year)
    const merged: SeriesOverview = {
      ...base,
      first: getEarliest(before?.first ?? null, after?.first ?? null),
      last: getLatest(before?.last ?? null, after?.last ?? null),
      years: years.map(
        year =>
          (summaryOf(siteOf(year), year) ?? summaryOf(otherOf(year), year))!
      ),
    }
    return [merged]
  })

  return {
    station: handover.name,
    county: old.county,
    health: years.map(year => siteOf(year).health.find(h => h.year === year)!),
    verdicts: years.map(year => {
      const judged = new Map(
        series.map(s => [
          s.pollutant,
          s.years.find(y => y.year === year)!.judgement.verdict,
        ])
      )
      return {
        year,
        verdict: worstVerdict([...judged.values()]),
        pollutants: Object.fromEntries(
          pollutants.map(p => [p.code, judged.get(p.code) ?? 'absent'])
        ),
      }
    }),
    series,
  }
}

const place = <T>(items: T[], gone: (item: T) => boolean, added: T[]) => {
  const index = items.findIndex(gone)
  return [
    ...items.slice(0, index),
    ...added,
    ...items.slice(index).filter(item => !gone(item)),
  ]
}

export const withHandovers = (
  derived: Derived,
  handovers: Handover[]
): Derived => {
  let { stations } = derived.overview
  const readings = new Map(derived.readings)
  for (const handover of handovers) {
    check(
      handover,
      stations.map(s => s.station)
    )
    const old = stations.find(s => s.station === handover.oldSite)!
    const next = stations.find(s => s.station === handover.newSite)!
    const gone = (s: StationOverview) =>
      s.station === old.station || s.station === next.station
    stations = place(stations, gone, [
      mergeStation(handover, old, next, derived),
    ])
    for (const year of derived.overview.years) {
      const from = readings.get(
        readingsKey(handoverSite(handover, year), year)
      )!
      for (const site of [handover.oldSite, handover.newSite]) {
        readings.delete(readingsKey(site, year))
      }
      const file: StationReadings = { ...from, station: handover.name }
      readings.set(readingsKey(handover.name, year), file)
    }
  }
  return {
    overview: {
      ...derived.overview,
      stations,
      counties: getCounties(
        stations,
        derived.overview.years,
        derived.overview.pollutants.map(p => p.code)
      ),
      handovers: [...derived.overview.handovers, ...handovers],
    },
    readings,
  }
}

export const mergeFabrics = (
  fabrics: StationFabric[],
  handovers: Handover[]
) => {
  let merged = fabrics
  for (const handover of handovers) {
    const of = (site: string) =>
      new Map(merged.filter(f => f.station === site).map(f => [f.pollutant, f]))
    const old = of(handover.oldSite)
    const next = of(handover.newSite)
    const gone = (f: StationFabric) =>
      f.station === handover.oldSite || f.station === handover.newSite
    const added = [...new Set([...old.keys(), ...next.keys()])].map(code => {
      const base = (next.get(code) ?? old.get(code))!
      const rowOf = (year: number) => {
        const own =
          handoverSite(handover, year) === handover.newSite
            ? next.get(code)
            : old.get(code)
        return (own ?? base).rows.find(r => r.year === year)!
      }
      return {
        ...base,
        station: handover.name,
        rows: base.rows.map(r => rowOf(r.year)),
      }
    })
    merged = place(merged, gone, added)
  }
  return merged
}
