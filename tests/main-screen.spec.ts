import { getHomeScale } from '../src/camera.ts'
import { VERDICT_MARK, VERDICT_WORD } from '../src/stations.ts'
import { expect, test, type Page } from '@playwright/test'

type Outage = { hours: number; start: string; end: string; pollutant?: string }
type YearHealth = {
  year: number
  expected: number
  reported: number
  longestOutage: Outage | null
}

type Overview = {
  window: { start: string; end: string }
  years: number[]
  stations: { station: string; health: YearHealth[] }[]
}

const YEAR = 2025
const healthOf = (overview: Overview, name: string, year = YEAR) =>
  overview.stations
    .find(s => s.station === name)!
    .health.find(h => h.year === year)!

const READINGS_ROUTE = '**/readings/**'

const floorShare = (reported: number, expected: number) =>
  `${(Math.floor((reported * 1000) / expected) / 10).toFixed(1)}%`

const getChartLabels = (page: Page) =>
  page
    .locator('svg[data-chart]')
    .evaluateAll(elements =>
      elements.map(element => element.getAttribute('aria-label') ?? '')
    )

const openStation = async (page: Page, name: string) => {
  await page
    .locator(`[data-testid="c-tile"][data-station="${name}"] button`)
    .click()
  await expect(page.getByTestId('c-detail')).toBeVisible()
}

const checkScreen = async (page: Page, overview: Overview) => {
  await page.goto('./')
  await expect(
    page.getByRole('heading', { level: 1, name: 'NS Air Quality Dashboard' })
  ).toBeVisible()
  await expect(page.getByTestId('data-end')).toHaveText(overview.window.end)
  await expect(page.getByTestId('window-start')).toHaveText(
    overview.window.start
  )

  await expect(page.getByTestId('c-tile')).toHaveCount(overview.stations.length)
  await openStation(page, 'Sydney')
  const rows = page.getByTestId('health-row')
  await expect(rows).toHaveCount(overview.stations.length)

  for (const name of ['Aylesford', 'Sydney']) {
    const health = healthOf(overview, name)
    const row = page.locator(
      `[data-testid="health-row"][data-station="${name}"]`
    )
    await expect(row.locator('[data-cell="share"]')).toHaveText(
      floorShare(health.reported, health.expected)
    )
    const outage = health.longestOutage!
    const text = (
      await row.locator('[data-cell="outage"]').innerText()
    ).replace(/\s+/g, ' ')
    expect(text).toContain(
      `${outage.hours.toLocaleString('en-CA')} hours, ${outage.pollutant}`
    )
    expect(text).toContain(`${outage.start} to ${outage.end}`)
  }

  const sydney = page.locator(
    '[data-testid="health-row"][data-station="Sydney"]'
  )
  await expect(sydney.locator('[data-cell="share"]')).toHaveText('94.2%')
  await expect(sydney.locator('[data-cell="outage"]')).toContainText(
    '517 hours'
  )

  const card = page.locator('[data-series="NO2"]')
  await expect(card.locator('svg[data-chart]')).toBeVisible()
  expect(await card.locator('[data-run]').count()).toBeGreaterThan(1)
  expect(await card.locator('[data-missing]').count()).toBeGreaterThan(1)
  await expect(card.locator('[data-limit]')).toHaveCount(1)
  const missingWidths = await card
    .locator('[data-missing]')
    .evaluateAll(elements =>
      elements.map(element => Number(element.getAttribute('width')))
    )
  for (const width of missingWidths) {
    expect(width).toBeGreaterThanOrEqual(1)
  }
  await expect(
    page.locator('[data-series="O3"] [data-insufficient-day]').first()
  ).toBeAttached()
  await expect(
    page.locator('[data-series="NO"] [data-verdict="none"]')
  ).toContainText('No official limit')
  await expect(page.locator('[data-series="NO"] [data-limit]')).toHaveCount(0)
  for (const label of await getChartLabels(page)) {
    expect(label.length).toBeGreaterThan(20)
  }
}

