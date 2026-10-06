import type { Overview, StationReadings } from '../scripts/derive.ts'
import { getOverview, getReadings } from './api.ts'
import { getDefaultYear, getYearStations, type YearStation } from './years.ts'
import { useEffect, useMemo, useState } from 'react'

export type DashboardData = {
  overview: Overview
  // The year that the tiles, the map, and the readings show.
  year: number
  setYear: (y: number) => void
  // The stations as the year shows them.
  stations: YearStation[]
  // Null until the first pick, so no readings load before a station is asked
  // for.
  station: string | null
  setStation: (s: string) => void
  // A month of the year, or '' for the whole year.
  month: string
  setMonth: (m: string) => void
  // The readings of the picked station in the year, undefined while they load.
  data: StationReadings | undefined
  failed: string | null
}

export type DashboardState =
  | { kind: 'loading' }
  | { kind: 'failed'; text: string }
  | { kind: 'ready'; dashboard: DashboardData }

// The one source of the data for every layout: the overview, the year, the
// readings of the picked station in that year, the picked station, and the
// month.
export const useDashboardData = () => {
  const [overview, setOverview] = useState<Overview | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [station, setStation] = useState<string | null>(null)
  const [month, setMonth] = useState('')
  const [pickedYear, setPickedYear] = useState<number | null>(null)
  // Each station and year loads once. A later visit shows its readings in the
  // first frame, with no request.
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
  const key = `${station}/${year}`
  const data = station === null ? undefined : byKey[key]
  useEffect(() => {
    if (station === null || overview === null || data !== undefined) {
      return
    }
    // A click on the next station or year aborts this request, so a stale
    // answer never lands.
    const controller = new AbortController()
    getReadings(station, year, controller.signal)
      .then(readings => {
        const done = `${readings.station}/${readings.year}`
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
    // A month belongs to one year.
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
