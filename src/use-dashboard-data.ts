import type { Overview, StationReadings } from '../scripts/derive.ts'
import { getOverview, getReadings } from './api.ts'
import { useEffect, useState } from 'react'

export type DashboardData = {
  overview: Overview
  // Null until the first pick, so no readings load before a station is asked
  // for.
  station: string | null
  setStation: (s: string) => void
  month: string
  setMonth: (m: string) => void
  // The readings of the picked station, undefined while they load.
  data: StationReadings | undefined
  failed: string | null
}

export type DashboardState =
  | { kind: 'loading' }
  | { kind: 'failed'; text: string }
  | { kind: 'ready'; dashboard: DashboardData }

// The one source of the live data for every layout: the overview, the readings
// of the picked station, the picked station, and the month.
export const useDashboardData = () => {
  const [overview, setOverview] = useState<Overview | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [station, setStation] = useState<string | null>(null)
  const [month, setMonth] = useState('')
  // Each station loads once. A later visit shows its readings in the first
  // frame, with no request.
  const [byStation, setByStation] = useState<Record<string, StationReadings>>(
    {}
  )
  const [readError, setReadError] = useState<{
    station: string
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
  const data = station === null ? undefined : byStation[station]
  useEffect(() => {
    if (station === null || data !== undefined) {
      return
    }
    // A click on the next station aborts this request, so a stale answer never
    // lands.
    const controller = new AbortController()
    getReadings(station, controller.signal)
      .then(readings => {
        setByStation(known => ({ ...known, [readings.station]: readings }))
        setReadError(known =>
          known !== null && known.station === readings.station ? null : known
        )
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted) {
          setReadError({ station, text: String(error) })
        }
      })
    return () => controller.abort()
  }, [station, data])
  if (error !== null) {
    return { kind: 'failed' as const, text: error }
  }
  if (overview === null) {
    return { kind: 'loading' as const }
  }
  const failed =
    readError !== null && readError.station === station ? readError.text : null
  return {
    kind: 'ready' as const,
    dashboard: { overview, station, setStation, month, setMonth, data, failed },
  }
}
