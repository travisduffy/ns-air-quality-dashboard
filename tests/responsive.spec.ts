import { readdirSync, readFileSync } from 'node:fs'
import { expect, test, type Page } from '@playwright/test'

// The default sizes of the screen sweep. A breakpoint width takes the height
// of the nearest default width, the smaller one on a tie.
const DEFAULT_SIZES = [
  [360, 800],
  [390, 844],
  [430, 932],
  [768, 1024],
  [1024, 768],
  [1280, 800],
  [1440, 900],
  [1920, 1080],
] as const

// The width on each side of each breakpoint in src/*.css: max-width N adds N
// and N + 1, min-width N adds N - 1 and N.
const getBreakpointWidths = () => {
  const dir = new URL('../src/', import.meta.url)
  const widths = new Set<number>()
  for (const name of readdirSync(dir).filter(n => n.endsWith('.css'))) {
    const css = readFileSync(new URL(name, dir), 'utf8').replace(
      /\/\*[\s\S]*?\*\//g,
      ''
    )
    for (const m of css.matchAll(/\((min|max)-width:\s*(\d+)px\)/g)) {
      const n = Number(m[2])
      for (const w of m[1] === 'max' ? [n, n + 1] : [n - 1, n]) {
        widths.add(w)
      }
    }
  }
  return [...widths]
}

const getHeight = (width: number) =>
  [...DEFAULT_SIZES].sort(
    (a, b) => Math.abs(a[0] - width) - Math.abs(b[0] - width) || a[0] - b[0]
  )[0][1]

const SIZES = [
  ...new Map(
    [
      ...DEFAULT_SIZES.map(([w, h]) => [w, h] as const),
      ...getBreakpointWidths().map(w => [w, getHeight(w)] as const),
    ].map(size => [size[0], size])
  ).values(),
].sort((a, b) => a[0] - b[0])

const TOUCH_PX = 44
const TOUCH_WIDTH_BELOW = 768
const MIN_CONTROL_PX = 24
const PHONE_WIDTH = 700

const waitForSettled = async (page: Page) => {
  await expect(page.locator('[data-skeleton]')).toHaveCount(0)
  await expect(page.locator('.map-view[data-ready="true"]')).toBeVisible()
}

const getPageOverflow = (page: Page) =>
  page.evaluate(() => document.documentElement.scrollWidth - innerWidth)

const getBannerBox = (page: Page) =>
  page.evaluate(() => {
    const box = document.querySelector('.c-top')!.getBoundingClientRect()
    return { top: box.top, bottom: box.bottom, height: innerHeight }
  })

// Each visible element of the header, the tiles, the map frame, and the
// detail panel whose box crosses the left or the right edge of the viewport.
const getCutElements = (page: Page) =>
  page.evaluate(() => {
    const roots = [
      ...document.querySelectorAll(
        '.c-top, .c-tiles, [data-testid="c-detail"]'
      ),
    ]
    const elements = [
      ...roots.flatMap(root => [root, ...root.querySelectorAll('*')]),
      ...document.querySelectorAll('.map-frame'),
    ]
    return elements
      .filter(element => {
        const style = getComputedStyle(element)
        const box = element.getBoundingClientRect()
        const hidden =
          box.width === 0 ||
          box.height === 0 ||
          style.visibility === 'hidden' ||
          style.clipPath === 'inset(50%)'
        return !hidden && (box.left < -0.5 || box.right > innerWidth + 0.5)
      })
      .map(element => {
        const box = element.getBoundingClientRect()
        return `${element.tagName.toLowerCase()}.${element.className} ${Math.round(box.left)}..${Math.round(box.right)}`
      })
  })

// Each visible control smaller than 44 x 44 CSS px. Two exceptions, by
// WCAG 2.5.5: a link inside a sentence is an inline target, and the button of
// a tile or of a health row is a label whose target is the whole tile or row,
// so the tile or the row is measured in its place. A third exception, by
// WCAG 2.5.8, only for a minimum of 24 px: a control under 24 px passes when a
// 24 x 24 square on its center touches no other control, as the year rows of
// the fabric do with their 4 px gap.
const getSmallControls = (page: Page, minimum: number) =>
  page.evaluate(touch => {
    const controls = [
      ...document.querySelectorAll(
        'button, select, input, summary, [role="button"]'
      ),
    ]
    return controls
      .map(control => {
        const target =
          control.closest('[data-testid="c-tile"]') ??
          control.closest('[data-testid="health-row"]') ??
          control
        const box = target.getBoundingClientRect()
        return { control, box }
      })
      .filter(({ control, box }, _, all) => {
        const visible =
          box.width > 0 &&
          box.height > 0 &&
          getComputedStyle(control).visibility !== 'hidden'
        if (!visible || (box.width >= touch && box.height >= touch)) {
          return false
        }
        if (touch > 24) {
          return true
        }
        const x = box.left + box.width / 2
        const y = box.top + box.height / 2
        return all.some(
          other =>
            other.control !== control &&
            other.box.width > 0 &&
            other.box.height > 0 &&
            other.box.left < x + 12 &&
            other.box.right > x - 12 &&
            other.box.top < y + 12 &&
            other.box.bottom > y - 12
        )
      })
      .map(
        ({ control, box }) =>
          `${control.tagName.toLowerCase()} "${(control.textContent ?? '').trim().slice(0, 24)}" ${box.width.toFixed(1)}x${box.height.toFixed(1)}`
      )
  }, minimum)

