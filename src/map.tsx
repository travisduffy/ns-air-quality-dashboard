import type { Overview } from '../scripts/derive.ts'
import {
  STATION_COUNTY,
  VERDICT_MARK,
  VERDICT_WORD,
  getCountyColor,
  getCountyVerdicts,
  isNovaScotia,
  type Verdict,
} from './stations.ts'
import { MapEngine } from '@travisduffy/map-engine'
import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'

type Marker = {
  station: string
  county: string
  verdict: Verdict
  offset: number
}
type Box = [number, number, number, number]

const MAP_URL = `${import.meta.env.BASE_URL}map.png`
const SECTORS_URL = `${import.meta.env.BASE_URL}sectors.json`
const PADDING_PX = 16
const LABEL_GAP_PX = 3
const LABEL_GAP_STYLE = { '--label-gap': `${LABEL_GAP_PX}px` } as CSSProperties
const FIT_OPTIONS = { padding: PADDING_PX, keepOnResize: true }
const LABEL_SIDES = ['below', 'above', 'right', 'left'] as const

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
  hotStation: string | undefined
}

export const MapView = ({
  overview,
  station,
  onPick,
  getVerdict,
  hotStation,
}: MapViewProps) => {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const markerRefs = useRef<Map<string, HTMLButtonElement>>(new Map())
  const [engine, setEngine] = useState<MapEngine | null>(null)
  const [error, setError] = useState<string | null>(null)
  const anchors = useRef<Map<string, [number, number]>>(new Map())

  const stations = useMemo(
    () =>
      overview.stations.map(s => ({
        station: s.station,
        verdict: getVerdict(s.station),
      })),
    [overview, getVerdict]
  )
  const counties = useMemo(() => getCountyVerdicts(stations), [stations])
  const markers = useMemo<Marker[]>(() => {
    const perCounty = new Map<string, string[]>()
    for (const s of stations) {
      const county = STATION_COUNTY[s.station]
      if (county !== undefined) {
        perCounty.set(county, [...(perCounty.get(county) ?? []), s.station])
      }
    }
    return stations.flatMap(s => {
      const county = STATION_COUNTY[s.station]
      if (county === undefined) {
        return []
      }
      const group = perCounty.get(county) ?? []
      return [
        {
          station: s.station,
          county,
          verdict: s.verdict,
          offset: group.indexOf(s.station) - (group.length - 1) / 2,
        },
      ]
    })
  }, [stations])

  const onPickRef = useRef(onPick)
  const countiesRef = useRef(counties)

  // The engine callbacks read these refs, so they see the latest props. The
  // effect runs before the others, so no effect reads a stale value.
  useEffect(() => {
    onPickRef.current = onPick
    countiesRef.current = counties
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
        await mapEngine.computeAnchors()
        if (!alive) {
          return
        }
        // The numeric id of a sector is its place in the key list.
        for (const [id, key] of mapEngine.getSectorKeys().entries()) {
          anchors.current.set(
            getSectorName(mapEngine, key),
            mapEngine.getAnchor(id)
          )
        }
        mapEngine.on(
          'sectorClick',
          (event: { sectorData: { name: string } }) => {
            const hit = countiesRef.current.get(event.sectorData.name)
            if (hit !== undefined) {
              onPickRef.current(hit.first)
            }
          }
        )
        // A label sits below its marker. When that spot meets a marker, a
        // label, or the edge of the map, the label moves above, then right,
        // then left of its own marker.
        const spreadLabels = () => {
          const bounds = canvas.getBoundingClientRect()
          const items = [...markerRefs.current.values()]
            .filter(button => button.style.visibility === 'visible')
            .flatMap(button => {
              const name = button.querySelector<HTMLElement>('.name')
              const mark = button.querySelector<HTMLElement>('.mark')
              if (name === null || mark === null || name.offsetWidth === 0) {
                return []
              }
              return [{ name, pin: mark.getBoundingClientRect() }]
            })
            .sort((a, b) => a.pin.top - b.pin.top || a.pin.left - b.pin.left)
          const blocked = items.map(item => item.pin)
          for (const { name, pin } of items) {
            const width = name.offsetWidth
            const height = name.offsetHeight
            const centerX = pin.left + pin.width / 2
            const centerY = pin.top + pin.height / 2
            const spots = {
              below: [centerX - width / 2, pin.bottom + LABEL_GAP_PX],
              above: [centerX - width / 2, pin.top - LABEL_GAP_PX - height],
              right: [pin.right + LABEL_GAP_PX, centerY - height / 2],
              left: [pin.left - LABEL_GAP_PX - width, centerY - height / 2],
            }
            const fits = (candidate: (typeof LABEL_SIDES)[number]) => {
              const [left, top] = spots[candidate]
              const taken = blocked.some(
                other =>
                  other !== pin &&
                  other.left < left + width &&
                  left < other.right &&
                  other.top < top + height &&
                  top < other.bottom
              )
              return (
                !taken &&
                left >= bounds.left &&
                left + width <= bounds.right &&
                top >= bounds.top &&
                top + height <= bounds.bottom
              )
            }
            const side = LABEL_SIDES.find(fits) ?? 'below'
            const [left, top] = spots[side]
            if (name.dataset.side !== side) {
              name.dataset.side = side
            }
            blocked.push(new DOMRect(left, top, width, height))
          }
        }
        const place = () => {
          const rect = canvas.getBoundingClientRect()
          for (const [name, button] of markerRefs.current) {
            const anchor = anchors.current.get(STATION_COUNTY[name] ?? '')
            if (anchor === undefined) {
              continue
            }
            const [sx, sy] = mapEngine.project(anchor[0], anchor[1])
            const inside =
              sx >= 0 && sy >= 0 && sx <= rect.width && sy <= rect.height
            button.style.transform = `translate(${sx}px, ${sy}px)`
            button.style.visibility = inside ? 'visible' : 'hidden'
          }
        }
        const placeAll = () => {
          place()
          spreadLabels()
        }
        mapEngine.onFrame(placeAll)
        const box = getNovaScotiaBox(mapEngine)
        const frame = () => {
          mapEngine.fitBounds(box, FIT_OPTIONS)
          placeAll()
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
        getCountyColor(name, countiesRef.current.get(name)?.verdict)
      )
    }
  }, [engine, counties])

  return (
    <section
      className="map-view"
      aria-label="Map of the stations"
      data-ready={engine !== null}
    >
      <div className="map-frame" style={LABEL_GAP_STYLE}>
        <canvas
          ref={canvasRef}
          className="map-canvas"
          role="img"
          aria-label="Map of the Maritimes, Nova Scotia in view"
        />
        {markers.map(m => {
          const picked = m.station === station
          const className = `map-marker ${m.verdict}${picked ? ' picked' : ''}`
          const verdictWord = VERDICT_WORD[m.verdict].toLowerCase()
          const label = `${m.station}, ${m.county}: ${verdictWord}`
          return (
            <button
              key={m.station}
              type="button"
              ref={element => {
                if (element === null) {
                  markerRefs.current.delete(m.station)
                } else {
                  markerRefs.current.set(m.station, element)
                }
              }}
              className={className}
              style={{ '--offset': m.offset } as CSSProperties}
              data-hot={m.station === hotStation ? '' : undefined}
              data-testid="map-marker"
              data-station={m.station}
              aria-pressed={picked}
              aria-label={label}
              onClick={() => onPick(m.station)}
            >
              <span className="mark" aria-hidden="true">
                {VERDICT_MARK[m.verdict]}
              </span>
              <span className="name">{m.station}</span>
            </button>
          )
        })}
        {error !== null && (
          <p className="error">Could not load the map: {error}</p>
        )}
      </div>
      <p className="legend">
        <span className="mk over" aria-hidden="true">
          ▲
        </span>{' '}
        {VERDICT_WORD.over.toLowerCase()}{' '}
        <span className="mk within" aria-hidden="true">
          ●
        </span>{' '}
        {VERDICT_WORD.within.toLowerCase()}{' '}
        <span className="mk blank" aria-hidden="true">
          ○
        </span>{' '}
        {VERDICT_WORD.none.toLowerCase()}
      </p>
    </section>
  )
}
