import { createHash } from 'node:crypto'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

const ROOT = join(import.meta.dirname, '..')

type Entry = { file: string; url: string; sha256: string }

const main = async () => {
  const record = JSON.parse(
    readFileSync(join(ROOT, 'data/fetch-record.json'), 'utf8')
  )

  let changed = 0
  for (const entry of record.files as Entry[]) {
    const response = await fetch(entry.url)
    if (!response.ok) {
      throw new Error(`${response.status} for ${entry.url}`)
    }

    const bytes = Buffer.from(await response.arrayBuffer())
    mkdirSync(dirname(join(ROOT, entry.file)), { recursive: true })
    writeFileSync(join(ROOT, entry.file), bytes)

    // A source can serve new bytes later, such as a corrected reading.
    const sha256 = createHash('sha256').update(bytes).digest('hex')
    if (sha256 !== entry.sha256) {
      changed++
      console.warn(`changed since the record: ${entry.file}`)
    }
  }
  console.log(`fetched ${record.files.length} files, ${changed} changed`)
}

main()
