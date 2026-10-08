import assert from 'node:assert/strict'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'
import { derive } from '../scripts/derive.ts'
import { deriveFabrics, roundHundredth } from '../scripts/fabric.ts'
import { HANDOVERS } from '../scripts/handovers.ts'
import { loadCounties, loadData, type LoadedData } from '../scripts/load.ts'
import { withHandovers } from '../scripts/merge.ts'
import {
  fabricPath,
  type Limit,
  type StationFabric,
} from '../shared/contract.ts'
import { HOUR_MS } from '../shared/time.ts'

const ROOT = new URL('..', import.meta.url).pathname
const PUBLIC = join(ROOT, 'public')
const MAX_FABRIC_BYTES = 60_000
const DAY_HOURS = 24
const START_MS = Date.UTC(2016, 0, 1) + HOUR_MS
const END_MS = Date.UTC(2017, 0, 1)

const readJson = (path: string) => JSON.parse(readFileSync(path, 'utf8'))

const limit = (value: number): Limit => ({
  value,
  unit: 'ppb',
  averagingPeriod: 'test',
  framework: 'test',
  url: 'https://example.invalid',
  officialValue: String(value),
  converted: false,
})

const fillDay = (
  readings: Map<number, number>,
  day: number,
  count: number,
  value: (hour: number) => number
) => {
  for (let k = 0; k < count; k++) {
    readings.set(START_MS + (day * DAY_HOURS + k) * HOUR_MS, value(k))
  }
}

const fixture = (
  series: [string, number | null, Map<number, number>][]
): LoadedData => ({
  since: '2016-01-01',
  startMs: START_MS,
  endMs: END_MS,
  site: 'test',
  licence: { name: 'test', url: 'https://example.invalid' },
  fetchedFirst: '2016-01-01',
  fetchedLast: '2017-01-01',
  series: series.map(([pollutant, , readings]) => ({
    station: 'Test',
    pollutant,
    unit: 'ppb',
    datasetId: 'test',
    readings,
  })),
  limits: new Map(
    series.flatMap(([pollutant, hours]) =>
      hours === null
        ? []
        : [[pollutant, { limit: limit(27), averagingHours: hours }] as const]
    )
  ),
  minCompleteHours: 18,
  corrections: [],
})

const fabricsOf = (data: LoadedData) =>
  deriveFabrics(data, derive(data, { Test: 'Test County' }))

const loaded = loadData(ROOT)
const derived = withHandovers(
  derive(loaded, loadCounties(ROOT, loaded)),
  HANDOVERS
)

test('a daily value from the fabric file equals the mean of the hourly values of the readings file', () => {
  const [year, station] = [2023, 'Aylesford']
  const fabric: StationFabric = readJson(
    join(PUBLIC, fabricPath(station, 'PM2.5'))
  )
  const readings = readJson(join(PUBLIC, 'readings', station, `${year}.json`))
  const hourly: (number | null)[] = readings.series.find(
    (s: { pollutant: string }) => s.pollutant === 'PM2.5'
  ).values
  const row = fabric.rows.find(r => r.year === year)!
  const day = row.values.findIndex((v, i) => i > 100 && v !== null)
  const hours = hourly
    .slice(day * DAY_HOURS, (day + 1) * DAY_HOURS)
    .filter(v => v !== null)
  assert.ok(hours.length >= loaded.minCompleteHours)
  assert.equal(
    row.values[day],
    roundHundredth(hours.reduce((a, b) => a + b, 0) / hours.length)
  )
})

test('a day with fewer readings than a complete day is null', () => {
  const readings = new Map<number, number>()
  fillDay(readings, 0, 17, () => 10)
  fillDay(readings, 1, 18, () => 10)
  const [fabric] = fabricsOf(fixture([['PM2.5', 24, readings]]))
  assert.deepEqual(fabric!.rows[0]!.values.slice(0, 3), [null, 10, null])
})

