// The contract of the files in public/data/. The pipeline and the browser
// both read each file through its parse function, and each type derives from
// that function, so the type and the check never drift apart. Each parse
// function throws on the first field that breaks the contract.

export const SCHEMA_VERSION = 1

export const LAYERS = ['pm25', 'o3', 'trs'] as const

// Chapter 6 of the story draws the hours reported of the PM2.5 layer in place
// of its daily values.
export const HIGHLIGHT_LAYERS = [...LAYERS, 'pm25-hours'] as const

export const CHAPTERS = [1, 2, 3, 4, 5, 6] as const

const MONTHS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]

// The keys of section 9 of the story sheet. Chapter 3 keys each row by its
// station, and chapter 4 keys each year by the key of its research value.
export const STORY_NUMBER_KEYS = [
  'c14_o3_pm25_station_days_judged',
  'c14_o3_pm25_station_days_over',
  'c14_o3_pm25_pct_over',
  'c14_SO2_max_pct_of_limit',
  'c4_station_days_judged',
  'c4_station_days_gt27',
  'c4_province_top1_mean',
  'c4_province_top1_stations',
  'c4_top1_daily_mean',
  'c4_top2_daily_mean',
  'c4_top3_daily_mean',
  'c4_top4_daily_mean',
  'c2_june2023_rise_Lake Major',
  'c2_june2023_rise_Sydney',
  'c2_june2023_rise_Pictou',
  'c2_june2023_rise_Port Hawkesbury',
  'c2_june2023_rise_Kentville',
  'c2_june2023_rise_Aylesford',
  'c2_halifax_johnston_pm25_june2023_readings',
  'c1_trs_hours_ge3_2016',
  'c1_trs_hours_ge3_2017',
  'c1_trs_hours_ge3_2018',
  'c1_trs_hours_ge3_2019',
  'c1_trs_hours_ge3_2020',
  'c1_trs_hours_ge3_2021',
  'c1_trs_hours_ge3_2022',
  'c1_trs_hours_ge3_2023',
  'c1_trs_hours_ge3_2024',
  'c1_trs_hours_ge3_2025',
  'c1_trs_hours_ge3_2016_2019',
  'c1_trs_hours_ge3_2020_2025',
  'c3_o3_month_mean_3',
  'c3_o3_month_mean_9',
  'c5_pct_total',
  'c2_halifax_johnston_pm25_longest_gap_2023_hours',
] as const

export const STORY_DAY_KEYS = ['c4_province_top1_day'] as const

// The labels of the four worst station-days of chapter 2, in the form of the
// research: the station, one space, and the day.
export const STORY_STATION_DAY_KEYS = [
  'c4_top1_station_day',
  'c4_top2_station_day',
  'c4_top3_station_day',
  'c4_top4_station_day',
] as const

type StoryNumberKey = (typeof STORY_NUMBER_KEYS)[number]
type StoryDayKey = (typeof STORY_DAY_KEYS)[number]
type StoryStationDayKey = (typeof STORY_STATION_DAY_KEYS)[number]

const SHA256 = /^[0-9a-f]{64}$/
const DAY = /^\d{4}-\d{2}-\d{2}$/
const TIME =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})?$/

const fail = (path: string, want: string): never => {
  throw new Error(`contract: ${path} is not ${want}`)
}

const readObject = (value: unknown, path: string) => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return fail(path, 'an object')
  }
  return value as Record<string, unknown>
}

const readArray = (value: unknown, path: string) =>
  Array.isArray(value) ? (value as unknown[]) : fail(path, 'an array')

const readText = (value: unknown, path: string) =>
  typeof value === 'string' && value !== '' ? value : fail(path, 'a text')

const readNumber = (value: unknown, path: string) =>
  typeof value === 'number' && Number.isFinite(value)
    ? value
    : fail(path, 'a finite number')

const readCount = (value: unknown, path: string) =>
  Number.isInteger(value) && (value as number) >= 0
    ? (value as number)
    : fail(path, 'a count')

const readHash = (value: unknown, path: string) =>
  typeof value === 'string' && SHA256.test(value)
    ? value
    : fail(path, 'a SHA-256 in hex')

const readDay = (value: unknown, path: string) =>
  typeof value === 'string' &&
  DAY.test(value) &&
  !Number.isNaN(Date.parse(value))
    ? value
    : fail(path, 'a day, YYYY-MM-DD')