for (const width of [1440, 390]) {
  test(`main screen at ${width} px`, async ({ page, request }) => {
    await page.setViewportSize({ width, height: 900 })
    const response = await request.get('overview.json')
    const overview = (await response.json()) as Overview
    await checkScreen(page, overview)

    const [panel, map] = await page.evaluate(() =>
      ['.c-panel', '.c-map'].map(selector => {
        const box = document.querySelector(selector)!.getBoundingClientRect()
        return { x: box.x, y: box.y, width: box.width, height: box.height }
      })
    )
    if (width >= 900) {
      expect(panel.x + panel.width).toBeLessThanOrEqual(map.x)
      expect(Math.abs(map.x - width / 2)).toBeLessThanOrEqual(1)
      expect(Math.abs(map.x + map.width - width)).toBeLessThanOrEqual(1)
    } else {
      expect(map.y + map.height).toBeLessThanOrEqual(panel.y)
    }
    const overflow = await page.evaluate(
      () =>
        document.documentElement.scrollWidth -
        document.documentElement.clientWidth
    )
    expect(overflow).toBeLessThanOrEqual(0)
  })
}

test('the detail view opens on the picked pollutant', async ({ page }) => {
  await page.goto('./')
  await openStation(page, 'Aylesford')
  const cards = page.getByTestId('c-detail').locator('[data-series]')
  const codes = await cards.evaluateAll(elements =>
    elements.map(element => element.getAttribute('data-series')!)
  )
  expect(codes.length).toBeGreaterThan(1)
  await page.getByRole('button', { name: '← All stations' }).click()

  for (const code of codes) {
    await page
      .getByTestId('c-pollutant')
      .getByText(code, { exact: true })
      .click()
    await openStation(page, 'Aylesford')
    await expect(cards.first()).toHaveAttribute('data-series', code)
    await page.getByRole('button', { name: '← All stations' }).click()
  }
})

test('the detail header judges the picked pollutant only', async ({ page }) => {
  await page.goto('./')
  const tile = page.locator('[data-testid="c-tile"][data-station="Aylesford"]')
  const verdicts = new Set<string>()
  await expect(tile).toBeVisible()
  for (const button of await page.getByTestId('c-pollutant').all()) {
    const code = await button.innerText()
    await button.click()
    const verdict = (await tile.getAttribute(
      'data-verdict'
    )) as keyof typeof VERDICT_WORD
    verdicts.add(verdict)
    await openStation(page, 'Aylesford')
    await expect(page.getByTestId('c-detail-verdict')).toHaveText(
      `${code} ${VERDICT_MARK[verdict]} ${VERDICT_WORD[verdict]}`
    )
    await page.getByRole('button', { name: '← All stations' }).click()
  }
  expect(verdicts.size).toBeGreaterThan(1)
})

test('the map comes before the tiles on a phone', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('./')
  await expect(page.getByTestId('c-tile').first()).toBeVisible()
  const map = (await page.locator('.c-map').boundingBox())!
  const tiles = (await page.locator('.c-tiles').boundingBox())!
  expect(map.y + map.height).toBeLessThanOrEqual(tiles.y)
  expect(map.y).toBeLessThan(844)
})

test('the map has no pins, and a county with one station opens it', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('./')
  await expect(page.locator('.map-view[data-ready="true"]')).toBeVisible()
  await expect(page.locator('.map-marker')).toHaveCount(0)
  const counties = page.getByTestId('map-county')
  await expect(counties).toHaveCount(5)
  await counties.filter({ hasText: 'Pictou' }).click()
  await expect(page.getByTestId('c-detail')).toBeVisible()
  await expect(page.locator('#c-detail-h')).toHaveText('Pictou')
})

test('a county of two stations opens a chooser by keyboard', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('./')
  await expect(page.locator('.map-view[data-ready="true"]')).toBeVisible()
  const kings = page.locator(
    '[data-testid="map-county"][data-county="Kings, NS"]'
  )
  await kings.focus()
  await page.keyboard.press('Enter')
  const chooser = page.getByTestId('map-chooser')
  await expect(chooser.getByRole('button', { name: 'Kentville' })).toBeVisible()
  await expect(chooser.getByRole('button', { name: 'Aylesford' })).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(chooser).toHaveCount(0)
  await expect(kings).toBeFocused()
  await page.keyboard.press('Enter')
  await chooser.getByRole('button', { name: 'Kentville' }).click()
  await expect(page.locator('#c-detail-h')).toHaveText('Kentville')
})

