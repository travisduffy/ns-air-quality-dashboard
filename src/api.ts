import {
  readingsPath,
  type Overview,
  type StationReadings,
} from '../shared/contract.ts'

const getJson = async <T>(path: string, signal?: AbortSignal) => {
  const response = await fetch(`${import.meta.env.BASE_URL}${path}`, { signal })
  if (!response.ok) {
    throw new Error(`${path} answered ${response.status}`)
  }
  return (await response.json()) as T
}

export const getOverview = () => getJson<Overview>('overview.json')

export const getReadings = (
  station: string,
  year: number,
  signal?: AbortSignal
) =>
  getJson<StationReadings>(
    readingsPath(encodeURIComponent(station), year),
    signal
  )
