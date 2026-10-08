import { VERDICT_COLOR } from '../src/stations.ts'
import {
  COUNTY_PIXELS,
  getColorAt,
  getHomePoint,
  isColor,
} from './map-points.ts'
import { expect, test, type Page } from '@playwright/test'

type Verdict = 'over' | 'within' | 'none' | 'nodata' | 'absent'

type Overview = {
  pollutants: { code: string; label: string }[]
  stations: {
    station: string
    verdicts: {
      year: number
      verdict: Verdict
      pollutants: Record<string, Verdict>
    }[]
    series: {
      pollutant: string
      label: string
      years: { year: number; reported: number }[]
    }[]
  }[]
}

const PHONE_WIDTH = 700

const getOverview = async (page: Page) =>
  (await page.request.get('overview.json').then(r => r.json())) as Overview

const RANK = ['absent', 'nodata', 'none', 'within', 'over']

const getJudged = (station: Overview['stations'][number], year: number) => {
  const summary = station.verdicts.find(v => v.year === year)!
  const judged = station.series.map(s => {
    const verdict = summary.pollutants[s.pollutant]
    const reported = s.years.find(y => y.year === year)!.reported
    return verdict === 'none' && reported === 0 ? 'nodata' : verdict
  })
  return judged.reduce(
    (worst, v) => (RANK.indexOf(v) > RANK.indexOf(worst) ? v : worst),
    'absent'
  )
}

const getStation = (overview: Overview, name: string) =>
  overview.stations.find(s => s.station === name)!

const getTile = (page: Page, name: string) =>
  page.locator(`[data-testid="c-tile"][data-station="${name}"]`)

const choosePollutant = async (page: Page, code: string) => {
  const width = page.viewportSize()!.width
  if (width < PHONE_WIDTH) {
    await page.getByTestId('c-pollutant-select').selectOption(code)
    return
  }
  await page.getByTestId('c-pollutant').getByText(code, { exact: true }).click()
}

const openStation = async (page: Page, name: string) => {
  await getTile(page, name).locator('button').click()
  await expect(page.getByTestId('c-detail')).toBeVisible()
}

const getCardCodes = (page: Page) =>
  page
    .getByTestId('c-detail')
    .locator('[data-series]')
    .evaluateAll(elements =>
      elements.map(element => element.getAttribute('data-series')!)
    )

test('A1: a picked pollutant fills the detail view with that pollutant only', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('./')
  const overview = await getOverview(page)
  const measured = getStation(overview, 'Sydney').series.map(s => s.pollutant)
  expect(measured.length).toBeGreaterThan(1)

  for (const code of ['O3', 'CO']) {
    await choosePollutant(page, code)
    await openStation(page, 'Sydney')
    await expect(
      page.getByTestId('c-detail').locator('[data-series]')
    ).toHaveCount(1)
    expect(await getCardCodes(page)).toEqual([code])
    await expect(page.getByTestId('c-detail-verdict')).toContainText(code)
    await page.getByRole('button', { name: '← All stations' }).click()
  }
})

test('A2: All mode keeps every chart in the detail view', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('./')
  const overview = await getOverview(page)
  const measured = getStation(overview, 'Sydney').series.map(s => s.pollutant)

  await openStation(page, 'Sydney')
  await expect(page.getByTestId('c-detail-verdict')).toHaveText(/^All /)
  await expect(
    page.getByTestId('c-detail').locator('[data-series]')
  ).toHaveCount(measured.length)
  expect((await getCardCodes(page)).toSorted()).toEqual(measured.toSorted())
})

