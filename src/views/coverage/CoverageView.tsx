import type { Manifest, Station } from '../../../shared/contract.ts'
import { getManifest, getStations, useData } from '../../api.ts'
import { CountyButtons, CoverageMap, getCountyLabel } from './CoverageMap.tsx'
import './coverage.css'
import {
  formatDay,
  formatDuration,
  formatFetchDay,
  formatHour,
  getCountyStatus,
  getDataRange,
  isStopped,
} from './report.ts'
import { useMemo, useState } from 'react'

type SidebarProps = {
  county: string | null
  stations: Station[]
  dataEnd: string
}

const StationItem = ({
  station,
  dataEnd,
}: {
  station: Station
  dataEnd: string
}) => {
  const stopped = isStopped(station, dataEnd)
  return (
    <li className="station" data-stopped={stopped}>
      <h3>{station.name}</h3>
      <p className="status">
        {stopped
          ? `Stopped reporting on ${formatDay(station.lastReport)}`
          : 'Reporting to the end of the data'}
      </p>
      <dl>
        <dt>Last report</dt>
        <dd>{formatHour(station.lastReport)}</dd>
        <dt>Reported for</dt>
        <dd>
          {formatDuration(station.firstReport, station.lastReport)}, from{' '}
          {formatDay(station.firstReport)}
        </dd>
      </dl>
    </li>
  )
}

const Sidebar = ({ county, stations, dataEnd }: SidebarProps) => {
  if (county === null) {
    return (
      <p className="hint">Click a county on the map to see its stations.</p>
    )
  }
  return (
    <>
      <h2>{getCountyLabel(county)}</h2>
      {stations.length === 0 ? (
        <p data-testid="no-station">
          This county has no air quality station in the data.
        </p>
      ) : (
        <ul className="stations" aria-label="Stations in this county">
          {stations.map(station => (
            <StationItem key={station.id} station={station} dataEnd={dataEnd} />
          ))}
        </ul>
      )}
    </>
  )
}

const Source = ({
  manifest,
  first,
  last,
}: {
  manifest: Manifest
  first: string
  last: string
}) => (
  <p className="source" data-testid="source">
    The data runs from {formatDay(first)} to {formatDay(last)}. Source:{' '}
    {manifest.source.name}, fetched {formatFetchDay(manifest.fetchedAt)}.
  </p>
)

// The load sits at module level, so its identity holds across renders.
const loadCoverage = async (signal: AbortSignal) => {
  const [stations, manifest] = await Promise.all([
    getStations(signal),
    getManifest(signal),
  ])
  return { stations, manifest }
}

const CoverageView = () => {
  const coverage = useData(loadCoverage)
  const [selected, setSelected] = useState<string | null>(null)
  const [counties, setCounties] = useState<string[]>([])

  const ready = coverage.status === 'ready' ? coverage.data : null
  const range = useMemo(
    () => (ready === null ? null : getDataRange(ready.stations)),
    [ready]
  )
  const statuses = useMemo(() => {
    const out = new Map<string, ReturnType<typeof getCountyStatus>>()
    if (ready === null || range === null) {
      return out
    }
    const names = new Set(ready.stations.map(station => station.county))
    for (const name of names) {
      const inCounty = ready.stations.filter(s => s.county === name)
      out.set(name, getCountyStatus(inCounty, range.last))
    }
    return out
  }, [ready, range])

  return (
    <main className="coverage">
      <h1>Coverage</h1>
      <p className="lede">
        Which air quality stations reported in Nova Scotia, and for how long.
      </p>
      {coverage.status === 'error' && (
        <p className="error" role="alert">
          Could not load the stations: {coverage.message}
        </p>
      )}
      {coverage.status === 'loading' && <p>Loading the stations…</p>}
      {ready !== null && range !== null && (
        <div className="coverage-layout">
          <CoverageMap
            statuses={statuses}
            selected={selected}
            onSelect={setSelected}
            onCounties={setCounties}
          />
          <CountyButtons
            counties={counties}
            statuses={statuses}
            selected={selected}
            onSelect={setSelected}
          />
          <aside className="coverage-sidebar" aria-label="Stations">
            <div aria-live="polite">
              <Sidebar
                county={selected}
                stations={ready.stations.filter(
                  station => station.county === selected
                )}
                dataEnd={range.last}
              />
            </div>
            <Source
              manifest={ready.manifest}
              first={range.first}
              last={range.last}
            />
          </aside>
        </div>
      )}
    </main>
  )
}

// React.lazy loads a module by its default export.
export default CoverageView
