import { attachCamera } from './camera.ts'
import { Bone, MAP_ASPECT } from './skeleton.tsx'
import {
  VERDICT_COLOR,
  VERDICT_WORD,
  getCountyColor,
  isNovaScotia,
} from './stations.ts'
import type { YearCounty } from './years.ts'
import { MapEngine, type PickResult } from '@travisduffy/map-engine'
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'

type Chooser = { county: string; anchor: [number, number] | null }
type Box = [number, number, number, number]

const MAP_URL = `${import.meta.env.BASE_URL}map.png`
const SECTORS_URL = `${import.meta.env.BASE_URL}sectors.json`
const CHOOSER_MARGIN_PX = 8

const clampInside = (start: number, size: number, frame: number) =>
  Math.max(CHOOSER_MARGIN_PX, Math.min(start, frame - size - CHOOSER_MARGIN_PX))

const getCountyLabel = (county: string) =>
  `${county.replace(/, NS$/, '')} County`

const getSectorName = (engine: MapEngine, key: string) => {
  const sector = engine.getSector(key)
  if (sector === undefined) {
    throw new Error(`the map holds no sector ${key}`)
  }
  return sector.name
}

const getCountyAnchor = (
  engine: MapEngine,
  county: string
): [number, number] | null => {
  const key = engine
    .getSectorKeys()
    .find(key => getSectorName(engine, key) === county)
  if (key === undefined) {
    return null
  }
  const [minX, minY, maxX, maxY] = engine.getBBox(key)
  return [(minX + maxX) / 2, (minY + maxY) / 2]
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
  counties: YearCounty[]
  station: string | null
  onPick: (station: string) => void
  onHover: (stations: string[]) => void
}

export const MapView = ({
  counties,
  station,
  onPick,
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
  const [aspect, setAspect] = useState<string>(MAP_ASPECT)
  const [styled, setStyled] = useState(false)
  const [hover, setHover] = useState<string | null>(null)
  const [chooser, setChooser] = useState<Chooser | null>(null)

  const byCounty = useMemo(
    () => new Map(counties.map(item => [item.county, item])),
    [counties]
  )

  const onPickRef = useRef(onPick)
  const byCountyRef = useRef(byCounty)

  useEffect(() => {
    onPickRef.current = onPick
    byCountyRef.current = byCounty
  })

  const openCounty = (county: string, anchor: [number, number] | null) => {
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
    setChooser({ county, anchor })
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
    let disposeCamera = () => {}
    mapEngine.setTickRate(60)
    mapEngine
      .loadMap({ bitmapUrl: MAP_URL, definitionUrl: SECTORS_URL, canvas })
      .then(() => {
        if (!alive) {
          return
        }
        mapEngine.on('sectorClick', (result: PickResult) => {
          openCountyRef.current(result.sectorData.name, [
            result.pixelX,
            result.pixelY,
          ])
        })
        mapEngine.on('sectorHover', (result: PickResult | null) => {
          const name = result?.sectorData.name
          const live = name !== undefined && byCountyRef.current.has(name)
          canvas.dataset.live = String(live)
          setHover(live ? name : null)
        })

        const box = getNovaScotiaBox(mapEngine)
        const [minX, minY, maxX, maxY] = box
        setAspect(`${maxX + 1 - minX} / ${maxY + 1 - minY}`)
        disposeCamera = attachCamera(mapEngine, canvas, box)
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
      disposeCamera()
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
      chooserRef.current
        ?.querySelector('button')
        ?.focus({ preventScroll: true })
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

  // Place the chooser on its anchor on every frame, so that it follows a pan
  // or a zoom, and flip and shift it by its measured size to stay in the frame.
  useLayoutEffect(() => {
    const anchor = chooser?.anchor ?? null
    const place = () => {
      const box = chooserRef.current
      const frame = frameRef.current
      if (box === null || frame === null) {
        return
      }
      const width = frame.clientWidth
      const height = frame.clientHeight
      box.style.maxHeight = `${height - 2 * CHOOSER_MARGIN_PX}px`
      box.style.maxWidth = `${width - 2 * CHOOSER_MARGIN_PX}px`
      const [x, y] =
        anchor === null || engine === null
          ? [width / 2, height / 2]
          : engine.project(anchor[0], anchor[1])
      box.dataset.anchor = `${Math.round(x)},${Math.round(y)}`
      const left =
        x + box.offsetWidth + CHOOSER_MARGIN_PX <= width
          ? x
          : x - box.offsetWidth
      const top =
        y + box.offsetHeight + CHOOSER_MARGIN_PX <= height
          ? y
          : y - box.offsetHeight
      box.style.left = `${clampInside(left, box.offsetWidth, width)}px`
      box.style.top = `${clampInside(top, box.offsetHeight, height)}px`
    }
    if (chooser === null) {
      return
    }
    place()
    engine?.onFrame(place)
    return () => engine?.offFrame(place)
  }, [chooser, engine])

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
      aria-busy={engine === null && error === null}
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
        {engine === null && error === null && <Bone className="sk-fill" />}
        {error !== null && (
          <p className="error">Could not load the map: {error}</p>
        )}
      </div>
      <ul className="county-list" aria-label="Counties with a station">
        {counties.map(item => {
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
                  openCounty(
                    item.county,
                    engine === null
                      ? null
                      : getCountyAnchor(engine, item.county)
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
        {(['over', 'within', 'none', 'nodata', 'absent'] as const).map(
          verdict => (
            <span key={verdict} className="key">
              <span
                className="swatch"
                aria-hidden="true"
                style={{ background: VERDICT_COLOR[verdict] }}
              />
              {VERDICT_WORD[verdict].toLowerCase()}
            </span>
          )
        )}
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
