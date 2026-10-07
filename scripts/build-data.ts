import { join } from 'node:path'
import {
  LAYERS,
  parseFabricLayer,
  parseManifest,
  parseStations,
  parseStory,
} from '../shared/contract.ts'
import { deriveStations } from './coverage.ts'
import { deriveLayer } from './fabric.ts'
import { loadData } from './load.ts'
import {
  buildManifest,
  describeDatasets,
  readFetchRecord,
  type EmittedFile,
} from './manifest.ts'
import { compactJson, stableJson, writeFiles } from './publish.ts'
import { deriveStory } from './story.ts'

const ROOT = join(import.meta.dirname, '..')
const OUT_DIR = join(ROOT, 'public', 'data')

// Load and validate the raw files, derive each data file, check each one
// against its guard in shared/contract.ts, and write them with the manifest
// last.
export const buildData = (root: string, outDir: string) => {
  const data = loadData(root)
  const stations = parseStations(deriveStations(data))

  const emitted: EmittedFile[] = [
    { path: 'stations.json', text: stableJson(stations) },
    ...LAYERS.map(layer => ({
      path: `fabric/${layer}.json`,
      text: compactJson(parseFabricLayer(deriveLayer(data, layer))),
    })),
    { path: 'story.json', text: stableJson(parseStory(deriveStory(data))) },
  ]
  const datasets = describeDatasets(root, readFetchRecord(root))
  const manifest = parseManifest(buildManifest(data, datasets, emitted))
  writeFiles(outDir, [
    ...emitted,
    { path: 'manifest.json', text: stableJson(manifest) },
  ])
  return { files: emitted.length + 1, datasets, stations }
}

const main = () => {
  const { files, datasets, stations } = buildData(ROOT, OUT_DIR)
  console.log(
    'data:',
    `${files} files, ${datasets.length} datasets, ${stations.length} stations`
  )
}

if (process.argv[1] === import.meta.filename) main()
