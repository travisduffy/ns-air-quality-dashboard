import { VERDICT_COLOR } from '../src/stations.ts'
import {
  COUNTY_PIXELS,
  getColorAt,
  getHomePoint,
  isColor,
} from './map-points.ts'
import { expect, test, type Page } from '@playwright/test'

type Overview = {
  years: number[]
  pollutants: { code: string; label: string }[]
  counties: {
    county: string
    verdicts: { year: number; pollutants: Record<string, string> }[]
  }[]
  stations: { station: string; series: { pollutant: string }[] }[]
}

const PHONE_WIDTH = 700
const ORANGE = [224, 123, 0]

const getOverview = async (page: Page) =>
  (await page.request.get('overview.json').then(r => r.json())) as Overview

const choosePollutant = async (page: Page, code: string) => {
  const width = page.viewportSize()!.width
  if (width < PHONE_WIDTH) {
    await page.getByTestId('c-pollutant-select').selectOption(code)
    return
  }
  await page.getByTestId('c-pollutant').getByText(code, { exact: true }).click()
}

const openFabric = async (page: Page, station: string, pollutant: string) => {
  await page.goto('./')
  await choosePollutant(page, pollutant)
  await page
    .locator(`[data-testid="c-tile"][data-station="${station}"] button`)
    .click()
  const fabric = page.getByTestId('fabric')
  await expect(fabric).toHaveAttribute('data-ready', 'true')
  return fabric
}

const countOrange = (page: Page) =>
  page.getByTestId('fabric-canvas').evaluate((element, orange) => {
    const canvas = element as HTMLCanvasElement
    const { data } = canvas
      .getContext('2d')!
      .getImageData(0, 0, canvas.width, canvas.height)
    let found = 0
    for (let i = 0; i < data.length; i += 4) {
      if (
        data[i] === orange[0] &&
        data[i + 1] === orange[1] &&
        data[i + 2] === orange[2]
      ) {
        found++
      }
    }
    return found
  }, ORANGE)

const getBox = async (page: Page, testId: string) =>
  (await page.getByTestId(testId).first().boundingBox())!

const clickYearRow = async (page: Page, year: number) => {
  const canvas = await getBox(page, 'fabric-canvas')
  const row = await page
    .locator(`[data-testid="fabric-year"][data-year="${year}"]`)
    .boundingBox()
  await page.mouse.click(canvas.x + canvas.width / 2, row!.y + row!.height / 2)
}

test('S1: the fabric has one row for each year and outlines the selected year', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  const fabric = await openFabric(page, 'Aylesford', 'O3')
  const overview = await getOverview(page)

  const years = await fabric
    .getByTestId('fabric-year')
    .evaluateAll(buttons => buttons.map(b => Number(b.textContent)))
  expect(years).toEqual(overview.years)
  expect(years[0]).toBe(2010)
  expect(years[years.length - 1]).toBe(2025)

  const outline = fabric.getByTestId('fabric-outline')
  await expect(outline).toHaveAttribute('data-year', '2025')
  const row = (await fabric
    .locator('[data-testid="fabric-year"][data-year="2025"]')
    .boundingBox())!
  const box = (await outline.boundingBox())!
  expect(box.y).toBeLessThanOrEqual(row.y)
  expect(box.y + box.height).toBeGreaterThanOrEqual(row.y + row.height)

  const canvas = await getBox(page, 'fabric-canvas')
  expect(canvas.height).toBeCloseTo(years.length * 22 - 4, 0)
  expect(await countOrange(page)).toBeGreaterThan(0)
})

test('S2: the detail view opens on the fabric, and a tap on a year opens its charts below', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  const fabric = await openFabric(page, 'Aylesford', 'O3')

  const fabricBox = (await fabric.boundingBox())!
  const cardBox = (await page
    .getByTestId('c-detail')
    .locator('[data-series]')
    .first()
    .boundingBox())!
  const headBox = (await page
    .getByTestId('c-detail')
    .locator('.c-detail-head')
    .boundingBox())!
  expect(fabricBox.y).toBeGreaterThan(headBox.y)
  expect(fabricBox.y + fabricBox.height).toBeLessThan(cardBox.y)
  await expect(page.locator('#readings-h')).toHaveText('Readings, 2025')

  await clickYearRow(page, 2018)
  await expect(page.locator('#readings-h')).toHaveText('Readings, 2018')
  await expect(page.getByTestId('fabric-outline')).toHaveAttribute(
    'data-year',
    '2018'
  )
  await expect(
    page.getByTestId('c-detail').locator('[data-series="O3"]')
  ).toContainText(/on 2018-/)
})

