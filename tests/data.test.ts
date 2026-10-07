import assert from 'node:assert/strict'
import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, relative } from 'node:path'
import { after, test } from 'node:test'
import { parseStations } from '../shared/contract.ts'
import { buildData } from '../scripts/build-data.ts'
import { readFetchRecord, sha256 } from '../scripts/manifest.ts'

// These tests read the raw files in data/raw, so they run only where the
// fetch put them.

const ROOT = join(import.meta.dirname, '..')
const DATA_DIR = join(ROOT, 'public', 'data')
const HOUR_MS = 3_600_000

const made: string[] = []
after(() => {
  for (const dir of made) rmSync(dir, { recursive: true, force: true })
})

const hashTree = (dir: string) =>
  Object.fromEntries(
    readdirSync(dir, { recursive: true, withFileTypes: true })
      .filter(entry => entry.isFile())
      .map(entry => {
        const path = join(entry.parentPath, entry.name)
        return [relative(dir, path), sha256(readFileSync(path))]
      })
      .sort(([a], [b]) => (a! < b! ? -1 : 1))
  )

// A second route to the coverage of one station, apart from the loader: it
// reads each raw page, keeps the rows of the station that hold a value, and
// counts the distinct hours of each series.
const rawCoverage = (station: string) => {
  const hours = new Set<string>()
  const pollutants = new Set<string>()
  let firstMs = Infinity
  let lastMs = -Infinity
  for (const entry of readFetchRecord(ROOT)) {
    if (!/\/page-\d+\.json$/.test(entry.file)) continue
    const rows = JSON.parse(
      readFileSync(join(ROOT, entry.file), 'utf8')
    ) as Record<string, string | undefined>[]
    for (const row of rows) {
      if (row.station !== station) continue
      if (row.average === undefined || row.average.trim() === '') continue
      const ms = Date.parse(`${row.date_time!.slice(0, 13)}:00:00Z`)
      hours.add(`${row.pollutant} ${ms}`)
      pollutants.add(row.pollutant!)
      firstMs = Math.min(firstMs, ms)
      lastMs = Math.max(lastMs, ms)
    }
  }
  const expected = ((lastMs - firstMs) / HOUR_MS + 1) * pollutants.size
  return { reported: hours.size, expected }
}

test('Halifax coverage from the raw rows agrees with stations.json', () => {
  const raw = rawCoverage('Halifax')
  const stations = parseStations(
    JSON.parse(readFileSync(join(DATA_DIR, 'stations.json'), 'utf8'))
  )
  const halifax = stations.find(s => s.name === 'Halifax')!
  assert.equal(raw.reported, halifax.reportedHours)
  assert.equal(raw.expected, halifax.expectedHours)
  assert.equal(((raw.reported / raw.expected) * 100).toFixed(2), '97.93')
})

test('two builds give the same bytes, equal to public/data', () => {
  const first = mkdtempSync(join(tmpdir(), 'aqd-build-'))
  const second = mkdtempSync(join(tmpdir(), 'aqd-build-'))
  made.push(first, second)
  buildData(ROOT, first)
  buildData(ROOT, second)
  const hashes = hashTree(first)
  assert.equal(Object.keys(hashes).length, 6)
  assert.deepEqual(hashTree(second), hashes)
  assert.deepEqual(hashTree(DATA_DIR), hashes)
})
