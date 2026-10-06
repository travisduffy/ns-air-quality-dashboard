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

// The page opens on the newest year.
const YEAR = 2025
const healthOf = (overview: Overview, name: string, year = YEAR) =>
  overview.stations
    .find(s => s.station === name)!
    .health.find(h => h.year === year)!

// The readings files sit under the base path of the site.
const READINGS_ROUTE = '**/readings/**'

// A second route to the rounded-down share: integer arithmetic on the counts,
// never the float share.
const floorShare = (reported: number, expected: number) =>
  `${(Math.floor((reported * 1000) / expected) / 10).toFixed(1)}%`

const getChartLabels = (page: Page) =>
  page
    .locator('svg[data-chart]')
    .evaluateAll(elements =>
      elements.map(element => element.getAttribute('aria-label') ?? '')
    )

// The data panel shows the tiles first. A pick opens the readings and the
// station health in its place.
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

  // Fixed values counted from the raw files by a second route.
  const sydney = page.locator(
    '[data-testid="health-row"][data-station="Sydney"]'
  )
  await expect(sydney.locator('[data-cell="share"]')).toHaveText('94.2%')
  await expect(sydney.locator('[data-cell="outage"]')).toContainText(
    '517 hours'
  )

  // A broken line of more than one run, the strip of missing hours, and the
  // limit line.
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

    // One layout: the data panel on the left and the map on the right half
    // of a wide screen, and the map below the panel when stacked.
    const panel = (await page.locator('.c-panel').boundingBox())!
    const map = (await page.locator('.c-map').boundingBox())!
    if (width >= 900) {
      expect(panel.x + panel.width).toBeLessThanOrEqual(map.x)
      expect(Math.abs(map.x - width / 2)).toBeLessThanOrEqual(1)
      expect(Math.abs(map.x + map.width - width)).toBeLessThanOrEqual(1)
    } else {
      expect(panel.y + panel.height).toBeLessThanOrEqual(map.y)
    }
    const overflow = await page.evaluate(
      () =>
        document.documentElement.scrollWidth -
        document.documentElement.clientWidth
    )
    expect(overflow).toBeLessThanOrEqual(0)
  })
}

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

// Sum every layout shift entry, also the ones that follow an input. That is

// stricter than the CLS metric.
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

// A readings file is about 130 to 320 kB, so the page asks for one only when a
// station is picked, and then only for the chosen year.
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

// A switch between two stations with the same pollutants: the cards keep their

// place, the charts show a skeleton, and the page does not scroll.
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
    // On a narrow screen the new station can wrap a verdict to one more line,
    // and the panel then scrolls its heading to the top.
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
    'Historical data: hourly readings 2016 - 2025, published by Nova Scotia Open Data, released one checked year at a time.'
  )
  await expect(page.locator('footer')).toContainText('This screen is not live')
  await expect(page.getByTestId('c-limits-note')).toHaveText(
    'Every year is judged against the same current limits.'
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
  expect(await select.locator('option').allTextContents()).toEqual(
    Array.from({ length: 10 }, (_, i) => String(2016 + i))
  )
  await expect(select).toHaveValue('2025')
  const tile = (name: string) =>
    page.locator(`[data-testid="c-tile"][data-station="${name}"]`)
  await expect(tile('Aylesford')).toHaveAttribute('data-verdict', 'over')
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
  // The station began in 2018, so 2016 and 2017 are missing, in text too.
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
