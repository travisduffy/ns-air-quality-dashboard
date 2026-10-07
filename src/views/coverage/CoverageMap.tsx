import type { CountyStatus } from './report.ts'
import { MapEngine } from '@travisduffy/map-engine'
import { useEffect, useRef, useState } from 'react'

type Box = [number, number, number, number]

const MAP_URL = `${import.meta.env.BASE_URL}map.png`
const SECTORS_URL = `${import.meta.env.BASE_URL}sectors.json`
const FIT_OPTIONS = { padding: 16, keepOnResize: true }
// The palette of the story: warm grays, with the accent for the selection.
const SEA_COLOR = '#e9e6df'
const OUTSIDE_COLOR = '#d3cfc5'
const SELECTED_COLOR = '#b5541c'
const STATUS_COLOR: Record<CountyStatus, string> = {
  reporting: '#6c675e',
  stopped: '#a39e93',
  none: '#faf8f3',
}
const STATUS_WORD: Record<CountyStatus, string> = {
  reporting: 'Reporting to the end of the data',
  stopped: 'Stopped reporting',
  none: 'No station',
}
const LEGEND = [
  ['reporting', STATUS_COLOR.reporting],
  ['stopped', STATUS_COLOR.stopped],
  ['none', STATUS_COLOR.none],
  ['selected', SELECTED_COLOR],
] as const

// A key shows only when a county can take its colour. A station that stopped
// shows in the sidebar, and its county keeps the colour of the others.
const getLegend = (statuses: ReadonlyMap<string, CountyStatus>) => {
  const shown = new Set(statuses.values())
  return LEGEND.filter(([key]) => key !== 'stopped' || shown.has(key))
}

const isNovaScotia = (name: string) => name.endsWith(', NS')

// The sector name is "Kings, NS", and the people say "Kings County".
export const getCountyLabel = (name: string) =>
  `${name.replace(/, NS$/, '')} County`

const getColor = (name: string, status: CountyStatus, selected: boolean) => {
  if (name === 'Sea' || name === 'Outside the map') {
    return SEA_COLOR
  }
  if (!isNovaScotia(name)) {
    return OUTSIDE_COLOR
  }
  return selected ? SELECTED_COLOR : STATUS_COLOR[status]
}

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

type CoverageMapProps = {
  statuses: ReadonlyMap<string, CountyStatus>
  selected: string | null
  onSelect: (county: string) => void
  onCounties: (counties: string[]) => void
}

export const CoverageMap = ({
  statuses,
  selected,
  onSelect,
  onCounties,
}: CoverageMapProps) => {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const tipRef = useRef<HTMLDivElement>(null)
  const pointer = useRef({ x: 0, y: 0 })
  const [engine, setEngine] = useState<MapEngine | null>(null)
  const [error, setError] = useState<string | null>(null)
  // True once the palette is on the canvas, so the raw bitmap never shows.
  const [styled, setStyled] = useState(false)
  const [hover, setHover] = useState<string | null>(null)

  // The engine callbacks read these refs, so they see the latest props.
  const onSelectRef = useRef(onSelect)
  const onCountiesRef = useRef(onCounties)
  useEffect(() => {
    onSelectRef.current = onSelect
    onCountiesRef.current = onCounties
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
      .then(() => {
        if (!alive) {
          return
        }
        // Every county of Nova Scotia is a target, with or without a station.
        mapEngine.on(
          'sectorClick',
          (event: { sectorData: { name: string } }) => {
            if (isNovaScotia(event.sectorData.name)) {
              onSelectRef.current(event.sectorData.name)
            }
          }
        )
        mapEngine.on(
          'sectorHover',
          (event: { sectorData: { name: string } } | null) => {
            const name = event?.sectorData.name
            const live = name !== undefined && isNovaScotia(name)
            canvas.style.cursor = live ? 'pointer' : ''
            setHover(live ? name : null)
          }
        )
        const box = getNovaScotiaBox(mapEngine)
        const frame = () => {
          mapEngine.fitBounds(box, FIT_OPTIONS)
        }
        // The engine reads the new canvas size in its own animation frame, so
        // a later frame is the first one where the fit agrees with the canvas.
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
        onCountiesRef.current(
          mapEngine
            .getSectorKeys()
            .map(key => getSectorName(mapEngine, key))
            .filter(isNovaScotia)
            .sort()
        )
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
        getColor(name, statuses.get(name) ?? 'none', name === selected)
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
  }, [engine, statuses, selected])

  const moveTip = (x: number, y: number) => {
    pointer.current = { x, y }
    const tip = tipRef.current
    if (tip !== null) {
      tip.style.transform = `translate(${x}px, ${y}px)`
    }
  }

  return (
    <section
      className="coverage-map"
      aria-label="Map of the counties"
      data-ready={engine !== null && styled}
    >
      <div
        className="coverage-frame"
        onPointerMove={event => {
          const box = event.currentTarget.getBoundingClientRect()
          moveTip(event.clientX - box.left, event.clientY - box.top)
        }}
        onPointerLeave={() => setHover(null)}
      >
        <canvas
          ref={canvasRef}
          className="coverage-canvas"
          role="img"
          aria-label="Map of Nova Scotia. The buttons below the map hold the same counties."
        />
        {hover !== null && (
          <div
            className="coverage-tip"
            ref={tipRef}
            data-testid="map-tip"
            style={{
              transform: `translate(${pointer.current.x}px, ${pointer.current.y}px)`,
            }}
          >
            <strong>{getCountyLabel(hover)}</strong>
            <span>{STATUS_WORD[statuses.get(hover) ?? 'none']}</span>
          </div>
        )}
        {error !== null && (
          <p className="error">Could not load the map: {error}</p>
        )}
      </div>
      <p className="coverage-legend">
        {getLegend(statuses).map(([key, color]) => (
          <span key={key} className="key">
            <span
              className="swatch"
              aria-hidden="true"
              style={{ background: color }}
            />
            {key === 'selected' ? 'Selected' : STATUS_WORD[key]}
          </span>
        ))}
      </p>
    </section>
  )
}

type CountyButtonsProps = {
  counties: string[]
  statuses: ReadonlyMap<string, CountyStatus>
  selected: string | null
  onSelect: (county: string) => void
}

// The same targets as the map, for the keyboard and for a screen reader.
export const CountyButtons = ({
  counties,
  statuses,
  selected,
  onSelect,
}: CountyButtonsProps) => (
  <ul className="coverage-counties" aria-label="Counties of Nova Scotia">
    {counties.map(name => (
      <li key={name}>
        <button
          type="button"
          className={name === selected ? 'picked' : undefined}
          data-testid="county-button"
          data-county={name}
          aria-pressed={name === selected}
          onClick={() => onSelect(name)}
        >
          <span
            className="swatch"
            aria-hidden="true"
            style={{ background: STATUS_COLOR[statuses.get(name) ?? 'none'] }}
          />
          {getCountyLabel(name)}
        </button>
      </li>
    ))}
  </ul>
)
