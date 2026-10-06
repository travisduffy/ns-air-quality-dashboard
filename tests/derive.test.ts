import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  dailyMaxEightHour,
  dailyMeans,
  derive,
  eightHourAverages,
  findGaps,
  hourlyVerdict,
  longestGap,
  stationHealth,
  type Overview,
  type SeriesSummary,
} from '../scripts/derive.ts'
import { loadData, type Limit } from '../scripts/load.ts'

const ROOT = new URL('..', import.meta.url).pathname
const START = Date.UTC(2025, 0, 1)

const limit = (value: number, unit = 'ppb'): Limit => ({
  value,
  unit,
  averagingPeriod: 'test',
  framework: 'test',
  url: 'https://example.invalid',
  officialValue: String(value),
  converted: false,
})

// Fixture: one value per hour from START. Index 0 is the stamp
// 2025-01-01T00:00, which closes the day 2024-12-31, so the indexes 1 to 24 are
// the 24 hours of the day 2025-01-01.
const dayWith = (readings: number, value: number) => {
  const v: (number | null)[] = new Array(25).fill(null)
  for (let i = 1; i <= readings; i++) v[i] = value
  return v
}

const near = (actual: number | null, expected: number) =>
  assert.ok(
    actual !== null && Math.abs(actual - expected) < 5e-10,
    `${actual} is not near ${expected}`
  )

test('an hourly value equal to the limit is within, and above it is over', () => {
  const v = hourlyVerdict([30.2, 30.3, 30.1, null], START, limit(30.2, 'ppm'))
  assert.partialDeepStrictEqual(v, {
    kind: 'hourly',
    judgedHours: 3,
    overHours: 1,
    withinHours: 2,
    maxValue: 30.3,
    maxAt: '2025-01-01T01:00:00',
  })
})

test('a day one reading short of 18 is insufficient, and a day with 18 is valid', () => {
  const short = dailyMeans(dayWith(17, 10), START, limit(27), 18)
  assert.deepEqual(
    short.find(d => d.day === '2025-01-01'),
    { day: '2025-01-01', value: null, readings: 17, verdict: 'insufficient' }
  )
  const ok = dailyMeans(dayWith(18, 10), START, limit(27), 18)
  assert.deepEqual(
    ok.find(d => d.day === '2025-01-01'),
    { day: '2025-01-01', value: 10, readings: 18, verdict: 'within' }
  )
})

test('the stamp of midnight is in the day that it closes', () => {
  const d = dailyMeans(dayWith(24, 5), START, limit(27), 18)
  assert.deepEqual(
    d.map(x => [x.day, x.readings]),
    [
      ['2024-12-31', 0],
      ['2025-01-01', 24],
    ]
  )
  assert.equal(d[0]!.verdict, 'insufficient')
})

test('a daily mean equal to the limit is within, and above it is over', () => {
  assert.equal(
    dailyMeans(dayWith(24, 27), START, limit(27), 18)[1]!.verdict,
    'within'
  )
  assert.equal(
    dailyMeans(dayWith(24, 27.1), START, limit(27), 18)[1]!.verdict,
    'over'
  )
})

test('an 8-hour average is invalid with 5 readings and valid with 6', () => {
  const five = eightHourAverages([1, 1, 1, 1, 1, null, null, null])
  assert.equal(five[7], null)
  const six = eightHourAverages([1, 1, 1, 1, 1, 7, null, null])
  assert.equal(six[7], 2)
})

test('the hours before the window start count as missing', () => {
  const a = eightHourAverages([10, 10, 10, 10, 10, 10])
  assert.deepEqual(a.slice(0, 5), [null, null, null, null, null])
  assert.equal(a[5], 10)
})

test('a daily maximum needs 18 valid 8-hour averages in a day', () => {
  // 24 readings of the day 2025-01-01 give a valid average at each hour from
  // the 6th reading on.
  const full = dayWith(24, 70)
  const withAverages = dailyMaxEightHour(full, START, limit(60))
  assert.deepEqual(withAverages[1], {
    day: '2025-01-01',
    value: 70,
    readings: 24,
    verdict: 'over',
  })
  // Readings only in the hours 1 to 17 give too few valid averages.
  const sparse = dailyMaxEightHour(dayWith(17, 70), START, limit(60))
  assert.partialDeepStrictEqual(sparse[1], {
    value: null,
    verdict: 'insufficient',
  })
})

test('a daily maximum 8-hour average equal to the limit is within', () => {
  assert.equal(
    dailyMaxEightHour(dayWith(24, 60), START, limit(60))[1]!.verdict,
    'within'
  )
})

test('a gap is found at the window start and at the window end', () => {
  const gaps = findGaps([null, null, 5, 6, null, 7, null], START)
  assert.deepEqual(gaps, [
    { start: '2025-01-01T00:00:00', end: '2025-01-01T01:00:00', hours: 2 },
    { start: '2025-01-01T04:00:00', end: '2025-01-01T04:00:00', hours: 1 },
    { start: '2025-01-01T06:00:00', end: '2025-01-01T06:00:00', hours: 1 },
  ])
})

test('one gap holds every hour when all are missing, and none when none is', () => {
  assert.equal(findGaps([null, null, null], START).length, 1)
  assert.deepEqual(findGaps([1, 2, 3], START), [])
})

test('the longest outage is the earliest gap on a tie', () => {
  const gaps = findGaps([null, null, 1, null, null, 1], START)
  assert.deepEqual(longestGap(gaps), {
    hours: 2,
    start: '2025-01-01T00:00:00',
    end: '2025-01-01T01:00:00',
  })
  assert.equal(longestGap([]), null)
})