test('S4: each pollutant has a fabric, and a pollutant with no limit shows the shade and no limit mark', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('./')
  const overview = await getOverview(page)

  for (const { code } of overview.pollutants) {
    const station = overview.stations.find(s =>
      s.series.some(x => x.pollutant === code)
    )!
    await choosePollutant(page, code)
    await page
      .locator(
        `[data-testid="c-tile"][data-station="${station.station}"] button`
      )
      .click()
    const canvas = page.getByTestId('fabric-canvas')
    await expect(page.getByTestId('fabric')).toHaveAttribute(
      'data-ready',
      'true'
    )
    await expect(canvas).toHaveAttribute('data-pollutant', code)
    await page.getByRole('button', { name: '← All stations' }).click()
  }

  const none = await openFabric(page, 'Sydney', 'NO')
  await expect(none.getByTestId('fabric-legend')).toContainText(
    'No official limit'
  )
  await expect(none.locator('.legend-over')).toHaveCount(0)
  expect(await countOrange(page)).toBe(0)

  const limited = await openFabric(page, 'Aylesford', 'O3')
  await expect(limited.locator('.legend-over')).toHaveCount(1)
  await expect(limited.getByTestId('fabric-legend')).not.toContainText(
    'No official limit'
  )
})

test('S6: a tap on a year row moves the one year picker, and every view shows that year', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await openFabric(page, 'Aylesford', 'O3')
  const overview = await getOverview(page)

  await clickYearRow(page, 2019)
  await expect(page.getByTestId('c-year-select')).toHaveValue('2019')
  await expect(page.getByTestId('readings-year-picker')).toHaveValue('2019')
  await expect(page.getByTestId('fabric-outline')).toHaveAttribute(
    'data-year',
    '2019'
  )
  const canvas = (await page.locator('.map-canvas').boundingBox())!
  for (const county of overview.counties) {
    const verdict = county.verdicts.find(v => v.year === 2019)!.pollutants.O3
    const point = getHomePoint(canvas, COUNTY_PIXELS[county.county])
    await expect
      .poll(async () =>
        isColor(
          await getColorAt(page, point),
          VERDICT_COLOR[verdict as keyof typeof VERDICT_COLOR]
        )
      )
      .toBe(true)
  }

  await page.getByTestId('c-year-select').selectOption('2022')
  await expect(page.getByTestId('fabric-outline')).toHaveAttribute(
    'data-year',
    '2022'
  )
  await expect(page.getByTestId('readings-year-picker')).toHaveValue('2022')
})

test('S7: a phone keeps the desktop layout at a smaller scale', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  const fabric = await openFabric(page, 'Aylesford', 'O3')
  const desk = await getBox(page, 'fabric-canvas')
  const deskRows = await fabric.getByTestId('fabric-year').count()

  await page.setViewportSize({ width: 390, height: 844 })
  await expect(fabric).toHaveAttribute('data-ready', 'true')
  await expect
    .poll(async () => (await getBox(page, 'fabric-canvas')).width)
    .toBeLessThan(desk.width / 2)
  const phone = await getBox(page, 'fabric-canvas')
  expect(phone.height).toBeCloseTo(desk.height, 0)
  expect(await fabric.getByTestId('fabric-year').count()).toBe(deskRows)
  expect(phone.x + phone.width).toBeLessThanOrEqual(390)
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth
    )
  ).toBe(true)
  await expect(fabric.getByTestId('fabric-outline')).toBeVisible()
  expect(await countOrange(page)).toBeGreaterThan(0)
})

test('T3: the file of the picked station and pollutant is the only fabric request', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  const urls: string[] = []
  page.on('request', request => {
    if (request.url().includes('/fabric/')) {
      urls.push(new URL(request.url()).pathname)
    }
  })

  await page.goto('./')
  await page
    .locator('[data-testid="c-tile"][data-station="Aylesford"] button')
    .click()
  await expect(page.getByTestId('c-detail')).toBeVisible()
  expect(urls).toEqual([])
  await page.getByRole('button', { name: '← All stations' }).click()

  await choosePollutant(page, 'O3')
  await page
    .locator('[data-testid="c-tile"][data-station="Aylesford"] button')
    .click()
  await expect(page.getByTestId('fabric')).toHaveAttribute('data-ready', 'true')
  await clickYearRow(page, 2018)
  await expect(page.getByTestId('fabric-outline')).toHaveAttribute(
    'data-year',
    '2018'
  )
  expect(urls).toHaveLength(1)
  expect(urls[0]).toMatch(/\/fabric\/Aylesford\/O3\.json$/)
})

