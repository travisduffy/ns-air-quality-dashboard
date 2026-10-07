import { expect, test, type Page } from '@playwright/test'

type Station = { name: string; firstReport: string; lastReport: string }

const SIDEBAR = '.coverage-sidebar'

const HOUR_MS = 3_600_000

// An hour of the data ends at its stamp, so the view shows the day and the
// clock at which the hour began.
const getHourStart = (hour: string) =>
  new Date(Date.parse(`${hour.slice(0, 13)}:00:00Z`) - HOUR_MS)

// A second route to the text of a day: the Intl formatter in UTC, never the
// formatter of the view.
const dayOf = (hour: string) => {
  const parts = new Intl.DateTimeFormat('en-US', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  }).formatToParts(getHourStart(hour))
  const get = (type: string) => parts.find(p => p.type === type)!.value
  return `${get('day')} ${get('month')} ${get('year')}`
}

const clockOf = (hour: string) => {
  const clock = getHourStart(hour).getUTCHours()
  const pad = (value: number) => `${String(value).padStart(2, '0')}:00`
  return `${pad(clock)} to ${pad(clock + 1)}`
}

const openCoverage = async (page: Page) => {
  await page.goto('./#/coverage')
  await expect(page.locator('.coverage-map[data-ready="true"]')).toBeVisible()
}

const getJson = async <T>(page: Page, name: string) => {
  const response = await page.request.get(`./data/${name}.json`)
  expect(response.ok()).toBe(true)
  return (await response.json()) as T
}

const getStations = (page: Page) => getJson<Station[]>(page, 'stations')

// The canvas has no DOM inside, so the test finds a point of a county by
// hover: it reads the tip at each point that has the color of the status of
// the county, and clicks the first point where the tip names the county.
const REPORTING_RGB = [108, 103, 94]
const NO_STATION_RGB = [250, 248, 243]

const clickCountyOnMap = async (page: Page, label: string, rgb: number[]) => {
  const canvas = page.locator('.coverage-canvas')
  const box = (await canvas.boundingBox())!
  const shot = (await canvas.screenshot()).toString('base64')
  const points = await page.evaluate(
    async ({ shot, rgb, width, height }) => {
      const blob = await (await fetch(`data:image/png;base64,${shot}`)).blob()
      const bitmap = await createImageBitmap(blob)
      const context = new OffscreenCanvas(width, height).getContext('2d')!
      context.drawImage(bitmap, 0, 0, width, height)
      const found: [number, number][] = []
      const STEP_PX = 14
      for (let y = 0; y < height; y += STEP_PX) {
        for (let x = 0; x < width; x += STEP_PX) {
          const pixel = context.getImageData(x, y, 1, 1).data
          const match = rgb.every((value, i) => pixel[i] === value)
          if (match) {
            found.push([x, y])
          }
        }
      }
      return found
    },
    { shot, rgb, width: Math.round(box.width), height: Math.round(box.height) }
  )
  expect(points.length).toBeGreaterThan(0)
  for (const [x, y] of points) {
    await page.mouse.move(box.x + x, box.y + y)
    const tip = page.getByTestId('map-tip')
    await page.waitForTimeout(40)
    if ((await tip.count()) > 0 && (await tip.innerText()).includes(label)) {
      await page.mouse.click(box.x + x, box.y + y)
      return
    }
  }
  throw new Error(`no point of the map reads ${label}`)
}

test('a click on Halifax County lists Halifax as stopped and Halifax Johnston with its last report', async ({
  page,
}) => {
  await openCoverage(page)
  const stations = await getStations(page)
  const halifax = stations.find(s => s.name === 'Halifax')!
  const johnston = stations.find(s => s.name === 'Halifax Johnston')!

  await clickCountyOnMap(page, 'Halifax County', REPORTING_RGB)
  const sidebar = page.locator(SIDEBAR)
  await expect(
    sidebar.getByRole('heading', { name: 'Halifax County' })
  ).toBeVisible()

  const stopped = sidebar.locator('.station', {
    has: page.getByRole('heading', { name: 'Halifax', exact: true }),
  })
  await expect(stopped).toContainText(
    `Stopped reporting on ${dayOf(halifax.lastReport)}`
  )
  await expect(stopped).toContainText('Stopped reporting on 31 Dec 2017')
  await expect(stopped).toContainText('2 years')
  await expect(stopped).toContainText(`from ${dayOf(halifax.firstReport)}`)

  const active = sidebar.locator('.station', {
    has: page.getByRole('heading', { name: 'Halifax Johnston' }),
  })
  await expect(active).not.toContainText('Stopped reporting')
  // Every county with a stopped station has one that still reports, so the
  // map shows no stopped county and its legend has no key for one.
  await expect(page.locator('.coverage-legend')).not.toContainText(
    'Stopped reporting'
  )
  await expect(active).toContainText(
    `${dayOf(johnston.lastReport)}, ${clockOf(johnston.lastReport)}`
  )
  await expect(active).toContainText('8 years')
  await expect(active).toContainText('from 1 Jan 2018')
})

