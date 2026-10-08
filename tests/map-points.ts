import { expect, type Page } from '@playwright/test'

export type Point = { x: number; y: number }
export type Box = { x: number; y: number; width: number; height: number }

export const NS_BOX = [179, 192, 1867, 1551] as const
export const PADDING_PX = 16
export const COUNTY_PIXELS: Record<string, number[]> = {
  'Halifax, NS': [1004, 1036],
  'Kings, NS': [612, 998],
  'Pictou, NS': [1142, 797],
  'Inverness, NS': [1480, 636],
  'Cape Breton, NS': [1697, 636],
}

export const openMap = async (page: Page, width = 1440, height = 900) => {
  await page.setViewportSize({ width, height })
  await page.goto('./')
  await expect(page.locator('.map-view[data-ready="true"]')).toBeVisible()
  return (await page.locator('.map-canvas').boundingBox())!
}

export const getHomePoint = (canvas: Box, [x, y]: number[]) => {
  const [minX, minY, maxX, maxY] = NS_BOX
  const scale = Math.min(
    (canvas.width - 2 * PADDING_PX) / (maxX + 1 - minX),
    (canvas.height - 2 * PADDING_PX) / (maxY + 1 - minY)
  )
  return {
    x: canvas.x + canvas.width / 2 + (x + 0.5 - (minX + maxX + 1) / 2) * scale,
    y: canvas.y + canvas.height / 2 + (y + 0.5 - (minY + maxY + 1) / 2) * scale,
  }
}

export const readPixels = async (page: Page, clip: Box) => {
  const png = await page.screenshot({ clip })
  return page.evaluate(async base64 => {
    const response = await fetch(`data:image/png;base64,${base64}`)
    const bitmap = await createImageBitmap(await response.blob())
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height)
    const context = canvas.getContext('2d')!
    context.drawImage(bitmap, 0, 0)
    return [...context.getImageData(0, 0, bitmap.width, bitmap.height).data]
  }, png.toString('base64'))
}

export const getColorAt = async (page: Page, point: { x: number; y: number }) =>
  (
    await readPixels(page, {
      x: Math.round(point.x),
      y: Math.round(point.y),
      width: 1,
      height: 1,
    })
  ).slice(0, 3)

export const toRgb = (hex: string) => [
  parseInt(hex.slice(1, 3), 16),
  parseInt(hex.slice(3, 5), 16),
  parseInt(hex.slice(5, 7), 16),
]

export const toHex = (rgb: number[]) =>
  `#${rgb.map(value => value.toString(16).padStart(2, '0')).join('')}`

export const isColor = (rgb: number[], hex: string) =>
  toRgb(hex).every((value, i) => Math.abs(rgb[i] - value) <= 3)

export const expectCountyAt = async (
  page: Page,
  point: { x: number; y: number },
  county: string
) => {
  await page.mouse.move(point.x, point.y)
  await expect(page.getByTestId('map-tip')).toContainText(county)
}