test('a failed load of the map code leaves the tiles up', async ({ page }) => {
  await page.route('**/assets/map-*.js', route => route.abort())
  await page.goto('./')
  await expect(page.locator('.map-frame .error')).toContainText(
    'Could not load the map'
  )
  await expect(page.getByTestId('c-tile')).toHaveCount(8)
})

const watchShifts = (page: Page) =>
  page.evaluate(() => {
    const target = window as unknown as { shift: number }
    target.shift = 0
    new PerformanceObserver(list => {
      for (const entry of list.getEntries()) {
        target.shift += (entry as unknown as { value: number }).value
      }
    }).observe({ type: 'layout-shift' })
  })

const waitForSettled = async (page: Page) => {
  await expect(page.locator('[data-skeleton]')).toHaveCount(0)
  await expect(
    page.locator('[data-series="SO2"] svg[data-chart]')
  ).toBeVisible()
}

const waitForIdle = async (page: Page) => {
  await expect(page.locator('svg[data-chart]').first()).toBeVisible()
  await expect(page.locator('[data-skeleton]')).toHaveCount(0)
}

test('no readings load before a station is picked', async ({ page }) => {
  const asked: string[] = []
  page.on('request', request => {
    if (request.url().includes('/readings/')) {
      asked.push(decodeURIComponent(request.url()))
    }
  })
  await page.goto('./')
  await expect(page.locator('.map-view[data-ready="true"]')).toBeVisible()
  await expect(page.locator('.c-tile-pick[aria-pressed="true"]')).toHaveCount(0)
  await expect(page.locator('.county[aria-pressed="true"]')).toHaveCount(0)
  expect(asked).toHaveLength(0)

  await openStation(page, 'Pictou')
  await waitForIdle(page)
  expect(asked).toHaveLength(1)
  expect(asked[0]).toContain('readings/Pictou/2025.json')
})

test('Escape and the back button give the focus back to the tile', async ({
  page,
}) => {
  await page.goto('./')
  const tile = page.locator(
    '[data-testid="c-tile"][data-station="Kentville"] button'
  )
  for (const closeKey of ['Escape', 'Enter']) {
    await tile.focus()
    await page.keyboard.press('Enter')
    await expect(page.locator('#c-detail-h')).toBeFocused()
    if (closeKey === 'Enter') {
      await page.locator('.c-close').focus()
    }
    await page.keyboard.press(closeKey)
    await expect(page.getByTestId('c-detail')).toHaveCount(0)
    await expect(tile).toBeFocused()
  }
})

test('the arrow keys step through the station select', async ({ page }) => {
  await page.goto('./')
  await openStation(page, 'Kentville')
  const picker = page.getByTestId('station-picker')
  await picker.focus()
  await page.keyboard.press('ArrowDown')
  await expect(page.locator('#c-detail-h')).toHaveText('Lake Major')
  await expect(picker).toBeFocused()
})

for (const width of [1440, 390]) {
  test(`station switch at ${width} px keeps the screen still`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 })
    await page.goto('./')
    await openStation(page, 'Halifax Johnston')
    await waitForSettled(page)
    await page.route(READINGS_ROUTE, async route => {
      await new Promise(resolve => setTimeout(resolve, 400))
      await route.continue()
    })
    await page.getByTestId('station-picker').scrollIntoViewIfNeeded()
    await page.waitForTimeout(300)
    await watchShifts(page)
    const scrollY = await page.evaluate(() => window.scrollY)
    if (width >= 900) {
      await page
        .locator('[data-testid="health-row"][data-station="Sydney"] button')
        .click()
    } else {
      await page.getByTestId('station-picker').selectOption('Sydney')
    }
    await expect(page.locator('[data-skeleton]').first()).toBeAttached()
    await expect(page.locator('[data-series]')).toHaveCount(7)
    await waitForSettled(page)
    await page.waitForTimeout(500)
    const shift = await page.evaluate(
      () => (window as unknown as { shift: number }).shift
    )
    expect(shift).toBeLessThan(width >= 900 ? 0.01 : 0.1)
    if (width >= 900) {
      const scrolledPx = await page.evaluate(() => window.scrollY)
      expect(Math.abs(scrolledPx - scrollY)).toBeLessThanOrEqual(1)
    } else {
      await expect(page.getByTestId('c-detail')).toBeInViewport()
    }
    for (const label of await getChartLabels(page)) {
      expect(label).toContain('at Sydney')
    }
  })
}

