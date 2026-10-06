import {
  VERDICT_MARK,
  VERDICT_WORD,
  getSeriesVerdict,
  getStationVerdict,
} from './stations.ts'
// The map styles load with the page, so the map frame holds its size while
// the map code loads.
import './map.css'
import { Footer, Health, Readings } from './panels.tsx'
import './screen.css'
import { Tile, findSeries, getScaleMax } from './tile.tsx'
import type { DashboardData } from './use-dashboard-data.ts'
import {
  Suspense,
  lazy,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'

const DEFAULT_POLLUTANT = 'PM2.5'

// The map holds three.js, the largest part of the bundle. It loads in its own
// chunk, so the tiles show before it. A failed load shows in the map frame and
// leaves the rest of the page up.
const MapView = lazy(() =>
  import('./map.tsx')
    .then(module => ({ default: module.MapView }))
    .catch((error: unknown) => {
      console.error('🛰️  map code load failed:', error)
      return {
        default: () => (
          <div className="map-view">
            <div className="map-frame">
              <p className="error">Could not load the map: {String(error)}</p>
            </div>
          </div>
        ),
      }
    })
)

// The pollutants of all stations, in the order that the data lists them.
const getPollutants = (overview: DashboardData['overview']) => {
  const found = new Map<string, string>()
  for (const station of overview.stations) {
    for (const series of station.series) {
      if (!found.has(series.pollutant)) {
        found.set(series.pollutant, series.label)
      }
    }
  }
  return [...found].map(([code, label]) => ({ code, label }))
}

type StationSearchProps = {
  overview: DashboardData['overview']
  onPick: (station: string) => void
}

const StationSearch = ({ overview, onPick }: StationSearchProps) => {
  const [text, setText] = useState('')

  return (
    <label className="c-search">
      <span>Find a station</span>
      <input
        type="search"
        list="c-stations"
        placeholder="Find a station"
        autoComplete="off"
        value={text}
        onChange={event => {
          setText(event.target.value)
          const hit = overview.stations.find(
            s => s.station.toLowerCase() === event.target.value.toLowerCase()
          )
          if (hit !== undefined) {
            setText('')
            onPick(hit.station)
          }
        }}
      />
      <datalist id="c-stations">
        {overview.stations.map(s => (
          <option key={s.station} value={s.station} />
        ))}
      </datalist>
    </label>
  )
}

export const Screen = ({ dashboard }: { dashboard: DashboardData }) => {
  const { overview, station, setStation } = dashboard
  const pollutants = useMemo(() => getPollutants(overview), [overview])
  const [pollutant, setPollutant] = useState(
    pollutants.some(p => p.code === DEFAULT_POLLUTANT)
      ? DEFAULT_POLLUTANT
      : (pollutants[0]?.code ?? '')
  )
  const [open, setOpen] = useState(false)
  const [hot, setHot] = useState<string | null>(null)
  const detailRef = useRef<HTMLElement>(null)
  const headingRef = useRef<HTMLHeadingElement>(null)
  const trigger = useRef<HTMLElement | null>(null)

  const scaleMax = useMemo(
    () => getScaleMax(overview.stations, pollutant),
    [overview, pollutant]
  )
  const label = pollutants.find(p => p.code === pollutant)?.label ?? pollutant
  const picked = overview.stations.find(s => s.station === station)
  if (station !== null && picked === undefined) {
    throw new Error(`the overview holds no station ${station}`)
  }
  const overall = picked === undefined ? null : getStationVerdict(picked)
  const getVerdict = useCallback(
    (name: string) => {
      const found = overview.stations.find(s => s.station === name)
      const series = found && findSeries(found, pollutant)
      return series ? getSeriesVerdict(series) : 'none'
    },
    [overview, pollutant]
  )

  const pick = (name: string) => {
    trigger.current = document.activeElement as HTMLElement | null
    setStation(name)
    setOpen(true)
  }

  const close = () => setOpen(false)

  // The readings open in the data panel, in place of the tiles, and the
  // focus moves to their heading. On a wide screen only the panel scrolls. A
  // switch of station inside the readings keeps the focus where it is, so the
  // arrow keys can step through the station select.
  useEffect(() => {
    if (!open) {
      return
    }

    const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches
    const behavior = reducedMotion ? 'auto' : 'smooth'
    detailRef.current?.scrollIntoView({ behavior, block: 'start' })
    headingRef.current?.focus({ preventScroll: true })
  }, [open])

  // The focus goes back to the control that opened the readings. The tiles
  // stay mounted, hidden, while the readings show, so a tile can take the
  // focus back once this render shows it again.
  useEffect(() => {
    if (!open && trigger.current?.isConnected) {
      trigger.current.focus()
    }
  }, [open])

  useEffect(() => {
    if (!open) {
      return
    }

    // The close of the detail sets state only, so the stale copy of it that
    // this effect holds is safe. An open select keeps its own Escape.
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement
      if (event.key === 'Escape' && target.closest('select, input') === null) {
        close()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  const setHotFromPin = (target: EventTarget) => {
    const pin = (target as HTMLElement).closest<HTMLElement>('.map-marker')
    setHot(pin?.dataset.station ?? null)
  }

  const source = overview.source
  const first = overview.window.start.slice(0, 10)
  const last = overview.window.end.slice(0, 10)
  const data = `${first} to ${last}`

  return (
    <main className="c-page">
      <header className="c-top">
        <div className="c-title">
          <h1>{overview.project}</h1>
          <p>Nova Scotia stations, hourly readings, {data}.</p>
        </div>
        <StationSearch overview={overview} onPick={pick} />
        <div className="c-pollutants">
          <label className="c-select">
            <span>Pollutant</span>
            <select
              value={pollutant}
              onChange={event => setPollutant(event.target.value)}
              data-testid="c-pollutant-select"
            >
              {pollutants.map(p => (
                <option key={p.code} value={p.code}>
                  {p.code}, {p.label}
                </option>
              ))}
            </select>
          </label>
          <div role="group" aria-label="Pollutant" className="c-buttons">
            {pollutants.map(p => (
              <button
                key={p.code}
                type="button"
                title={p.label}
                aria-pressed={p.code === pollutant}
                onClick={() => setPollutant(p.code)}
                data-testid="c-pollutant"
              >
                {p.code}
              </button>
            ))}
          </div>
        </div>
      </header>

      <div className="c-panel">
        {open && picked !== undefined && overall !== null ? (
          <section
            id="c-detail"
            className="c-detail"
            ref={detailRef}
            aria-labelledby="c-detail-h"
            data-testid="c-detail"
          >
            <div className="c-detail-head">
              <button type="button" className="c-close" onClick={close}>
                ← Back to all stations
              </button>
              <h2 id="c-detail-h" tabIndex={-1} ref={headingRef}>
                {picked.station}
              </h2>
              <p className="c-verdict">
                <span aria-hidden="true">{VERDICT_MARK[overall]}</span>{' '}
                <strong>{VERDICT_WORD[overall]}</strong>, all pollutants
              </p>
            </div>
            <div className="layout">
              <Readings dashboard={dashboard} />
              <Health
                stations={overview.stations}
                picked={picked.station}
                onPick={setStation}
              />
            </div>
          </section>
        ) : null}
        <section className="c-grid" aria-labelledby="c-grid-h" hidden={open}>
          <h2 id="c-grid-h">{label} at each station</h2>
          <p className="c-note">
            Every tile uses the same scale. The bar is the highest value as a
            share of the limit, and the tick is the limit. The strip below it is
            the share of hours that reported; the hatched part is missing. Pick
            a tile or a pin for the full readings.
          </p>
          <div className="c-tiles">
            {overview.stations.map(s => (
              <Tile
                key={s.station}
                station={s}
                pollutant={pollutant}
                scaleMax={scaleMax}
                picked={s.station === station}
                hot={s.station === hot}
                onPick={pick}
                onHot={setHot}
              />
            ))}
          </div>
        </section>

        <details className="c-about">
          <summary>About this data</summary>
          <dl>
            <div>
              <dt>Window starts</dt>
              <dd data-testid="window-start">{overview.window.start}</dd>
            </div>
            <div>
              <dt>Data ends</dt>
              <dd data-testid="data-end">{overview.window.end}</dd>
            </div>
            <div>
              <dt>Time</dt>
              <dd>{overview.window.timeNote}</dd>
            </div>
            <div>
              <dt>Source</dt>
              <dd>
                {source.name},{' '}
                <a href={source.site} target="_blank" rel="noopener noreferrer">
                  {source.site}
                </a>
                . Licence:{' '}
                <a
                  href={source.licence.url}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {source.licence.name}
                </a>
              </dd>
            </div>
          </dl>
        </details>
        <Footer />
      </div>

      <div
        className="c-map"
        onPointerOver={event => setHotFromPin(event.target)}
        onPointerLeave={() => setHot(null)}
        onFocus={event => setHotFromPin(event.target)}
        onBlur={() => setHot(null)}
      >
        <Suspense
          fallback={
            <div className="map-view">
              <div className="map-frame" />
            </div>
          }
        >
          <MapView
            overview={overview}
            station={station}
            onPick={pick}
            getVerdict={getVerdict}
            hotStation={hot ?? undefined}
          />
        </Suspense>
      </div>
    </main>
  )
}