const checkLayout = async (page: Page, width: number) => {
  // The detail panel rises in with a transform; measure the end state.
  await page.evaluate(() =>
    Promise.all(document.getAnimations().map(a => a.finished))
  )
  expect(await getPageOverflow(page), 'horizontal page overflow').toBe(0)
  expect(await getCutElements(page), 'elements cut by the viewport').toEqual([])
  if (width < TOUCH_WIDTH_BELOW) {
    expect(
      await getSmallControls(page, TOUCH_PX),
      'controls under 44 px'
    ).toEqual([])
  }
}

const choosePollutant = async (page: Page, code: string) => {
  if (page.viewportSize()!.width < PHONE_WIDTH) {
    await page.getByTestId('c-pollutant-select').selectOption(code)
    return
  }
  await page.getByTestId('c-pollutant').getByText(code, { exact: true }).click()
}

const waitStill = async (page: Page, testId: string) => {
  let last = -1
  await expect
    .poll(
      async () => {
        const box = (await page.getByTestId(testId).boundingBox())!
        const still = box.y === last
        last = box.y
        return still
      },
      { intervals: [300] }
    )
    .toBe(true)
}

// The fabric of Halifax in single mode, with one day of 2019 tapped.
const openTappedFabric = async (page: Page) => {
  await choosePollutant(page, 'O3')
  await page
    .locator('[data-testid="c-tile"][data-station="Halifax"] button')
    .click()
  await expect(page.getByTestId('fabric')).toHaveAttribute('data-ready', 'true')
  await waitStill(page, 'fabric-canvas')
  const year = page.locator('[data-testid="fabric-year"][data-year="2019"]')
  await year.scrollIntoViewIfNeeded()
  await waitStill(page, 'fabric-canvas')
  const canvas = (await page.getByTestId('fabric-canvas').boundingBox())!
  const row = (await year.boundingBox())!
  await page.mouse.click(canvas.x + canvas.width * 0.55, row.y + row.height / 2)
  await expect(page.getByTestId('fabric-outline')).toHaveAttribute(
    'data-year',
    '2019'
  )
}

// The three views of the scan: the screen in All mode, the screen with one
// pollutant picked, and the detail of Halifax with the fabric and a tapped day.
// Each must have no horizontal overflow and no control under 24 CSS px.
const checkScanView = async (page: Page) => {
  await page.evaluate(() =>
    Promise.all(
      document.getAnimations().map(a => a.finished.catch(() => undefined))
    )
  )
  expect(await getPageOverflow(page), 'horizontal page overflow').toBe(0)
  expect(await getCutElements(page), 'elements cut by the viewport').toEqual([])
  expect(
    await getSmallControls(page, MIN_CONTROL_PX),
    `controls under ${MIN_CONTROL_PX} px`
  ).toEqual([])
}

for (const [width, height] of SIZES) {
  test.describe(`${width}x${height}`, () => {
    test.use({ viewport: { width, height } })

    test('the main screen fits the screen', async ({ page }) => {
      await page.goto('./')
      await waitForSettled(page)
      const banner = await getBannerBox(page)
      expect(banner.top, 'banner top').toBe(0)
      expect(banner.bottom, 'banner bottom').toBeLessThanOrEqual(banner.height)
      await checkLayout(page, width)
    })

    test('an open station detail fits the screen', async ({ page }) => {
      await page.goto('./')
      await waitForSettled(page)
      await page.locator('[data-testid="c-tile"] button').first().click()
      await expect(page.getByTestId('c-detail')).toBeVisible()
      await expect(page.locator('svg[data-chart]').first()).toBeVisible()
      await expect(page.locator('[data-skeleton]')).toHaveCount(0)
      if (width >= 900) {
        // The two columns fill the screen, so the banner stays in view.
        const banner = await getBannerBox(page)
        expect(banner.top, 'banner top after the pick').toBe(0)
      }
      await checkLayout(page, width)
    })

    test('scan: the All mode fits the screen', async ({ page }) => {
      await page.goto('./')
      await waitForSettled(page)
      await checkScanView(page)
    })

    test('scan: one pollutant picked fits the screen', async ({ page }) => {
      await page.goto('./')
      await waitForSettled(page)
      await choosePollutant(page, 'O3')
      await checkScanView(page)
    })

    test('scan: the fabric of Halifax with one day tapped fits the screen', async ({
      page,
    }) => {
      await page.goto('./')
      await waitForSettled(page)
      await openTappedFabric(page)
      await checkScanView(page)
    })
  })
}
