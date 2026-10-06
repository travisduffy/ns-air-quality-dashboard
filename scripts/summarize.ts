import {
  judge,
  normalizeUnit,
  type Limit,
  type Reading,
  type Result,
} from '../src/judge.ts'
import { STATION_COUNTIES } from '../src/stations.ts'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = join(import.meta.dirname, '..')
const YEAR = '2025'

type Row = {
  date_time: string
  pollutant: string
  unit: string
  station: string
  average?: string
}

type SourceLimit = {
  pollutant: string
  value: number | null
  unit: string
  averagingHours: number | null
  framework: string
  url: string
}

const readJson = (path: string) =>
  JSON.parse(readFileSync(join(ROOT, path), 'utf8'))

const main = () => {
  const record = readJson('data/fetch-record.json')
  const source = readJson('data/limits.json')

  // A limit with no value has no official number to judge against, such as
  // TRS, NO, and NOX. The dashboard lists them as not judged.
  const limits: Limit[] = []
  for (const limit of source.limits as SourceLimit[]) {
    if (limit.value === null || limit.averagingHours === null) continue
    limits.push({
      id: `${limit.pollutant}-${limit.averagingHours}h-${limits.length}`,
      pollutant: limit.pollutant,
      value: limit.value,
      unit: normalizeUnit(limit.unit),
      hours: limit.averagingHours,
      framework: limit.framework,
      url: limit.url,
    })
  }

  const series = new Map<string, Reading[]>()
  const units = new Map<string, string>()
  for (const file of record.files) {
    if (!file.file.includes('/page-')) continue

    for (const row of readJson(file.file) as Row[]) {
      if (row.average === undefined || !row.date_time.startsWith(YEAR)) continue
      if (!(row.station in STATION_COUNTIES)) {
        throw new Error(`station with no county: ${row.station}`)
      }

      const key = `${row.station}|${row.pollutant}`
      const readings = series.get(key) ?? []
      readings.push({ time: row.date_time, value: Number(row.average) })
      series.set(key, readings)
      units.set(row.pollutant, normalizeUnit(row.unit))
    }
  }

  const stations = new Map<
    string,
    { name: string; county: string; results: Result[] }
  >()
  for (const [key, readings] of series) {
    const [name, pollutant] = key.split('|')
    const station = stations.get(name) ?? {
      name,
      county: STATION_COUNTIES[name],
      results: [],
    }
    stations.set(name, station)

    for (const limit of limits) {
      if (limit.pollutant !== pollutant) continue
      // A unit mismatch would judge a reading against the wrong number.
      if (limit.unit !== units.get(pollutant)) {
        throw new Error(`unit mismatch for ${pollutant}: ${limit.unit}`)
      }
      station.results.push(judge(readings, limit))
    }
  }

  const summary = {
    year: YEAR,
    limits,
    notJudged: source.limits
      .filter((limit: SourceLimit) => limit.value === null)
      .map((limit: SourceLimit) => limit.pollutant),
    stations: [...stations.values()].sort((a, b) =>
      a.name.localeCompare(b.name)
    ),
  }
  writeFileSync(
    join(ROOT, 'public/summary.json'),
    `${JSON.stringify(summary)}\n`
  )
  console.log(`summary: ${stations.size} stations, ${limits.length} limits`)
}

main()
