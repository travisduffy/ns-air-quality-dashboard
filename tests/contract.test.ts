import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'
import {
  STORY_DAY_KEYS,
  STORY_NUMBER_KEYS,
  STORY_STATION_DAY_KEYS,
  parseFabricLayer,
  parseManifest,
  parseStations,
  parseStory,
} from '../shared/contract.ts'

const FIXTURES = join(import.meta.dirname, 'fixtures')

const readFixture = (name: string) =>
  JSON.parse(readFileSync(join(FIXTURES, name), 'utf8'))

const CASES = [
  { file: 'manifest.json', parse: parseManifest },
  { file: 'stations.json', parse: parseStations },
  { file: 'fabric/pm25.json', parse: parseFabricLayer },
  { file: 'fabric/o3.json', parse: parseFabricLayer },
  { file: 'fabric/trs.json', parse: parseFabricLayer },
  { file: 'story.json', parse: parseStory },
]

for (const { file, parse } of CASES) {
  test(`the fixture ${file} passes its guard`, () => {
    const fixture = readFixture(file)
    assert.deepEqual(parse(fixture), fixture)
  })
}

test('a manifest that lists itself fails its guard', () => {
  assert.throws(
    () => parseManifest(readFixture('manifest-lists-itself.json')),
    /manifest\.files\[0\]\.path/
  )
})

test('a fabric layer with a short day array fails its guard', () => {
  const layer = readFixture('fabric/pm25.json')
  layer.stations[0].values.pop()
  assert.throws(() => parseFabricLayer(layer), /values is not an array of 3/)
})

test('a station that reports more hours than expected fails its guard', () => {
  const stations = readFixture('stations.json')
  stations[0].reportedHours = stations[0].expectedHours + 1
  assert.throws(() => parseStations(stations), /reportedHours/)
})

test('the story holds each key of the story sheet and no other', () => {
  const story = readFixture('story.json')
  assert.deepEqual(
    Object.keys(story.values).sort(),
    [...STORY_NUMBER_KEYS, ...STORY_DAY_KEYS, ...STORY_STATION_DAY_KEYS].sort()
  )
  delete story.values.c5_pct_total
  assert.throws(() => parseStory(story), /c5_pct_total/)
  story.values.c5_pct_total = 96.75
  story.values.c9_unknown = 1
  assert.throws(() => parseStory(story), /c9_unknown/)
})

test('a station-day label with no day fails its guard', () => {
  const story = readFixture('story.json')
  story.values.c4_top1_station_day = 'Aylesford'
  assert.throws(() => parseStory(story), /c4_top1_station_day/)
})
