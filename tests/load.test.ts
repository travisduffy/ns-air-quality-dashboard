import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, test } from 'node:test'
import { loadData } from '../scripts/load.ts'
import { msStamp } from '../scripts/time.ts'

const ROOT = new URL('..', import.meta.url).pathname
const made: string[] = []

after(() => {
  for (const d of made) rmSync(d, { recursive: true, force: true })
})

type Row = Record<string, string>

const row = (stamp: string, average?: string) => {
  const r: Row = {
    date_time: `${stamp}.000`,
    pollutant: 'O3',
    unit: 'ppb',
    station: 'Testville',
  }
  if (average !== undefined) r.average = average
  return r
}

const fixture = (
  rows: Row[],
  since = '2025-01-01T00:00:00',
  name: string | null = null
) => {
  const dir = mkdtempSync(join(tmpdir(), 'aqm-load-'))
  made.push(dir)
  mkdirSync(join(dir, 'data', 'raw', 'aaaa-bbbb'), { recursive: true })
  copyFileSync(
    join(ROOT, 'data', 'limits.json'),
    join(dir, 'data', 'limits.json')
  )
  const meta = Buffer.from(
    JSON.stringify({
      license: {
        name: 'Test licence',
        termsLink: 'https://example.invalid/licence',
      },
    })
  )
  const page = Buffer.from(JSON.stringify(rows))
  writeFileSync(join(dir, 'data', 'raw', 'aaaa-bbbb', 'metadata.json'), meta)
  writeFileSync(join(dir, 'data', 'raw', 'aaaa-bbbb', 'page-0.json'), page)
  const entry = (file: string, b: Buffer, n: number | null) => ({
    file,
    datasetId: 'aaaa-bbbb',
    name,
    url: 'https://data.example.invalid/resource/aaaa-bbbb.json',
    fetchedAt: '2026-01-01T00:00:00.000Z',
    httpStatus: 200,
    rows: n,
    bytes: b.length,
    sha256: createHash('sha256').update(b).digest('hex'),
  })
  const record = {
    since,
    files: [
      entry('data/raw/aaaa-bbbb/metadata.json', meta, null),
      entry('data/raw/aaaa-bbbb/page-0.json', page, rows.length),
    ],
  }
  writeFileSync(join(dir, 'data', 'fetch-record.json'), JSON.stringify(record))
  return dir
}

test('identical repeated rows load as one reading', () => {
  const d = loadData(
    fixture([
      row('2025-01-01T00:00:00', '21'),
      row('2025-01-01T00:00:00', '21'),
      row('2025-01-01T01:00:00', '22.5'),
    ])
  )
  assert.equal(d.series.length, 1)
  assert.deepEqual([...d.series[0]!.readings.values()], [21, 22.5])
})

test('repeated rows that differ leave the hour missing, and the loader says so', () => {
  const d = loadData(
    fixture([
      row('2025-01-01T00:00:00', '21'),
      row('2025-01-01T00:00:00', '22'),
      row('2025-01-01T01:00:00', '23'),
    ])
  )
  assert.deepEqual([...d.series[0]!.readings.values()], [23])
  assert.equal(d.corrections.length, 1)
  assert.match(
    d.corrections[0]!,
    /two different values.*in 1 hour of Testville O3/
  )
})

test('a repeat with an average in one row and none in the other leaves the hour missing', () => {
  const d = loadData(
    fixture([row('2025-01-01T00:00:00', '21'), row('2025-01-01T00:00:00')])
  )
  assert.equal(d.series[0]!.readings.size, 0)
  assert.equal(d.corrections.length, 1)
})

test('a stamp with seconds after the hour is read as the hour, and listed', () => {
  const r = row('2025-01-01T01:00:00', '3')
  r.date_time = '2025-01-01T01:00:59.000'
  const d = loadData(fixture([r, row('2025-01-01T02:00:00', '4')]))
  assert.deepEqual(
    [...d.series[0]!.readings.keys()],
    [Date.UTC(2025, 0, 1, 1), Date.UTC(2025, 0, 1, 2)]
  )
  assert.equal(d.corrections.length, 1)
  assert.match(d.corrections[0]!, /seconds after the hour/)
})

