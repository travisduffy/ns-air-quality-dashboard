import { expect, test, type Page } from '@playwright/test'

// Points inside each county, as fractions of the bitmap width and height.
// The canvas keeps the aspect ratio of the bitmap, so they hold at any size.
const HALIFAX = [0.491, 0.621]
const LUNENBURG = [0.324, 0.693]

const pointAt = async (page: Page, [x, y]: number[]) => {
  const box = (await page.locator('#map').boundingBox())!
  return [box.x + box.width * x, box.y + box.height * y]
}

test.beforeEach(async ({ page }) => {
  await page.goto('/')
  await expect(page.locator('body')).toHaveAttribute('data-state', 'ready')
})

test('the panel ranks the counties that have a station', async ({ page }) => {
  await expect(page.locator('.ranking li')).toHaveCount(5)
  await expect(page.locator('.ranking li').first()).toHaveAttribute(
    'data-band',
    'over'
  )
})

test('a hover names the county under the pointer', async ({ page }) => {
  const [x, y] = await pointAt(page, HALIFAX)
  await page.mouse.move(x, y)
  await expect(page.locator('#tooltip')).toBeVisible()
  await expect(page.locator('#tooltip strong')).toHaveText('Halifax')
})

test('a click opens the stations of the county', async ({ page }) => {
  const [x, y] = await pointAt(page, HALIFAX)
  await page.mouse.click(x, y)
  await expect(page.locator('#panel h2')).toHaveText('Halifax County')
  await expect(page.locator('#panel h3')).toHaveText([
    'Halifax Johnston',
    'Lake Major',
  ])

  await page.locator('#back').click()
  await expect(page.locator('.ranking')).toBeVisible()
})

test('a county with no station says so', async ({ page }) => {
  const [x, y] = await pointAt(page, LUNENBURG)
  await page.mouse.click(x, y)
  await expect(page.locator('#panel h2')).toHaveText('Lunenburg County')
  await expect(page.locator('#panel .status')).toHaveText(
    /No provincial station/
  )
})

test('a pollutant filter rejudges every county', async ({ page }) => {
  await page.locator('[data-filter="NO2"]').click()
  await expect(page.locator('[data-filter="NO2"]')).toHaveAttribute(
    'aria-pressed',
    'true'
  )
  await expect(page.locator('.ranking li[data-band="over"]')).toHaveCount(0)
})
