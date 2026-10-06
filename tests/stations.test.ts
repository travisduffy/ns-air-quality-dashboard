import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { SeriesSummary } from '../scripts/derive.ts'
import {
  STATION_COUNTY,
  VERDICT_COLOR,
  VERDICT_MARK,
  VERDICT_WORD,
  getCountyColor,
  getCountyVerdicts,
  getSeriesVerdict,
  getStationVerdict,
  getWorstVerdict,
  isNovaScotia,
  type Station,
} from '../src/stations.ts'

const hourly = (overHours: number) =>
  ({ verdict: { kind: 'hourly', overHours } }) as unknown as SeriesSummary
const noLimit = { verdict: { kind: 'none' } } as unknown as SeriesSummary

test('the station table puts each station in a county of Nova Scotia', () => {
  for (const [station, county] of Object.entries(STATION_COUNTY)) {
    assert.equal(isNovaScotia(county), true, station)
  }
})

test('a county that holds a station takes the color of its verdict', () => {
  for (const county of Object.values(STATION_COUNTY)) {
    assert.equal(getCountyColor(county, 'over'), VERDICT_COLOR.over)
  }
})

test('a county takes the worst verdict', () => {
  assert.equal(getWorstVerdict([]), 'none')
  assert.equal(getWorstVerdict(['none', 'within']), 'within')
  assert.equal(getWorstVerdict(['within', 'over', 'none']), 'over')
})

test('two stations of one county merge, and the first one stays', () => {
  const counties = getCountyVerdicts([
    { station: 'Kentville', verdict: 'within' },
    { station: 'Aylesford', verdict: 'over' },
    { station: 'Pictou', verdict: 'none' },
  ])
  assert.deepEqual(counties.get('Kings, NS'), {
    verdict: 'over',
    first: 'Kentville',
  })
  assert.deepEqual(counties.get('Pictou, NS'), {
    verdict: 'none',
    first: 'Pictou',
  })
})

test('a county with no station is neutral, and land outside is muted', () => {
  assert.equal(getCountyColor('Kings, NS', 'over'), VERDICT_COLOR.over)
  assert.equal(getCountyColor('Kings, NS', 'within'), VERDICT_COLOR.within)
  assert.equal(getCountyColor('Kings, NS', 'none'), VERDICT_COLOR.none)
  assert.equal(getCountyColor('Colchester, NS', undefined), VERDICT_COLOR.idle)
  assert.equal(
    getCountyColor('Charlotte, NB', undefined),
    VERDICT_COLOR.outside
  )
  assert.equal(new Set(Object.values(VERDICT_COLOR)).size, 5)
})

test('one series is over, within, or has no limit', () => {
  assert.equal(getSeriesVerdict(noLimit), 'none')
  assert.equal(getSeriesVerdict(hourly(0)), 'within')
  assert.equal(getSeriesVerdict(hourly(2)), 'over')
})

test('a station takes the worst verdict of its series', () => {
  const station = (series: SeriesSummary[]) =>
    ({ station: 'Pictou', series }) as Station
  assert.equal(getStationVerdict(station([])), 'none')
  assert.equal(getStationVerdict(station([noLimit, hourly(0)])), 'within')
  assert.equal(getStationVerdict(station([hourly(0), hourly(1)])), 'over')
})

test('each verdict of a series has a word, a mark, and a color', () => {
  const verdicts = [noLimit, hourly(0), hourly(2)].map(getSeriesVerdict)
  for (const verdict of verdicts) {
    assert.ok(VERDICT_WORD[verdict], verdict)
    assert.ok(VERDICT_MARK[verdict], verdict)
    assert.ok(VERDICT_COLOR[verdict], verdict)
  }
})
