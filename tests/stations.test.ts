import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import type { Overview, VerdictState } from '../shared/contract.ts'
import {
  SEA_COLOR,
  VERDICT_COLOR,
  VERDICT_MARK,
  VERDICT_WORD,
  getCountyColor,
  isNovaScotia,
} from '../src/stations.ts'
import { getYearCounties } from '../src/years.ts'

const overview: Overview = JSON.parse(
  readFileSync(new URL('../public/overview.json', import.meta.url), 'utf8')
)

test('each county of the data is a county of Nova Scotia', () => {
  for (const { county } of overview.counties) {
    assert.equal(isNovaScotia(county), true, county)
    assert.equal(getCountyColor(county, 'over'), VERDICT_COLOR.over)
  }
})

test('the counties of a year keep the order of the stations and the verdict of the data', () => {
  const year = overview.years[0]!
  const counties = getYearCounties(overview, year, 'PM2.5')
  assert.deepEqual(
    counties.map(c => c.county),
    [...new Set(overview.stations.map(s => s.county))]
  )
  for (const county of counties) {
    const data = overview.counties.find(c => c.county === county.county)!
    const verdicts = data.verdicts.find(v => v.year === year)!
    assert.equal(county.verdict, verdicts.pollutants['PM2.5'])
    assert.deepEqual(county.stations, data.stations)
  }
  assert.throws(() => getYearCounties(overview, 1900, 'PM2.5'), /1900/)
})

test('a county with no station is neutral, and land outside Nova Scotia takes the water color', () => {
  assert.equal(getCountyColor('Kings, NS', 'over'), VERDICT_COLOR.over)
  assert.equal(getCountyColor('Kings, NS', 'within'), VERDICT_COLOR.within)
  assert.equal(getCountyColor('Kings, NS', 'none'), VERDICT_COLOR.none)
  assert.equal(getCountyColor('Kings, NS', 'absent'), VERDICT_COLOR.absent)
  assert.equal(getCountyColor('Colchester, NS', undefined), VERDICT_COLOR.idle)
  assert.equal(getCountyColor('Charlotte, NB', undefined), SEA_COLOR)
  assert.equal(new Set(Object.values(VERDICT_COLOR)).size, 6)
})

test('each verdict has a word, a mark, and a color, and absent reads as the tile does', () => {
  const verdicts: VerdictState[] = [
    'over',
    'within',
    'none',
    'nodata',
    'absent',
  ]
  for (const verdict of verdicts) {
    assert.ok(VERDICT_WORD[verdict], verdict)
    assert.ok(VERDICT_MARK[verdict], verdict)
    assert.ok(VERDICT_COLOR[verdict], verdict)
  }
  assert.equal(VERDICT_WORD.absent, 'Not measured')
})
