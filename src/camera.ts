import type { BBox, MapEngine } from '@travisduffy/map-engine'

const PADDING_PX = 16
const FIT_OPTIONS = { padding: PADDING_PX, keepOnResize: true }
const GUARDED_EVENTS = [
  'wheel',
  'pointerdown',
  'pointermove',
  'pointerup',
  'pointercancel',
] as const

const isCameraInput = (event: Event) => {
  if (event instanceof WheelEvent) {
    return true
  }
  return (
    event instanceof PointerEvent &&
    (event.pointerType === 'touch' || event.button === 1)
  )
}

export const lockCamera = (
  engine: MapEngine,
  canvas: HTMLCanvasElement,
  box: BBox
) => {
  engine.fitBounds(box, FIT_OPTIONS)
  const frame = canvas.parentElement
  if (frame === null) {
    throw new Error('the map canvas holds no frame')
  }
  const input = new AbortController()
  for (const type of GUARDED_EVENTS) {
    frame.addEventListener(
      type,
      event => {
        if (event.target === canvas && isCameraInput(event)) {
          event.stopPropagation()
        }
      },
      { capture: true, passive: true, signal: input.signal }
    )
  }
  return () => input.abort()
}
