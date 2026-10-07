import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { readFetchRecord, sha256 } from './manifest.ts'

const ROOT = join(import.meta.dirname, '..')

// Check the raw files on this machine against data/fetch-record.json: each
// recorded file is on disk with its bytes and its SHA-256, and data/raw holds
// no file that the record does not list. CI has no raw files, so this check
// runs only where the raw files are.
export const checkRaw = (root: string) => {
  const defects: string[] = []
  const record = readFetchRecord(root)
  for (const entry of record) {
    const path = join(root, entry.file)
    if (!existsSync(path) || !statSync(path).isFile()) {
      defects.push(`${entry.file} is in the fetch record but not on disk`)
      continue
    }
    const bytes = readFileSync(path)
    if (bytes.length !== entry.bytes) {
      defects.push(
        `${entry.file} has ${bytes.length} bytes, the record says ${entry.bytes}`
      )
    }
    if (sha256(bytes) !== entry.sha256) {
      defects.push(`${entry.file} does not match its SHA-256 in the record`)
    }
  }

  const recorded = new Set(record.map(entry => entry.file))
  const rawDir = join(root, 'data', 'raw')
  for (const entry of readdirSync(rawDir, {
    recursive: true,
    withFileTypes: true,
  })) {
    if (entry.isDirectory()) continue
    const file = relative(root, join(entry.parentPath, entry.name))
    if (!recorded.has(file)) defects.push(`${file} is not in the fetch record`)
  }
  return { files: record.length, defects }
}

const main = () => {
  let result: ReturnType<typeof checkRaw>
  try {
    result = checkRaw(ROOT)
  } catch (error) {
    console.error('data:raw-check could not read:', (error as Error).message)
    process.exit(2)
  }
  for (const defect of result.defects) console.error(defect)
  if (result.defects.length > 0) {
    console.error(`data:raw-check found ${result.defects.length} defects`)
    process.exit(1)
  }
  console.log(`data:raw-check passed: ${result.files} files match the record`)
}

if (process.argv[1] === import.meta.filename) main()