test('a fast second click aborts the first request, and a visited station shows with no request', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('./')
  await openStation(page, 'Halifax Johnston')
  await waitForIdle(page)
  const failed: string[] = []
  const asked: string[] = []
  page.on('requestfailed', request =>
    failed.push(decodeURIComponent(request.url()))
  )
  page.on('request', request => {
    if (request.url().includes('/readings/')) {
      asked.push(decodeURIComponent(request.url()))
    }
  })
  await page.route(READINGS_ROUTE, async route => {
    const delayMs = route.request().url().includes('Kentville') ? 1500 : 100
    await new Promise(resolve => setTimeout(resolve, delayMs))
    await route.continue().catch(() => undefined)
  })
  await page
    .locator('[data-testid="health-row"][data-station="Kentville"] button')
    .click()
  await page
    .locator('[data-testid="health-row"][data-station="Sydney"] button')
    .click()
  await waitForSettled(page)
  await page.waitForTimeout(1800)
  expect(failed.some(url => url.includes('Kentville'))).toBe(true)
  for (const label of await getChartLabels(page)) {
    expect(label).toContain('at Sydney')
  }
  const askedBefore = asked.length
  await page.getByTestId('station-picker').selectOption('Kentville')
  await waitForIdle(page)
  await page.getByTestId('station-picker').selectOption('Sydney')
  await expect(page.locator('[data-skeleton]')).toHaveCount(0)
  await expect(page.locator('[data-series="CO"] svg[data-chart]')).toBeVisible()
  const askedAgain = asked
    .slice(askedBefore)
    .filter(url => url.includes('Sydney'))
  expect(askedAgain).toHaveLength(0)
})

test('the skeleton does not move when the user asks for reduced motion', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.route(READINGS_ROUTE, async route => {
    await new Promise(resolve => setTimeout(resolve, 5000))
    await route.continue().catch(() => undefined)
  })
  await page.goto('./')
  await openStation(page, 'Sydney')
  const skeleton = page.locator('[data-skeleton]').first()
  await expect(skeleton).toBeAttached()
  const getAnimationName = () =>
    skeleton.evaluate(element => getComputedStyle(element).animationName)
  expect(await getAnimationName()).toBe('none')
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  expect(await getAnimationName()).toBe('shimmer')
})

test('the header says that the data is historical, and nothing says live', async ({
  page,
}) => {
  await page.goto('./')
  await expect(page).toHaveTitle(/historical data, 2016 - 2025/)
  const header = page.locator('.c-title')
  await expect(header).toContainText(
    'Historical hourly readings 2016 - 2025, Nova Scotia Open Data.'
  )
  await expect(page.locator('footer')).toContainText('This screen is not live')
  await expect(page.getByTestId('c-limits-note')).toHaveText(
    'Every year is judged by the official 3-year statistic of the current limits.'
  )
  const text = (await page.locator('body').innerText()).toLowerCase()
  for (const word of ['real-time', 'realtime', 'up to date', 'latest']) {
    expect(text).not.toContain(word)
  }
})