const readTime = (value: unknown, path: string) =>
  typeof value === 'string' &&
  TIME.test(value) &&
  !Number.isNaN(Date.parse(value))
    ? value
    : fail(path, 'a time in ISO 8601')

const readStationDay = (value: unknown, path: string) => {
  const found = /^(.+) (\d{4}-\d{2}-\d{2})$/.exec(readText(value, path))
  if (found === null) {
    return fail(path, 'a station and a day, "<station> YYYY-MM-DD"')
  }
  readDay(found[2], path)
  return found[0]
}

const readOneOf = <T>(value: unknown, path: string, options: readonly T[]) =>
  options.includes(value as T)
    ? (value as T)
    : fail(path, `one of ${options.join(', ')}`)

export const parseManifest = (value: unknown) => {
  const manifest = readObject(value, 'manifest')
  const source = readObject(manifest.source, 'manifest.source')
  const datasets = readArray(manifest.datasets, 'manifest.datasets').map(
    (item, i) => {
      const path = `manifest.datasets[${i}]`
      const dataset = readObject(item, path)
      return {
        id: readText(dataset.id, `${path}.id`),
        name: readText(dataset.name, `${path}.name`),
        url: readText(dataset.url, `${path}.url`),
        fetchedAt: readTime(dataset.fetchedAt, `${path}.fetchedAt`),
        // A dataset of zero rows is legal: four Sable Island sets are empty.
        rows: readCount(dataset.rows, `${path}.rows`),
        sha256: readHash(dataset.sha256, `${path}.sha256`),
      }
    }
  )
  const files = readArray(manifest.files, 'manifest.files').map((item, i) => {
    const path = `manifest.files[${i}]`
    const file = readObject(item, path)
    const filePath = readText(file.path, `${path}.path`)
    // The manifest cannot hold its own hash, so it lists every file but itself.
    if (filePath === 'manifest.json') {
      return fail(`${path}.path`, 'a file other than the manifest')
    }
    return {
      path: filePath,
      bytes: readCount(file.bytes, `${path}.bytes`),
      sha256: readHash(file.sha256, `${path}.sha256`),
    }
  })

  return {
    schemaVersion: readOneOf(manifest.schemaVersion, 'manifest.schemaVersion', [
      SCHEMA_VERSION,
    ]),
    source: {
      name: readText(source.name, 'manifest.source.name'),
      site: readText(source.site, 'manifest.source.site'),
      licence: readText(source.licence, 'manifest.source.licence'),
    },
    fetchedAt: readTime(manifest.fetchedAt, 'manifest.fetchedAt'),
    datasets,
    files,
  }
}

export const parseStations = (value: unknown) =>
  readArray(value, 'stations').map((item, i) => {
    const path = `stations[${i}]`
    const station = readObject(item, path)
    const firstReport = readTime(station.firstReport, `${path}.firstReport`)
    const lastReport = readTime(station.lastReport, `${path}.lastReport`)
    const expectedHours = readCount(
      station.expectedHours,
      `${path}.expectedHours`
    )
    const reportedHours = readCount(
      station.reportedHours,
      `${path}.reportedHours`
    )
    if (Date.parse(firstReport) > Date.parse(lastReport)) {
      return fail(`${path}.lastReport`, 'at or after the first report')
    }
    if (reportedHours > expectedHours) {
      return fail(`${path}.reportedHours`, 'at most the expected hours')
    }

    return {
      id: readText(station.id, `${path}.id`),
      name: readText(station.name, `${path}.name`),
      county: readText(station.county, `${path}.county`),
      firstReport,
      lastReport,
      series: readArray(station.series, `${path}.series`).map((s, j) =>
        readText(s, `${path}.series[${j}]`)
      ),
      expectedHours,
      reportedHours,
    }
  })

