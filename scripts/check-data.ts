import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import {
  LAYERS,
  STORY_STATION_DAY_KEYS,
  parseFabricLayer,
  parseManifest,
  parseStations,
  parseStory,
  type FabricLayer,
  type Station,
  type Story,
} from '../shared/contract.ts'
import { STATION_COUNTY } from '../shared/stations.ts'
import { sha256 } from './manifest.ts'

const DATA_DIR = join(import.meta.dirname, '..', 'public', 'data')

const LAYER_SERIES = { pm25: 'PM2.5', o3: 'O3', trs: 'TRS' } as const

// Check the emitted data as CI sees it: it reads only the data directory. It
// returns one sentence for each defect, and an empty list for a clean set.
// It throws when the directory or the manifest cannot be read at all.
export const checkData = (dir: string) => {
  const defects: string[] = []
  const manifest = parseManifest(
    JSON.parse(readFileSync(join(dir, 'manifest.json'), 'utf8'))
  )

  const onDisk = readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter(entry => !entry.isDirectory())
    .map(entry => relative(dir, join(entry.parentPath, entry.name)))
    .filter(path => path !== 'manifest.json')
    .sort()
  const listed = manifest.files.map(f => f.path).sort()
  for (const path of onDisk) {
    if (!listed.includes(path)) defects.push(`${path} is not in the manifest`)
  }

  const texts = new Map<string, string>()
  for (const file of manifest.files) {
    const path = join(dir, file.path)
    if (!onDisk.includes(file.path) || !statSync(path).isFile()) {
      defects.push(`${file.path} is in the manifest but not on disk`)
      continue
    }
    const bytes = readFileSync(path)
    if (bytes.length !== file.bytes) {
      defects.push(
        `${file.path} has ${bytes.length} bytes, the manifest says ${file.bytes}`
      )
    }
    if (sha256(bytes) !== file.sha256) {
      defects.push(`${file.path} does not match its SHA-256 in the manifest`)
    }
    texts.set(file.path, bytes.toString('utf8'))
  }

  const parse = <T>(path: string, parser: (value: unknown) => T) => {
    const text = texts.get(path)
    if (text === undefined) {
      defects.push(`${path} is missing`)
      return null
    }
    try {
      return parser(JSON.parse(text))
    } catch (error) {
      defects.push(`${path}: ${(error as Error).message}`)
      return null
    }
  }

  const stations = parse('stations.json', parseStations)
  const layers = LAYERS.map(layer =>
    parse(`fabric/${layer}.json`, parseFabricLayer)
  )
  const story = parse('story.json', parseStory)
  if (stations === null || story === null || layers.includes(null)) {
    return defects
  }

  defects.push(
    ...checkStations(stations),
    ...checkLayers(layers as FabricLayer[], stations),
    ...checkStory(story, layers as FabricLayer[], stations)
  )
  return defects
}

const checkStations = (stations: Station[]) => {
  const defects: string[] = []
  const ids = new Set<string>()
  for (const station of stations) {
    const county = STATION_COUNTY[station.name]
    if (county === undefined) {
      defects.push(`stations.json: ${station.name} is an unknown station`)
    } else if (station.county !== county) {
      defects.push(
        `stations.json: ${station.name} is in ${station.county}, the county map says ${county}`
      )
    }
    if (ids.has(station.id)) {
      defects.push(`stations.json: the id ${station.id} repeats`)
    }
    ids.add(station.id)
  }
  return defects
}

const checkLayers = (layers: FabricLayer[], stations: Station[]) => {
  const defects: string[] = []
  const [first] = layers
  for (const [i, layer] of layers.entries()) {
    const path = `fabric/${LAYERS[i]}.json`
    if (layer.layer !== LAYERS[i]) {
      defects.push(`${path} holds the layer ${layer.layer}`)
    }
    if (
      layer.firstDay !== first!.firstDay ||
      layer.dayCount !== first!.dayCount
    ) {
      defects.push(`${path} has days other than fabric/${first!.layer}.json`)
    }
    for (const row of layer.stations) {
      const station = stations.find(s => s.name === row.station)
      if (station === undefined) {
        defects.push(`${path}: ${row.station} is not in stations.json`)
      } else if (!station.series.includes(LAYER_SERIES[layer.layer])) {
        defects.push(`${path}: ${row.station} measures no ${layer.layer}`)
      }
    }
  }
  return defects
}

const checkStory = (
  story: Story,
  layers: FabricLayer[],
  stations: Station[]
) => {
  const defects: string[] = []
  const names = stations.map(s => s.name)
  const firstDay = layers[0]!.firstDay
  const lastDay = new Date(
    Date.parse(`${firstDay}T00:00:00Z`) + (layers[0]!.dayCount - 1) * 86_400_000
  )
    .toISOString()
    .slice(0, 10)
  const inWindow = (day: string) => day >= firstDay && day <= lastDay

  for (const key of STORY_STATION_DAY_KEYS) {
    // The label ends in one space and a day of ten characters.
    const name = story.values[key].slice(0, -11)
    if (!names.includes(name)) {
      defects.push(
        `story.json: ${key} names ${name}, which is not in stations.json`
      )
    }
  }
  for (const { chapter, highlight } of story.chapters) {
    const path = `story.json: chapter ${chapter}`
    if (!inWindow(highlight.from) || !inWindow(highlight.to)) {
      defects.push(`${path} has days outside ${firstDay} to ${lastDay}`)
    }
    const named = [
      ...highlight.stations,
      ...(highlight.marks ?? []).map(m => m.station),
    ]
    for (const name of named) {
      if (!names.includes(name)) {
        defects.push(`${path} names ${name}, which is not in stations.json`)
      }
    }
    for (const mark of highlight.marks ?? []) {
      if (!inWindow(mark.day)) defects.push(`${path} marks the day ${mark.day}`)
    }
  }
  return defects
}

const main = () => {
  let defects: string[]
  try {
    defects = checkData(DATA_DIR)
  } catch (error) {
    console.error(
      'data:check could not read the data:',
      (error as Error).message
    )
    process.exit(2)
  }
  for (const defect of defects) console.error(defect)
  if (defects.length > 0) {
    console.error(`data:check found ${defects.length} defects`)
    process.exit(1)
  }
  console.log(
    'data:check passed: every file matches its guard and the manifest'
  )
}

if (process.argv[1] === import.meta.filename) main()
