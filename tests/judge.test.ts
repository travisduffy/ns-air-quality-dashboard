import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  getBand,
  dailyAverages,
  dailyMax8h,
  judge,
  normalizeUnit,
  type Limit,
  type Reading,
} from '../src/judge.ts'

const hours = (day: string, values: number[]) =>
  values.map((value, i) => ({
    time: `${day}T${String(i).padStart(2, '0')}:00:00.000`,
    value,
  }))

const limit = (hours: number, value: number): Limit => ({
  id: `test-${hours}h`,
  pollutant: 'X',
  value,
  unit: 'ppb',
  hours,
  framework: 'test',
  url: 'https://example.org',
})

test('a daily average needs 18 hours', () => {
  const full = hours('2025-03-01', Array(18).fill(10))
  const short = hours('2025-03-02', Array(17).fill(99))
  assert.deepEqual(dailyAverages([...full, ...short]), [10])
})

test('an 8-hour average needs 6 of its 8 hours', () => {
  const readings: Reading[] = hours('2025-03-01', [0, 0, 0, 0, 0, 80, 80])
  // The window that ends at hour 5 holds 6 hours: five zeros and one 80.
  assert.deepEqual(dailyMax8h(readings), [160 / 7])
})

test('the 8-hour window runs across midnight', () => {
  const late = hours('2025-03-01', Array(24).fill(0)).slice(20)
  const early = hours('2025-03-02', [70, 70, 70, 70])
  const days = dailyMax8h([...late, ...early])
  assert.equal(days.length, 1)
  assert.equal(days[0], 35)
})

test('judge counts each period strictly over the limit', () => {
  const readings = hours('2025-03-01', [10, 20, 30, 40])
  assert.deepEqual(judge(readings, limit(1, 30)), {
    limitId: 'test-1h',
    peak: 40,
    over: 1,
    periods: 4,
  })
})

test('judge gives no peak when no period is valid', () => {
  const readings = hours('2025-03-01', [10, 20])
  assert.equal(judge(readings, limit(24, 5)).peak, null)
})

test('judge fails fast on an unknown averaging period', () => {
  assert.throws(() => judge([], limit(3, 1)), /no rule for a 3-hour limit/)
})

test('getBand splits at half the limit and at the limit', () => {
  assert.equal(getBand(null), 'none')
  assert.equal(getBand(0.49), 'low')
  assert.equal(getBand(0.5), 'mid')
  assert.equal(getBand(1), 'mid')
  assert.equal(getBand(1.01), 'over')
})

test('normalizeUnit reads the micro sign as u', () => {
  assert.equal(normalizeUnit('µg/m3'), 'ug/m3')
})
