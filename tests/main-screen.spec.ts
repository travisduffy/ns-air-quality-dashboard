import {
  COUNTY_PIXELS,
  type Box,
  type Point,
  expectCountyAt,
  getColorAt,
  getHomePoint,
  isColor,
  openMap,
  readPixels,
  toHex,
} from './map-points.ts'
import {
  SEA_COLOR,
  VERDICT_COLOR,
  VERDICT_MARK,
  VERDICT_WORD,
} from '../src/stations.ts'
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

test('the station picker of the detail view lists each station once, with Halifax once and no Halifax Johnston', async ({
  page,
  request,
}) => {
  const overview = (await (
    await request.get('overview.json')
  ).json()) as Overview
  await page.goto('./')
  await openStation(page, 'Halifax')
  const options = await page
    .getByTestId('station-picker')
    .locator('option')
    .allTextContents()
  const expected = overview.stations.map(s => s.station).sort()
  expect(expected.length).toBeGreaterThan(1)
  expect([...options].sort()).toEqual(expected)
  expect(new Set(options).size).toBe(options.length)
  expect(options.filter(name => name === 'Halifax')).toHaveLength(1)
  expect(options.filter(name => name.includes('Johnston'))).toHaveLength(0)
})

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

test('the map has no pins and no county list, and a tap on a county with one station opens it', async ({
  page,
}) => {
  const canvas = await openMap(page)
  await expect(page.locator('.map-marker')).toHaveCount(0)
  await expect(page.locator('.county-list')).toHaveCount(0)
  await expect(page.getByTestId('map-county')).toHaveCount(0)
  await expect(page.getByRole('button', { name: /County/ })).toHaveCount(0)
  const pictou = getHomePoint(canvas, COUNTY_PIXELS['Pictou, NS'])
  await expectCountyAt(page, pictou, 'Pictou County')
  await page.mouse.click(pictou.x, pictou.y)
  await expect(page.getByTestId('c-detail')).toBeVisible()
  await expect(page.locator('#c-detail-h')).toHaveText('Pictou')
})

test('a tap on a county of two stations opens a chooser, and Escape closes it', async ({
  page,
}) => {
  const canvas = await openMap(page)
  const kings = getHomePoint(canvas, COUNTY_PIXELS['Kings, NS'])
  await page.mouse.click(kings.x, kings.y)
  const chooser = page.getByTestId('map-chooser')
  await expect(chooser.getByRole('button', { name: 'Kentville' })).toBeVisible()
  await expect(chooser.getByRole('button', { name: 'Aylesford' })).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(chooser).toHaveCount(0)
  await page.mouse.click(kings.x, kings.y)
  await chooser.getByRole('button', { name: 'Kentville' }).click()
  await expect(page.locator('#c-detail-h')).toHaveText('Kentville')
})

test('the tip of a county shows again when the pointer comes back onto it', async ({
  page,
}) => {
  const canvas = await openMap(page)
  const pictou = getHomePoint(canvas, PICTOU_PIXEL)
  await expectCountyAt(page, pictou, 'Pictou County')
  await page.mouse.move(canvas.x + canvas.width / 2, canvas.y - 20)
  await expect(page.getByTestId('map-tip')).toHaveCount(0)
  await expectCountyAt(page, pictou, 'Pictou County')
})

test('Escape on the county chooser gives the focus to the map', async ({
  page,
}) => {
  const canvas = await openMap(page)
  const kings = getHomePoint(canvas, COUNTY_PIXELS['Kings, NS'])
  await page.mouse.click(kings.x, kings.y)
  await expect(page.getByTestId('map-chooser')).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.getByTestId('map-chooser')).toHaveCount(0)
  await expect(page.locator('canvas.map-canvas')).toBeFocused()
})

test('a failed load of the map code leaves the tiles up', async ({ page }) => {
  await page.route('**/assets/map-*.js', route => route.abort())
  await page.goto('./')
  await expect(page.locator('.map-frame .error')).toContainText(
    'Could not load the map'
  )
  await expect(page.getByTestId('c-tile')).toHaveCount(7)
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
    await openStation(page, 'Sydney')
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
        .locator('[data-testid="health-row"][data-station="Pictou"] button')
        .click()
    } else {
      await page.getByTestId('station-picker').selectOption('Pictou')
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
      expect(label).toContain('at Pictou')
    }
  })
}

