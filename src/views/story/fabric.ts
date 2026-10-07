import type { FabricLayer, Highlight } from '../../../shared/contract.ts'
import { DAY_MS, dayIndex } from './format.ts'

export type HighlightLayer = Highlight['layer']

export type Geometry = {
  gutterPx: number
  labelPx: number
  rowPx: number
  gapPx: number
  padTopPx: number
}

// The desk layout puts each station label in a left gutter. The phone has no
// room for a gutter, so each label sits on its own line above its row.
export const DESK: Geometry = {
  gutterPx: 148,
  labelPx: 0,
  rowPx: 34,
  gapPx: 10,
  padTopPx: 14,
}

export const PHONE: Geometry = {
  gutterPx: 0,
  labelPx: 17,
  rowPx: 10,
  gapPx: 3,
  padTopPx: 0,
}

// The neutral ramp keeps a normal day gray. Only a day over the limit takes
// colour, and it always carries the triangle as well.
const RAMP = [
  [0xf1, 0xef, 0xe9],
  [0xcf, 0xcb, 0xc2],
  [0xa3, 0x9e, 0x93],
  [0x6c, 0x67, 0x5e],
  [0x34, 0x31, 0x2c],
]
const OVER = '#e07b00'
const GAP = '#e4e2dc'
const HATCH = '#9c978c'
const INK = '#1c1b19'
const DIM = 'rgba(250, 248, 243, 0.9)'
// A mark outside the highlight shows through the veil as much as a row does.
const DIM_MARK_ALPHA = 0.1
// The frame of a short range, in CSS pixels.
const FRAME_PX = 3
const FRAME_MIN_PX = 8
const MARK_PX = 12

// The smell layer counts hours at or above 3 ppb, and one hour is news.
export const TRS_FULL_HOURS = 4
const DAY_HOURS = 24

export const rowTop = (geometry: Geometry, row: number) =>
  geometry.padTopPx +
  row * (geometry.labelPx + geometry.rowPx + geometry.gapPx) +
  geometry.labelPx

export const fabricHeight = (geometry: Geometry, rows: number) =>
  rowTop(geometry, rows) - geometry.labelPx - geometry.gapPx

// The square root spreads the many clean days across the light half of the
// ramp, so the texture of a normal year still shows.
const mix = (t: number) => {
  const scaled = Math.sqrt(Math.min(1, Math.max(0, t))) * (RAMP.length - 1)
  const low = Math.min(RAMP.length - 2, Math.floor(scaled))
  const part = scaled - low
  const rgb = RAMP[low].map((c, k) =>
    Math.round(c + (RAMP[low + 1][k] - c) * part)
  )
  return `rgb(${rgb.join(', ')})`
}

// Each kind of layer maps a day to a shade, or to null for a day with no
// reading, which draws hatched.
export const shadeOf = (layer: HighlightLayer, limit: number | null) => {
  if (layer === 'pm25-hours') {
    return (_value: number | null, hours: number) =>
      hours === 0 ? null : mix(((DAY_HOURS - hours) / DAY_HOURS) * 0.8 + 0.05)
  }
  const full = limit ?? TRS_FULL_HOURS
  return (value: number | null) => {
    if (value === null) {
      return null
    }
    if (limit !== null && value > limit) {
      return OVER
    }
    return mix(value / full)
  }
}

const hatchPattern = (context: CanvasRenderingContext2D, scale: number) => {
  const size = Math.max(4, Math.round(4 * scale))
  const tile = document.createElement('canvas')
  tile.width = tile.height = size
  const tileContext = tile.getContext('2d')!
  tileContext.fillStyle = GAP
  tileContext.fillRect(0, 0, size, size)
  tileContext.strokeStyle = HATCH
  tileContext.lineWidth = Math.max(1, scale)
  tileContext.beginPath()
  tileContext.moveTo(0, size)
  tileContext.lineTo(size, 0)
  tileContext.stroke()
  return context.createPattern(tile, 'repeat')!
}

// The days of one device pixel column, as a half-open range.
const columnDays = (column: number, columns: number, dayCount: number) => {
  const from = Math.floor((column * dayCount) / columns)
  const to = Math.max(from + 1, Math.floor(((column + 1) * dayCount) / columns))
  return [from, to] as const
}

// A column shows the worst day of its range: the highest value, or the
// fewest hours, so that no day over the limit and no gap hides in a bin.
const worstDay = (
  values: (number | null)[],
  hours: number[],
  from: number,
  to: number,
  byHours: boolean
) => {
  let worst = from
  for (let day = from + 1; day < to; day++) {
    if (byHours) {
      if (hours[day] < hours[worst]) worst = day
      continue
    }
    const value = values[day]
    const best = values[worst]
    if (value !== null && (best === null || value > best)) worst = day
  }
  return worst
}

type DrawInput = {
  canvas: HTMLCanvasElement
  geometry: Geometry
  widthPx: number
  scale: number
  stations: readonly string[]
  data: FabricLayer
  layer: HighlightLayer
  highlight: Highlight
}

