import type { Daily, Gap } from '../scripts/derive.ts'
import {
  HOUR_MS,
  dayStamps,
  hourSpan,
  msStamp,
  stampMs,
} from '../scripts/time.ts'
import { num } from './format.ts'
import { useLayoutEffect, useRef, useState, type ReactNode } from 'react'

const LEFT = 46
const RIGHT = 8
const TOP = 8
const AXIS = 18
const STRIP = 10

const INK = '#1d2b36'
const LINE = '#1f5f8b'
const OVER = '#b3261e'
const WITHIN = '#2e7d32'
const MISSING = '#5b4a00'

// The fixed chart heights. A skeleton takes the same height, so nothing moves
// when the chart replaces it.
export const DAILY_HEIGHT = 200
export const HOURLY_HEIGHT = 190

// Measure before the first paint, so that a new chart never draws at a guessed
// width and then jumps.
const useWidth = () => {
  const ref = useRef<HTMLDivElement | null>(null)
  const [width, setWidth] = useState(320)
  useLayoutEffect(() => {
    const el = ref.current
    if (el === null) {
      return
    }
    const read = () => setWidth(Math.max(200, Math.floor(el.clientWidth)))
    read()
    const ro = new ResizeObserver(read)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  return [ref, width] as const
}

// A domain is the range of stamps in a view, first and last stamp included.
type Domain = { t0: number; t1: number }
type Axis = { lo: number; hi: number }
type Scale = {
  x: (t: number) => number
  y: (v: number) => number
  plotW: number
  plotH: number
}

const niceTop = (v: number) => {
  if (v <= 0) {
    return 1
  }
  const p = 10 ** Math.floor(Math.log10(v))
  for (const m of [1, 2, 2.5, 5, 10]) {
    if (m * p >= v) {
      return m * p
    }
  }
  return 10 * p
}

// The axis always holds the limit, so the verdict can be read off the chart.
const yAxis = (values: number[], limit: number | null) => {
  const all = limit === null ? values : [...values, limit]
  if (all.length === 0) {
    return { lo: 0, hi: 1 }
  }
  return { lo: Math.min(0, ...all), hi: niceTop(Math.max(...all)) }
}

const DAY_MS = 24 * HOUR_MS

const xTicks = (d: Domain) => {
  const out: number[] = []
  const spanDays = (d.t1 - d.t0) / DAY_MS
  const s = new Date(d.t0)
  if (spanDays > 120) {
    let y = s.getUTCFullYear()
    let m = s.getUTCMonth()
    for (let k = 0; k < 60; k++) {
      const t = Date.UTC(y, m, 1)
      if (t > d.t1) {
        break
      }
      if (t >= d.t0 && m % 3 === 0) {
        out.push(t)
      }
      m += 1
      if (m === 12) {
        m = 0
        y += 1
      }
    }
  } else {
    const step = spanDays > 14 ? 7 : 1
    for (
      let t = Date.UTC(s.getUTCFullYear(), s.getUTCMonth(), s.getUTCDate());
      t <= d.t1;
      t += step * DAY_MS
    ) {
      if (t >= d.t0) {
        out.push(t)
      }
    }
  }
  return out
}

const tickLabel = (t: number, d: Domain) => {
  const s = msStamp(t)
  return (d.t1 - d.t0) / DAY_MS > 120 ? s.slice(0, 7) : s.slice(5, 10)
}

type FrameProps = {
  width: number
  height: number
  domain: Domain
  axis: Axis
  limit: number | null
  limitLabel: string
  label: string
  gaps: Gap[]
  render: (s: Scale) => ReactNode
  behind?: (s: Scale) => ReactNode
}

const Frame = (p: FrameProps) => {
  const { width, height, domain, axis, limit } = p
  // The time axis starts where the hour of the first stamp starts, so that hour
  // is visible.
  const time: Domain = { t0: hourSpan(domain.t0).start, t1: domain.t1 }
  const plotW = width - LEFT - RIGHT
  const plotH = height - TOP - AXIS - STRIP - 6
  const x = (t: number) => LEFT + ((t - time.t0) / (time.t1 - time.t0)) * plotW
  const y = (v: number) =>
    TOP + plotH - ((v - axis.lo) / (axis.hi - axis.lo)) * plotH
  const scale: Scale = { x, y, plotW, plotH }
  const stripY = TOP + plotH + AXIS - 2
  return (
    <svg
      width={width}
      height={height}
      role="img"
      aria-label={p.label}
      data-chart
    >
      {p.behind?.(scale)}
      {[axis.lo, (axis.lo + axis.hi) / 2, axis.hi].map(v => (
        <g key={v}>
          <line
            x1={LEFT}
            x2={width - RIGHT}
            y1={y(v)}
            y2={y(v)}
            stroke="#d5dde3"
            strokeWidth={1}
          />
          <text
            x={LEFT - 4}
            y={y(v) + 4}
            textAnchor="end"
            fontSize={11}
            fill={INK}
          >
            {num(v)}
          </text>
        </g>
      ))}
      {xTicks(time).map(t => (
        <text
          key={t}
          x={x(t)}
          y={TOP + plotH + 13}
          textAnchor={t === time.t1 ? 'end' : 'middle'}
          fontSize={11}
          fill={INK}
        >
          {tickLabel(t, time)}
        </text>
      ))}
      {p.render(scale)}
      {limit !== null && (
        <g data-limit>
          <line
            x1={LEFT}
            x2={width - RIGHT}
            y1={y(limit)}
            y2={y(limit)}
            stroke={OVER}
            strokeWidth={1.5}
            strokeDasharray="6 4"
          />
          <text
            x={width - RIGHT - 2}
            y={y(limit) - 4}
            textAnchor="end"
            fontSize={11}
            fill={OVER}
          >
            {p.limitLabel}
          </text>
        </g>
      )}
      <g data-strip>
        <rect x={LEFT} y={stripY} width={plotW} height={STRIP} fill="#eef2f5" />
        {p.gaps.map(g => {
          const a = Math.max(stampMs(g.start), domain.t0)
          const b = Math.min(stampMs(g.end), domain.t1)
          if (b < a) {
            return null
          }
          // A missing stamp marks the hour that the stamp closes.
          const x0 = x(hourSpan(a).start)
          const w = Math.max(1, x(b) - x0)
          return (
            <rect
              key={g.start}
              data-missing
              x={x0}
              y={stripY}
              width={w}
              height={STRIP}
              fill={MISSING}
            />
          )
        })}
      </g>
    </svg>
  )
}

export type HourlyProps = {
  start: string
  values: (number | null)[]
  gaps: Gap[]
  limit: number | null
  limitLabel: string
  label: string
  domain: Domain
  height?: number
}

// One line per run of present hours. A missing hour ends the run, so no line
// crosses a gap.
export const HourlyChart = (p: HourlyProps) => {
  const [ref, width] = useWidth()
  const t0 = stampMs(p.start)
  const present: number[] = []
  p.values.forEach((v, i) => {
    const t = t0 + i * HOUR_MS
    if (v !== null && t >= p.domain.t0 && t <= p.domain.t1) {
      present.push(v)
    }
  })
  const axis = yAxis(present, p.limit)
  return (
    <div ref={ref} className="chart">
      <Frame
        width={width}
        height={p.height ?? HOURLY_HEIGHT}
        domain={p.domain}
        axis={axis}
        limit={p.limit}
        limitLabel={p.limitLabel}
        label={p.label}
        gaps={p.gaps}
        render={({ x, y }) => {
          const runs: string[] = []
          const dots: ReactNode[] = []
          let cur: string[] = []
          const flush = (lastT: number, lastV: number) => {
            if (cur.length === 1) {
              dots.push(
                <circle
                  key={lastT}
                  cx={x(lastT)}
                  cy={y(lastV)}
                  r={1.6}
                  fill={LINE}
                />
              )
            } else if (cur.length > 1) {
              runs.push('M' + cur.join('L'))
            }
            cur = []
          }
          let lastT = 0
          let lastV = 0
          p.values.forEach((v, i) => {
            const t = t0 + i * HOUR_MS
            if (t < p.domain.t0 || t > p.domain.t1) {
              return
            }
            if (v === null) {
              flush(lastT, lastV)
              return
            }
            cur.push(`${x(t).toFixed(1)},${y(v).toFixed(1)}`)
            lastT = t
            lastV = v
          })
          flush(lastT, lastV)
          return (
            <g data-line>
              {runs.map((d, i) => (
                <path
                  key={i}
                  d={d}
                  fill="none"
                  stroke={LINE}
                  strokeWidth={1}
                  data-run
                />
              ))}
              {dots}
            </g>
          )
        }}
      />
    </div>
  )
}

export type DailyProps = {
  days: Daily[]
  gaps: Gap[]
  limit: number
  limitLabel: string
  label: string
  domain: Domain
}

// A valid day is a marker with a shape for its verdict. An insufficient day is
// a light band with no value.
export const DailyChart = (p: DailyProps) => {
  const [ref, width] = useWidth()
  // A day is in the view when one of its stamps is.
  const shown = p.days.filter(
    d =>
      dayStamps(d.day).first <= p.domain.t1 &&
      dayStamps(d.day).last >= p.domain.t0
  )
  const axis = yAxis(
    shown.flatMap(d => (d.value === null ? [] : [d.value])),
    p.limit
  )
  return (
    <div ref={ref} className="chart">
      <Frame
        width={width}
        height={DAILY_HEIGHT}
        domain={p.domain}
        axis={axis}
        limit={p.limit}
        limitLabel={p.limitLabel}
        label={p.label}
        gaps={p.gaps}
        behind={({ x, plotH }) => (
          <g data-insufficient>
            {shown
              .filter(d => d.value === null)
              .map(d => {
                const s = dayStamps(d.day)
                const a = Math.max(
                  hourSpan(s.first).start,
                  hourSpan(p.domain.t0).start
                )
                const b = Math.min(s.last, p.domain.t1)
                return (
                  <rect
                    key={d.day}
                    data-insufficient-day
                    x={x(a)}
                    y={TOP}
                    width={Math.max(1, x(b) - x(a))}
                    height={plotH}
                    fill="#e3e8ec"
                  />
                )
              })}
          </g>
        )}
        render={({ x, y }) => {
          const mid = (d: Daily) =>
            (hourSpan(dayStamps(d.day).first).start + dayStamps(d.day).last) / 2
          const runs: string[] = []
          let cur: string[] = []
          for (const d of shown) {
            if (d.value === null) {
              if (cur.length > 1) {
                runs.push('M' + cur.join('L'))
              }
              cur = []
            } else {
              cur.push(`${x(mid(d)).toFixed(1)},${y(d.value).toFixed(1)}`)
            }
          }
          if (cur.length > 1) {
            runs.push('M' + cur.join('L'))
          }
          return (
            <g>
              {runs.map((d, i) => (
                <path
                  key={i}
                  d={d}
                  fill="none"
                  stroke={LINE}
                  strokeWidth={0.8}
                  opacity={0.6}
                />
              ))}
              {shown.map(d => {
                if (d.value === null) {
                  return null
                }
                const cx = x(mid(d))
                const cy = y(d.value)
                return d.verdict === 'over' ? (
                  <path
                    key={d.day}
                    data-day="over"
                    d={`M${cx},${cy - 4}L${cx + 4},${cy}L${cx},${cy + 4}L${cx - 4},${cy}Z`}
                    fill={OVER}
                  />
                ) : (
                  <circle
                    key={d.day}
                    data-day="within"
                    cx={cx}
                    cy={cy}
                    r={2.2}
                    fill={WITHIN}
                  />
                )
              })}
            </g>
          )
        }}
      />
    </div>
  )
}

// The place of a chart while its readings load: the same box as the chart, with
// no content for a screen reader.
export const ChartSkeleton = (p: { height?: number }) => {
  return (
    <div
      className="chart skeleton"
      style={{ height: p.height ?? HOURLY_HEIGHT }}
      aria-hidden="true"
      data-skeleton
    />
  )
}
