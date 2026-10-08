import type { BBox, MapEngine, MapView } from '@travisduffy/map-engine'

const PADDING_PX = 16
const FIT_OPTIONS = { padding: PADDING_PX, keepOnResize: true }
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

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value))

export const getHomeScale = (box: BBox, width: number, height: number) =>
  Math.min(
    Math.max(1, width - 2 * PADDING_PX) / (box[2] + 1 - box[0]),
    Math.max(1, height - 2 * PADDING_PX) / (box[3] + 1 - box[1])
  )

export const getHeldView = (
  view: MapView,
  scale: number,
  homeScale: number,
  box: BBox
) => ({
  centerX: clamp(view.centerX, box[0], box[2] + 1),
  centerY: clamp(view.centerY, box[1], box[3] + 1),
  zoom: Math.max(view.zoom, (ZOOM_FLOOR_RATIO * homeScale * view.zoom) / scale),
})

export const getPannedCenter = (
  view: MapView,
  scale: number,
  dx: number,
  dy: number
) => ({
  centerX: view.centerX - dx / scale,
  centerY: view.centerY - dy / scale,
})

export const getZoomedCenter = (
  view: MapView,
  zoom: number,
  scale: number,
  offsetX: number,
  offsetY: number
) => {
  const shift = (1 - view.zoom / zoom) / scale
  return {
    centerX: view.centerX + offsetX * shift,
    centerY: view.centerY + offsetY * shift,
  }
}

export const attachCamera = (
  engine: MapEngine,
  canvas: HTMLCanvasElement,
  box: BBox
) => {
  engine.fitBounds(box, FIT_OPTIONS)
  let size = { width: canvas.clientWidth, height: canvas.clientHeight }

  const getScale = (engineWidth: number) => {
    const [left] = engine.project(0, 0)
    const [right] = engine.project(1, 0)
    return ((right - left) * engineWidth) / canvas.clientWidth
  }

  const holdView = () => {
    const { width, height } = size
    size = { width: canvas.clientWidth, height: canvas.clientHeight }
    const view = engine.getView()
    if (view === null) {
      return
    }
    const held = getHeldView(
      view,
      getScale(width),
      getHomeScale(box, width, height),
      box
    )
    if (
      held.zoom !== view.zoom ||
      held.centerX !== view.centerX ||
      held.centerY !== view.centerY
    ) {
      engine.setView(held)
    }
  }
  engine.onFrame(holdView)

  const panBy = (dx: number, dy: number) => {
    const view = engine.getView()
    if (view === null) {
      return
    }
    engine.setView(getPannedCenter(view, getScale(size.width), dx, dy))
  }
  const zoomAt = (factor: number, x: number, y: number) => {
    const view = engine.getView()
    if (view === null) {
      return
    }
    const scale = getScale(size.width)
    engine.setView({ zoom: view.zoom * factor })
    const zoom = engine.getView()?.zoom ?? view.zoom
    engine.setView(
      getZoomedCenter(
        view,
        zoom,
        scale,
        x - canvas.clientWidth / 2,
        y - canvas.clientHeight / 2
      )
    )
  }

  const input = new AbortController()
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
      drag = { x: event.clientX, y: event.clientY, left: event.button === 0 }
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
      zoomAt(ZOOM_STEP, event.clientX - rect.left, event.clientY - rect.top)
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

  return () => {
    input.abort()
    engine.offFrame(holdView)
  }
}
