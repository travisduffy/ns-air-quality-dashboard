import { expect, test, type Page } from '@playwright/test'

type Outage = { hours: number; start: string; end: string; pollutant?: string }
type Overview = {
  window: { start: string; end: string }
  stations: {
    station: string
    health: {
      expected: number
      reported: number
      reportedShare: number
      longestOutage: Outage | null
    }
  }[]
}

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
    const station = overview.stations.find(s => s.station === name)!
    const row = page.locator(
      `[data-testid="health-row"][data-station="${name}"]`
    )
    await expect(row.locator('[data-cell="share"]')).toHaveText(
      floorShare(station.health.reported, station.health.expected)
    )
    const outage = station.health.longestOutage!
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
  await expect(sydney.locator('[data-cell="share"]')).toHaveText('94.1%')
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

test('the map frames Nova Scotia and puts a pin on each station', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('./')
  await expect(page.locator('.map-view[data-ready="true"]')).toBeVisible()
  const markers = page.getByTestId('map-marker')
  await expect(markers).toHaveCount(7)
  await expect(markers.first()).toBeVisible()
  await markers.filter({ hasText: 'Pictou' }).click()
  await expect(page.getByTestId('c-detail')).toBeVisible()
  await expect(page.locator('#c-detail-h')).toHaveText('Pictou')
})

test('a failed load of the map code leaves the tiles up', async ({ page }) => {
  await page.route('**/assets/map-*.js', route => route.abort())
  await page.goto('./')
  await expect(page.locator('.map-frame .error')).toContainText(
    'Could not load the map'
  )
  await expect(page.getByTestId('c-tile')).toHaveCount(7)
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

// A station file is about 134 kB, so the page asks for one only when a station
// is picked.
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
  await expect(page.locator('.map-marker[aria-pressed="true"]')).toHaveCount(0)
  expect(asked).toHaveLength(0)

  await openStation(page, 'Pictou')
  await waitForIdle(page)
  expect(asked).toHaveLength(1)
  expect(asked[0]).toContain('readings/Pictou.json')
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
