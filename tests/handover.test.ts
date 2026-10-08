import assert from 'node:assert/strict'
import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { derive } from '../scripts/derive.ts'
import { emitData } from '../scripts/emit.ts'
import { deriveFabrics } from '../scripts/fabric.ts'
import { HANDOVERS } from '../scripts/handovers.ts'
import { loadCounties, loadData } from '../scripts/load.ts'
import { withHandovers } from '../scripts/merge.ts'
import {
  handoverSite,
  judgedVerdict,
  readingsKey,
  type Handover,
} from '../shared/contract.ts'

const ROOT = new URL('..', import.meta.url).pathname
const loaded = loadData(ROOT)
const sites = derive(loaded, loadCounties(ROOT, loaded))
const merged = withHandovers(sites, HANDOVERS)
const [handover] = HANDOVERS as [Handover]
const years = sites.overview.years
const codes = sites.overview.pollutants.map(p => p.code)

const stationOf = (derived: typeof sites, name: string) =>
  derived.overview.stations.find(s => s.station === name)!

const halifax = stationOf(merged, handover.name)
const sourceOf = (year: number) =>
  stationOf(sites, handoverSite(handover, year))

test('the first entry hands Halifax over to the Johnston site on 2018-01-01', () => {
  assert.equal(handover.name, 'Halifax')
  assert.equal(handover.oldSite, 'Halifax')
  assert.equal(handover.newSite, 'Halifax Johnston')
  assert.equal(handover.firstDay, '2018-01-01')
  assert.deepEqual(merged.overview.handovers, HANDOVERS)
  assert.deepEqual(sites.overview.handovers, [])
})

test('the merged overview holds one Halifax in place of the two sites', () => {
  const names = merged.overview.stations.map(s => s.station)
  assert.equal(names.filter(n => n === 'Halifax').length, 1)
  assert.equal(names.includes('Halifax Johnston'), false)
  assert.equal(names.length, sites.overview.stations.length - 1)
  const county = merged.overview.counties.find(c => c.county === 'Halifax, NS')!
  assert.deepEqual(county.stations, ['Halifax', 'Lake Major'])
})

test('every year of every pollutant keeps the summary and the verdict of the site that measured it', () => {
  let compared = 0
  for (const year of years) {
    const source = sourceOf(year)
    for (const code of codes) {
      const before = source.series
        .find(s => s.pollutant === code)
        ?.years.find(y => y.year === year)
      const after = halifax.series
        .find(s => s.pollutant === code)
        ?.years.find(y => y.year === year)
      assert.deepEqual(after, before, `${code} ${year}`)
      assert.equal(
        halifax.verdicts.find(v => v.year === year)!.pollutants[code],
        source.verdicts.find(v => v.year === year)!.pollutants[code],
        `${code} ${year}`
      )
      compared++
    }
  }
  assert.equal(compared, years.length * codes.length)
})

test('every year keeps the health and the station verdict of the site that measured it', () => {
  for (const year of years) {
    const source = sourceOf(year)
    assert.deepEqual(
      halifax.health.find(h => h.year === year),
      source.health.find(h => h.year === year)
    )
    assert.equal(
      halifax.verdicts.find(v => v.year === year)!.verdict,
      source.verdicts.find(v => v.year === year)!.verdict
    )
  }
})

test('the 3-year statistic of 2018 and 2019 is the figure of the Johnston site alone', () => {
  const johnston = stationOf(sites, 'Halifax Johnston')
  for (const year of [2018, 2019]) {
    for (const code of codes) {
      const metricOf = (station: typeof johnston) =>
        station.series
          .find(s => s.pollutant === code)
          ?.years.find(y => y.year === year)?.metric
      const metric = metricOf(halifax)
      assert.deepEqual(metric, metricOf(johnston))
      for (const used of metric?.years ?? []) {
        assert.ok(used.year >= 2018, `${code} ${year} uses ${used.year}`)
      }
    }
  }
})

test('every year keeps the readings file of the site that measured it, under the name Halifax', () => {
  for (const year of years) {
    const source = sites.readings.get(
      readingsKey(handoverSite(handover, year), year)
    )!
    assert.deepEqual(merged.readings.get(readingsKey('Halifax', year)), {
      ...source,
      station: 'Halifax',
    })
  }
  assert.equal(merged.readings.size, sites.readings.size - years.length)
  assert.equal(
    merged.readings.has(readingsKey('Halifax Johnston', 2020)),
    false
  )
})

test('every year keeps the fabric row of the site that measured it', () => {
  const before = deriveFabrics(loaded, sites)
  const after = deriveFabrics(loaded, merged)
  assert.equal(after.length, before.length - halifax.series.length)
  for (const fabric of after.filter(f => f.station === 'Halifax')) {
    for (const row of fabric.rows) {
      const site = handoverSite(handover, row.year)
      const source = before.find(
        f => f.station === site && f.pollutant === fabric.pollutant
      )!
      assert.deepEqual(
        row,
        source.rows.find(r => r.year === row.year),
        `${fabric.pollutant} ${row.year}`
      )
    }
  }
  assert.equal(
    after.some(f => f.station === 'Halifax Johnston'),
    false
  )
})

test('another takeover is one new entry: two stations of one county merge by the same code', () => {
  const entry: Handover = {
    name: 'Kings',
    oldSite: 'Aylesford',
    newSite: 'Kentville',
    firstDay: '2020-01-01',
    reason: null,
  }
  const both = withHandovers(sites, [...HANDOVERS, entry])
  const names = both.overview.stations.map(s => s.station)
  assert.equal(
    names.includes('Aylesford') || names.includes('Kentville'),
    false
  )
  assert.equal(names.includes('Kings'), true)
  const kings = stationOf(both, 'Kings')
  for (const year of [2019, 2020]) {
    const source = stationOf(sites, year < 2020 ? 'Aylesford' : 'Kentville')
    assert.deepEqual(
      kings.health.find(h => h.year === year),
      source.health.find(h => h.year === year)
    )
  }
  assert.equal(
    deriveFabrics(loaded, both).filter(f => f.station === 'Kings').length > 0,
    true
  )
})

test('a bad entry fails the build', () => {
  const bad = (change: Partial<Handover>) =>
    assert.throws(() => withHandovers(sites, [{ ...handover, ...change }]))
  bad({ firstDay: '2018-06-01' })
  bad({ newSite: 'Nowhere' })
  bad({ oldSite: 'Halifax Johnston' })
  bad({ name: 'Sydney' })
  bad({ newSite: 'Sydney' })
})

test('the emit step removes the folder of a station that left the data', () => {
  const out = mkdtempSync(join(tmpdir(), 'handover-'))
  for (const dir of ['readings', 'fabric']) {
    mkdirSync(join(out, dir, 'Halifax Johnston'), { recursive: true })
    writeFileSync(join(out, dir, 'Halifax Johnston', 'old.json'), '{}\n')
  }
  emitData(merged, out, deriveFabrics(loaded, merged))
  assert.equal(existsSync(join(out, 'readings', 'Halifax Johnston')), false)
  assert.equal(existsSync(join(out, 'fabric', 'Halifax Johnston')), false)
  assert.equal(existsSync(join(out, 'readings', 'Halifax', '2018.json')), true)
  assert.equal(existsSync(join(out, 'fabric', 'Halifax', 'O3.json')), true)
})

test('a no-limit pollutant with no readings is judged as no data, so a year with no readings reads so', () => {
  assert.equal(judgedVerdict('none', 0), 'nodata')
  assert.equal(judgedVerdict('none', 5), 'none')
  assert.equal(judgedVerdict('within', 0), 'within')
})
