import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'
import type { Overview, StationFabric } from '../shared/contract.ts'

// The files of the data build before it reached back to 2016.
const BEFORE =
  process.env.PUBLIC_BEFORE ??
  '/home/trav/admin/.agents/scratch/aqd8-fabric-20261008-history/public-before'
const AFTER = join(import.meta.dirname, '..', 'public')

const read = (dir: string, path: string) =>
  JSON.parse(readFileSync(join(dir, path), 'utf8'))

test('the files of the build before the change are there', () => {
  assert.ok(existsSync(join(BEFORE, 'overview.json')), BEFORE)
})

const before: Overview = read(BEFORE, 'overview.json')
const after: Overview = read(AFTER, 'overview.json')
const kept = after.years.filter(y => y >= 2018)
const same = after.years.filter(y => y >= 2016)

test('the data spans 2010 to 2025, and the build shows the same stations and series', () => {
  assert.deepEqual(
    after.years,
    Array.from({ length: 16 }, (_, i) => 2010 + i)
  )
  assert.equal(after.window.start, '2010-01-01T01:00:00')
  assert.equal(after.window.end, before.window.end)
  const list = (o: Overview) =>
    o.stations.map(s => [s.station, s.series.map(x => x.pollutant)])
  assert.deepEqual(list(after), list(before))
  assert.equal(kept.length, 8)
})

test('every verdict, summary, and health figure of 2018 to 2025 is unchanged', () => {
  let compared = 0
  for (const station of after.stations) {
    const old = before.stations.find(s => s.station === station.station)!
    for (const year of kept) {
      const where = `${station.station} ${year}`
      assert.deepEqual(
        station.verdicts.find(v => v.year === year),
        old.verdicts.find(v => v.year === year),
        `verdict ${where}`
      )
      assert.deepEqual(
        station.health.find(h => h.year === year),
        old.health.find(h => h.year === year),
        `health ${where}`
      )
      for (const series of station.series) {
        const oldSeries = old.series.find(
          s => s.pollutant === series.pollutant
        )!
        assert.deepEqual(
          series.years.find(y => y.year === year),
          oldSeries.years.find(y => y.year === year),
          `${where} ${series.pollutant}`
        )
        compared++
      }
    }
  }
  assert.equal(compared, 43 * kept.length)
  for (const county of after.counties) {
    const old = before.counties.find(c => c.county === county.county)!
    for (const year of kept) {
      assert.deepEqual(
        county.verdicts.find(v => v.year === year),
        old.verdicts.find(v => v.year === year),
        `${county.county} ${year}`
      )
    }
  }
})

// A rolling 8-hour average at the first hour of the old window now reaches
// into the hours before it, so the daily figure of 2016-01-01 can move.
const dropFirstDay = (code: string, year: number, days: unknown[]) =>
  code === 'O3' && year === 2016 ? days.slice(1) : days

test('the hourly readings of 2016 to 2025 are unchanged, and so is each daily figure', () => {
  let files = 0
  for (const station of after.stations) {
    for (const year of same) {
      const path = `readings/${station.station}/${year}.json`
      const now = read(AFTER, path)
      const old = read(BEFORE, path)
      assert.equal(now.series.length, old.series.length, path)
      now.series.forEach(
        (s: { pollutant: string; daily: unknown[] }, i: number) => {
          const { daily, ...rest } = s
          const { daily: oldDaily, ...oldRest } = old.series[i]
          assert.deepEqual(rest, oldRest, `${path} ${s.pollutant}`)
          assert.deepEqual(
            dropFirstDay(s.pollutant, year, daily),
            dropFirstDay(s.pollutant, year, oldDaily),
            `${path} ${s.pollutant}`
          )
        }
      )
      assert.deepEqual({ ...now, series: 0 }, { ...old, series: 0 }, path)
      files++
    }
  }
  assert.equal(files, after.stations.length * same.length)
})

test('the fabric rows of 2016 to 2025 are unchanged', () => {
  let rows = 0
  for (const station of after.stations) {
    for (const series of station.series) {
      const path = `fabric/${station.station}/${series.pollutant}.json`
      const old: StationFabric = read(BEFORE, path)
      const now: StationFabric = read(AFTER, path)
      assert.equal(now.rows.length, 16, path)
      for (const year of same) {
        const pick = (file: StationFabric) =>
          file.rows.find(r => r.year === year)!
        const a = pick(now)
        const b = pick(old)
        const first = series.pollutant === 'O3' && year === 2016 ? 1 : 0
        assert.deepEqual(a.values.slice(first), b.values.slice(first), path)
        if (first === 0) assert.deepEqual(a.overDays, b.overDays, path)
        rows++
      }
    }
  }
  assert.equal(rows, 43 * same.length)
})

test('the readings of 2010 to 2015 exist for each station that reported then', () => {
  for (const station of after.stations) {
    for (const year of after.years.filter(y => y < 2016)) {
      assert.ok(
        existsSync(join(AFTER, `readings/${station.station}/${year}.json`)),
        `${station.station} ${year}`
      )
    }
  }
})