test('S3: each station in All mode takes its worst verdict and shows one line', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('./')
  const overview = await getOverview(page)

  const year = 2017
  await page.getByTestId('c-year-select').selectOption(String(year))
  for (const station of overview.stations) {
    await expect(getTile(page, station.station)).toHaveAttribute(
      'data-verdict',
      getJudged(station, year)
    )
  }

  const aylesford = getStation(overview, 'Aylesford').verdicts.find(
    v => v.year === year
  )!
  const within = Object.values(aylesford.pollutants).filter(
    v => v === 'within'
  ).length
  expect(aylesford.verdict).toBe('over')
  await expect(getTile(page, 'Aylesford').getByTestId('c-all-line')).toHaveText(
    `O3 over · ${within} within`
  )

  await expect(page.locator('.map-view[data-ready="true"]')).toBeVisible()
  const canvas = (await page.locator('.map-canvas').boundingBox())!
  const kings = getHomePoint(canvas, COUNTY_PIXELS['Kings, NS'])
  await expect
    .poll(async () =>
      isColor(await getColorAt(page, kings), VERDICT_COLOR.over)
    )
    .toBe(true)
})

test('S5: a station that does not measure the pollutant opens with a note and a link to each pollutant it measures', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('./')
  const overview = await getOverview(page)
  const aylesford = getStation(overview, 'Aylesford')
  expect(aylesford.series.some(s => s.pollutant === 'SO2')).toBe(false)

  await choosePollutant(page, 'SO2')
  await openStation(page, 'Aylesford')
  const note = page.getByTestId('c-missing')
  const label = overview.pollutants.find(p => p.code === 'SO2')!.label
  await expect(note).toContainText(`Aylesford does not measure ${label}`)
  await expect(
    page.getByTestId('c-detail').locator('[data-series]')
  ).toHaveCount(0)
  const links = note.getByRole('button')
  await expect(links).toHaveCount(aylesford.series.length)

  await links.filter({ hasText: 'O3' }).click()
  await expect(page.getByTestId('c-missing')).toHaveCount(0)
  expect(await getCardCodes(page)).toEqual(['O3'])
  await expect(page.getByTestId('c-pollutant-select')).toHaveValue('O3')
})

test('S9: the All button comes first, the screen opens in All mode, and the tiles show no peak-day bar', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('./')
  const overview = await getOverview(page)
  const tiles = page.getByTestId('c-tile')
  await expect(tiles).toHaveCount(overview.stations.length)

  const buttons = page.getByTestId('c-pollutant')
  await expect(buttons).toHaveCount(overview.pollutants.length + 1)
  await expect(buttons.first()).toHaveText('All')
  await expect(buttons.first()).toHaveAttribute('aria-pressed', 'true')
  await expect(page.locator('#c-grid-h')).toContainText('All pollutants')
  await expect(page.getByTestId('c-all-line')).toHaveCount(
    overview.stations.length
  )
  await expect(page.locator('.c-tile .c-track')).toHaveCount(0)
  await expect(page.locator('.c-tile .c-years')).toHaveCount(0)

  await choosePollutant(page, 'PM2.5')
  await expect(buttons.first()).toHaveAttribute('aria-pressed', 'false')
  await expect(page.getByTestId('c-all-line')).toHaveCount(0)
  await expect(page.locator('.c-tile .c-track')).toHaveCount(
    overview.stations.length
  )

  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('./')
  const select = page.getByTestId('c-pollutant-select')
  await expect(select).toHaveValue('all')
  await expect(select.locator('option').first()).toHaveText('All')
  await expect(page.getByTestId('c-all-line')).toHaveCount(
    overview.stations.length
  )
  await expect(page.locator('.c-tile .c-track')).toHaveCount(0)
})

test('the merged Halifax has readings in every year, so no year reads No readings in All mode', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('./')
  const overview = await getOverview(page)
  const halifax = getStation(overview, 'Halifax')
  const tile = getTile(page, 'Halifax')
  for (const { year, verdict } of halifax.verdicts) {
    await page.getByTestId('c-year-select').selectOption(String(year))
    await expect(tile).toHaveAttribute('data-verdict', verdict)
    await expect(tile).not.toContainText('No readings')
  }
})