test('a click on a county with no station says so', async ({ page }) => {
  await openCoverage(page)
  await clickCountyOnMap(page, 'Lunenburg County', NO_STATION_RGB)
  const sidebar = page.locator(SIDEBAR)
  await expect(
    sidebar.getByRole('heading', { name: 'Lunenburg County' })
  ).toBeVisible()
  await expect(page.getByTestId('no-station')).toHaveText(
    'This county has no air quality station in the data.'
  )
  await expect(sidebar.locator('.station')).toHaveCount(0)
})

test('each of the 18 counties of Nova Scotia opens its sidebar', async ({
  page,
}) => {
  await openCoverage(page)
  const buttons = page.getByTestId('county-button')
  // Nova Scotia has 18 counties, and the map holds every one of them.
  await expect(buttons).toHaveCount(18)
  for (const county of await buttons.all()) {
    await county.click()
    const name = (await county.innerText()).trim()
    await expect(
      page.locator(SIDEBAR).getByRole('heading', { name, level: 2 })
    ).toBeVisible()
  }
})

test('the sidebar states the date range and the fetch date from the data', async ({
  page,
}) => {
  await openCoverage(page)
  const stations = await getStations(page)
  const manifest = await getJson<{ fetchedAt: string }>(page, 'manifest')
  const first = stations.map(s => s.firstReport).sort()[0]
  const last = stations
    .map(s => s.lastReport)
    .sort()
    .at(-1)!
  const source = page.getByTestId('source')
  await expect(source).toContainText(
    `The data runs from ${dayOf(first)} to ${dayOf(last)}.`
  )
  await expect(source).toContainText(`fetched ${dayOf(manifest.fetchedAt)}`)
  await expect(source).not.toContainText('we ')
})

test('the county buttons work with the keyboard', async ({ page }) => {
  await openCoverage(page)
  const button = page.locator('[data-county="Halifax, NS"]')
  await button.focus()
  await page.keyboard.press('Enter')
  await expect(button).toHaveAttribute('aria-pressed', 'true')
  await expect(
    page.locator(SIDEBAR).getByRole('heading', { name: 'Halifax County' })
  ).toBeVisible()
})

test('the stations file fails with a message', async ({ page }) => {
  await page.route('**/data/stations.json', route =>
    route.fulfill({ status: 404, body: 'not found' })
  )
  await page.goto('./#/coverage')
  await expect(page.getByRole('alert')).toContainText(
    'data/stations.json answered 404'
  )
})

test('the view makes no request to another origin and logs no error', async ({
  page,
}) => {
  const errors: string[] = []
  const foreign: string[] = []
  page.on('console', message => {
    if (message.type() === 'error') {
      errors.push(message.text())
    }
  })
  page.on('pageerror', error => errors.push(error.message))
  page.on('request', request => {
    if (!request.url().startsWith('http://127.0.0.1')) {
      foreign.push(request.url())
    }
  })
  await openCoverage(page)
  await clickCountyOnMap(page, 'Halifax County', REPORTING_RGB)
  expect(errors).toEqual([])
  expect(foreign).toEqual([])
})

for (const [width, height] of [
  [1440, 900],
  [390, 844],
]) {
  test(`the layout holds at ${width}x${height}`, async ({ page }) => {
    await page.setViewportSize({ width, height })
    await openCoverage(page)
    await page.locator('[data-county="Halifax, NS"]').click()
    const map = (await page.locator('.coverage-frame').boundingBox())!
    const sidebar = (await page.locator(SIDEBAR).boundingBox())!
    if (width >= 900) {
      // A wide screen puts the sidebar to the right of the map.
      expect(sidebar.x).toBeGreaterThanOrEqual(map.x + map.width)
    } else {
      // A narrow screen puts the sidebar below the map.
      expect(sidebar.y).toBeGreaterThanOrEqual(map.y + map.height)
    }
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth
    )
    expect(overflow).toBeLessThanOrEqual(0)
  })
}
