import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { Derived } from './derive.ts'

// A station name is a file name. Refuse any name that could leave the folder.
const STATION_NAME = /^[A-Za-z][A-Za-z0-9 .-]*$/

// Write the site data as static files: overview.json, and one file per
// station in readings/. The files hold compact JSON.
export const emitData = (derived: Derived, outDir: string) => {
  mkdirSync(join(outDir, 'readings'), { recursive: true })

  const paths = [join(outDir, 'overview.json')]
  writeFileSync(paths[0]!, JSON.stringify(derived.overview) + '\n')

  for (const [station, readings] of derived.readings) {
    if (!STATION_NAME.test(station)) {
      throw new Error(`station name is not a safe file name: ${station}`)
    }
    const path = join(outDir, 'readings', `${station}.json`)
    writeFileSync(path, JSON.stringify(readings) + '\n')
    paths.push(path)
  }
  return paths
}
