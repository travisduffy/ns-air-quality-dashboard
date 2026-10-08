import './map.css'
import { Footer, Health, Readings } from './panels.tsx'
import './screen.css'
import { VERDICT_MARK, VERDICT_WORD } from './stations.ts'
import { Tile, getScaleMax } from './tile.tsx'
import type { DashboardData } from './use-dashboard-data.ts'
import { getYearCounties } from './years.ts'
import { Suspense, lazy, useEffect, useMemo, useRef, useState } from 'react'

const DEFAULT_POLLUTANT = 'PM2.5'

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
  const { overview, year, setYear, stations, station, setStation } = dashboard
  const pollutants = overview.pollutants
  const [pollutant, setPollutant] = useState(
    pollutants.some(p => p.code === DEFAULT_POLLUTANT)
      ? DEFAULT_POLLUTANT
      : (pollutants[0]?.code ?? '')
  )
  const [open, setOpen] = useState(false)
  const [hot, setHot] = useState<string[]>([])
  const detailRef = useRef<HTMLElement>(null)
  const headingRef = useRef<HTMLHeadingElement>(null)
  const trigger = useRef<HTMLElement | null>(null)

  const scaleMax = useMemo(
    () => getScaleMax(stations, pollutant),
    [stations, pollutant]
  )
  const label = pollutants.find(p => p.code === pollutant)?.label ?? pollutant
  const picked = stations.find(s => s.station === station)
  if (station !== null && picked === undefined) {
    throw new Error(`the overview holds no station ${station}`)
  }
  const verdict = picked === undefined ? null : picked.verdicts[pollutant]
  const counties = useMemo(
    () => getYearCounties(overview, year, pollutant),
    [overview, year, pollutant]
  )

  const pick = (name: string) => {
    trigger.current = document.activeElement as HTMLElement | null
    setStation(name)
    setOpen(true)
  }

  const close = () => setOpen(false)

  useEffect(() => {
    if (!open) {
      return
    }

    const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches
    const behavior = reducedMotion ? 'auto' : 'smooth'
    detailRef.current?.scrollIntoView({ behavior, block: 'start' })
    headingRef.current?.focus({ preventScroll: true })
  }, [open])

  useEffect(() => {
    if (!open && trigger.current?.isConnected) {
      trigger.current.focus()
    }
  }, [open])

  useEffect(() => {
    if (!open) {
      return
    }

    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement
      if (event.key === 'Escape' && target.closest('select, input') === null) {
        close()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  const source = overview.source
  const first = overview.years[0]
  const last = overview.years[overview.years.length - 1]

  return (
    <main className="c-page">
      <header className="c-top">
        <div className="c-title">
          <h1>{overview.project}</h1>
          <p>
            Historical hourly readings {first} - {last}, Nova Scotia Open Data.
          </p>
        </div>
        <StationSearch overview={overview} onPick={pick} />
        <label className="c-year">
          <span>Year</span>
          <select
            value={year}
            onChange={event => setYear(Number(event.target.value))}
            data-testid="c-year-select"
          >
            {overview.years.map(y => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
        </label>
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
        {open && picked !== undefined && verdict !== null ? (
          <section
            id="c-detail"
            className="c-detail"
            ref={detailRef}
            aria-labelledby="c-detail-h"
            data-testid="c-detail"
          >
            <div className="c-detail-head">
              <button type="button" className="c-close" onClick={close}>
                ← All stations
              </button>
              <h2 id="c-detail-h" tabIndex={-1} ref={headingRef}>
                {picked.station}
              </h2>
              <p className="c-verdict" data-testid="c-detail-verdict">
                {pollutant}{' '}
                <span aria-hidden="true">{VERDICT_MARK[verdict]}</span>{' '}
                <strong>{VERDICT_WORD[verdict]}</strong>
              </p>
            </div>
            <div className="layout">
              <Readings dashboard={dashboard} pollutant={pollutant} />
              <Health
                stations={stations}
                picked={picked.station}
                onPick={setStation}
              />
            </div>
          </section>
        ) : null}
        <section className="c-grid" aria-labelledby="c-grid-h" hidden={open}>
          <h2 id="c-grid-h">
            {label} at each station, {year}
          </h2>
          <p className="c-note">
            Colour: the 3-year verdict. Bar: the peak day. Cells: the yearly
            peak, {first} - {last}. Pick a tile or a county for the full
            readings.
          </p>
          <p className="c-note" data-testid="c-limits-note">
            Every year is judged by the official 3-year statistic of the current
            limits.
          </p>
          <div className="c-tiles">
            {stations.map(s => (
              <Tile
                key={s.station}
                station={s}
                pollutant={pollutant}
                year={year}
                scaleMax={scaleMax}
                picked={s.station === station}
                hot={hot.includes(s.station)}
                onPick={pick}
                onHot={name => setHot(name === null ? [] : [name])}
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
            {source.corrections.length > 0 && (
              <div>
                <dt>Changes to the source rows</dt>
                <dd data-testid="corrections">
                  <ul>
                    {source.corrections.map(text => (
                      <li key={text}>{text}</li>
                    ))}
                  </ul>
                </dd>
              </div>
            )}
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

      <div className="c-map">
        <Suspense
          fallback={
            <div className="map-view">
              <div className="map-frame" />
            </div>
          }
        >
          <MapView
            counties={counties}
            station={station}
            onPick={pick}
            onHover={setHot}
          />
        </Suspense>
      </div>
    </main>
  )
}