test('a fast second click aborts the first request, and a visited station shows with no request', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('./')
  await openStation(page, 'Halifax')
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
  await expect(page).toHaveTitle(/historical data, 2010 - 2025/)
  const header = page.locator('.c-title')
  await expect(header).toContainText(
    'Historical hourly readings 2010 - 2025, Nova Scotia Open Data.'
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

test('the year selector holds 2010 to 2025, opens on 2025, and drives the tiles', async ({
  page,
}) => {
  await page.goto('./')
  await page
    .getByTestId('c-pollutant')
    .getByText('PM2.5', { exact: true })
    .click()
  const select = page.getByTestId('c-year-select')
  await expect(select.locator('option')).toHaveText(
    Array.from({ length: 16 }, (_, i) => String(2010 + i))
  )
  await expect(select).toHaveValue('2025')
  const tile = (name: string) =>
    page.locator(`[data-testid="c-tile"][data-station="${name}"]`)
  await expect(tile('Aylesford')).toHaveAttribute('data-verdict', 'within')
  await expect(tile('Halifax')).toHaveAttribute('data-verdict', 'within')
  await select.selectOption('2016')
  await expect(page.locator('#c-grid-h')).toContainText('2016')
  await expect(tile('Aylesford')).toHaveAttribute('data-verdict', 'within')
  await expect(tile('Halifax')).toHaveAttribute('data-verdict', 'within')
  await page
    .getByTestId('c-pollutant')
    .getByText('NO2', { exact: true })
    .click()
  await expect(tile('Aylesford')).not.toHaveAttribute('data-verdict', 'nodata')
  await select.selectOption('2025')
  await expect(tile('Aylesford')).toHaveAttribute('data-verdict', 'nodata')
  await expect(tile('Aylesford')).toContainText('No readings in 2025.')
})

test('each tile has a strip of sixteen cells, and a year with no readings is missing', async ({
  page,
}) => {
  await page.goto('./')
  await page
    .getByTestId('c-pollutant')
    .getByText('NO2', { exact: true })
    .click()
  const strip = page.locator(
    '[data-testid="c-tile"][data-station="Aylesford"] .c-years li'
  )
  await expect(strip).toHaveCount(16)
  await expect(strip.nth(6)).not.toHaveAttribute('data-state', 'missing')
  await expect(strip.nth(7)).not.toHaveAttribute('data-state', 'missing')
  await expect(strip.nth(8)).toHaveAttribute('data-state', 'missing')
  await expect(strip.nth(15)).toHaveAttribute('data-state', 'missing')
  await expect(strip.nth(8).locator('.sr-only')).toHaveText('2018: no readings')
  await expect(strip.nth(6).locator('.sr-only')).toHaveText(
    /^2016: (peak \d+% of the limit|no official limit)$/
  )
  await expect(strip.nth(15)).toHaveClass(/on/)
  const labels = await strip.locator('.sr-only').allTextContents()
  expect(labels.map(l => l.slice(0, 4))).toEqual(
    Array.from({ length: 16 }, (_, i) => String(2010 + i))
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
  await page
    .getByTestId('c-pollutant')
    .getByText('NO2', { exact: true })
    .click()
  await openStation(page, 'Aylesford')
  await expect(page.getByTestId('no-readings').first()).toContainText(
    'No readings in 2025'
  )
  await expect(page.locator('svg[data-chart]')).toHaveCount(0)
})

const PICTOU_PIXEL = COUNTY_PIXELS['Pictou, NS']
const NEW_BRUNSWICK_PIXEL = [400, 500]

const FRAME_CORNER_PX = 8

const getMapShot = async (page: Page, canvas: Box) => {
  await page.mouse.move(canvas.x + 4, canvas.y + 4)
  await expect(page.getByTestId('map-tip')).toHaveCount(0)
  await page.waitForTimeout(400)
  return page.screenshot({
    clip: {
      x: canvas.x + FRAME_CORNER_PX,
      y: canvas.y + FRAME_CORNER_PX,
      width: canvas.width - 2 * FRAME_CORNER_PX,
      height: canvas.height - 2 * FRAME_CORNER_PX,
    },
  })
}

test('a wheel and a drag over the map leave the view unchanged', async ({
  page,
}) => {
  const canvas = await openMap(page)
  const start = getHomePoint(canvas, PICTOU_PIXEL)
  const before = await getMapShot(page, canvas)
  await expectCountyAt(page, start, 'Pictou County')
  await page.mouse.wheel(0, -600)
  await page.mouse.wheel(0, 900)
  await page.mouse.down()
  await page.mouse.move(start.x + 120, start.y + 60, { steps: 8 })
  await page.mouse.up()
  await page.mouse.dblclick(
    canvas.x + canvas.width / 2,
    canvas.y + canvas.height * 0.9
  )
  await page.mouse.click(start.x, start.y, { button: 'middle' })
  const after = await getMapShot(page, canvas)
  expect(after.equals(before)).toBe(true)
  await expect(page.getByTestId('map-chooser')).toHaveCount(0)
  await expect(page.getByTestId('c-detail')).toHaveCount(0)
  await expectCountyAt(page, start, 'Pictou County')
})

test('a middle-button drag and the zoom and pan keys leave the view unchanged', async ({
  page,
}) => {
  const canvas = await openMap(page)
  const start = getHomePoint(canvas, PICTOU_PIXEL)
  const before = await getMapShot(page, canvas)
  for (const key of ['ArrowLeft', 'ArrowDown', '+', '=', '-']) {
    await page.keyboard.press(key)
  }
  await page.evaluate(() => {
    const target = document.querySelector('.map-canvas')!
    const base = { pointerId: 7, bubbles: true, cancelable: true }
    target.dispatchEvent(
      new PointerEvent('pointerdown', { ...base, button: 1, buttons: 4 })
    )
    target.dispatchEvent(
      new PointerEvent('pointermove', {
        ...base,
        buttons: 4,
        clientX: 600,
        clientY: 300,
      })
    )
    target.dispatchEvent(new PointerEvent('pointerup', { ...base, button: 1 }))
  })
  expect((await getMapShot(page, canvas)).equals(before)).toBe(true)
  await expectCountyAt(page, start, 'Pictou County')
})

test('a wheel over the map scrolls the page on a phone', async ({ page }) => {
  const canvas = await openMap(page, 390, 844)
  const scroll = () =>
    page.evaluate(
      () => window.scrollY + (document.querySelector('.c-page')?.scrollTop ?? 0)
    )
  expect(await scroll()).toBe(0)
  await page.mouse.move(canvas.x + canvas.width / 2, canvas.y + 40)
  await page.mouse.wheel(0, 300)
  await expect.poll(scroll).toBeGreaterThan(0)
})

test.describe('a touch screen', () => {
  test.use({ hasTouch: true, viewport: { width: 390, height: 844 } })

  test('a tap on a county picks it, and a swipe over the map picks none', async ({
    page,
  }) => {
    const canvas = await openMap(page, 390, 844)
    const start = getHomePoint(canvas, PICTOU_PIXEL)
    const before = await getMapShot(page, canvas)
    const client = await page.context().newCDPSession(page)
    await client.send('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: [{ x: start.x, y: start.y }],
    })
    for (let step = 1; step <= 6; step++) {
      await client.send('Input.dispatchTouchEvent', {
        type: 'touchMove',
        touchPoints: [{ x: start.x + 4 * step, y: start.y + 12 * step }],
      })
    }
    await client.send('Input.dispatchTouchEvent', {
      type: 'touchEnd',
      touchPoints: [],
    })
    await page.waitForTimeout(300)
    await expect(page.getByTestId('c-detail')).toHaveCount(0)
    expect((await getMapShot(page, canvas)).equals(before)).toBe(true)
    await page.touchscreen.tap(start.x, start.y)
    await expect(page.getByTestId('c-detail')).toBeVisible()
    await expect(page.locator('#c-detail-h')).toHaveText('Pictou')
  })
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

test('land of New Brunswick on screen takes the water color', async ({
  page,
}) => {
  const canvas = await openMap(page)
  const point = getHomePoint(canvas, NEW_BRUNSWICK_PIXEL)
  expect(isColor(await getColorAt(page, point), SEA_COLOR)).toBe(true)
  await page.mouse.move(point.x, point.y)
  await expect(page.getByTestId('map-tip')).toHaveCount(0)
})

const luminance = (rgba: number[], at: number) =>
  0.299 * rgba[at] + 0.587 * rgba[at + 1] + 0.114 * rgba[at + 2]

const findDarkEdges = (rgba: number[], canvas: Box, from: Point) => {
  const found: number[] = []
  const width = Math.round(canvas.width)
  const height = Math.round(canvas.height)
  const x0 = Math.round(from.x - canvas.x)
  const y0 = Math.round(from.y - canvas.y)
  const fill = rgba.slice(4 * (y0 * width + x0), 4 * (y0 * width + x0) + 3)
  const read = (x: number, y: number) =>
    x >= 0 && y >= 0 && x < width && y < height ? 4 * (y * width + x) : null
  for (const [dx, dy] of [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ]) {
    let x = x0
    let y = y0
    while (
      read(x, y) !== null &&
      isColor(rgba.slice(read(x, y)!), toHex(fill))
    ) {
      x += dx
      y += dy
    }
    const outer = read(x + 4 * dx, y + 4 * dy)
    if (outer === null) {
      continue
    }
    const floor = Math.min(luminance(fill, 0), luminance(rgba, outer)) - 12
    for (let step = 0; step < 4; step++) {
      const edge = read(x + step * dx, y + step * dy)
      if (edge !== null && luminance(rgba, edge) < floor) {
        found.push(edge)
        break
      }
    }
  }
  return found
}

test('a thin border is drawn around every county, lit or not', async ({
  page,
}) => {
  const canvas = await openMap(page)
  const overlay = page.locator('.map-borders')
  await expect(overlay).toHaveAttribute('data-segments', /^[1-9]\d{3,}$/)
  const counties = {
    ...COUNTY_PIXELS,
    'Digby, NS': [342, 1218],
    'Annapolis, NS': [492, 1092],
    'Colchester, NS': [984, 846],
    'Antigonish, NS': [1302, 792],
    'Yarmouth, NS': [324, 1356],
  }
  expect(Object.keys(counties)).toHaveLength(10)
  await page.mouse.move(canvas.x + 4, canvas.y + 4)
  const drawn = await readPixels(page, canvas)
  await overlay.evaluate(element => (element.style.display = 'none'))
  const bare = await readPixels(page, canvas)
  await overlay.evaluate(element => (element.style.display = ''))
  for (const [county, pixel] of Object.entries(counties)) {
    const point = getHomePoint(canvas, pixel)
    const edges = findDarkEdges(drawn, canvas, point)
    expect(edges.length, `${county} edges`).toBeGreaterThan(0)
    const inked = edges.filter(
      edge => luminance(bare, edge) - luminance(drawn, edge) >= 8
    )
    expect(inked.length, `${county} inked by the border layer`).toBeGreaterThan(
      0
    )
  }
  const idle = await getColorAt(
    page,
    getHomePoint(canvas, counties['Digby, NS'])
  )
  expect(isColor(idle, VERDICT_COLOR.idle)).toBe(true)
})

test('the border layer holds one pixel of the screen per device pixel at a ratio of two', async ({
  browser,
}) => {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 2,
  })
  const page = await context.newPage()
  const canvas = await openMap(page)
  const widths = await page.locator('.map-borders').evaluate(element => {
    const overlay = element as HTMLCanvasElement
    const rect = overlay.getBoundingClientRect()
    return {
      ratio: overlay.width / rect.width,
      css: rect.width,
      pixels: overlay.width,
    }
  })
  expect(widths.ratio).toBeCloseTo(2, 1)
  expect(canvas.width).toBeCloseTo(widths.css, 0)
  await context.close()
})

const HALIFAX_PIXEL = COUNTY_PIXELS['Halifax, NS']

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
    const canvas = await openMap(page, width, height)
    const halifax = getHomePoint(canvas, HALIFAX_PIXEL)
    await page.mouse.click(halifax.x, halifax.y)
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
  for (const county of ['Halifax, NS', 'Kings, NS']) {
    test(`the chooser of ${county} sits on its anchor inside the map frame at ${width} px`, async ({
      page,
    }) => {
      const canvas = await openMap(page, width, height)
      const point = getHomePoint(canvas, COUNTY_PIXELS[county])
      await expectCountyAt(page, point, county.replace(', NS', ' County'))
      await page.mouse.click(point.x, point.y)
      await expect(page.getByTestId('map-chooser')).toBeVisible()
      const state = await getChooserState(page)
      expect(state.inside).toBe(true)
      expect(state.reachable).toBe(true)
      expect(
        Math.abs(state.anchor.x - (point.x - canvas.x))
      ).toBeLessThanOrEqual(2)
      expect(
        Math.abs(state.anchor.y - (point.y - canvas.y))
      ).toBeLessThanOrEqual(2)
    })
  }
}

test('a drag leaves the open chooser where it is', async ({ page }) => {
  const canvas = await openMap(page)
  const point = getHomePoint(canvas, HALIFAX_PIXEL)
  await page.mouse.click(point.x, point.y)
  await expect(page.getByTestId('map-chooser')).toBeVisible()
  const before = await getChooserState(page)
  const start = { x: canvas.x + 10, y: canvas.y + canvas.height - 10 }
  await page.mouse.move(start.x, start.y)
  await page.mouse.down()
  await page.mouse.move(start.x + 60, start.y - 40, { steps: 8 })
  await page.mouse.up()
  await page.waitForTimeout(300)
  await expect(page.getByTestId('map-chooser')).toBeVisible()
  expect(await getChooserState(page)).toEqual(before)
})
