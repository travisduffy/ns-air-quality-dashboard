import {
  existsSync,
  mkdirSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { dirname, join } from 'node:path'
import {
  fabricPath,
  readingsPath,
  type StationFabric,
} from '../shared/contract.ts'
import type { Derived } from './derive.ts'

const STATION_NAME = /^[A-Za-z][A-Za-z0-9 .-]*$/
const POLLUTANT_CODE = /^[A-Za-z][A-Za-z0-9.]*$/

export const emitData = (
  derived: Derived,
  outDir: string,
  fabrics: StationFabric[] = []
) => {
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
    const path = join(outDir, readingsPath(station, year))
    mkdirSync(dirname(path), { recursive: true })
    writeFileSync(path, JSON.stringify(readings) + '\n')
    paths.push(path)
  }

  for (const fabric of fabrics) {
    const { station, pollutant } = fabric
    if (!STATION_NAME.test(station)) {
      throw new Error(`station name is not a safe file name: ${station}`)
    }
    if (!POLLUTANT_CODE.test(pollutant)) {
      throw new Error(`pollutant is not a safe file name: ${pollutant}`)
    }
    const path = join(outDir, fabricPath(station, pollutant))
    mkdirSync(dirname(path), { recursive: true })
    writeFileSync(path, JSON.stringify(fabric) + '\n')
    paths.push(path)
  }

  const kept = new Set(paths.map(path => dirname(path)))
  for (const dir of ['readings', 'fabric']) {
    const root = join(outDir, dir)
    if (!existsSync(root)) {
      continue
    }
    for (const name of readdirSync(root)) {
      if (!kept.has(join(root, name))) {
        rmSync(join(root, name), { recursive: true })
      }
    }
  }
  return paths
}
