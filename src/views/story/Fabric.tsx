import type { FabricLayer, Highlight } from '../../../shared/contract.ts'
import {
  DESK,
  PHONE,
  TRS_FULL_HOURS,
  drawFabric,
  fabricHeight,
  rowTop,
  type HighlightLayer,
} from './fabric.ts'
import { dayAt, dayIndex, formatDay, formatNumber } from './format.ts'
import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type KeyboardEvent,
  type MouseEvent,
  type PointerEvent,
} from 'react'

const DESK_QUERY = '(min-width: 900px)'
const MOTION_QUERY = '(prefers-reduced-motion: reduce)'
const PAGE_DAYS = 30
const FADE_MS = 240
// A tap lands on a mark within this distance, because one CSS pixel of the
// phone fabric holds about ten days.
const SNAP_PX = 10

const TITLES: Record<HighlightLayer, string> = {
  pm25: 'Fine particles in the air, each day',
  o3: 'Ground-level ozone, the highest 8 hours of each day',
  trs: 'Hours at the smell level at Pictou, each day',
  'pm25-hours': 'Hours of fine-particle readings sent, each day',
}

const useMedia = (query: string) =>
  useSyncExternalStore(
    onChange => {
      const list = window.matchMedia(query)
      list.addEventListener('change', onChange)
      return () => list.removeEventListener('change', onChange)
    },
    () => window.matchMedia(query).matches
  )