test('a stamp with minutes still throws', () => {
  const r = row('2025-01-01T01:00:00', '3')
  r.date_time = '2025-01-01T01:30:00.000'
  assert.throws(() => loadData(fixture([r])), /bad date_time/)
})

test('a misspelled station name is read as its station, and listed', () => {
  const a = row('2025-01-01T01:00:00', '3')
  const b = row('2025-01-01T02:00:00', '4')
  a.station = b.station = 'Alyesford'
  const d = loadData(fixture([a, b]))
  assert.deepEqual(
    d.series.map(s => s.station),
    ['Aylesford']
  )
  assert.match(d.corrections[0]!, /station name "Alyesford".*read as Aylesford/)
})

test('a row of a pollutant that the dataset name does not list is left out, and listed', () => {
  const name = 'Test Sulphur Dioxide (SO2) Hourly Data Testville'
  const so2 = row('2025-01-01T01:00:00', '1')
  so2.pollutant = 'SO2'
  so2.unit = 'ppb'
  const d = loadData(
    fixture(
      [so2, row('2025-01-01T02:00:00', '4'), row('2025-01-01T03:00:00', '5')],
      '2025-01-01T00:00:00',
      name
    )
  )
  assert.deepEqual(
    d.series.map(s => s.pollutant),
    ['SO2']
  )
  assert.equal(d.endMs, Date.UTC(2025, 0, 1, 1))
  assert.match(d.corrections[0]!, /pollutant O3.*left out/)
  assert.match(d.corrections[0]!, /2 hours/)
})

test('a row with no average, or an empty average, is a missing hour and still counts as the data end', () => {
  const d = loadData(
    fixture([
      row('2025-01-01T00:00:00', '5'),
      row('2025-01-01T01:00:00'),
      row('2025-01-01T02:00:00', ''),
    ])
  )
  assert.equal(d.series[0]!.readings.size, 1)
  assert.equal(d.endMs - d.startMs, 2 * 3_600_000)
})

test('the stamps are naive times, with no shift', () => {
  const d = loadData(
    fixture([row('2025-03-09T02:00:00', '1')], '2025-03-09T00:00:00')
  )
  assert.equal([...d.series[0]!.readings.keys()][0], Date.UTC(2025, 2, 9, 2))
})

test('an average that is not a number throws', () => {
  assert.throws(
    () => loadData(fixture([row('2025-01-01T00:00:00', 'NoData')])),
    /not a number/
  )
})

test('a row before the window start throws', () => {
  assert.throws(
    () => loadData(fixture([row('2024-12-31T23:00:00', '1')])),
    /before the window start/
  )
})

test('a page that does not match the hash of the fetch record throws', () => {
  const dir = fixture([row('2025-01-01T00:00:00', '21')])
  writeFileSync(
    join(dir, 'data', 'raw', 'aaaa-bbbb', 'page-0.json'),
    JSON.stringify([row('2025-01-01T00:00:00', '99')])
  )
  assert.throws(() => loadData(dir), /bytes|sha256/)
})

test('the two spellings of the PM2.5 unit load as one label', () => {
  const a = row('2025-01-01T00:00:00', '1')
  a.pollutant = 'PM2.5'
  a.unit = 'µg/m3'
  assert.equal(loadData(fixture([a])).series[0]!.unit, 'ug/m3')
})

test('the real files load, with the licence, the limits, and the data end from the files', () => {
  const d = loadData(ROOT)
  assert.match(d.licence.name, /Open Government Licence/)
  assert.equal(d.limits.get('SO2')!.limit.value, 343.5)
  assert.equal(d.minCompleteHours, 18)
  assert.equal(d.since, '2016-01-01T01:00:00')
  assert.equal(msStamp(d.endMs), '2026-01-01T00:00:00')
  assert.equal(d.corrections.length, 5)
})
