import { join } from 'node:path'
import { derive } from './derive.ts'
import { emitData } from './emit.ts'
import { loadData } from './load.ts'

const ROOT = join(import.meta.dirname, '..')

const main = () => {
  const derived = derive(loadData(ROOT))
  const paths = emitData(derived, join(ROOT, 'public'))
  const { start, end, hours } = derived.overview.window
  console.log(
    'data:',
    `${paths.length} files, ${start} to ${end}, ${hours} hours`
  )
}

main()
