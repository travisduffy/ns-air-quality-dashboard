import {
  handoverYear,
  type Handover,
  type StationFabric,
} from '../shared/contract.ts'
import { getFabric } from './api.ts'
import { setMarkerDay, useMarkerDay } from './charts.tsx'
import {
  DAYS,
  DIVIDER_PX,
  GAP_PX,
  MARK_PX,
  MONTH_STARTS,
  ROW_PX,
  dayAt,
  dayCenter,
  dayDate,
  dayIndex,
  drawFabric,
  fabricHeight,
  rowAt,
  rowTop,
} from './fabric-draw.ts'
import { num } from './format.ts'
import { Bone, useDelayed } from './skeleton.tsx'
import { getSinceText } from './stations.ts'
import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type MouseEvent,
} from 'react'

const GUTTER_PX = 48
const OUTLINE_PX = 2
const CARET_PX = 6
const MONTH_NAMES = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
]

const useFabric = (station: string, pollutant: string) => {
  const [fabric, setFabric] = useState<StationFabric | null>(null)
  const [failed, setFailed] = useState<string | null>(null)

  useEffect(() => {
    const controller = new AbortController()
    setFabric(null)
    setFailed(null)
    getFabric(station, pollutant, controller.signal)
      .then(setFabric)
      .catch((error: unknown) => {
        if (!controller.signal.aborted) {
          setFailed(String(error))
        }
      })
    return () => controller.abort()
  }, [station, pollutant])

  return { fabric, failed }
}

const useWidth = () => {
  const ref = useRef<HTMLDivElement>(null)
  const [widthPx, setWidthPx] = useState(0)

  useLayoutEffect(() => {
    const observer = new ResizeObserver(([entry]) =>
      setWidthPx(Math.floor(entry.contentRect.width))
    )
    observer.observe(ref.current!)
    return () => observer.disconnect()
  }, [])

  return [ref, widthPx] as const
}

const Legend = ({ fabric }: { fabric: StationFabric }) => {
  const { limit, scale, unit } = fabric
  return (
    <div className="fabric-legend" data-testid="fabric-legend">
      <span className="legend-scale">
        <span>0</span>
        <span className="legend-ramp" aria-hidden="true" />
        <span>
          {limit === null
            ? `${num(scale.max)} ${unit} or more`
            : `${num(limit.value)} ${unit}, the limit`}
        </span>
      </span>
      {limit === null ? (
        <span className="legend-key">No official limit: shade only</span>
      ) : (
        <span className="legend-key">
          <span className="legend-over" aria-hidden="true">
            ▲
          </span>
          Over the limit
        </span>
      )}
      <span className="legend-key">
        <span className="legend-gap" aria-hidden="true" />
        No reading that day
      </span>
    </div>
  )
}

type Props = {
  station: string
  pollutant: string
  label: string
  years: number[]
  year: number
  handover: Handover | null
  onYear: (year: number) => void
}

