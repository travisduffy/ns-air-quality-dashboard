import assert from 'node:assert/strict'
import {
  cpSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, test } from 'node:test'
import { gzipSync } from 'node:zlib'
import {
  LAYERS,
  parseFabricLayer,
  parseManifest,
  parseStations,
  parseStory,
} from '../shared/contract.ts'
import { checkData } from '../scripts/check-data.ts'
import { sha256 } from '../scripts/manifest.ts'
import { stableJson } from '../scripts/publish.ts'

// These tests read only public/data, so they run where the raw files are not.

const DATA_DIR = join(import.meta.dirname, '..', 'public', 'data')
const GZIP_LIMIT_BYTES = 250 * 1024
const DAY_COUNT = 3653

// Section 9 of the story build sheet, with the keys of the research of the
// story. Each value is copied by hand from the sheet, apart from the build.
const STORY_SHEET = {
  c14_o3_pm25_station_days_judged: 49163,
  c14_o3_pm25_station_days_over: 50,
  c14_o3_pm25_pct_over: 0.1,
  c14_SO2_max_pct_of_limit: 30.54,
  c4_station_days_judged: 24413,
  c4_station_days_gt27: 4,
  c4_province_top1_day: '2021-07-27',
  c4_province_top1_mean: 19.12,
  c4_province_top1_stations: 6,
  c4_top1_station_day: 'Aylesford 2025-08-24',
  c4_top1_daily_mean: 35.14,
  c4_top2_station_day: 'Sydney 2023-06-01',
  c4_top2_daily_mean: 30.89,
  c4_top3_station_day: 'Kentville 2021-07-27',
  c4_top3_daily_mean: 29.98,
  c4_top4_station_day: 'Port Hawkesbury 2025-07-16',
  c4_top4_daily_mean: 27.58,
  'c2_june2023_rise_Lake Major': 37.0,
  c2_june2023_rise_Sydney: 34.67,
  c2_june2023_rise_Pictou: 34.02,
  'c2_june2023_rise_Port Hawkesbury': 32.48,
  c2_june2023_rise_Kentville: 24.82,
  c2_june2023_rise_Aylesford: 11.85,
  c2_halifax_johnston_pm25_june2023_readings: 0,
  c1_trs_hours_ge3_2016: 27,
  c1_trs_hours_ge3_2017: 15,
  c1_trs_hours_ge3_2018: 24,
  c1_trs_hours_ge3_2019: 36,
  c1_trs_hours_ge3_2020: 1,
  c1_trs_hours_ge3_2021: 0,
  c1_trs_hours_ge3_2022: 0,
  c1_trs_hours_ge3_2023: 0,
  c1_trs_hours_ge3_2024: 0,
  c1_trs_hours_ge3_2025: 1,
  c1_trs_hours_ge3_2016_2019: 102,
  c1_trs_hours_ge3_2020_2025: 2,
  c3_o3_month_mean_3: 36.67,
  c3_o3_month_mean_9: 22.17,
  c5_pct_total: 96.75,
  c2_halifax_johnston_pm25_longest_gap_2023_hours: 2291,
}

// The day card of 27 July 2021 in the fabric build sheet.
const DAY_CARD = {
  day: '2021-07-27',
  values: {
    Kentville: 29.98,
    Pictou: 23.13,
    'Halifax Johnston': 17.67,
    'Port Hawkesbury': 16.94,
    'Lake Major': 15.43,
    Sydney: 11.57,
    Aylesford: null,
  },
}

const made: string[] = []
after(() => {
  for (const dir of made) rmSync(dir, { recursive: true, force: true })
})

const readData = (path: string) =>
  JSON.parse(readFileSync(join(DATA_DIR, path), 'utf8')) as unknown

const story = parseStory(readData('story.json'))
const stations = parseStations(readData('stations.json'))
const layers = LAYERS.map(layer =>
  parseFabricLayer(readData(`fabric/${layer}.json`))
)

const copyData = () => {
  const dir = mkdtempSync(join(tmpdir(), 'aqd-data-'))
  made.push(dir)
  cpSync(DATA_DIR, dir, { recursive: true })
  return dir
}

// Write a changed file and give the manifest its new hash, so that only the
// content of the file is wrong.
const rewrite = (dir: string, path: string, value: unknown) => {
  const text = stableJson(value)
  writeFileSync(join(dir, path), text)
  const manifest = parseManifest(
    JSON.parse(readFileSync(join(dir, 'manifest.json'), 'utf8'))
  )
  const entry = manifest.files.find(f => f.path === path)!
  entry.bytes = Buffer.byteLength(text)
  entry.sha256 = sha256(text)
  writeFileSync(join(dir, 'manifest.json'), stableJson(manifest))
}