export const parseFabricLayer = (value: unknown) => {
  const layer = readObject(value, 'layer')
  const dayCount = readCount(layer.dayCount, 'layer.dayCount')
  const readDays = (days: unknown, path: string) => {
    const list = readArray(days, path)
    if (list.length !== dayCount) {
      return fail(path, `an array of ${dayCount} days`)
    }
    return list
  }
  const stations = readArray(layer.stations, 'layer.stations').map(
    (item, i) => {
      const path = `layer.stations[${i}]`
      const row = readObject(item, path)
      return {
        station: readText(row.station, `${path}.station`),
        // A day below the rule of the derivation is null.
        values: readDays(row.values, `${path}.values`).map((v, j) =>
          v === null ? null : readNumber(v, `${path}.values[${j}]`)
        ),
        hours: readDays(row.hours, `${path}.hours`).map((h, j) =>
          readCount(h, `${path}.hours[${j}]`) <= 24
            ? (h as number)
            : fail(`${path}.hours[${j}]`, 'at most 24 hours')
        ),
      }
    }
  )

  return {
    layer: readOneOf(layer.layer, 'layer.layer', LAYERS),
    firstDay: readDay(layer.firstDay, 'layer.firstDay'),
    dayCount,
    unit: readText(layer.unit, 'layer.unit'),
    limit: layer.limit === null ? null : readNumber(layer.limit, 'layer.limit'),
    stations,
  }
}

const parseHighlight = (value: unknown, path: string) => {
  const highlight = readObject(value, path)
  const from = readDay(highlight.from, `${path}.from`)
  const to = readDay(highlight.to, `${path}.to`)
  if (from > to) {
    return fail(`${path}.to`, 'on or after from')
  }

  return {
    layer: readOneOf(highlight.layer, `${path}.layer`, HIGHLIGHT_LAYERS),
    from,
    to,
    stations: readArray(highlight.stations, `${path}.stations`).map((s, i) =>
      readText(s, `${path}.stations[${i}]`)
    ),
    // An absent months or marks stays absent, so that a parse gives back
    // the file as it is.
    ...(highlight.months === undefined
      ? {}
      : {
          months: readArray(highlight.months, `${path}.months`).map((m, i) =>
            readOneOf(m, `${path}.months[${i}]`, MONTHS)
          ),
        }),
    ...(highlight.marks === undefined
      ? {}
      : {
          marks: readArray(highlight.marks, `${path}.marks`).map((item, i) => {
            const mark = readObject(item, `${path}.marks[${i}]`)
            return {
              station: readText(mark.station, `${path}.marks[${i}].station`),
              day: readDay(mark.day, `${path}.marks[${i}].day`),
            }
          }),
        }),
  }
}

export const parseStory = (value: unknown) => {
  const story = readObject(value, 'story')
  const values = readObject(story.values, 'story.values')
  const known: readonly string[] = [
    ...STORY_NUMBER_KEYS,
    ...STORY_DAY_KEYS,
    ...STORY_STATION_DAY_KEYS,
  ]
  for (const key of Object.keys(values)) {
    if (!known.includes(key)) {
      fail(`story.values.${key}`, 'a key of the story sheet')
    }
  }
  const numbers = {} as Record<StoryNumberKey, number>
  for (const key of STORY_NUMBER_KEYS) {
    numbers[key] = readNumber(values[key], `story.values.${key}`)
  }
  const days = {} as Record<StoryDayKey, string>
  for (const key of STORY_DAY_KEYS) {
    days[key] = readDay(values[key], `story.values.${key}`)
  }
  const stationDays = {} as Record<StoryStationDayKey, string>
  for (const key of STORY_STATION_DAY_KEYS) {
    stationDays[key] = readStationDay(values[key], `story.values.${key}`)
  }
  const chapters = readArray(story.chapters, 'story.chapters')
  if (chapters.length !== CHAPTERS.length) {
    fail('story.chapters', `an array of ${CHAPTERS.length} chapters`)
  }

  return {
    values: { ...numbers, ...days, ...stationDays },
    chapters: chapters.map((item, i) => {
      const path = `story.chapters[${i}]`
      const chapter = readObject(item, path)
      return {
        chapter: readOneOf(chapter.chapter, `${path}.chapter`, [CHAPTERS[i]]),
        highlight: parseHighlight(chapter.highlight, `${path}.highlight`),
      }
    }),
  }
}

export type Manifest = ReturnType<typeof parseManifest>
export type Station = ReturnType<typeof parseStations>[number]
export type FabricLayer = ReturnType<typeof parseFabricLayer>
export type Highlight = ReturnType<typeof parseHighlight>
export type Story = ReturnType<typeof parseStory>
