export const PROJECT = 'NS Air Quality Dashboard'

export type Limit = {
  value: number
  unit: string
  averagingPeriod: string
  framework: string
  url: string
  officialValue: string
  converted: boolean
}

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

export type VerdictState = 'over' | 'within' | 'none' | 'nodata' | 'absent'

const VERDICT_RANK: Record<VerdictState, number> = {
  absent: 0,
  nodata: 1,
  none: 2,
  within: 3,
  over: 4,
}

export const worstVerdict = (verdicts: VerdictState[]) =>
  verdicts.reduce<VerdictState>(
    (worst, v) => (VERDICT_RANK[v] > VERDICT_RANK[worst] ? v : worst),
    'absent'
  )

export type Judgement = {
  verdict: VerdictState
  over: number
  judged: number
  unit: 'hours' | 'days' | null
  ratio: number | null
}

export type Outage = { hours: number; start: string; end: string }

export type StationHealth = {
  expected: number
  reported: number
  reportedShare: number
  longestOutage: (Outage & { pollutant: string }) | null
}

export type YearSummary = {
  year: number
  expected: number
  reported: number
  missing: number
  reportedShare: number
  gapCount: number
  longestOutage: Outage | null
  verdict: Verdict
  judgement: Judgement
}

export type SeriesOverview = {
  pollutant: string
  label: string
  unit: string
  datasetId: string
  first: string | null
  last: string | null
  years: YearSummary[]
}

export type YearHealth = StationHealth & { year: number }

export type YearVerdicts = {
  year: number
  verdict: VerdictState
  pollutants: Record<string, VerdictState>
}

export type StationOverview = {
  station: string
  county: string
  health: YearHealth[]
  verdicts: YearVerdicts[]
  series: SeriesOverview[]
}

export type CountyOverview = {
  county: string
  stations: string[]
  verdicts: Omit<YearVerdicts, 'verdict'>[]
}

export type Overview = {
  project: string
  source: {
    name: string
    site: string
    licence: { name: string; url: string }
    fetchedFirst: string
    fetchedLast: string
    corrections: string[]
  }
  window: { start: string; end: string; hours: number; timeNote: string }
  years: number[]
  pollutants: { code: string; label: string }[]
  stations: StationOverview[]
  counties: CountyOverview[]
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

export type StationReadings = {
  station: string
  year: number
  start: string
  end: string
  stepHours: 1
  hours: number
  series: SeriesReadings[]
}

export const readingsKey = (station: string, year: number) =>
  `${station}/${year}`

export const readingsPath = (station: string, year: number) =>
  `readings/${station}/${year}.json`
