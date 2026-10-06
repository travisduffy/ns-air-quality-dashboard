import assert from 'node:assert/strict'
import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { derive } from '../scripts/derive.ts'
import { emitData } from '../scripts/emit.ts'
import { loadData } from '../scripts/load.ts'

const ROOT = new URL('..', import.meta.url).pathname
const PUBLIC = join(ROOT, 'public')
const derived = derive(loadData(ROOT))

const readJson = (path: string) => JSON.parse(readFileSync(path, 'utf8'))

// The page reads these static files, so each file must hold the derived data,
// key for key.
test('the overview file equals the derived overview', () => {
  assert.deepEqual(
    readJson(join(PUBLIC, 'overview.json')),
    JSON.parse(JSON.stringify(derived.overview))
  )
})

test('each station has one readings file, equal to the derived readings', () => {
  const names = readdirSync(join(PUBLIC, 'readings')).sort()
  const stations = [...derived.readings.keys()].sort()
  assert.deepEqual(
    names,
    stations.map(s => `${s}.json`)
  )
  for (const [station, readings] of derived.readings) {
    assert.deepEqual(
      readJson(join(PUBLIC, 'readings', `${station}.json`)),
      JSON.parse(JSON.stringify(readings))
    )
  }
})

test('a readings file holds one value for each grid hour of every series', () => {
  for (const station of derived.readings.keys()) {
    const r = readJson(join(PUBLIC, 'readings', `${station}.json`))
    assert.equal(r.hours, 8761)
    for (const s of r.series) {
      assert.equal(s.values.length, 8761)
      const missing = s.values.filter((v: number | null) => v === null).length
      const gapped = s.gaps.reduce(
        (a: number, g: { hours: number }) => a + g.hours,
        0
      )
      assert.equal(missing, gapped)
    }
  }
})

test('the overview lists the stations that the readings files hold', () => {
  const o = readJson(join(PUBLIC, 'overview.json'))
  assert.deepEqual(
    o.stations.map((s: { station: string }) => s.station),
    [...derived.readings.keys()]
  )
})

test('a station name that could leave the folder is refused', () => {
  const dir = mkdtempSync(join(tmpdir(), 'aqm-emit-'))
  const bad = {
    overview: derived.overview,
    readings: new Map([['../escape', derived.readings.values().next().value!]]),
  }
  assert.throws(() => emitData(bad, dir), /not a safe file name/)
  rmSync(dir, { recursive: true, force: true })
})
