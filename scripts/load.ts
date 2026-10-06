import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { chosenLimits } from './limit-choice.ts'
import { msStamp, stampMs, yearOf } from './time.ts'

export type Limit = {
  value: number
  unit: string
  averagingPeriod: string
  framework: string
  url: string
  officialValue: string
  converted: boolean
}

export type ChosenLimit = { limit: Limit; averagingHours: number }

export type RawSeries = {
  station: string
  pollutant: string
  unit: string
  datasetId: string
  // Epoch ms of the stamp read as a naive time (UTC), to the reading. A
  // missing hour has no entry.
  readings: Map<number, number>
}

export type LoadedData = {
  since: string
  startMs: number
  endMs: number
  site: string
  licence: { name: string; url: string }
  fetchedFirst: string
  fetchedLast: string
  series: RawSeries[]
  limits: Map<string, ChosenLimit>
  minCompleteHours: number
  // One sentence for each correction that the loader made to the source rows.
  corrections: string[]
}

type FileEntry = {
  file: string
  datasetId: string | null
  name?: string | null
  url: string
  fetchedAt: string
  rows: number | null
  bytes: number
  sha256: string
}

// A station name that the source misspells in one dataset. Each entry is read
// as the station on the right. A change here is a decision about the data, and
// the page lists it under About this data.
export const STATION_ALIASES: Record<string, string> = {
  Alyesford: 'Aylesford',
}

// The pollutants that the name of a dataset lists in its parentheses, such as
// "(NOx, NO2, NO)", in upper case. Null when the name lists none.
export const datasetPollutants = (name: string | null | undefined) => {
  const found = /\(([^)]*)\)/.exec(name ?? '')
  if (found === null) return null
  return new Set(found[1]!.split(',').map(p => p.trim().toUpperCase()))
}

type Correction = {
  kind: 'alias' | 'pollutant' | 'seconds' | 'conflict'
  dataset: string
  from: string
  to: string
  rows: number
  first: number
  last: number
}

const correctionText = (c: Correction) => {
  const a = yearOf(c.first)
  const b = yearOf(c.last)
  const when = a === b ? `in ${a}` : `from ${a} to ${b}`
  const hours = `${c.rows.toLocaleString('en-CA')} ${c.rows === 1 ? 'hour' : 'hours'}`
  if (c.kind === 'conflict') {
    return `The dataset "${c.dataset}" lists two different values for the same hour in ${hours} of ${c.from} ${when}. No value is chosen, and those hours show as missing.`
  }
  if (c.kind === 'seconds') {
    return `The dataset "${c.dataset}" lists ${hours} ${when} with seconds after the hour in the stamp. Each is read as the hour, and no other row holds that hour.`
  }
  return c.kind === 'alias'
    ? `The dataset "${c.dataset}" lists ${hours} ${when} under the station name "${c.from}". They are read as ${c.to}.`
    : `The dataset "${c.dataset}" lists ${hours} ${when} under the pollutant ${c.from}, which the dataset does not hold. These rows are left out, and the hours show as missing.`
}

// The two spellings of the PM2.5 unit name one unit. Only the display label is
// normalized.
export const normalizeUnit = (unit: string) => unit.replace(/[µμ]/g, 'u')

export const parseStamp = (stamp: unknown, where: string) => {
  if (
    typeof stamp !== 'string' ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:00:\d{2}(\.000)?$/.test(stamp)
  ) {
    throw new Error(`${where}: bad date_time ${JSON.stringify(stamp)}`)
  }
  // A few seconds after the hour read as the hour. The loader lists each such
  // row as a correction.
  const ms = stampMs(stamp.slice(0, 14) + '00:00')
  if (Number.isNaN(ms)) throw new Error(`${where}: bad date_time ${stamp}`)
  return ms
}

const readJson = (path: string): unknown =>
  JSON.parse(readFileSync(path, 'utf8'))

const asString = (v: unknown, where: string) => {
  if (typeof v !== 'string' || v === '') {
    throw new Error(`${where}: expected a non-empty string`)
  }
  return v
}

