import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { Derived } from './derive.ts'

const STATION_NAME = /^[A-Za-z][A-Za-z0-9 .-]*$/

export const emitData = (derived: Derived, outDir: string) => {
  mkdirSync(join(outDir, 'readings'), { recursive: true })

  const paths = [join(outDir, 'overview.json')]
  writeFileSync(paths[0]!, JSON.stringify(derived.overview) + '\n')

  for (const readings of derived.readings.values()) {
    const { station, year } = readings
    if (!STATION_NAME.test(station)) {
      throw new Error(`station name is not a safe file name: ${station}`)
    }
    if (!Number.isInteger(year)) {
      throw new Error(`year is not an integer: ${year}`)
    }
    const dir = join(outDir, 'readings', station)
    mkdirSync(dir, { recursive: true })
    const path = join(dir, `${year}.json`)
    writeFileSync(path, JSON.stringify(readings) + '\n')
    paths.push(path)
  }
  return paths
}
