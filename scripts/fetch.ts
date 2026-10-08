import { createHash } from 'node:crypto'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

const ROOT = join(import.meta.dirname, '..')

const PAGE_SIZE = 50_000
const ATTEMPTS = 3

type Entry = {
  file: string
  datasetId: string | null
  name: string | null
  url: string
  fetchedAt: string
  httpStatus: number
  rows: number | null
  bytes: number
  sha256: string
}

const get = async (url: string) => {
  for (let attempt = 1; ; attempt++) {
    try {
      const response = await fetch(url)
      if (response.ok) {
        return {
          status: response.status,
          bytes: Buffer.from(await response.arrayBuffer()),
        }
      }
      if (attempt === ATTEMPTS || response.status < 500) {
        throw new Error(`${response.status} for ${url}`)
      }
    } catch (error) {
      if (attempt === ATTEMPTS) throw error
    }
    await new Promise(resolve => setTimeout(resolve, attempt * 2000))
  }
}

const pageUrl = (id: string, origin: string, since: string, page: number) =>
  `${origin}/resource/${id}.json?$where=date_time%20%3E%3D%20'${encodeURIComponent(since)}'` +
  `&$order=%3Aid&$limit=${PAGE_SIZE}&$offset=${page * PAGE_SIZE}`

const main = async () => {
  const path = join(ROOT, 'data/fetch-record.json')
  const old = JSON.parse(readFileSync(path, 'utf8')) as {
    since: string
    files: Entry[]
  }
  const before = new Map(old.files.map(f => [f.file, f.sha256]))
  const files: Entry[] = []
  let changed = 0

  const save = (
    entry: Pick<Entry, 'file' | 'datasetId' | 'name' | 'url'>,
    result: { status: number; bytes: Buffer },
    rows: number | null
  ) => {
    mkdirSync(dirname(join(ROOT, entry.file)), { recursive: true })
    writeFileSync(join(ROOT, entry.file), result.bytes)
    const sha256 = createHash('sha256').update(result.bytes).digest('hex')
    files.push({
      ...entry,
      fetchedAt: new Date().toISOString(),
      httpStatus: result.status,
      rows,
      bytes: result.bytes.length,
      sha256,
    })
    const known = before.get(entry.file)
    if (known !== undefined && known !== sha256) {
      changed++
      console.warn(`changed since the record: ${entry.file}`)
    }
  }

  for (const entry of old.files) {
    if (/\/page-\d+\.json$/.test(entry.file)) continue
    save(entry, await get(entry.url), null)
    if (entry.datasetId === null) continue

    const origin = new URL(entry.url).origin
    for (let page = 0; ; page++) {
      const url = pageUrl(entry.datasetId, origin, old.since, page)
      const result = await get(url)
      const rows = (JSON.parse(result.bytes.toString('utf8')) as unknown[])
        .length
      save(
        {
          file: `data/raw/${entry.datasetId}/page-${page}.json`,
          datasetId: entry.datasetId,
          name: entry.name,
          url,
        },
        result,
        rows
      )
      console.log(`${entry.datasetId} page ${page}: ${rows} rows`)
      if (rows < PAGE_SIZE) break
    }
  }

  writeFileSync(
    path,
    JSON.stringify({ since: old.since, files }, null, 2) + '\n'
  )
  console.log(`fetched ${files.length} files, ${changed} changed`)
}

main()