test('station health sums the series and names the pollutant of the longest outage, the earliest on a tie', () => {
  const g = (hours: number, h: number) => ({
    start: `2025-01-01T0${h}:00:00`,
    end: `2025-01-01T0${h}:00:00`,
    hours,
  })
  const health = stationHealth([
    { pollutant: 'A', expected: 10, reported: 8, gaps: [g(2, 5)] },
    { pollutant: 'B', expected: 10, reported: 7, gaps: [g(2, 1)] },
  ])
  assert.deepEqual(health, {
    expected: 20,
    reported: 15,
    reportedShare: 0.75,
    longestOutage: {
      hours: 2,
      start: '2025-01-01T01:00:00',
      end: '2025-01-01T01:00:00',
      pollutant: 'B',
    },
  })
})

// The expected values below come from a second route: python3 straight from
// the raw pages, written apart from the loader.
const derived = derive(loadData(ROOT))

const find = (station: string, pollutant: string): SeriesSummary => {
  const s = derived.overview.stations.find(x => x.station === station)
  return s!.series.find(x => x.pollutant === pollutant)!
}

const daily = (station: string, pollutant: string, day: string) =>
  derived.readings
    .get(station)!
    .series.find(x => x.pollutant === pollutant)!
    .daily!.find(d => d.day === day)!

test('the raw files have the grid of the data', () => {
  assert.partialDeepStrictEqual(derived.overview.window, {
    start: '2025-01-01T00:00:00',
    end: '2026-01-01T00:00:00',
    hours: 8761,
  })
})

test('Sydney CO is the series with the most missing hours', () => {
  const most = derived.overview.stations
    .flatMap(s => s.series)
    .reduce((a, b) => (b.missing > a.missing ? b : a))
  assert.equal(most.pollutant, 'CO')
  const s = find('Sydney', 'CO')
  assert.partialDeepStrictEqual(s, {
    expected: 8761,
    reported: 7832,
    missing: 929,
    gapCount: 12,
  })
  assert.deepEqual(s.longestOutage, {
    hours: 517,
    start: '2025-11-10T23:00:00',
    end: '2025-12-02T11:00:00',
  })
  assert.partialDeepStrictEqual(s.verdict, {
    kind: 'hourly',
    judgedHours: 7832,
    overHours: 0,
    maxValue: 1.53,
    maxAt: '2025-07-16T21:00:00',
  })
})

test('Sydney PM2.5 is counted from the raw pages', () => {
  const s = find('Sydney', 'PM2.5')
  assert.partialDeepStrictEqual(s, {
    expected: 8761,
    reported: 8362,
    missing: 399,
    gapCount: 11,
  })
  assert.deepEqual(s.longestOutage, {
    hours: 329,
    start: '2025-01-01T00:00:00',
    end: '2025-01-14T16:00:00',
  })
  assert.equal(s.unit, 'ug/m3')
  const full = daily('Sydney', 'PM2.5', '2025-07-16')
  assert.partialDeepStrictEqual(full, { readings: 24, verdict: 'within' })
  near(full.value, 25.508333333333336)
  assert.deepEqual(daily('Sydney', 'PM2.5', '2025-01-14'), {
    day: '2025-01-14',
    value: null,
    readings: 8,
    verdict: 'insufficient',
  })
})

test('Aylesford PM2.5 has a day over the limit', () => {
  const d = daily('Aylesford', 'PM2.5', '2025-08-24')
  assert.partialDeepStrictEqual(d, { readings: 24, verdict: 'over' })
  near(d.value, 35.141666666666666)
})

test('Sydney O3 has a daily maximum 8-hour average', () => {
  const s = find('Sydney', 'O3')
  assert.partialDeepStrictEqual(s, {
    expected: 8761,
    reported: 8351,
    missing: 410,
    gapCount: 15,
  })
  assert.partialDeepStrictEqual(s.verdict, {
    kind: 'daily',
    maxDay: '2025-05-08',
  })
  const top = daily('Sydney', 'O3', '2025-05-08')
  assert.partialDeepStrictEqual(top, { readings: 24, verdict: 'within' })
  near(top.value, 52.1875)
  assert.deepEqual(daily('Sydney', 'O3', '2025-01-10'), {
    day: '2025-01-10',
    value: null,
    readings: 0,
    verdict: 'insufficient',
  })
})

test('Kentville O3 has a day over the limit', () => {
  const d = daily('Kentville', 'O3', '2025-10-06')
  assert.equal(d.verdict, 'over')
  near(d.value, 64.75)
})

test('repeated rows count once: Aylesford O3 and Pictou TRS', () => {
  assert.partialDeepStrictEqual(find('Aylesford', 'O3'), {
    reported: 8671,
    missing: 90,
  })
  assert.partialDeepStrictEqual(find('Pictou', 'TRS'), {
    reported: 8492,
    missing: 269,
  })
  assert.equal(find('Pictou', 'TRS').verdict.kind, 'none')
})

test('the health of Sydney sums from its series', () => {
  const o: Overview = derived.overview
  const sydney = o.stations.find(s => s.station === 'Sydney')!
  assert.equal(sydney.health.expected, sydney.series.length * 8761)
  assert.equal(
    sydney.health.reported,
    sydney.series.reduce((a, s) => a + s.reported, 0)
  )
  assert.partialDeepStrictEqual(sydney.health.longestOutage, {
    hours: 517,
    pollutant: 'CO',
  })
})