test('data:check passes the emitted data', () => {
  assert.deepEqual(checkData(DATA_DIR), [])
})

test('data:check refuses a file that differs from its manifest hash', () => {
  const dir = copyData()
  const path = join(dir, 'story.json')
  writeFileSync(path, readFileSync(path, 'utf8').replace('49163', '49164'))
  assert.deepEqual(checkData(dir), [
    'story.json does not match its SHA-256 in the manifest',
  ])
})

test('data:check refuses a file that the manifest does not list', () => {
  const dir = copyData()
  writeFileSync(join(dir, 'fabric', 'extra.json'), '{}\n')
  assert.deepEqual(checkData(dir), ['fabric/extra.json is not in the manifest'])
})

test('data:check refuses an unknown station and a wrong county', () => {
  const dir = copyData()
  const changed = structuredClone(stations)
  changed[0]!.name = 'Halifax North'
  changed[1]!.county = 'Kings, NS'
  rewrite(dir, 'stations.json', changed)
  const defects = checkData(dir)
  assert.ok(
    defects.includes('stations.json: Halifax North is an unknown station')
  )
  assert.ok(
    defects.includes(
      'stations.json: Halifax Johnston is in Kings, NS, the county map says Halifax, NS'
    )
  )
})

test('data:check refuses a story that names a station with no row', () => {
  const dir = copyData()
  const changed = structuredClone(story)
  changed.chapters[2]!.highlight.stations.push('Sable Island')
  rewrite(dir, 'story.json', changed)
  assert.deepEqual(checkData(dir), [
    'story.json: chapter 3 names Sable Island, which is not in stations.json',
  ])
})

test('Halifax coverage counts only the hours from its first to its last report', () => {
  const halifax = stations.find(s => s.name === 'Halifax')!
  assert.equal(halifax.firstReport, '2016-01-01T01:00:00')
  assert.equal(halifax.lastReport, '2018-01-01T00:00:00')
  assert.equal(halifax.reportedHours, 120268)
  assert.equal(halifax.expectedHours, 122808)
  const percent = (halifax.reportedHours / halifax.expectedHours) * 100
  assert.equal(percent.toFixed(2), '97.93')
})

test('each value of story.json equals section 9 of the story sheet', () => {
  assert.deepEqual(story.values, STORY_SHEET)
})

test('the chapter 2 highlight marks the four days of its labels', () => {
  const labels = [1, 2, 3, 4].map(
    rank => story.values[`c4_top${rank}_station_day` as 'c4_top1_station_day']
  )
  const marks = story.chapters[1]!.highlight.marks!
  assert.deepEqual(
    marks.map(m => `${m.station} ${m.day}`),
    labels
  )
})

test('the chapter 1 highlight marks each station-day over a limit', () => {
  const marks = story.chapters[0]!.highlight.marks!
  assert.equal(marks.length, story.values.c14_o3_pm25_station_days_over)
})

test('each fabric layer holds ten years of days', () => {
  for (const layer of layers) {
    assert.equal(layer.firstDay, '2016-01-01')
    assert.equal(layer.dayCount, DAY_COUNT)
  }
})

test('each fabric file is at most 250 KB gzipped', () => {
  for (const layer of LAYERS) {
    const bytes = readFileSync(join(DATA_DIR, 'fabric', `${layer}.json`))
    assert.ok(gzipSync(bytes).length <= GZIP_LIMIT_BYTES, layer)
  }
})

test('the PM2.5 layer gives the day card of the fabric sheet', () => {
  const pm25 = layers[0]!
  const index =
    (Date.parse(DAY_CARD.day) - Date.parse(pm25.firstDay)) / 86_400_000
  for (const [station, value] of Object.entries(DAY_CARD.values)) {
    const row = pm25.stations.find(s => s.station === station)!
    assert.equal(row.values[index], value, station)
  }
})

test('the TRS layer adds up to the spike hours of each year', () => {
  const trs = layers[2]!
  const pictou = trs.stations.find(s => s.station === 'Pictou')!
  for (let year = 2016; year <= 2025; year++) {
    const from =
      (Date.parse(`${year}-01-01`) - Date.parse(trs.firstDay)) / 86_400_000
    const to =
      (Date.parse(`${year + 1}-01-01`) - Date.parse(trs.firstDay)) / 86_400_000
    const sum = pictou.values
      .slice(from, to)
      .reduce<number>((total, v) => total + (v ?? 0), 0)
    const key = `c1_trs_hours_ge3_${year}` as 'c1_trs_hours_ge3_2016'
    assert.equal(sum, story.values[key], String(year))
  }
})
