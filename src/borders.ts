import type { MapEngine } from '@travisduffy/map-engine'

const BORDER_COLOR = 'rgba(20, 40, 55, 0.4)'
const BORDER_WIDTH_PX = 1
const NO_GROUP = 0xffff

const getCountyMapping = (engine: MapEngine, keys: string[]) => {
  const ids = keys
    .map(key => engine.getSectorId(key))
    .filter(id => id !== undefined)
  const mapping = new Uint16Array(engine.getSectorKeys().length).fill(NO_GROUP)
  for (const id of ids) {
    mapping[id] = id
  }
  return mapping
}

export const attachBorders = async (
  engine: MapEngine,
  overlay: HTMLCanvasElement,
  keys: string[]
) => {
  const mapping = getCountyMapping(engine, keys)
  await engine.setParentMapping(mapping, mapping.length)
  await engine.recomputeBorders()
  engine.setBordersVisible(false)
  const segments = engine.getBorderSegments()
  const context = overlay.getContext('2d')
  if (segments === null || context === null) {
    throw new Error('the map has no county borders to draw')
  }
  overlay.dataset.segments = String(segments.length / 4)

  let drawn = ''
  const draw = () => {
    const ratio = window.devicePixelRatio
    const width = overlay.clientWidth
    const height = overlay.clientHeight
    const [left, top] = engine.project(0, 0)
    const [right] = engine.project(1, 0)
    const state = [ratio, width, height, left, top, right].join()
    if (state === drawn) {
      return
    }
    drawn = state
    overlay.width = Math.round(width * ratio)
    overlay.height = Math.round(height * ratio)
    context.setTransform(ratio, 0, 0, ratio, 0, 0)
    context.strokeStyle = BORDER_COLOR
    context.lineWidth = BORDER_WIDTH_PX
    context.beginPath()
    const scale = right - left
    for (let i = 0; i < segments.length; i += 4) {
      context.moveTo(left + segments[i] * scale, top + segments[i + 1] * scale)
      context.lineTo(
        left + segments[i + 2] * scale,
        top + segments[i + 3] * scale
      )
    }
    context.stroke()
  }
  draw()
  engine.onFrame(draw)
  return () => engine.offFrame(draw)
}
