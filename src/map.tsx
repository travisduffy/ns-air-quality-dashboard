import type { Overview } from '../scripts/derive.ts'
import {
  STATION_COUNTY,
  VERDICT_COLOR,
  VERDICT_WORD,
  getCountyColor,
  getCountyVerdicts,
  isNovaScotia,
  type Verdict,
} from './stations.ts'
import { MapEngine } from '@travisduffy/map-engine'
import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'

type County = { county: string; verdict: Verdict; stations: string[] }
type Chooser = { county: string; x: number; y: number }
type Box = [number, number, number, number]

const MAP_URL = `${import.meta.env.BASE_URL}map.png`
const SECTORS_URL = `${import.meta.env.BASE_URL}sectors.json`
const PADDING_PX = 16
const FIT_OPTIONS = { padding: PADDING_PX, keepOnResize: true }
const CHOOSER_MARGIN_PX = 8

// The sector name is "Kings, NS", and the people say "Kings County".
const getCountyLabel = (county: string) =>
  `${county.replace(/, NS$/, '')} County`

const getSectorName = (engine: MapEngine, key: string) => {
  const sector = engine.getSector(key)
  if (sector === undefined) {
    throw new Error(`the map holds no sector ${key}`)
  }
  return sector.name
}

const getNovaScotiaBox = (engine: MapEngine) => {
  const box: Box = [Infinity, Infinity, -Infinity, -Infinity]
  for (const key of engine.getSectorKeys()) {
    if (!isNovaScotia(getSectorName(engine, key))) {
      continue
    }
    const [a, b, c, d] = engine.getBBox(key)
    box[0] = Math.min(box[0], a)
    box[1] = Math.min(box[1], b)
    box[2] = Math.max(box[2], c)
    box[3] = Math.max(box[3], d)
  }
  if (box[0] === Infinity) {
    throw new Error('the map holds no sector of Nova Scotia')
  }
  return box
}

type MapViewProps = {
  overview: Overview
  station: string | null
  onPick: (station: string) => void
  getVerdict: (station: string) => Verdict
  onHover: (stations: string[]) => void
}

