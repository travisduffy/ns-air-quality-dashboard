import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { SCHEMA_VERSION, type Manifest } from '../shared/contract.ts'
import type { LoadedData } from './load.ts'

export const SOURCE_NAME =
  'Nova Scotia Provincial Ambient Hourly air quality data'

export type RecordFile = {
  file: string
  datasetId: string | null
  name?: string | null
  url: string
  fetchedAt: string
  rows: number | null
  bytes: number
  sha256: string
}

export type EmittedFile = { path: string; text: string }

export const sha256 = (data: string | Buffer) =>
  createHash('sha256').update(data).digest('hex')

export const readFetchRecord = (root: string) => {
  const record = JSON.parse(
    readFileSync(join(root, 'data', 'fetch-record.json'), 'utf8')
  ) as { files: RecordFile[] }
  if (!Array.isArray(record.files)) {
    throw new Error('data/fetch-record.json lists no files')
  }
  return record.files
}

// One entry for each dataset of the fetch record. The hash of a dataset is
// the SHA-256 of its page files joined in the order of the record, so that
// `cat page-0.json page-1.json | sha256sum` gives the same value.
export const describeDatasets = (root: string, files: RecordFile[]) => {
  const pages = new Map<string, RecordFile[]>()
  for (const f of files) {
    if (f.datasetId === null || !/\/page-\d+\.json$/.test(f.file)) continue
    pages.set(f.datasetId, [...(pages.get(f.datasetId) ?? []), f])
  }

  return [...pages]
    .map(([id, list]) => {
      const hash = createHash('sha256')
      let rows = 0
      for (const page of list) {
        if (page.rows === null) {
          throw new Error(`${page.file} has no row count in the fetch record`)
        }
        hash.update(readFileSync(join(root, page.file)))
        rows += page.rows
      }
      const first = list[0]!
      const url = new URL(first.url)
      return {
        id,
        name: first.name ?? id,
        url: `${url.origin}${url.pathname}`,
        fetchedAt: list.map(p => p.fetchedAt).sort()[list.length - 1]!,
        rows,
        sha256: hash.digest('hex'),
      }
    })
    .sort((a, b) => (a.id < b.id ? -1 : 1))
}

// The manifest holds no build time, so that two builds of the same raw files
// give the same bytes.
export const buildManifest = (
  data: LoadedData,
  datasets: Manifest['datasets'],
  emitted: EmittedFile[]
): Manifest => ({
  schemaVersion: SCHEMA_VERSION,
  source: { name: SOURCE_NAME, site: data.site, licence: data.licence.name },
  fetchedAt: data.fetchedLast,
  datasets,
  files: emitted
    .map(f => ({
      path: f.path,
      bytes: Buffer.byteLength(f.text),
      sha256: sha256(f.text),
    }))
    .sort((a, b) => (a.path < b.path ? -1 : 1)),
})
