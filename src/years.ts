import type {
  Overview,
  SeriesOverview,
  StationHealth,
  VerdictState,
  YearSummary,
} from '../shared/contract.ts'

export const getDefaultYear = (overview: Overview) =>
  overview.years[overview.years.length - 1]!

export type YearPoint = {
  year: number
  verdict: VerdictState
  ratio: number | null
}

export type YearSeries = Omit<SeriesOverview, 'years'> &
  YearSummary & { points: YearPoint[] }

export type YearStation = {
  station: string
  county: string
  verdict: VerdictState
  verdicts: Record<string, VerdictState>
  health: StationHealth
  series: YearSeries[]
}

const findYear = <T extends { year: number }>(
  items: T[],
  year: number,
  owner: string
) => {
  const found = items.find(item => item.year === year)
  if (found === undefined) {
    throw new Error(`${owner} has no summary of ${year}`)
  }
  return found
}

export const getYearStations = (
  overview: Overview,
  year: number
): YearStation[] =>
  overview.stations.map(station => {
    const verdicts = findYear(station.verdicts, year, station.station)
    return {
      station: station.station,
      county: station.county,
      verdict: verdicts.verdict,
      verdicts: verdicts.pollutants,
      health: findYear(station.health, year, station.station),
      series: station.series.map(({ years, ...series }) => ({
        ...series,
        ...findYear(years, year, series.pollutant),
        points: years.map(y => ({
          year: y.year,
          verdict: y.judgement.verdict,
          ratio: y.judgement.ratio,
        })),
      })),
    }
  })

export type YearCounty = {
  county: string
  stations: string[]
  verdict: VerdictState
}

export const getYearCounties = (
  overview: Overview,
  year: number,
  pollutant: string
): YearCounty[] =>
  overview.counties.map(county => ({
    county: county.county,
    stations: county.stations,
    verdict: findYear(county.verdicts, year, county.county).pollutants[
      pollutant
    ],
  }))