const loadLimits = (root: string) => {
  const file = readJson(join(root, 'data', 'limits.json')) as {
    limits: Record<string, unknown>[]
    dailyCompleteness: { minHours: number }
  }
  const limits = new Map<string, ChosenLimit>()
  for (const c of chosenLimits) {
    const hits = file.limits.filter(
      l =>
        l.pollutant === c.pollutant &&
        l.framework === c.framework &&
        l.averagingHours === c.averagingHours
    )
    const key = `${c.pollutant} ${c.framework} ${c.averagingHours}`
    if (hits.length !== 1) {
      throw new Error(
        `limit choice not found exactly once in data/limits.json: ${key}`
      )
    }
    const l = hits[0]!
    if (typeof l.value !== 'number') {
      throw new Error(`limit choice has no value: ${key}`)
    }
    if (typeof l.officialText !== 'string' || l.officialText === '') {
      throw new Error(`limit choice has no quote: ${key}`)
    }
    const limit: Limit = {
      value: l.value,
      unit: asString(l.unit, key),
      averagingPeriod: asString(l.averagingPeriod, key),
      framework: c.framework,
      url: asString(l.url, key),
      officialValue: asString(l.officialValue, key),
      converted: l.converted === true,
    }
    limits.set(c.pollutant, { limit, averagingHours: c.averagingHours })
  }
  const minHours = file.dailyCompleteness?.minHours
  if (!Number.isInteger(minHours) || minHours <= 0) {
    throw new Error('data/limits.json: bad dailyCompleteness.minHours')
  }
  return { limits, minCompleteHours: minHours }
}

