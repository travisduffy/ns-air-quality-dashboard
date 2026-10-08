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
const ZOOM_FLOOR_RATIO = 0.75
const DRAG_DEAD_ZONE_PX = 4
const ZOOM_STEP = 2
const KEY_PAN_PX = 80
const KEY_PAN: Record<string, [number, number]> = {
  ArrowLeft: [1, 0],
  ArrowRight: [-1, 0],
  ArrowUp: [0, 1],
  ArrowDown: [0, -1],
}
const KEY_ZOOM: Record<string, number> = {
  '+': ZOOM_STEP,
  '=': ZOOM_STEP,
  '-': 1 / ZOOM_STEP,
}

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

const getBoxScale = (box: Box, width: number, height: number) =>
  Math.min(
    Math.max(1, width - 2 * PADDING_PX) / (box[2] + 1 - box[0]),
    Math.max(1, height - 2 * PADDING_PX) / (box[3] + 1 - box[1])
  )

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value))

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
  const [aspect, setAspect] = useState<string>()
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
    const input = new AbortController()
    let alive = true
    mapEngine.setTickRate(60)
    mapEngine
      .loadMap({ bitmapUrl: MAP_URL, definitionUrl: SECTORS_URL, canvas })
      .then(() => {
        if (!alive) {
          return
        }
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
            canvas.dataset.live = String(live)
            setHover(live ? name : null)
          }
        )

        const box = getNovaScotiaBox(mapEngine)
        const [minX, minY, maxX, maxY] = box
        setAspect(`${maxX + 1 - minX} / ${maxY + 1 - minY}`)
        mapEngine.fitBounds(box, FIT_OPTIONS)
        const zoomPerScale =
          (mapEngine.getView()?.zoom ?? 1) /
          getBoxScale(box, canvas.clientWidth, canvas.clientHeight)

        let engineSize = {
          width: canvas.clientWidth,
          height: canvas.clientHeight,
        }
        mapEngine.onFrame(() => {
          const { width, height } = engineSize
          engineSize = {
            width: canvas.clientWidth,
            height: canvas.clientHeight,
          }
          const view = mapEngine.getView()
          if (view === null) {
            return
          }
          const floor =
            ZOOM_FLOOR_RATIO * zoomPerScale * getBoxScale(box, width, height)
          const zoom = Math.max(view.zoom, floor)
          const centerX = clamp(view.centerX, minX, maxX + 1)
          const centerY = clamp(view.centerY, minY, maxY + 1)
          if (
            zoom !== view.zoom ||
            centerX !== view.centerX ||
            centerY !== view.centerY
          ) {
            mapEngine.setView({ centerX, centerY, zoom })
          }
        })

        const panBy = (dx: number, dy: number) => {
          const view = mapEngine.getView()
          if (view === null) {
            return
          }
          const scale = view.zoom / zoomPerScale
          mapEngine.setView({
            centerX: view.centerX - dx / scale,
            centerY: view.centerY - dy / scale,
          })
        }
        const zoomAt = (factor: number, x: number, y: number) => {
          const view = mapEngine.getView()
          if (view === null) {
            return
          }
          mapEngine.setView({ zoom: view.zoom * factor })
          const zoom = mapEngine.getView()?.zoom ?? view.zoom
          const shift = zoomPerScale * (1 / view.zoom - 1 / zoom)
          mapEngine.setView({
            centerX: view.centerX + (x - canvas.clientWidth / 2) * shift,
            centerY: view.centerY + (y - canvas.clientHeight / 2) * shift,
          })
        }

        const { signal } = input
        let drag: { x: number; y: number; left: boolean } | null = null
        const endDrag = () => {
          drag = null
          delete canvas.dataset.dragging
        }
        canvas.addEventListener(
          'pointerdown',
          event => {
            if (event.pointerType === 'touch' || event.button > 1) {
              return
            }
            drag = {
              x: event.clientX,
              y: event.clientY,
              left: event.button === 0,
            }
          },
          { signal }
        )
        canvas.addEventListener(
          'pointermove',
          event => {
            if (drag === null) {
              return
            }
            if ((event.buttons & (drag.left ? 1 : 4)) === 0) {
              endDrag()
              return
            }
            const dx = event.clientX - drag.x
            const dy = event.clientY - drag.y
            if (canvas.dataset.dragging === undefined) {
              if (Math.hypot(dx, dy) <= DRAG_DEAD_ZONE_PX) {
                return
              }
              canvas.dataset.dragging = 'true'
              if (drag.left) {
                canvas.setPointerCapture(event.pointerId)
              }
            }
            if (drag.left) {
              panBy(dx, dy)
            }
            drag.x = event.clientX
            drag.y = event.clientY
          },
          { signal }
        )
        canvas.addEventListener('pointerup', endDrag, { signal })
        canvas.addEventListener('pointercancel', endDrag, { signal })
        canvas.addEventListener(
          'dblclick',
          event => {
            event.preventDefault()
            const rect = canvas.getBoundingClientRect()
            zoomAt(
              ZOOM_STEP,
              event.clientX - rect.left,
              event.clientY - rect.top
            )
          },
          { signal }
        )
        canvas.addEventListener(
          'keydown',
          event => {
            if (event.ctrlKey || event.metaKey || event.altKey) {
              return
            }
            const pan = KEY_PAN[event.key]
            const factor = KEY_ZOOM[event.key]
            if (pan !== undefined) {
              panBy(pan[0] * KEY_PAN_PX, pan[1] * KEY_PAN_PX)
            } else if (factor !== undefined) {
              zoomAt(factor, canvas.clientWidth / 2, canvas.clientHeight / 2)
            } else {
              return
            }
            event.preventDefault()
          },
          { signal }
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
      input.abort()
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
    let second = 0
    const first = requestAnimationFrame(() => {
      second = requestAnimationFrame(() => setStyled(true))
    })
    return () => {
      cancelAnimationFrame(first)
      cancelAnimationFrame(second)
    }
  }, [engine, counties])

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
        style={{ aspectRatio: aspect }}
        onContextMenu={event => event.preventDefault()}
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
          tabIndex={0}
          aria-label="Map of Nova Scotia. The list below the map holds each county with a station."
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
