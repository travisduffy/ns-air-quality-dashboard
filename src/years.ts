import type {
  Overview,
  SeriesOverview,
  SeriesSummary,
  StationHealth,
  Verdict,
} from '../scripts/derive.ts'
import { yearHours } from '../scripts/time.ts'

// The newest year is the one that the page shows first.
export const getDefaultYear = (overview: Overview) =>
  overview.years[overview.years.length - 1]!

// One year of one series: its highest value as a share of the limit, or null
// when it has none. The year with no reading has none, and it is missing.
export type YearPoint = {
  year: number
  ratio: number | null
  reported: number
  expected: number
}

export type YearSeries = SeriesSummary & { points: YearPoint[] }

export type YearStation = {
  station: string
  health: StationHealth
  series: YearSeries[]
}

const getVerdict = (series: SeriesOverview, year: number): Verdict => {
  const found = series.years.find(y => y.year === year)
  if (found === undefined) {
    throw new Error(`${series.pollutant} has no summary of ${year}`)
  }
  const verdict = found.verdict
  if (verdict.kind === 'none' || series.limit === null) {
    return { kind: 'none', reason: series.reason ?? '' }
  }
  return { ...verdict, limit: series.limit }
}

export const getRatio = (series: SeriesOverview, year: number) => {
  const found = series.years.find(y => y.year === year)
  const verdict = found?.verdict
  if (
    verdict === undefined ||
    verdict.kind === 'none' ||
    series.limit === null ||
    verdict.maxValue === null
  ) {
    return null
  }
  return verdict.maxValue / series.limit.value
}

// The stations as one year shows them: each series with its counts and its
// verdict of that year, and the ten-year points for the strip.
export const getYearStations = (
  overview: Overview,
  year: number
): YearStation[] => {
  const expected = yearHours(year)
  return overview.stations.map(station => {
    const series = station.series.map((s): YearSeries => {
      const found = s.years.find(y => y.year === year)
      if (found === undefined) {
        throw new Error(`${s.pollutant} has no summary of ${year}`)
      }
      return {
        pollutant: s.pollutant,
        label: s.label,
        unit: s.unit,
        datasetId: s.datasetId,
        expected,
        reported: found.reported,
        missing: expected - found.reported,
        reportedShare: found.reported / expected,
        gapCount: found.gapCount,
        longestOutage: found.longestOutage,
        verdict: getVerdict(s, year),
        points: s.years.map(y => ({
          year: y.year,
          ratio: getRatio(s, y.year),
          reported: y.reported,
          expected: yearHours(y.year),
        })),
      }
    })
    const health = station.health.find(h => h.year === year)
    if (health === undefined) {
      throw new Error(`${station.station} has no health of ${year}`)
    }
    return {
      station: station.station,
      series,
      health: {
        expected: health.expected,
        reported: health.reported,
        reportedShare:
          health.expected === 0 ? 0 : health.reported / health.expected,
        longestOutage: health.longestOutage,
      },
    }
  })
}