test('T3: the fabric shows its skeleton while the file loads', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.route('**/fabric/**', async route => {
    await new Promise(resolve => setTimeout(resolve, 1500))
    await route.continue().catch(() => undefined)
  })
  await page.goto('./')
  await choosePollutant(page, 'O3')
  await page
    .locator('[data-testid="c-tile"][data-station="Aylesford"] button')
    .click()
  const fabric = page.getByTestId('fabric')
  await expect(
    fabric.locator('[data-skeleton]:not([data-pending])')
  ).toBeVisible()
  await expect(fabric).toHaveAttribute('data-ready', 'true')
  await expect(fabric.locator('[data-skeleton]')).toHaveCount(0)
})

const waitStill = async (page: Page, testId: string) => {
  let last = -1
  await expect
    .poll(
      async () => {
        const { y } = await getBox(page, testId)
        const still = y === last
        last = y
        return still
      },
      { intervals: [300] }
    )
    .toBe(true)
}

const TAP_YEAR = 2019
const TAP_INDEX = 201

const dayIndexOf = (day: string) =>
  (Date.parse(day) - Date.UTC(TAP_YEAR, 0, 1)) / 86_400_000

for (const width of [1440, 390]) {
  test(`S8: a tap on one day marks that day on the fabric, the daily chart, and the hourly chart at ${width} px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 })
    const fabric = await openFabric(page, 'Aylesford', 'O3')
    await waitStill(page, 'fabric-canvas')
    const canvas = await getBox(page, 'fabric-canvas')
    const row = (await page
      .locator(`[data-testid="fabric-year"][data-year="${TAP_YEAR}"]`)
      .boundingBox())!
    await expect(fabric.getByTestId('fabric-marker')).toHaveCount(0)

    await page.mouse.click(
      canvas.x + ((TAP_INDEX + 0.5) / 366) * canvas.width,
      row.y + row.height / 2
    )

    await expect(page.locator('#readings-h')).toHaveText(
      `Readings, ${TAP_YEAR}`
    )
    await expect(fabric.getByTestId('fabric-outline')).toHaveAttribute(
      'data-year',
      String(TAP_YEAR)
    )
    await expect(page.getByRole('dialog')).toHaveCount(0)

    const marker = fabric.getByTestId('fabric-marker')
    await expect(marker).toHaveCount(1)
    const day = (await marker.getAttribute('data-day'))!
    expect(Math.abs(dayIndexOf(day) - TAP_INDEX)).toBeLessThanOrEqual(2)
    const canvasAfter = await getBox(page, 'fabric-canvas')
    const line = (await marker.boundingBox())!
    expect(line.width).toBeGreaterThanOrEqual(1.99)
    expect(line.y).toBeCloseTo(canvasAfter.y, 0)
    expect(line.height).toBeCloseTo(canvasAfter.height, 0)
    const dayX =
      canvasAfter.x + ((dayIndexOf(day) + 0.5) / 366) * canvasAfter.width
    expect(line.x + line.width / 2).toBeCloseTo(dayX, 0)
    const caret = (await marker.locator('span').boundingBox())!
    expect(caret.y + caret.height).toBeLessThanOrEqual(canvasAfter.y + 1)

    const charts = page
      .getByTestId('c-detail')
      .locator('[data-series="O3"] [data-chart]')
    await expect(charts).toHaveCount(2)
    for (const index of [0, 1]) {
      const mark = charts.nth(index).locator('[data-day-marker]')
      await expect(mark).toHaveCount(1)
      await expect(mark).toHaveAttribute('data-day', day)
      await expect(mark.locator('text')).toHaveText(day)
      const bar = (await mark.locator('rect').boundingBox())!
      expect(bar.width).toBeGreaterThanOrEqual(1.99)
    }

    await page.getByTestId('c-year-select').selectOption('2022')
    await expect(page.locator('#readings-h')).toHaveText('Readings, 2022')
    await expect(marker).toHaveCount(0)
    await expect(page.locator('[data-day-marker]')).toHaveCount(0)
  })
}