test('the year selector holds 2016 to 2025, opens on 2025, and drives the tiles', async ({
  page,
}) => {
  await page.goto('./')
  const select = page.getByTestId('c-year-select')
  await expect(select.locator('option')).toHaveText(
    Array.from({ length: 10 }, (_, i) => String(2016 + i))
  )
  await expect(select).toHaveValue('2025')
  const tile = (name: string) =>
    page.locator(`[data-testid="c-tile"][data-station="${name}"]`)
  await expect(tile('Aylesford')).toHaveAttribute('data-verdict', 'within')
  await expect(tile('Halifax')).toHaveAttribute('data-verdict', 'nodata')
  await select.selectOption('2016')
  await expect(page.locator('#c-grid-h')).toContainText('2016')
  await expect(tile('Aylesford')).toHaveAttribute('data-verdict', 'within')
  await expect(tile('Halifax')).toHaveAttribute('data-verdict', 'within')
  await expect(tile('Halifax Johnston')).toHaveAttribute(
    'data-verdict',
    'nodata'
  )
  await expect(tile('Halifax Johnston')).toContainText('No readings in 2016.')
})

test('each tile has a strip of ten cells, and a year with no readings is missing', async ({
  page,
}) => {
  await page.goto('./')
  const strip = page.locator(
    '[data-testid="c-tile"][data-station="Halifax Johnston"] .c-years li'
  )
  await expect(strip).toHaveCount(10)
  await expect(strip.nth(0)).toHaveAttribute('data-state', 'missing')
  await expect(strip.nth(1)).toHaveAttribute('data-state', 'missing')
  await expect(strip.nth(2)).not.toHaveAttribute('data-state', 'missing')
  await expect(strip.nth(0).locator('.sr-only')).toHaveText('2016: no readings')
  await expect(strip.nth(9).locator('.sr-only')).toHaveText(
    /^2025: peak \d+% of the limit$/
  )
  await expect(strip.nth(9)).toHaveClass(/on/)
  const labels = await strip.locator('.sr-only').allTextContents()
  expect(labels.map(l => l.slice(0, 4))).toEqual(
    Array.from({ length: 10 }, (_, i) => String(2016 + i))
  )
})

test('a readings file loads for the picked station and year only', async ({
  page,
}) => {
  const asked: string[] = []
  page.on('request', request => {
    if (request.url().includes('/readings/')) {
      asked.push(decodeURIComponent(request.url()))
    }
  })
  await page.goto('./')
  await page.getByTestId('c-year-select').selectOption('2019')
  await expect(page.locator('.map-view[data-ready="true"]')).toBeVisible()
  expect(asked).toHaveLength(0)
  await openStation(page, 'Sydney')
  await waitForIdle(page)
  expect(asked).toHaveLength(1)
  expect(asked[0]).toContain('readings/Sydney/2019.json')
  await expect(page.locator('#readings-h')).toHaveText('Readings, 2019')
  await expect(page.getByTestId('month-picker').locator('option')).toHaveCount(
    13
  )
  await page.getByTestId('readings-year-picker').selectOption('2016')
  await expect(page.locator('#readings-h')).toHaveText('Readings, 2016')
  await expect(page.locator('[data-series="CO"] svg[data-chart]')).toBeVisible()
  expect(asked).toHaveLength(2)
  expect(asked[1]).toContain('readings/Sydney/2016.json')
  for (const label of await getChartLabels(page)) {
    expect(label).toContain('2016')
  }
})

test('a series with no reading in the year shows as missing in the readings', async ({
  page,
}) => {
  await page.goto('./')
  await page.getByTestId('c-year-select').selectOption('2016')
  await openStation(page, 'Halifax Johnston')
  await expect(page.getByTestId('no-readings').first()).toContainText(
    'No readings in 2016'
  )
  await expect(page.locator('svg[data-chart]')).toHaveCount(0)
})

const NS_BOX = [179, 192, 1867, 1551] as const
const PICTOU_PIXEL = [1142, 797]
const NEW_BRUNSWICK_PIXEL = [400, 500]
const WATER_RGB = [0xae, 0xbf, 0xca]

const openMap = async (page: Page) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('./')
  await expect(page.locator('.map-view[data-ready="true"]')).toBeVisible()
  return (await page.locator('.map-canvas').boundingBox())!
}