export const MapView = ({
  overview,
  station,
  onPick,
  getVerdict,
  onHover,
}: MapViewProps) => {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const frameRef = useRef<HTMLDivElement>(null)
  const tipRef = useRef<HTMLDivElement>(null)
  const chooserRef = useRef<HTMLDivElement>(null)
  const opener = useRef<HTMLElement | null>(null)
  const pointer = useRef({ x: 0, y: 0 })
  const [engine, setEngine] = useState<MapEngine | null>(null)
  const [error, setError] = useState<string | null>(null)
  // True once the palette is on the canvas, so the raw bitmap never shows.
  const [styled, setStyled] = useState(false)
  const [hover, setHover] = useState<string | null>(null)
  const [chooser, setChooser] = useState<Chooser | null>(null)

  const stations = useMemo(
    () =>
      overview.stations.map(s => ({
        station: s.station,
        verdict: getVerdict(s.station),
      })),
    [overview, getVerdict]
  )
  const counties = useMemo(() => getCountyVerdicts(stations), [stations])
  const list = useMemo(() => {
    const out: County[] = []
    for (const [county, { verdict }] of counties) {
      out.push({
        county,
        verdict,
        stations: stations
          .filter(s => STATION_COUNTY[s.station] === county)
          .map(s => s.station),
      })
    }
    return out
  }, [stations, counties])
  const byCounty = useMemo(
    () => new Map(list.map(item => [item.county, item])),
    [list]
  )

  const onPickRef = useRef(onPick)
  const byCountyRef = useRef(byCounty)

  // The engine callbacks read these refs, so they see the latest props. The
  // effect runs before the others, so no effect reads a stale value.
  useEffect(() => {
    onPickRef.current = onPick
    byCountyRef.current = byCounty
  })

  const openCounty = (county: string, x: number, y: number) => {
    const item = byCounty.get(county)
    if (item === undefined) {
      setChooser(null)
      return
    }
    setHover(null)
    if (item.stations.length === 1) {
      setChooser(null)
      onPick(item.stations[0])
      return
    }
    setChooser({ county, x, y })
  }
  const openCountyRef = useRef(openCounty)

  useEffect(() => {
    openCountyRef.current = openCounty
  })

  useEffect(() => {
    const canvas = canvasRef.current
    if (canvas === null) {
      return
    }
    const mapEngine = new MapEngine()
    let alive = true
    let observer: ResizeObserver | null = null
    let framing = 0
    mapEngine.setTickRate(60)
    mapEngine
      .loadMap({ bitmapUrl: MAP_URL, definitionUrl: SECTORS_URL, canvas })
      .then(async () => {
        if (!alive) {
          return
        }
        // A county with no station is no target: it gets no pointer cursor,
        // no tip, and no click.
        mapEngine.on(
          'sectorClick',
          (event: { sectorData: { name: string } }) => {
            const { x, y } = pointer.current
            openCountyRef.current(event.sectorData.name, x, y)
          }
        )
        mapEngine.on(
          'sectorHover',
          (event: { sectorData: { name: string } } | null) => {
            const name = event?.sectorData.name
            const live = name !== undefined && byCountyRef.current.has(name)
            canvas.style.cursor = live ? 'pointer' : ''
            setHover(live ? name : null)
          }
        )
        const box = getNovaScotiaBox(mapEngine)
        const frame = () => {
          mapEngine.fitBounds(box, FIT_OPTIONS)
        }
        // The engine reads the new canvas size in its own animation frame, so
        // a later frame is the first one where project agrees with the canvas.
        // The first call also frames at once, so the first paint is framed.
        let observed = false
        observer = new ResizeObserver(() => {
          if (!observed) {
            observed = true
            frame()
          }
          cancelAnimationFrame(framing)
          framing = requestAnimationFrame(frame)
        })
        observer.observe(canvas)
        setEngine(mapEngine)
      })
      .catch((reason: unknown) => {
        console.error('🛰️  map load failed:', reason)
        if (alive) {
          setError(reason instanceof Error ? reason.message : String(reason))
        }
      })
    return () => {
      alive = false
      cancelAnimationFrame(framing)
      observer?.disconnect()
      // A rerun of the effect, as in StrictMode, needs the state reset.
      setEngine(null)
      setStyled(false)
      mapEngine.destroy()
    }
  }, [])

  useEffect(() => {
    if (engine === null) {
      return
    }
    for (const key of engine.getSectorKeys()) {
      const name = getSectorName(engine, key)
      engine.setSectorColor(
        key,
        getCountyColor(name, byCountyRef.current.get(name)?.verdict)
      )
    }
    // The engine draws in its own animation frame. Show the canvas two frames
    // after the colors, so the first frame on screen is a styled one.
    let second = 0
    const first = requestAnimationFrame(() => {
      second = requestAnimationFrame(() => setStyled(true))
    })
    return () => {
      cancelAnimationFrame(first)
      cancelAnimationFrame(second)
    }
  }, [engine, counties])

  // The chooser takes the focus when it opens, and gives it back on close.
  useEffect(() => {
    if (chooser !== null) {
      chooserRef.current?.querySelector('button')?.focus()
    }
  }, [chooser])

  const closeChooser = () => {
    setChooser(null)
    if (opener.current?.isConnected) {
      opener.current.focus()
    }
  }

  const moveTip = (x: number, y: number) => {
    pointer.current = { x, y }
    const tip = tipRef.current
    if (tip !== null) {
      tip.style.transform = `translate(${x}px, ${y}px)`
    }
  }

  const getChooserStyle = (at: Chooser): CSSProperties => {
    const frame = frameRef.current?.getBoundingClientRect()
    const width = frame?.width ?? 0
    const height = frame?.height ?? 0
    return {
      left: Math.max(CHOOSER_MARGIN_PX, Math.min(at.x, width - 200)),
      top: Math.max(CHOOSER_MARGIN_PX, Math.min(at.y, height - 110)),
    }
  }

  const hovered = hover === null ? undefined : byCounty.get(hover)
  const onHoverRef = useRef(onHover)

  useEffect(() => {
    onHoverRef.current = onHover
  })

  // The tiles of the county under the pointer or the focus show as hot.
  const [focused, setFocused] = useState<string | null>(null)
  const hotCounty = hover ?? focused
  useEffect(() => {
    onHoverRef.current(
      hotCounty === null ? [] : (byCounty.get(hotCounty)?.stations ?? [])
    )
  }, [hotCounty, byCounty])
  const choosing = chooser === null ? undefined : byCounty.get(chooser.county)

  return (
    <section
      className="map-view"
      aria-label="Map of the counties"
      data-ready={engine !== null && styled}
    >
      <div
        className="map-frame"
        ref={frameRef}
        onPointerMove={event => {
          const box = event.currentTarget.getBoundingClientRect()
          moveTip(event.clientX - box.left, event.clientY - box.top)
        }}
        onPointerLeave={() => setHover(null)}
        onKeyDown={event => {
          if (event.key === 'Escape' && chooser !== null) {
            event.stopPropagation()
            closeChooser()
          }
        }}
      >
        <canvas
          ref={canvasRef}
          className="map-canvas"
          role="img"
          aria-label="Map of the Maritimes, Nova Scotia in view. The list below the map holds each county with a station."
        />
        {hovered !== undefined && chooser === null && (
          <div
            className="map-tip"
            ref={tipRef}
            data-testid="map-tip"
            style={{
              transform: `translate(${pointer.current.x}px, ${pointer.current.y}px)`,
            }}
          >
            <strong>{getCountyLabel(hovered.county)}</strong>
            <span>{hovered.stations.join(', ')}</span>
          </div>
        )}
        {chooser !== null && choosing !== undefined && (
          <div
            className="map-chooser"
            ref={chooserRef}
            role="group"
            aria-label={`Stations in ${getCountyLabel(choosing.county)}`}
            data-testid="map-chooser"
            style={getChooserStyle(chooser)}
          >
            <strong>{getCountyLabel(choosing.county)}</strong>
            {choosing.stations.map(name => (
              <button
                key={name}
                type="button"
                data-station={name}
                onClick={() => {
                  setChooser(null)
                  onPick(name)
                }}
              >
                {name}
              </button>
            ))}
            <button type="button" className="close" onClick={closeChooser}>
              Close
            </button>
          </div>
        )}
        {error !== null && (
          <p className="error">Could not load the map: {error}</p>
        )}
      </div>
      <ul className="county-list" aria-label="Counties with a station">
        {list.map(item => {
          const picked = item.stations.includes(station ?? '')
          const names = item.stations.join(', ')
          const verdictWord = VERDICT_WORD[item.verdict].toLowerCase()
          return (
            <li key={item.county}>
              <button
                type="button"
                className={`county ${item.verdict}${picked ? ' picked' : ''}`}
                data-testid="map-county"
                data-county={item.county}
                aria-pressed={picked}
                onFocus={() => setFocused(item.county)}
                onBlur={() => setFocused(null)}
                aria-label={`${getCountyLabel(item.county)}, ${names}: ${verdictWord}`}
                onClick={event => {
                  opener.current = event.currentTarget
                  const frame = frameRef.current?.getBoundingClientRect()
                  openCounty(
                    item.county,
                    (frame?.width ?? 0) / 2 - 90,
                    (frame?.height ?? 0) / 2 - 50
                  )
                }}
              >
                <span
                  className="swatch"
                  aria-hidden="true"
                  style={{ background: VERDICT_COLOR[item.verdict] }}
                />
                <span className="county-name">
                  {getCountyLabel(item.county)}
                </span>
                <span className="county-stations">{names}</span>
              </button>
            </li>
          )
        })}
      </ul>
      <p className="legend">
        {(['over', 'within', 'none', 'nodata'] as const).map(verdict => (
          <span key={verdict} className="key">
            <span
              className="swatch"
              aria-hidden="true"
              style={{ background: VERDICT_COLOR[verdict] }}
            />
            {VERDICT_WORD[verdict].toLowerCase()}
          </span>
        ))}
        <span className="key">
          <span
            className="swatch"
            aria-hidden="true"
            style={{ background: VERDICT_COLOR.idle }}
          />
          no station
        </span>
      </p>
    </section>
  )
}
