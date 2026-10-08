import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  annualStatistic,
  dailyVerdict,
  fourthHighest,
  isAnnualComplete,
  judge,
  percentile98,
  threeYearMetric,
} from '../scripts/derive.ts'
import type { Annual, Daily, Limit } from '../shared/contract.ts'

const PM = 'annual 98th percentile of daily means'
const O3 = 'annual 4th highest daily maximum 8-hour average'

const limit = (value: number): Limit => ({
  value,
  unit: 'ug/m3',
  averagingPeriod: 'test',
  framework: 'test',
  url: 'https://example.invalid',
  officialValue: String(value),
  converted: false,
})

const ascending = (n: number) => Array.from({ length: n }, (_, i) => i + 1)

const yearDays = (year: number, valid: (day: string) => boolean): Daily[] => {
  const out: Daily[] = []
  for (let ms = Date.UTC(year, 0, 1); ms < Date.UTC(year + 1, 0, 1);) {
    const day = new Date(ms).toISOString().slice(0, 10)
    const value = valid(day) ? 10 : null
    out.push({
      day,
      value,
      readings: value === null ? 0 : 24,
      verdict: value === null ? 'insufficient' : 'within',
    })
    ms += 86_400_000
  }
  return out
}

const annual = (year: number, value: number | null, complete: boolean) => ({
  year,
  value,
  complete,
})

test('the 98th percentile is the (N - i) highest value, i the integer part of 0.98 N', () => {
  assert.equal(percentile98(ascending(275)), 270)
  assert.equal(percentile98(ascending(50)), 50)
  assert.equal(percentile98(ascending(51)), 50)
  assert.equal(percentile98(ascending(365)), 358)
  assert.equal(percentile98(ascending(366)), 359)
  assert.equal(percentile98([]), null)
})

test('the 4th highest repeats equal values, as in the CCME example', () => {
  assert.equal(fourthHighest([65.6, 77.8, 70.2, 52.5, 76.1, 70.2]), 70.2)
  assert.equal(fourthHighest([77.8, 76.1, 70.2]), null)
})

test('the metric is the 3-year average of the annual values, rounded to an integer', () => {
  const annuals = [
    annual(2009, 25.6, true),
    annual(2010, 33.4, true),
    annual(2011, 28.7, true),
  ]
  const metric = threeYearMetric(annuals, 2011, PM)
  assert.equal(metric.value, 29)
  assert.equal(metric.basis, 'three years')
  assert.deepEqual(
    metric.years.map(y => y.year),
    [2009, 2010, 2011]
  )
})

test('two complete years of three give the metric, and an incomplete year is left out', () => {
  const annuals = [
    annual(2023, 58.1, true),
    annual(2024, 90, false),
    annual(2025, 53.9, true),
  ]
  const metric = threeYearMetric(annuals, 2025, O3)
  assert.equal(metric.basis, 'two years')
  assert.equal(metric.value, 56)
})

test('with fewer than two complete years, the metric averages every annual value of the window', () => {
  const annuals: Annual[] = [
    annual(2016, 40.2, false),
    annual(2017, 61.4, true),
  ]
  const metric = threeYearMetric(annuals, 2017, O3)
  assert.equal(metric.basis, 'partial')
  assert.equal(metric.value, 51)
  const first = threeYearMetric(annuals, 2016, O3)
  assert.equal(first.basis, 'partial')
  assert.equal(first.value, 40)
  const none = threeYearMetric([annual(2016, null, false)], 2016, O3)
  assert.equal(none.basis, 'none')
  assert.equal(none.value, null)
})

test('a PM2.5 year is complete with 75% of its days and 60% of each quarter', () => {
  assert.equal(
    isAnnualComplete(
      yearDays(2025, () => true),
      PM
    ),
    true
  )
  const lateStart = yearDays(2025, day => day >= '2025-02-15')
  assert.equal(isAnnualComplete(lateStart, PM), false)
  const everyFourth = yearDays(2025, day => Number(day.slice(8, 10)) % 4 !== 0)
  assert.equal(isAnnualComplete(everyFourth, PM), true)
})

test('an ozone year is complete with 75% of the days from April to September', () => {
  const summer = yearDays(
    2025,
    day => day >= '2025-04-01' && day < '2025-10-01'
  )
  assert.equal(isAnnualComplete(summer, O3), true)
  const lateSummer = yearDays(2025, day => day >= '2025-05-20')
  assert.equal(isAnnualComplete(lateSummer, O3), false)
})

test('an incomplete year still counts when its annual value is over the limit', () => {
  const days = yearDays(2025, day => day >= '2025-12-01').map(d =>
    d.value === null ? d : { ...d, value: 30 }
  )
  assert.deepEqual(annualStatistic(2025, days, limit(27), PM), {
    year: 2025,
    value: 30,
    complete: true,
  })
  assert.equal(annualStatistic(2025, days, limit(35), PM).complete, false)
})

test('the verdict follows the metric, and the over days stay in the judgement', () => {
  const days = yearDays(2025, () => true).map((d, i) =>
    i < 3 ? { ...d, value: 40, verdict: 'over' as const } : d
  )
  const verdict = dailyVerdict(days, limit(27), 'daily mean')
  const metric = threeYearMetric(
    [annualStatistic(2025, days, limit(27), PM)],
    2025,
    PM
  )
  assert.equal(metric.value, 10)
  const within = judge(verdict, 8760, metric)
  assert.equal(within.verdict, 'within')
  assert.equal(within.over, 3)
  assert.equal(judge(verdict, 8760).verdict, 'over')
  const high = { ...metric, value: 28 }
  assert.equal(judge(verdict, 8760, high).verdict, 'over')
  assert.equal(judge(verdict, 0, high).verdict, 'nodata')
})
