import assert from 'node:assert/strict'
import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { derive } from '../scripts/derive.ts'
import { emitData } from '../scripts/emit.ts'
import { loadData } from '../scripts/load.ts'
import { yearHours } from '../scripts/time.ts'

const ROOT = new URL('..', import.meta.url).pathname
const PUBLIC = join(ROOT, 'public')
const derived = derive(loadData(ROOT))

const readJson = (path: string) => JSON.parse(readFileSync(path, 'utf8'))

test('the overview file equals the derived overview', () => {
  assert.deepEqual(
    readJson(join(PUBLIC, 'overview.json')),
    JSON.parse(JSON.stringify(derived.overview))
  )
})

test('each station and year has one readings file, equal to the derived readings', () => {
  const stations = readdirSync(join(PUBLIC, 'readings')).sort()
  assert.deepEqual(stations, [...derived.overview.stations.map(s => s.station)])
  for (const station of stations) {
    const names = readdirSync(join(PUBLIC, 'readings', station)).sort()
    assert.deepEqual(
      names,
      derived.overview.years.map(y => `${y}.json`)
    )
  }
  for (const [key, readings] of derived.readings) {
    const [station, year] = key.split('/')
    assert.deepEqual(
      readJson(join(PUBLIC, 'readings', station!, `${year}.json`)),
      JSON.parse(JSON.stringify(readings))
    )
  }
})

test('a readings file holds one value for each hour of its year in every series', () => {
  for (const [key, derivedFile] of derived.readings) {
    const [station, year] = key.split('/')
    const r = readJson(join(PUBLIC, 'readings', station!, `${year}.json`))
    assert.equal(r.hours, yearHours(Number(year)))
    assert.equal(r.year, Number(year))
    assert.equal(r.series.length, derivedFile.series.length)
    for (const s of r.series) {
      assert.equal(s.values.length, r.hours)
      const missing = s.values.filter((v: number | null) => v === null).length
      const gapped = s.gaps.reduce(
        (a: number, g: { hours: number }) => a + g.hours,
        0
      )
      assert.equal(missing, gapped)
      assert.ok(missing < r.hours, 'a series with no reading is not listed')
    }
  }
})

test('the overview holds a summary of each of the ten years', () => {
  const o = readJson(join(PUBLIC, 'overview.json'))
  assert.equal(o.years.length, 10)
  for (const station of o.stations) {
    for (const series of station.series) {
      assert.deepEqual(
        series.years.map((y: { year: number }) => y.year),
        o.years
      )
    }
  }
})

test('the overview lists the stations that the readings files hold', () => {
  const o = readJson(join(PUBLIC, 'overview.json'))
  assert.deepEqual(
    o.stations.map((s: { station: string }) => s.station),
    readdirSync(join(PUBLIC, 'readings')).sort()
  )
})

test('a station name that could leave the folder is refused', () => {
  const dir = mkdtempSync(join(tmpdir(), 'aqm-emit-'))
  const bad = {
    overview: derived.overview,
    readings: new Map([
      [
        '../escape/2016',
        { ...derived.readings.values().next().value!, station: '../escape' },
      ],
    ]),
  }
  assert.throws(() => emitData(bad, dir), /not a safe file name/)
  rmSync(dir, { recursive: true, force: true })
})