export const drawFabric = ({
  canvas,
  geometry,
  widthPx,
  scale,
  stations,
  data,
  layer,
  highlight,
}: DrawInput) => {
  const heightPx = fabricHeight(geometry, stations.length)
  canvas.width = Math.round(widthPx * scale)
  canvas.height = Math.round(heightPx * scale)
  canvas.style.width = `${widthPx}px`
  canvas.style.height = `${heightPx}px`
  const context = canvas.getContext('2d')
  if (!context) {
    throw new Error('the fabric needs a 2D canvas')
  }

  const columns = canvas.width
  const dayCount = data.dayCount
  const byHours = layer === 'pm25-hours'
  const shade = shadeOf(layer, data.limit)
  const hatch = hatchPattern(context, scale)
  const rows = new Map(data.stations.map(row => [row.station, row]))
  const from = dayIndex(data.firstDay, highlight.from)
  const to = dayIndex(data.firstDay, highlight.to)
  const months = highlight.months
  const lit = new Set(highlight.stations)
  const overs: { x: number; y: number; dim: boolean }[] = []

  // A column is lit when one of its days falls inside the highlight.
  const columnLit = Array.from({ length: columns }, (_, column) => {
    const [a, b] = columnDays(column, columns, dayCount)
    if (b <= from || a > to) {
      return false
    }
    if (!months) {
      return true
    }
    for (let day = a; day < b; day++) {
      const month = new Date(Date.parse(data.firstDay) + day * DAY_MS)
      if (months.includes(month.getUTCMonth() + 1)) return true
    }
    return false
  })

  context.clearRect(0, 0, canvas.width, canvas.height)
  stations.forEach((station, index) => {
    const y = Math.round(rowTop(geometry, index) * scale)
    const height = Math.round(geometry.rowPx * scale)
    const row = rows.get(station)
    if (!row) {
      context.strokeStyle = GAP
      context.lineWidth = scale
      context.strokeRect(0, y + 0.5, columns, height - 1)
      return
    }
    for (let column = 0; column < columns; column++) {
      const [a, b] = columnDays(column, columns, dayCount)
      const day = worstDay(row.values, row.hours, a, b, byHours)
      const fill = shade(row.values[day], row.hours[day])
      context.fillStyle = fill ?? hatch
      context.fillRect(column, y, 1, height)
      if (fill === OVER) {
        const dim = !lit.has(station) || !columnLit[column]
        overs.push({ x: column + 0.5, y, dim })
      }
    }
    if (!lit.has(station)) {
      context.fillStyle = DIM
      context.fillRect(0, y, columns, height)
      return
    }
    context.fillStyle = DIM
    let start = -1
    for (let column = 0; column <= columns; column++) {
      const dim = column < columns && !columnLit[column]
      if (dim && start < 0) start = column
      if (dim || start < 0) continue
      context.fillRect(start, y, column - start, height)
      start = -1
    }
  })

  // The triangles draw last, so that no fill covers one.
  context.fillStyle = OVER
  context.strokeStyle = INK
  context.lineWidth = 2 * scale
  context.lineJoin = 'round'
  const half = (MARK_PX / 2) * scale
  for (const { x, y, dim } of overs) {
    context.globalAlpha = dim ? DIM_MARK_ALPHA : 1
    const base = Math.max(y, MARK_PX * scale + scale)
    context.beginPath()
    context.moveTo(x - half, base - 2 * half)
    context.lineTo(x + half, base - 2 * half)
    context.lineTo(x, base)
    context.closePath()
    context.fill()
    context.stroke()
  }
  context.globalAlpha = 1

  // A range shorter than the decade gets a frame, because a month is only a
  // few pixels wide.
  const litRows = stations.flatMap((station, index) =>
    lit.has(station) ? [index] : []
  )
  if ((from > 0 || to < dayCount - 1) && !months && litRows.length > 0) {
    const left = Math.floor((Math.max(0, from) / dayCount) * columns)
    const right = Math.ceil(
      ((Math.min(dayCount - 1, to) + 1) / dayCount) * columns
    )
    const top = Math.round(rowTop(geometry, litRows[0]) * scale)
    const bottom = Math.round(
      (rowTop(geometry, litRows[litRows.length - 1]) + geometry.rowPx) * scale
    )
    const pad = FRAME_PX * scale
    const width = Math.max(right - left, FRAME_MIN_PX * scale)
    const center = (left + right) / 2
    context.strokeStyle = INK
    context.lineWidth = FRAME_PX * scale
    context.strokeRect(
      center - width / 2 - pad,
      top - pad,
      width + 2 * pad,
      bottom - top + 2 * pad
    )
  }

  context.fillStyle = INK
  for (const mark of highlight.marks ?? []) {
    const index = stations.indexOf(mark.station)
    if (index < 0) {
      continue
    }
    const x = Math.floor(
      ((dayIndex(data.firstDay, mark.day) + 0.5) / dayCount) * columns
    )
    const y = Math.round(rowTop(geometry, index) * scale)
    const height = Math.round(geometry.rowPx * scale)
    context.fillRect(x - scale, y - 3 * scale, 2 * scale, height + 6 * scale)
  }
}