export const Fabric = ({
  station,
  pollutant,
  label,
  years,
  year,
  handover,
  onYear,
}: Props) => {
  const { fabric, failed } = useFabric(station, pollutant)
  const shown = useDelayed()
  const [stageRef, stageWidthPx] = useWidth()
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const widthPx = Math.max(0, stageWidthPx - GUTTER_PX)
  const breakRow =
    handover === null ? -1 : years.indexOf(handoverYear(handover))
  const breaks = breakRow > 0 ? [breakRow] : []
  const heightPx = fabricHeight(years.length, breaks)
  const index = years.indexOf(year)
  const markerDay = useMarkerDay()
  const marked = markerDay?.startsWith(`${year}-`) ? markerDay : null
  const markPx = Math.max(MARK_PX, widthPx / DAYS)

  useEffect(() => {
    if (fabric === null || widthPx === 0) {
      return
    }
    drawFabric({
      canvas: canvasRef.current!,
      widthPx,
      scale: window.devicePixelRatio || 1,
      fabric,
      breaks,
    })
  }, [fabric, widthPx, breakRow])

  useEffect(() => () => setMarkerDay(null), [station, pollutant])

  useEffect(() => {
    if (markerDay !== null && !markerDay.startsWith(`${year}-`)) {
      setMarkerDay(null)
    }
  }, [year, markerDay])

  const onClick = (event: MouseEvent) => {
    const box = canvasRef.current!.getBoundingClientRect()
    const row = rowAt(event.clientY - box.top, years.length, breaks)
    const days = fabric!.rows[row].values.length
    const day = dayAt(event.clientX - box.left, box.width, days)
    setMarkerDay(dayDate(years[row], day))
    onYear(years[row])
  }

  return (
    <figure
      className="fabric"
      data-testid="fabric"
      data-ready={fabric !== null}
      aria-busy={fabric === null && failed === null}
    >
      <figcaption className="fabric-title">
        {label}, each day, {years[0]} to {years[years.length - 1]}
      </figcaption>
      {failed !== null && (
        <p className="error">Could not load the fabric: {failed}</p>
      )}
      <div
        className="fabric-stage"
        ref={stageRef}
        style={{ height: `${heightPx}px` }}
      >
        {years.map((y, i) => (
          <button
            key={y}
            type="button"
            className="fabric-year"
            style={{
              top: `${rowTop(i, breaks)}px`,
              height: `${ROW_PX}px`,
            }}
            aria-pressed={y === year}
            onClick={() => onYear(y)}
            data-testid="fabric-year"
            data-year={y}
          >
            {y}
          </button>
        ))}
        {fabric === null && failed === null && (
          <Bone
            className="fabric-sk"
            style={{ left: `${GUTTER_PX}px`, height: `${heightPx}px` }}
            pending={!shown}
          />
        )}
        <canvas
          ref={canvasRef}
          className="fabric-canvas"
          hidden={fabric === null}
          style={{ left: `${GUTTER_PX}px` }}
          role="img"
          aria-label={
            fabric === null
              ? `${label} at ${station}, loading`
              : `${fabric.label} at ${station}: one row for each year, one column for each day, shaded by the ${fabric.statistic}.`
          }
          onClick={onClick}
          data-testid="fabric-canvas"
          data-station={station}
          data-pollutant={pollutant}
        />
        {handover !== null && breaks.length > 0 && (
          <div
            className="fabric-divider"
            data-testid="fabric-divider"
            data-year={handoverYear(handover)}
            style={{
              left: 0,
              top: `${rowTop(breakRow, breaks) - DIVIDER_PX - GAP_PX / 2}px`,
              height: `${DIVIDER_PX}px`,
            }}
          >
            <span style={{ left: `${GUTTER_PX}px` }}>
              {getSinceText(handover)}
            </span>
          </div>
        )}
        {marked !== null && (
          <div
            aria-hidden="true"
            data-testid="fabric-marker"
            data-day={marked}
            style={{
              position: 'absolute',
              top: 0,
              left: `${GUTTER_PX + dayCenter(dayIndex(marked), widthPx) - markPx / 2}px`,
              width: `${markPx}px`,
              height: `${heightPx}px`,
              background: 'var(--ink)',
              boxShadow: '0 0 0 1px #fff',
              pointerEvents: 'none',
            }}
          >
            <span
              style={{
                position: 'absolute',
                top: `${-CARET_PX - 1}px`,
                left: '50%',
                transform: 'translateX(-50%)',
                borderLeft: `${CARET_PX}px solid transparent`,
                borderRight: `${CARET_PX}px solid transparent`,
                borderTop: `${CARET_PX}px solid var(--ink)`,
              }}
            />
          </div>
        )}
        {index >= 0 && (
          <div
            className="fabric-outline"
            aria-hidden="true"
            data-testid="fabric-outline"
            data-year={year}
            style={{
              left: `${GUTTER_PX - OUTLINE_PX}px`,
              top: `${rowTop(index, breaks) - OUTLINE_PX}px`,
              width: `${widthPx + 2 * OUTLINE_PX}px`,
              height: `${ROW_PX + 2 * OUTLINE_PX}px`,
            }}
          />
        )}
      </div>
      <div
        className="fabric-months"
        aria-hidden="true"
        style={{ marginLeft: `${GUTTER_PX}px` }}
      >
        {MONTH_STARTS.map((start, i) => (
          <span key={start} style={{ left: `${(start / DAYS) * 100}%` }}>
            {MONTH_NAMES[i][0]}
            <span className="fabric-month-rest">{MONTH_NAMES[i].slice(1)}</span>
          </span>
        ))}
      </div>
      {fabric !== null && <Legend fabric={fabric} />}
    </figure>
  )
}
