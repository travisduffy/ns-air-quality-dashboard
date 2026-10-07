import { mkdirSync, renameSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

const sortKeys = (_key: string, value: unknown) =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
    ? Object.fromEntries(
        Object.entries(value).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      )
    : value

// The one text form of a data file: keys sorted at every level, two-space
// indent, and a final newline. The same value always gives the same bytes.
export const stableJson = (value: unknown) =>
  JSON.stringify(value, sortKeys, 2) + '\n'

// The fabric files hold about 30,000 numbers each, so they drop the indent.
export const compactJson = (value: unknown) =>
  JSON.stringify(value, sortKeys) + '\n'

// Each file goes to a temporary name first and then moves into place, so a
// reader never sees half a file.
export const writeFiles = (
  outDir: string,
  files: { path: string; text: string }[]
) => {
  for (const { path, text } of files) {
    const target = join(outDir, path)
    mkdirSync(dirname(target), { recursive: true })
    const temp = `${target}.${process.pid}.tmp`
    writeFileSync(temp, text)
    renameSync(temp, target)
  }
}
