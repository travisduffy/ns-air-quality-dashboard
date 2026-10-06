import type { SeriesSummary } from '../scripts/derive.ts'
import type { YearStation } from './years.ts'

// A series with no reading in the year has no verdict: 'nodata'.
export type Verdict = 'over' | 'within' | 'none' | 'nodata'
export type Station = YearStation

// Each station sits in one county of the Maritimes bitmap; the names are the
// sector names of its definition file.
export const STATION_COUNTY: Record<string, string> = {
  Halifax: 'Halifax, NS',
  'Halifax Johnston': 'Halifax, NS',
  'Lake Major': 'Halifax, NS',
  Pictou: 'Pictou, NS',
  Sydney: 'Cape Breton, NS',
  'Port Hawkesbury': 'Inverness, NS',
  Kentville: 'Kings, NS',
  Aylesford: 'Kings, NS',
}

const RANK: Record<Verdict, number> = {
  nodata: 0,
  none: 1,
  within: 2,
  over: 3,
}

export const getWorstVerdict = (verdicts: Verdict[]) =>
  verdicts.reduce<Verdict>(
    (worst, v) => (RANK[v] > RANK[worst] ? v : worst),
    'nodata'
  )

// The colors of the map: a county with a station takes its verdict, and the
// others take a tone for their place.
export const VERDICT_COLOR: Record<Verdict | 'idle' | 'outside', string> = {
  over: '#d9534f',
  within: '#4caf6a',
  none: '#e0b43c',
  nodata: '#d9cfc0',
  idle: '#c9d3d9',
  outside: '#7f8c95',
}

// The water of the map frame, which the sea sector of the bitmap takes.
export const SEA_COLOR = '#aebfca'

export const VERDICT_MARK: Record<Verdict, string> = {
  over: '▲',
  within: '●',
  none: '○',
  nodata: '–',
}

export const VERDICT_WORD: Record<Verdict, string> = {
  over: 'Over the limit',
  within: 'Within the limit',
  none: 'No official limit',
  nodata: 'No readings this year',
}

export const getSeriesVerdict = (series: SeriesSummary): Verdict => {
  if (series.reported === 0) {
    return 'nodata'
  }

  const verdict = series.verdict
  if (verdict.kind === 'none') {
    return 'none'
  }

  const over = verdict.kind === 'hourly' ? verdict.overHours : verdict.overDays
  return over > 0 ? 'over' : 'within'
}

export const getStationVerdict = (station: Station): Verdict =>
  getWorstVerdict(station.series.map(getSeriesVerdict))

export const isNovaScotia = (county: string) => county.endsWith(', NS')

export const getCountyColor = (
  county: string,
  verdict: Verdict | undefined
) => {
  // The bitmap paints the sea white and the land past the map black. Both take
  // the color of the water of the frame.
  if (county === 'Sea' || county === 'Outside the map') {
    return SEA_COLOR
  }
  if (!isNovaScotia(county)) {
    return VERDICT_COLOR.outside
  }
  return verdict === undefined ? VERDICT_COLOR.idle : VERDICT_COLOR[verdict]
}

// The verdict of each county that has a station, and the first station of each
// county in the given order. A station with no readings in the year gives way
// to the next station of its county that has some.
export const getCountyVerdicts = (
  stations: { station: string; verdict: Verdict }[]
) => {
  const out = new Map<string, { verdict: Verdict; first: string }>()
  for (const s of stations) {
    const county = STATION_COUNTY[s.station]
    if (county === undefined) {
      continue
    }
    const prev = out.get(county)
    out.set(
      county,
      prev === undefined
        ? { verdict: s.verdict, first: s.station }
        : {
            verdict: getWorstVerdict([prev.verdict, s.verdict]),
            first:
              prev.verdict === 'nodata' && s.verdict !== 'nodata'
                ? s.station
                : prev.first,
          }
    )
  }
  return out
}