const getHomePoint = (
  canvas: { x: number; y: number; width: number; height: number },
  [x, y]: number[]
) => {
  const [minX, minY, maxX, maxY] = NS_BOX
  const scale = getHomeScale(NS_BOX, canvas.width, canvas.height)
  return {
    x: canvas.x + canvas.width / 2 + (x + 0.5 - (minX + maxX + 1) / 2) * scale,
    y: canvas.y + canvas.height / 2 + (y + 0.5 - (minY + maxY + 1) / 2) * scale,
  }
}

const readPixels = async (
  page: Page,
  clip: { x: number; y: number; width: number; height: number }
) => {
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

const isWater = (rgba: number[], at: number) =>
  WATER_RGB.every((value, i) => Math.abs(rgba[at + i] - value) <= 3)

const getWaterShare = async (
  page: Page,
  canvas: { x: number; y: number; width: number; height: number }
) => {
  const rgba = await readPixels(page, canvas)
  let water = 0
  for (let at = 0; at < rgba.length; at += 4) {
    if (isWater(rgba, at)) {
      water++
    }
  }
  return water / (rgba.length / 4)
}

const expectCountyAt = async (
  page: Page,
  point: { x: number; y: number },
  county: string
) => {
  await page.mouse.move(point.x, point.y)
  await expect(page.getByTestId('map-tip')).toContainText(county)
}

test('a left drag pans the map and opens no county', async ({ page }) => {
  const canvas = await openMap(page)
  const start = getHomePoint(canvas, PICTOU_PIXEL)
  const end = { x: start.x + 120, y: start.y + 60 }
  await expectCountyAt(page, start, 'Pictou County')
  await page.mouse.down()
  await page.mouse.move(end.x, end.y, { steps: 8 })
  await page.mouse.up()
  await expect(page.getByTestId('map-chooser')).toHaveCount(0)
  await expect(page.getByTestId('c-detail')).toHaveCount(0)
  await page.mouse.move(canvas.x + 4, canvas.y + 4)
  await expect(page.getByTestId('map-tip')).toHaveCount(0)
  await expectCountyAt(page, end, 'Pictou County')
})

test('a right-click on the map has its default prevented', async ({ page }) => {
  const canvas = await openMap(page)
  await page.evaluate(() => {
    const target = window as unknown as { prevented: boolean | null }
    target.prevented = null
    window.addEventListener('contextmenu', event => {
      target.prevented = event.defaultPrevented
    })
  })
  const point = getHomePoint(canvas, PICTOU_PIXEL)
  await page.mouse.click(point.x, point.y, { button: 'right' })
  expect(
    await page.evaluate(
      () => (window as unknown as { prevented: boolean | null }).prevented
    )
  ).toBe(true)
})

test('a double-click zooms in about the cursor', async ({ page }) => {
  const canvas = await openMap(page)
  const point = getHomePoint(canvas, PICTOU_PIXEL)
  const before = await getWaterShare(page, canvas)
  await page.mouse.dblclick(point.x, point.y)
  await expect
    .poll(() => getWaterShare(page, canvas))
    .toBeLessThan(before * 0.8)
  await page.mouse.move(canvas.x + 4, canvas.y + 4)
  await expectCountyAt(page, point, 'Pictou County')
})

test('land of New Brunswick on screen takes the water color', async ({
  page,
}) => {
  const canvas = await openMap(page)
  const point = getHomePoint(canvas, NEW_BRUNSWICK_PIXEL)
  const rgba = await readPixels(page, {
    x: Math.round(point.x),
    y: Math.round(point.y),
    width: 1,
    height: 1,
  })
  expect(isWater(rgba, 0)).toBe(true)
  await page.mouse.move(point.x, point.y)
  await expect(page.getByTestId('map-tip')).toHaveCount(0)
})

const HALIFAX_PIXEL = [1004, 1036]

const getChooserState = (page: Page) =>
  page.evaluate(() => {
    const frame = document.querySelector('.map-frame')!.getBoundingClientRect()
    const chooser = document.querySelector<HTMLElement>(
      '[data-testid="map-chooser"]'
    )!
    const box = chooser.getBoundingClientRect()
    const [x, y] = (chooser.dataset.anchor ?? '').split(',').map(Number)
    return {
      inside:
        box.left >= frame.left &&
        box.top >= frame.top &&
        box.right <= frame.right &&
        box.bottom <= frame.bottom,
      reachable:
        chooser.scrollHeight <= chooser.clientHeight ||
        getComputedStyle(chooser).overflowY === 'auto',
      left: box.left,
      anchor: { x, y },
    }
  })

for (const [width, height] of [
  [1440, 900],
  [1440, 760],
  [1280, 720],
]) {
  test(`a station pick at ${width} x ${height} keeps the top banner in view`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height })
    await page.goto('./')
    await expect(page.locator('.map-view[data-ready="true"]')).toBeVisible()
    await page
      .locator('[data-testid="map-county"][data-county="Halifax, NS"]')
      .click()
    await page
      .getByTestId('map-chooser')
      .getByRole('button', { name: 'Lake Major' })
      .click()
    await expect(page.locator('#c-detail-h')).toBeFocused()
    await page.waitForTimeout(800)
    const state = await page.evaluate(() => ({
      pageTop: document.querySelector('.c-page')!.scrollTop,
      windowTop: window.scrollY,
      bannerTop: document.querySelector('.c-top')!.getBoundingClientRect().top,
    }))
    expect(state).toEqual({ pageTop: 0, windowTop: 0, bannerTop: 0 })
  })
}

