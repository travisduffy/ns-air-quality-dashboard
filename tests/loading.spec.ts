import { expect, test, type Page } from '@playwright/test'

const DELAY = 1500
const SHIFT_LIMIT = 0.05
const SIZES = [
  { name: 'desktop', width: 1440, height: 900 },
  { name: 'phone', width: 390, height: 844 },
]
const DATA_ROUTE = /\/(overview\.json|sectors\.json|map\.png)$/
const READINGS_ROUTE = '**/readings/**'

const delay = (page: Page, route: string | RegExp, ms: number) =>
  page.route(route, async r => {
    await new Promise(resolve => setTimeout(resolve, ms))
    await r.continue().catch(() => undefined)
  })

const watchShift = (page: Page) =>
  page.addInitScript(() => {
    const target = window as unknown as { shift: number }
    target.shift = 0
    new PerformanceObserver(list => {
      for (const entry of list.getEntries()) {
        const shift = entry as unknown as {
          value: number
          hadRecentInput: boolean
        }
        if (!shift.hadRecentInput) {
          target.shift += shift.value
        }
      }
    }).observe({ type: 'layout-shift', buffered: true })
  })

for (const size of SIZES) {
  test.describe(size.name, () => {
    test.use({ viewport: { width: size.width, height: size.height } })

    test('each loading region shows its skeleton while the data is delayed', async ({
      page,
    }) => {
      await delay(page, DATA_ROUTE, 5000)
      await page.goto('./')
      const shell = page.locator('[data-loading="shell"]')
      await expect(shell).toHaveAttribute('aria-busy', 'true')
      await expect(shell).not.toHaveAttribute('data-pending')
      for (const region of ['header', 'tiles', 'map']) {
        const box = page.locator(`[data-loading="${region}"]`)
        await expect(box.locator('[data-skeleton]').first()).toBeVisible()
      }
      await expect(page.getByText('Loading…')).toHaveCount(0)
      const hidden = await page
        .locator('[data-skeleton]')
        .evaluateAll(bones =>
          bones.every(bone => bone.closest('[aria-hidden="true"]') !== null)
        )
      expect(hidden).toBe(true)
    })

    test('the readings show chart skeletons while the readings are delayed', async ({
      page,
    }) => {
      await delay(page, READINGS_ROUTE, 5000)
      await page.goto('./')
      await page.locator('[data-testid="c-tile"] button').first().click()
      const readings = page.locator('section.readings')
      await expect(readings).toHaveAttribute('aria-busy', 'true')
      await expect(
        readings.locator('[data-skeleton]:not([data-pending])').first()
      ).toBeVisible()
    })

    test('the layout does not shift when the data arrives', async ({
      page,
    }) => {
      await watchShift(page)
      await delay(page, DATA_ROUTE, DELAY)
      await page.goto('./')
      await expect(page.locator('[data-testid="c-tile"]').first()).toBeVisible()
      await expect(page.locator('.map-view[data-ready="true"]')).toBeAttached({
        timeout: 20_000,
      })
      await expect(page.locator('[data-skeleton]')).toHaveCount(0)
      await page.waitForTimeout(500)
      const shift = await page.evaluate(
        () => (window as unknown as { shift: number }).shift
      )
      expect(shift).toBeLessThan(SHIFT_LIMIT)
    })
  })
}