const useWidth = () => {
  const ref = useRef<HTMLDivElement>(null)
  const [widthPx, setWidthPx] = useState(0)

  useLayoutEffect(() => {
    const element = ref.current!
    const observer = new ResizeObserver(([entry]) =>
      setWidthPx(Math.floor(entry.contentRect.width))
    )
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  return [ref, widthPx] as const
}

type Props = {
  chapter: number
  highlight: Highlight
  data: FabricLayer
  stations: readonly string[]
  selected: number
  onSelect: (day: number) => void
  onOpen: (day: number) => void
  open: boolean
}

export const Fabric = ({
  chapter,
  highlight,
  data,
  stations,
  selected,
  onSelect,
  onOpen,
  open,
}: Props) => {
  const desk = useMedia(DESK_QUERY)
  const still = useMedia(MOTION_QUERY)
  const geometry = desk ? DESK : PHONE
  const [stageRef, stageWidthPx] = useWidth()
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [hover, setHover] = useState<number | null>(null)
  const [focused, setFocused] = useState(false)
  const widthPx = Math.max(0, stageWidthPx - geometry.gutterPx)
  const heightPx = fabricHeight(geometry, stations.length)
  const dayCount = data.dayCount
  const layer = highlight.layer

  useEffect(() => {
    if (widthPx === 0) {
      return
    }
    drawFabric({
      canvas: canvasRef.current!,
      geometry,
      widthPx,
      scale: window.devicePixelRatio || 1,
      stations,
      data,
      layer,
      highlight,
    })
  }, [geometry, widthPx, stations, data, layer, highlight])

  useEffect(() => {
    if (still) {
      return
    }
    canvasRef.current!.animate([{ opacity: 0.35 }, { opacity: 1 }], {
      duration: FADE_MS,
      easing: 'ease-out',
    })
  }, [chapter, still])

  const xOf = (day: number) => ((day + 0.5) / dayCount) * widthPx

  const dayFrom = (clientX: number) => {
    const box = canvasRef.current!.getBoundingClientRect()
    const x = clientX - box.left
    let day = Math.floor((x / box.width) * dayCount)
    let nearPx = SNAP_PX
    for (const mark of highlight.marks ?? []) {
      const markDay = dayIndex(data.firstDay, mark.day)
      const distancePx = Math.abs(xOf(markDay) - x)
      if (distancePx > nearPx) continue
      nearPx = distancePx
      day = markDay
    }
    return Math.min(dayCount - 1, Math.max(0, day))
  }

  const onClick = (event: MouseEvent) => onOpen(dayFrom(event.clientX))

  const onPointerMove = (event: PointerEvent) => {
    if (!desk || event.pointerType === 'touch') {
      return
    }
    setHover(dayFrom(event.clientX))
  }

  const onKeyDown = (event: KeyboardEvent) => {
    const steps: Record<string, number> = {
      ArrowLeft: -1,
      ArrowRight: 1,
      PageUp: -PAGE_DAYS,
      PageDown: PAGE_DAYS,
      Home: -dayCount,
      End: dayCount,
    }
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      onOpen(selected)
      return
    }
    const step = steps[event.key]
    if (step === undefined) {
      return
    }
    event.preventDefault()
    onSelect(Math.min(dayCount - 1, Math.max(0, selected + step)))
  }

  const selectedDay = dayAt(data.firstDay, selected)
  const firstYear = Number(data.firstDay.slice(0, 4))
  const lastYear = Number(dayAt(data.firstDay, dayCount - 1).slice(0, 4))
  const years = Array.from(
    { length: lastYear - firstYear + 1 },
    (_, i) => firstYear + i
  )

  return (
    <figure className="fabric">
      <figcaption className="fabric-title">
        {TITLES[layer]}
        {(focused || open) && (
          <span className="fabric-selected" aria-hidden="true">
            · {formatDay(selectedDay)}
          </span>
        )}
      </figcaption>
      <div
        className="fabric-stage"
        ref={stageRef}
        style={{ height: `${heightPx}px` }}
      >
        {stations.map((station, index) => (
          <span
            key={station}
            className={
              highlight.stations.includes(station)
                ? 'fabric-label'
                : 'fabric-label dim'
            }
            style={{
              top: `${rowTop(geometry, index) - geometry.labelPx}px`,
              height: `${geometry.labelPx || geometry.rowPx}px`,
            }}
          >
            {station}
          </span>
        ))}
        <canvas
          ref={canvasRef}
          className="fabric-canvas"
          style={{ left: `${geometry.gutterPx}px` }}
          tabIndex={0}
          role="slider"
          aria-label="The fabric: one thread for each day. Arrow keys move the day, and Enter opens it."
          aria-valuemin={0}
          aria-valuemax={dayCount - 1}
          aria-valuenow={selected}
          aria-valuetext={formatDay(selectedDay)}
          data-chapter={chapter}
          data-layer={layer}
          data-from={highlight.from}
          data-to={highlight.to}
          data-stations={highlight.stations.join('|')}
          data-months={highlight.months?.join('|') ?? ''}
          data-marks={(highlight.marks ?? [])
            .map(mark => `${mark.station}@${mark.day}`)
            .join('|')}
          onClick={onClick}
          onKeyDown={onKeyDown}
          onPointerMove={onPointerMove}
          onPointerLeave={() => setHover(null)}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
        />
        {hover !== null && (
          <div
            className="fabric-hover"
            style={{ left: `${geometry.gutterPx + xOf(hover)}px` }}
          >
            <span className="fabric-tip">
              {formatDay(dayAt(data.firstDay, hover))}
            </span>
          </div>
        )}
        {(focused || open) && (
          <div
            className="fabric-marker"
            style={{ left: `${geometry.gutterPx + xOf(selected)}px` }}
          >
            <span className="fabric-tip" aria-hidden="true">
              {formatDay(selectedDay)}
            </span>
          </div>
        )}
      </div>
      <div className="fabric-years" style={{ marginLeft: geometry.gutterPx }}>
        {years.map(year => (
          <span
            key={year}
            style={{
              left: `${xOf(dayIndex(data.firstDay, `${year}-01-01`))}px`,
            }}
          >
            {year}
          </span>
        ))}
      </div>
      <Legend layer={layer} limit={data.limit} chapter={chapter} />
    </figure>
  )
}

// The marks of chapter 1 are the days over a limit for fine particles or for
// ozone, drawn on the fine-particle rows.
const BOTH_LIMITS_CHAPTER = 1

const Legend = ({
  layer,
  limit,
  chapter,
}: {
  layer: HighlightLayer
  limit: number | null
  chapter: number
}) => (
  <div className="fabric-legend">
    {layer === 'pm25-hours' ? (
      <span className="legend-scale">
        <span>All 24 hours</span>
        <span className="legend-ramp reverse" aria-hidden="true" />
        <span>Few hours</span>
      </span>
    ) : (
      <span className="legend-scale">
        <span>0</span>
        <span className="legend-ramp" aria-hidden="true" />
        <span>
          {limit === null
            ? `${TRS_FULL_HOURS} hours or more`
            : `${formatNumber(limit)} (the ${layer === 'o3' ? '' : 'daily '}limit)`}
        </span>
      </span>
    )}
    {limit !== null && layer !== 'pm25-hours' && (
      <span className="legend-key">
        <span className="legend-over" aria-hidden="true">
          ▲
        </span>
        {layer === 'o3' ? 'Over the limit' : 'Over the daily limit'}
      </span>
    )}
    {chapter === BOTH_LIMITS_CHAPTER && (
      <span className="legend-key">
        <span className="legend-mark" aria-hidden="true" />A day over a limit
        for fine particles or ozone
      </span>
    )}
    <span className="legend-key">
      <span className="legend-gap" aria-hidden="true" />
      No reading that day
    </span>
  </div>
)