for (const [width, height] of [
  [1440, 900],
  [390, 844],
]) {
  test(`the chooser stays inside the map frame at each edge at ${width} px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height })
    await page.goto('./')
    await expect(page.locator('.map-view[data-ready="true"]')).toBeVisible()
    const canvas = (await page.locator('.map-canvas').boundingBox())!
    const home = getHomePoint(canvas, HALIFAX_PIXEL)
    for (const edge of [
      { x: canvas.x + canvas.width - 14, y: home.y },
      { x: home.x, y: canvas.y + canvas.height - 14 },
    ]) {
      await page.reload()
      await expect(page.locator('.map-view[data-ready="true"]')).toBeVisible()
      await page.mouse.move(home.x, home.y)
      await page.mouse.down()
      await page.mouse.move(edge.x, edge.y, { steps: 8 })
      await page.mouse.up()
      await expectCountyAt(page, edge, 'Halifax County')
      await page.mouse.click(edge.x, edge.y)
      const chooser = page.getByTestId('map-chooser')
      await expect(chooser.getByRole('button')).toHaveCount(4)
      const state = await getChooserState(page)
      expect(state.inside).toBe(true)
      expect(state.reachable).toBe(true)
    }
  })
}

test('the chooser follows its anchor while the map pans', async ({ page }) => {
  const canvas = await openMap(page)
  const point = getHomePoint(canvas, HALIFAX_PIXEL)
  await expectCountyAt(page, point, 'Halifax County')
  await page.mouse.click(point.x, point.y)
  await expect(page.getByTestId('map-chooser')).toBeVisible()
  const before = await getChooserState(page)
  expect(Math.abs(before.anchor.x - (point.x - canvas.x))).toBeLessThanOrEqual(
    2
  )
  expect(Math.abs(before.anchor.y - (point.y - canvas.y))).toBeLessThanOrEqual(
    2
  )
  const start = { x: canvas.x + 10, y: canvas.y + canvas.height - 10 }
  await page.mouse.move(start.x, start.y)
  await page.mouse.down()
  await page.mouse.move(start.x + 60, start.y - 40, { steps: 8 })
  await page.mouse.up()
  await expect(page.getByTestId('map-chooser')).toBeVisible()
  await expect
    .poll(async () =>
      Math.abs((await getChooserState(page)).left - before.left - 60)
    )
    .toBeLessThanOrEqual(1)
  const after = await getChooserState(page)
  expect(Math.abs(after.anchor.x - before.anchor.x - 60)).toBeLessThanOrEqual(1)
  expect(Math.abs(after.anchor.y - before.anchor.y + 40)).toBeLessThanOrEqual(1)
  expect(after.inside).toBe(true)
})
