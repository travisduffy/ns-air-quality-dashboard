import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  getHeldView,
  getHomeScale,
  getPannedCenter,
  getZoomedCenter,
} from '../src/camera.ts'

const BOX = [0, 0, 99, 49] as const

test('the home scale fits the box inside the padded canvas', () => {
  assert.equal(getHomeScale(BOX, 232, 232), 2)
  assert.equal(getHomeScale(BOX, 432, 132), 2)
})

test('the zoom floor holds the scale at three quarters of the home', () => {
  const view = { centerX: 50, centerY: 25, zoom: 1 }
  assert.equal(getHeldView(view, 0.5, 1, BOX).zoom, 1.5)
  assert.equal(getHeldView(view, 0.75, 1, BOX).zoom, 1)
  assert.equal(getHeldView({ ...view, zoom: 2 }, 2, 1, BOX).zoom, 2)
})

test('the pan clamp keeps the center inside the box', () => {
  const held = getHeldView({ centerX: -5, centerY: 200, zoom: 1 }, 1, 1, BOX)
  assert.deepEqual(held, { centerX: 0, centerY: 50, zoom: 1 })
  const past = getHeldView({ centerX: 150, centerY: -5, zoom: 1 }, 1, 1, BOX)
  assert.deepEqual(past, { centerX: 100, centerY: 0, zoom: 1 })
  const inside = { centerX: 40, centerY: 20, zoom: 1 }
  assert.deepEqual(getHeldView(inside, 1, 1, BOX), inside)
})

test('a pan moves the center against the drag, in bitmap pixels', () => {
  const view = { centerX: 50, centerY: 50, zoom: 1 }
  assert.deepEqual(getPannedCenter(view, 2, 10, -4), {
    centerX: 45,
    centerY: 52,
  })
})

test('a zoom about a point keeps that point under the cursor', () => {
  const view = { centerX: 100, centerY: 80, zoom: 1 }
  const scale = 0.5
  const zoom = 2
  const [offsetX, offsetY] = [40, -20]
  const center = getZoomedCenter(view, zoom, scale, offsetX, offsetY)
  const zoomedScale = (scale * zoom) / view.zoom
  assert.equal(center.centerX + offsetX / zoomedScale, 180)
  assert.equal(center.centerY + offsetY / zoomedScale, 40)
  assert.equal(view.centerX + offsetX / scale, 180)
  assert.equal(view.centerY + offsetY / scale, 40)
})

test('a zoom that the engine refused leaves the center in place', () => {
  const view = { centerX: 100, centerY: 80, zoom: 20 }
  assert.deepEqual(getZoomedCenter(view, 20, 4, 40, -20), {
    centerX: 100,
    centerY: 80,
  })
})
