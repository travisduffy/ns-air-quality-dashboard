import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  HOUR_MS,
  dayOf,
  dayStamps,
  hourSpan,
  monthStamps,
  monthsOf,
  msStamp,
  stampMs,
} from '../scripts/time.ts'

const FIRST = stampMs('2025-01-01T00:00:00')
const LAST = stampMs('2026-01-01T00:00:00')
const GRID = Array.from(
  { length: (LAST - FIRST) / HOUR_MS + 1 },
  (_, i) => FIRST + i * HOUR_MS
)
const MONTHS = [
  '2024-12',
  '2025-01',
  '2025-02',
  '2025-03',
  '2025-04',
  '2025-05',
  '2025-06',
  '2025-07',
  '2025-08',
  '2025-09',
  '2025-10',
  '2025-11',
  '2025-12',
  '2026-01',
]

test('a stamp is in the day of the stamp minus one hour', () => {
  assert.equal(dayOf(stampMs('2025-02-01T00:00:00')), '2025-01-31')
  assert.equal(dayOf(stampMs('2025-02-01T01:00:00')), '2025-02-01')
})

test('February 2025 has the stamps 2025-02-01T01:00 to 2025-03-01T00:00, 672 stamps', () => {
  const { first, last } = monthStamps('2025-02')
  assert.equal(msStamp(first), '2025-02-01T01:00:00')
  assert.equal(msStamp(last), '2025-03-01T00:00:00')
  assert.equal((last - first) / HOUR_MS + 1, 672)
})

test('a stamp is in the month range and the day range exactly when its day says so', () => {
  assert.equal(GRID.length, 8761)
  const wrongMonth: string[] = []
  const wrongDay: string[] = []
  for (const s of GRID) {
    const day = dayOf(s)
    for (const m of MONTHS) {
      const { first, last } = monthStamps(m)
      if ((first <= s && s <= last) !== day.startsWith(m)) {
        wrongMonth.push(`${msStamp(s)} ${m}`)
      }
    }
    const { first, last } = dayStamps(day)
    if (!(first <= s && s <= last)) wrongDay.push(msStamp(s))
  }
  assert.deepEqual(wrongMonth, [])
  assert.deepEqual(wrongDay, [])
})

test('the months of the grid by the rule are 2024-12 to 2025-12', () => {
  const months = monthsOf(FIRST, LAST)
  assert.deepEqual(months, MONTHS.slice(0, 13))
  assert.equal(months.length, 13)
})

test('a stamp gives the hour that ends at the stamp', () => {
  const s = stampMs('2025-02-01T00:00:00')
  assert.deepEqual(hourSpan(s), {
    start: stampMs('2025-01-31T23:00:00'),
    end: s,
  })
})
