import { worstVerdict } from '../shared/contract.ts'
import './map.css'
import { Footer, Health, HandoverNote, Readings } from './panels.tsx'
import './screen.css'
import { MapSkeleton } from './skeleton.tsx'
import { VERDICT_MARK, VERDICT_WORD, getHandover } from './stations.ts'
import { Tile, getAllVerdict, getScaleMax } from './tile.tsx'
import type { DashboardData } from './use-dashboard-data.ts'
import { getYearCounties, type YearStation } from './years.ts'
import { Suspense, lazy, useEffect, useMemo, useRef, useState } from 'react'

const ALL_VALUE = 'all'
const ALL_LABEL = 'All pollutants'

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

// Scroll the one container that holds the detail, and no ancestor of it:
// scrollIntoView also scrolls the page, which cuts off the top banner. The
// detail is the first child of the panel, and it rises 8 px as it enters, so
// the target is the content top of the panel and not the box of the detail.
const revealDetail = (panel: HTMLElement, behavior: ScrollBehavior) => {
  const style = getComputedStyle(panel)
  if (style.overflowY === 'auto' || style.overflowY === 'scroll') {
    panel.scrollTo({ top: 0, behavior })
    return
  }
  const top = panel.getBoundingClientRect().top + parseFloat(style.paddingTop)
  window.scrollTo({ top: window.scrollY + top, behavior })
}

const getAllCounties = (
  overview: DashboardData['overview'],
  stations: YearStation[]
) =>
  overview.counties.map(county => ({
    county: county.county,
    stations: county.stations,
    verdict: worstVerdict(
      stations
        .filter(s => county.stations.includes(s.station))
        .map(getAllVerdict)
    ),
  }))

export const Screen = ({ dashboard }: { dashboard: DashboardData }) => {
  const { overview, year, setYear, stations, station, setStation } = dashboard
  const pollutants = overview.pollutants
  const [pollutant, setPollutant] = useState<string | null>(null)
  const [open, setOpen] = useState(false)
  const [hot, setHot] = useState<string[]>([])
  const panelRef = useRef<HTMLDivElement>(null)
  const headingRef = useRef<HTMLHeadingElement>(null)
  const trigger = useRef<HTMLElement | null>(null)

  const scaleMax = useMemo(
    () => (pollutant === null ? 1 : getScaleMax(stations, pollutant)),
    [stations, pollutant]
  )
  const label = pollutants.find(p => p.code === pollutant)?.label ?? ALL_LABEL
  const picked = stations.find(s => s.station === station)
  if (station !== null && picked === undefined) {
    throw new Error(`the overview holds no station ${station}`)
  }
  const verdict =
    picked === undefined
      ? null
      : pollutant === null
        ? getAllVerdict(picked)
        : picked.verdicts[pollutant]
  const handover =
    picked === undefined ? null : getHandover(overview, picked.station)
  const counties = useMemo(
    () =>
      pollutant === null
        ? getAllCounties(overview, stations)
        : getYearCounties(overview, year, pollutant),
    [overview, stations, year, pollutant]
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
    if (panelRef.current !== null) {
      revealDetail(panelRef.current, behavior)
    }
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
              value={pollutant ?? ALL_VALUE}
              onChange={event =>
                setPollutant(
                  event.target.value === ALL_VALUE ? null : event.target.value
                )
              }
              data-testid="c-pollutant-select"
            >
              <option value={ALL_VALUE}>All</option>
              {pollutants.map(p => (
                <option key={p.code} value={p.code}>
                  {p.code}, {p.label}
                </option>
              ))}
            </select>
          </label>
          <div role="group" aria-label="Pollutant" className="c-buttons">
            <button
              type="button"
              title={ALL_LABEL}
              aria-pressed={pollutant === null}
              onClick={() => setPollutant(null)}
              data-testid="c-pollutant"
            >
              All
            </button>
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

      <div className="c-panel" ref={panelRef}>
        {open && picked !== undefined && verdict !== null ? (
          <section
            id="c-detail"
            className="c-detail"
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
                {pollutant ?? 'All'}{' '}
                <span aria-hidden="true">{VERDICT_MARK[verdict]}</span>{' '}
                <strong>{VERDICT_WORD[verdict]}</strong>
              </p>
              {handover !== null && (
                <HandoverNote handover={handover} years={overview.years} />
              )}
            </div>
            <div className="layout">
              <Readings
                dashboard={dashboard}
                pollutant={pollutant}
                onPollutant={setPollutant}
              />
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
          <p className="c-note" data-testid="c-colour-note">
            {pollutant === null
              ? 'Colour: the worst 3-year verdict of the station. The line counts the pollutants over and within the limit. Pick a tile or a county for the full readings.'
              : `Colour: the 3-year verdict. Bar: the peak day. Cells: the yearly peak, ${first} - ${last}. Pick a tile or a county for the full readings.`}
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
                handover={getHandover(overview, s.station)}
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
        <Suspense fallback={<MapSkeleton />}>
          <MapView counties={counties} onPick={pick} onHover={setHot} />
        </Suspense>
      </div>
    </main>
  )
}