// Read the fetch record and the raw pages under root. Every page is checked
// against the size and hash of the record, and every row is validated. A bad
// row or a repeat that differs throws.
export const loadData = (root: string): LoadedData => {
  const record = readJson(join(root, 'data', 'fetch-record.json')) as {
    since: string
    files: FileEntry[]
  }
  const startMs = parseStamp(record.since, 'fetch-record since')

  const fetched = record.files.map(f => f.fetchedAt).sort()
  const fetchedFirst = fetched[0]
  const fetchedLast = fetched[fetched.length - 1]
  if (fetchedFirst === undefined || fetchedLast === undefined) {
    throw new Error('fetch record lists no file')
  }

  let site: string | null = null
  let licence: { name: string; url: string } | null = null
  const seriesMap = new Map<string, RawSeries>()
  let endMs = -Infinity
  // The raw text of each row by dataset, series, and hour, to tell an
  // identical repeat from one that differs.
  const seen = new Map<string, string>()
  const conflicted = new Set<string>()
  const corrections = new Map<string, Correction>()
  const correct = (
    c: Omit<Correction, 'rows' | 'first' | 'last'>,
    ms: number
  ) => {
    const key = `${c.kind}\u0000${c.dataset}\u0000${c.from}`
    const found = corrections.get(key)
    if (found === undefined) {
      corrections.set(key, { ...c, rows: 1, first: ms, last: ms })
    } else {
      found.rows++
      found.first = Math.min(found.first, ms)
      found.last = Math.max(found.last, ms)
    }
  }

  for (const f of record.files) {
    if (f.datasetId === null) continue
    const id = f.datasetId
    const origin = new URL(f.url).origin
    if (site === null) site = origin
    else if (site !== origin) {
      throw new Error(`dataset ${id}: site ${origin} differs from ${site}`)
    }

    if (f.file.endsWith('/metadata.json')) {
      const meta = readJson(join(root, f.file)) as {
        license?: { name?: string; termsLink?: string }
      }
      const l = {
        name: asString(meta.license?.name, `dataset ${id} licence name`),
        url: asString(meta.license?.termsLink, `dataset ${id} licence link`),
      }
      if (licence === null) licence = l
      else if (licence.name !== l.name || licence.url !== l.url) {
        throw new Error(
          `dataset ${id}: licence differs from the other datasets`
        )
      }
      continue
    }
    if (!/\/page-\d+\.json$/.test(f.file)) continue

    const bytes = readFileSync(join(root, f.file))
    if (bytes.length !== f.bytes) {
      throw new Error(
        `dataset ${id}: ${f.file} has ${bytes.length} bytes, the record says ${f.bytes}`
      )
    }
    const sha = createHash('sha256').update(bytes).digest('hex')
    if (sha !== f.sha256) {
      throw new Error(
        `dataset ${id}: ${f.file} does not match its sha256 in the fetch record`
      )
    }
    const rows = JSON.parse(bytes.toString('utf8')) as Record<string, unknown>[]
    if (!Array.isArray(rows)) {
      throw new Error(`dataset ${id}: ${f.file} is not a list of rows`)
    }
    if (f.rows !== rows.length) {
      throw new Error(
        `dataset ${id}: ${f.file} has ${rows.length} rows, the record says ${f.rows}`
      )
    }

    for (const row of rows) {
      const where = `dataset ${id}`
      const ms = parseStamp(row.date_time, where)
      if (ms < startMs) {
        throw new Error(
          `${where}: row at ${row.date_time} is before the window start`
        )
      }
      const given = asString(row.station, `${where} station`)
      const station = STATION_ALIASES[given] ?? given
      const pollutant = asString(row.pollutant, `${where} pollutant`)
      const unit = normalizeUnit(asString(row.unit, `${where} unit`))
      const dataset = f.name ?? id
      if (!/:00:00(\.000)?$/.test(String(row.date_time))) {
        correct({ kind: 'seconds', dataset, from: 'seconds', to: '' }, ms)
      }
      if (station !== given) {
        correct({ kind: 'alias', dataset, from: given, to: station }, ms)
      }
      const listed = datasetPollutants(f.name)
      if (listed !== null && !listed.has(pollutant.toUpperCase())) {
        correct({ kind: 'pollutant', dataset, from: pollutant, to: '' }, ms)
        continue
      }
      if (ms > endMs) endMs = ms

      const key = `${station}\u0000${pollutant}`
      let s = seriesMap.get(key)
      if (s === undefined) {
        s = { station, pollutant, unit, datasetId: id, readings: new Map() }
        seriesMap.set(key, s)
      } else if (s.datasetId !== id) {
        throw new Error(
          `series ${station} ${pollutant} appears in datasets ${s.datasetId} and ${id}`
        )
      } else if (s.unit !== unit) {
        throw new Error(
          `${where}: series ${station} ${pollutant} has the units ${s.unit} and ${unit}`
        )
      }

      const text = JSON.stringify(
        Object.entries(row).sort(([a], [b]) => (a < b ? -1 : 1))
      )
      const seenKey = `${id}\u0000${key}\u0000${ms}`
      const before = seen.get(seenKey)
      if (before !== undefined) {
        // Two different values for one hour: neither is the true one, so the
        // hour is missing.
        if (before !== text && !conflicted.has(seenKey)) {
          conflicted.add(seenKey)
          s.readings.delete(ms)
          correct(
            {
              kind: 'conflict',
              dataset,
              from: `${station} ${pollutant}`,
              to: '',
            },
            ms
          )
        }
        continue
      }
      seen.set(seenKey, text)

      const avg = row.average
      if (avg === undefined || avg === null || avg === '') continue
      const value = typeof avg === 'string' ? Number(avg) : NaN
      if (
        typeof avg !== 'string' ||
        avg.trim() === '' ||
        !Number.isFinite(value)
      ) {
        throw new Error(
          `${where}: average ${JSON.stringify(avg)} at ${msStamp(ms)} is not a number`
        )
      }
      s.readings.set(ms, value)
    }
  }

  if (site === null || licence === null) {
    throw new Error('fetch record lists no dataset with a licence')
  }
  if (!Number.isFinite(endMs)) throw new Error('the raw files hold no row')
  const { limits, minCompleteHours } = loadLimits(root)
  const series = [...seriesMap.values()]
  return {
    since: msStamp(startMs),
    startMs,
    endMs,
    site,
    licence,
    fetchedFirst,
    fetchedLast,
    series,
    limits,
    minCompleteHours,
    corrections: [...corrections.values()]
      .sort((x, y) => (x.dataset + x.from < y.dataset + y.from ? -1 : 1))
      .map(correctionText),
  }
}
