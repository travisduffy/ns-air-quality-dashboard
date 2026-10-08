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
      ...document.querySelectorAll('.c-top, .c-tiles, [data-testid="c-detail"]'),
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
// so the tile or the row is measured in its place.
const getSmallControls = (page: Page) =>
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
      .filter(({ control, box }) => {
        const visible =
          box.width > 0 &&
          box.height > 0 &&
          getComputedStyle(control).visibility !== 'hidden'
        return visible && (box.width < touch || box.height < touch)
      })
      .map(
        ({ control, box }) =>
          `${control.tagName.toLowerCase()} "${(control.textContent ?? '').trim().slice(0, 24)}" ${box.width.toFixed(1)}x${box.height.toFixed(1)}`
      )
  }, TOUCH_PX)

const checkLayout = async (page: Page, width: number) => {
  // The detail panel rises in with a transform; measure the end state.
  await page.evaluate(() =>
    Promise.all(document.getAnimations().map(a => a.finished))
  )
  expect(await getPageOverflow(page), 'horizontal page overflow').toBe(0)
  expect(await getCutElements(page), 'elements cut by the viewport').toEqual(
    []
  )
  if (width < TOUCH_WIDTH_BELOW) {
    expect(await getSmallControls(page), 'controls under 44 px').toEqual([])
  }
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
  })
}