test('a pollutant with no limit has a daily mean, no limit, and no days over', () => {
  const readings = new Map<number, number>()
  fillDay(readings, 0, DAY_HOURS, hour => hour + 1)
  fillDay(readings, 1, DAY_HOURS, () => 1000)
  const [fabric] = fabricsOf(fixture([['NO', null, readings]]))
  assert.equal(fabric!.statistic, 'daily mean')
  assert.equal(fabric!.limit, null)
  assert.deepEqual(fabric!.rows[0]!.values.slice(0, 3), [12.5, 1000, null])
  assert.deepEqual(fabric!.rows[0]!.overDays, [])
  assert.equal(fabric!.scale.max, 1000)
})

test('the days over the limit are the days above it, and a day at the limit is within', () => {
  const readings = new Map<number, number>()
  fillDay(readings, 0, DAY_HOURS, () => 26.99)
  fillDay(readings, 1, DAY_HOURS, () => 27)
  fillDay(readings, 2, DAY_HOURS, () => 27.004)
  fillDay(readings, 5, DAY_HOURS, () => 40)
  const [fabric] = fabricsOf(fixture([['PM2.5', 24, readings]]))
  assert.deepEqual(fabric!.rows[0]!.overDays, [2, 5])
  assert.equal(fabric!.rows[0]!.values[2], 27)
  assert.equal(fabric!.scale.max, 27)
})

test('a pollutant with an hourly limit takes the greatest hourly value of each day', () => {
  const readings = new Map<number, number>()
  fillDay(readings, 0, 3, hour => (hour === 1 ? 28 : 5))
  fillDay(readings, 1, 1, () => 27)
  const [fabric] = fabricsOf(fixture([['SO2', 1, readings]]))
  assert.equal(fabric!.statistic, 'daily maximum hourly value')
  assert.deepEqual(fabric!.rows[0]!.values.slice(0, 3), [28, 27, null])
  assert.deepEqual(fabric!.rows[0]!.overDays, [0])
})

test('a row holds one value for each day of its year', () => {
  const readings = new Map<number, number>()
  fillDay(readings, 0, DAY_HOURS, () => 1)
  const [fabric] = fabricsOf(fixture([['NO', null, readings]]))
  assert.equal(fabric!.rows.length, 1)
  assert.equal(fabric!.rows[0]!.values.length, 366)
})

test('each station and pollutant has one fabric file, and the largest is under 60 KB', () => {
  const expected = derived.overview.stations.flatMap(s =>
    s.series.map(x => fabricPath(s.station, x.pollutant))
  )
  const found = readdirSync(join(PUBLIC, 'fabric'), { withFileTypes: true })
    .filter(e => e.isDirectory())
    .flatMap(e =>
      readdirSync(join(PUBLIC, 'fabric', e.name)).map(
        name => `fabric/${e.name}/${name}`
      )
    )
  assert.deepEqual(found.sort(), expected.sort())
  for (const path of found) {
    assert.ok(statSync(join(PUBLIC, path)).size < MAX_FABRIC_BYTES, path)
  }
})

test('a fabric file holds a row for each year and the same scale for all stations', () => {
  const fabrics = deriveFabrics(loaded, derived)
  assert.equal(fabrics.length, 43)
  const scales = new Map<string, Set<number>>()
  for (const f of fabrics) {
    assert.deepEqual(
      f.rows.map(r => r.year),
      derived.overview.years
    )
    const set = scales.get(f.pollutant) ?? new Set<number>()
    set.add(f.scale.max)
    scales.set(f.pollutant, set)
  }
  for (const [pollutant, set] of scales) assert.equal(set.size, 1, pollutant)
})

test('the days over the limit equal the over days of the overview', () => {
  for (const f of deriveFabrics(loaded, derived)) {
    const series = derived.overview.stations
      .find(s => s.station === f.station)!
      .series.find(s => s.pollutant === f.pollutant)!
    for (const row of f.rows) {
      const verdict = series.years.find(y => y.year === row.year)!.verdict
      if (verdict.kind !== 'daily') {
        continue
      }
      assert.equal(
        row.overDays.length,
        verdict.overDays,
        `${f.station} ${f.pollutant} ${row.year}`
      )
    }
  }
})
