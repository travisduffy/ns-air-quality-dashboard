import { join } from 'node:path'
import { derive } from './derive.ts'
import { emitData } from './emit.ts'
import { deriveFabrics } from './fabric.ts'
import { HANDOVERS } from './handovers.ts'
import { loadCounties, loadData } from './load.ts'
import { withHandovers } from './merge.ts'

const ROOT = join(import.meta.dirname, '..')

const main = () => {
  const data = loadData(ROOT)
  const derived = withHandovers(
    derive(data, loadCounties(ROOT, data)),
    HANDOVERS
  )
  const paths = emitData(
    derived,
    join(ROOT, 'public'),
    deriveFabrics(data, derived)
  )
  const { start, end, hours } = derived.overview.window
  console.log(
    'data:',
    `${paths.length} files, ${start} to ${end}, ${hours} hours, ${derived.overview.years.length} years`
  )
}

main()
