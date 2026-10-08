import {
  readingsKey,
  type Overview,
  type StationReadings,
} from '../shared/contract.ts'
import { getOverview, getReadings } from './api.ts'
import { getDefaultYear, getYearStations, type YearStation } from './years.ts'
import { useEffect, useMemo, useState } from 'react'

export type DashboardData = {
  overview: Overview
  year: number
  setYear: (y: number) => void
  stations: YearStation[]
  station: string | null
  setStation: (s: string) => void
  month: string
  setMonth: (m: string) => void
  data: StationReadings | undefined
  failed: string | null
}

export type DashboardState =
  | { kind: 'loading' }
  | { kind: 'failed'; text: string }
  | { kind: 'ready'; dashboard: DashboardData }

export const useDashboardData = () => {
  const [overview, setOverview] = useState<Overview | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [station, setStation] = useState<string | null>(null)
  const [month, setMonth] = useState('')
  const [pickedYear, setPickedYear] = useState<number | null>(null)
  const [byKey, setByKey] = useState<Record<string, StationReadings>>({})
  const [readError, setReadError] = useState<{
    key: string
    text: string
  } | null>(null)
  useEffect(() => {
    getOverview()
      .then(overview => {
        if (overview.stations.length === 0) {
          setError('the overview holds no station')
          return
        }
        setOverview(overview)
      })
      .catch((error: unknown) => setError(String(error)))
  }, [])
  const year = pickedYear ?? (overview === null ? 0 : getDefaultYear(overview))
  const stations = useMemo(
    () => (overview === null ? [] : getYearStations(overview, year)),
    [overview, year]
  )
  const key = readingsKey(station ?? '', year)
  const data = station === null ? undefined : byKey[key]
  useEffect(() => {
    if (station === null || overview === null || data !== undefined) {
      return
    }
    const controller = new AbortController()
    getReadings(station, year, controller.signal)
      .then(readings => {
        const done = readingsKey(readings.station, readings.year)
        setByKey(known => ({ ...known, [done]: readings }))
        setReadError(known =>
          known !== null && known.key === done ? null : known
        )
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted) {
          setReadError({ key, text: String(error) })
        }
      })
    return () => controller.abort()
  }, [station, year, key, overview, data])
  const setYear = (y: number) => {
    setPickedYear(y)
    setMonth('')
  }
  if (error !== null) {
    return { kind: 'failed' as const, text: error }
  }
  if (overview === null) {
    return { kind: 'loading' as const }
  }
  const failed =
    readError !== null && readError.key === key ? readError.text : null
  return {
    kind: 'ready' as const,
    dashboard: {
      overview,
      year,
      setYear,
      stations,
      station,
      setStation,
      month,
      setMonth,
      data,
      failed,
    },
  }
}
