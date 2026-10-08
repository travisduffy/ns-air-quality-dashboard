import type { VerdictState } from '../shared/contract.ts'
import type { YearStation } from './years.ts'

export type Station = YearStation

export const VERDICT_COLOR: Record<VerdictState | 'idle', string> = {
  over: '#d9534f',
  within: '#4caf6a',
  none: '#e0b43c',
  nodata: '#d9cfc0',
  absent: '#ece7df',
  idle: '#c9d3d9',
}

export const SEA_COLOR = '#aebfca'

export const VERDICT_MARK: Record<VerdictState, string> = {
  over: '▲',
  within: '●',
  none: '○',
  nodata: '–',
  absent: '×',
}

export const VERDICT_WORD: Record<VerdictState, string> = {
  over: 'Over the limit',
  within: 'Within the limit',
  none: 'No official limit',
  nodata: 'No readings this year',
  absent: 'Not measured',
}

export const isNovaScotia = (county: string) => county.endsWith(', NS')

export const getCountyColor = (
  county: string,
  verdict: VerdictState | undefined
) => {
  if (!isNovaScotia(county)) {
    return SEA_COLOR
  }
  return verdict === undefined ? VERDICT_COLOR.idle : VERDICT_COLOR[verdict]
}
