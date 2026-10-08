import type { StationFabric } from '../shared/contract.ts'

export const DAYS = 366
export const ROW_PX = 18
export const GAP_PX = 4
export const DIVIDER_PX = 18
export const MARK_PX = 2
export const MONTH_STARTS = [
  0, 31, 60, 91, 121, 152, 182, 213, 244, 274, 305, 335,
]

const DAY_MS = 86_400_000
const ROW_STEP_PX = ROW_PX + GAP_PX
const MARK_HALF_PX = 4
const MARK_HEIGHT_PX = 8

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

export const rowTop = (row: number, breaks: number[] = []) =>
  row * ROW_STEP_PX + DIVIDER_PX * breaks.filter(b => b <= row).length

export const fabricHeight = (rows: number, breaks: number[] = []) =>
  rows * ROW_STEP_PX - GAP_PX + DIVIDER_PX * breaks.length

export const rowAt = (y: number, rows: number, breaks: number[] = []) => {
  for (let row = rows - 1; row > 0; row--) {
    if (y >= rowTop(row, breaks)) {
      return row
    }
  }
  return 0
}

export const dayAt = (x: number, widthPx: number, days: number) =>
  Math.min(days - 1, Math.max(0, Math.floor((x / widthPx) * DAYS)))

export const dayCenter = (index: number, widthPx: number) =>
  ((index + 0.5) / DAYS) * widthPx

export const dayDate = (year: number, index: number) =>
  new Date(Date.UTC(year, 0, 1 + index)).toISOString().slice(0, 10)

export const dayIndex = (day: string) =>
  (Date.parse(`${day}T00:00:00Z`) - Date.parse(`${day.slice(0, 4)}-01-01`)) /
  DAY_MS

export const shadeOf = (value: number, max: number) => {
  const scaled = Math.sqrt(Math.min(1, Math.max(0, value / max))) * 4
  const low = Math.min(3, Math.floor(scaled))
  const part = scaled - low
  const rgb = RAMP[low].map((c, k) =>
    Math.round(c + (RAMP[low + 1][k] - c) * part)
  )
  return `rgb(${rgb.join(', ')})`
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

const columnDays = (column: number, columns: number) => {
  const from = Math.floor((column * DAYS) / columns)
  const to = Math.max(from + 1, Math.floor(((column + 1) * DAYS) / columns))
  return [from, to] as const
}

type DrawInput = {
  canvas: HTMLCanvasElement
  widthPx: number
  scale: number
  fabric: StationFabric
  breaks: number[]
}

export const drawFabric = ({
  canvas,
  widthPx,
  scale,
  fabric,
  breaks,
}: DrawInput) => {
  const heightPx = fabricHeight(fabric.rows.length, breaks)
  canvas.width = Math.round(widthPx * scale)
  canvas.height = Math.round(heightPx * scale)
  canvas.style.width = `${widthPx}px`
  canvas.style.height = `${heightPx}px`
  const context = canvas.getContext('2d')
  if (!context) {
    throw new Error('the fabric needs a 2D canvas')
  }

  const columns = canvas.width
  const hatch = hatchPattern(context, scale)
  const height = Math.round(ROW_PX * scale)
  const marks: { x: number; y: number }[] = []

  context.clearRect(0, 0, canvas.width, canvas.height)
  fabric.rows.forEach((row, index) => {
    const y = Math.round(rowTop(index, breaks) * scale)
    const over = new Set(row.overDays)
    for (let column = 0; column < columns; column++) {
      const [from, to] = columnDays(column, columns)
      if (from >= row.values.length) {
        continue
      }
      let worst = -1
      let isOver = false
      for (let day = from; day < Math.min(to, row.values.length); day++) {
        isOver ||= over.has(day)
        const value = row.values[day]
        if (value !== null && (worst < 0 || value > row.values[worst]!)) {
          worst = day
        }
      }
      context.fillStyle = isOver
        ? OVER
        : worst < 0
          ? hatch
          : shadeOf(row.values[worst]!, fabric.scale.max)
      context.fillRect(column, y, 1, height)
      if (isOver) {
        marks.push({ x: column + 0.5, y })
      }
    }
  })

  context.fillStyle = OVER
  context.strokeStyle = INK
  context.lineWidth = scale
  context.lineJoin = 'round'
  const half = MARK_HALF_PX * scale
  for (const { x, y } of marks) {
    const base = y + height - 2 * scale
    context.beginPath()
    context.moveTo(x - half, base)
    context.lineTo(x + half, base)
    context.lineTo(x, base - MARK_HEIGHT_PX * scale)
    context.closePath()
    context.fill()
    context.stroke()
  }
}
