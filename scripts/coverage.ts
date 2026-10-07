import type { Station } from '../shared/contract.ts'
import { STATION_COUNTY } from '../shared/stations.ts'
import type { LoadedData, RawSeries } from './load.ts'
import { STATION_ORDER, stationRank } from './series.ts'
import { HOUR_MS, msStamp } from './time.ts'

// A station id is its name in lower case, with a hyphen for each space.
export const stationId = (name: string) => name.toLowerCase().replace(/ /g, '-')

// The coverage of each station counts the hours from its first report to its
// last report, never the hours of the whole window. A station that started
// late or stopped early is judged only on the years it ran.
export const deriveStations = (data: LoadedData): Station[] => {
  const byStation = new Map<string, RawSeries[]>()
  for (const s of data.series) {
    if (s.readings.size === 0) continue
    byStation.set(s.station, [...(byStation.get(s.station) ?? []), s])
  }

  const stations = [...byStation].map(([name, series]) => {
    const county = STATION_COUNTY[name]
    if (county === undefined) {
      throw new Error(`station ${name} has no county`)
    }
    let firstMs = Infinity
    let lastMs = -Infinity
    let reportedHours = 0
    for (const s of series) {
      for (const ms of s.readings.keys()) {
        firstMs = Math.min(firstMs, ms)
        lastMs = Math.max(lastMs, ms)
      }
      reportedHours += s.readings.size
    }
    const spanHours = (lastMs - firstMs) / HOUR_MS + 1

    return {
      id: stationId(name),
      name,
      county,
      firstReport: msStamp(firstMs),
      lastReport: msStamp(lastMs),
      series: series.map(s => s.pollutant).sort(),
      expectedHours: spanHours * series.length,
      reportedHours,
    }
  })

  if (stations.length !== STATION_ORDER.length) {
    throw new Error(
      `the data holds ${stations.length} stations, the station order ${STATION_ORDER.length}`
    )
  }
  return stations.sort((a, b) => stationRank(a.name) - stationRank(b.name))
}
