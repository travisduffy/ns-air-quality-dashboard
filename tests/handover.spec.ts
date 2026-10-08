import { expect, test, type Page } from '@playwright/test'

const PHONE_WIDTH = 700
const SINCE = 'Johnston site since 2018'
const BOXES = [
  { width: 1440, height: 900 },
  { width: 390, height: 844 },
]

const choosePollutant = async (page: Page, code: string) => {
  if (page.viewportSize()!.width < PHONE_WIDTH) {
    await page.getByTestId('c-pollutant-select').selectOption(code)
    return
  }
  await page.getByTestId('c-pollutant').getByText(code, { exact: true }).click()
}

const tileOf = (page: Page, name: string) =>
  page.locator(`[data-testid="c-tile"][data-station="${name}"]`)

const openHalifax = async (page: Page, pollutant: string) => {
  await page.goto('./')
  await choosePollutant(page, pollutant)
  await tileOf(page, 'Halifax').locator('button').click()
  await expect(page.getByTestId('c-detail')).toBeVisible()
}

test('D5: the detail view of Halifax names the site of each year and the source', async ({
  page,
}) => {
  await openHalifax(page, 'O3')
  const note = page.getByTestId('c-handover-note')
  await expect(note).toHaveCount(1)
  await expect(note).toContainText('Two sites report as Halifax.')
  await expect(note).toContainText('2010–2017 come from the earlier site')
  await expect(note).toContainText('2018–2025 from the Johnston site')
  await expect(note).toContainText(
    'Each year shows the figures of the site that measured it.'
  )
  await expect(note).toContainText('Halifax Vogue site')
  await expect(note).toContainText('less than one block away')
  await expect(note).toContainText(
    'Source: the description of the dataset "Halifax Johnston", Nova Scotia Open Data.'
  )
})

test('D5: a station with no handover has no note and no site line', async ({
  page,
}) => {
  await page.goto('./')
  await tileOf(page, 'Sydney').locator('button').click()
  await expect(page.getByTestId('c-detail')).toBeVisible()
  await expect(page.getByTestId('c-handover-note')).toHaveCount(0)
  await expect(page.getByTestId('c-site')).toHaveCount(0)
})

test('D6: the charts of a year name the site of that year', async ({
  page,
}) => {
  await openHalifax(page, 'O3')
  const readings = page.getByTestId('readings-year-picker')
  await expect(page.getByTestId('c-site')).toHaveText(
    'Measured at the Johnston site.'
  )
  await expect(page.locator('svg[data-chart]').first()).toHaveAttribute(
    'aria-label',
    /at Halifax, Johnston site/
  )
  await readings.selectOption('2017')
  await expect(page.getByTestId('c-site')).toHaveText(
    'Measured at the earlier site.'
  )
  await expect(page.locator('svg[data-chart]').first()).toHaveAttribute(
    'aria-label',
    /at Halifax, earlier site/
  )
  await readings.selectOption('2018')
  await expect(page.getByTestId('c-site')).toHaveText(
    'Measured at the Johnston site.'
  )
})

for (const { width, height } of BOXES) {
  test(`D6: the fabric draws a labelled divider between the 2017 and 2018 rows at ${width} px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height })
    await openHalifax(page, 'PM2.5')
    await expect(page.getByTestId('fabric')).toHaveAttribute(
      'data-ready',
      'true'
    )
    const divider = page.getByTestId('fabric-divider')
    await expect(divider).toHaveCount(1)
    await expect(divider).toHaveText(SINCE)
    await expect(divider).toHaveAttribute('data-year', '2018')
    const [before, after, gap] = await page.evaluate(() => {
      const rect = (selector: string) => {
        const { top, bottom } = document
          .querySelector(selector)!
          .getBoundingClientRect()
        return { top, bottom }
      }
      return [
        rect('[data-testid="fabric-year"][data-year="2017"]'),
        rect('[data-testid="fabric-year"][data-year="2018"]'),
        rect('[data-testid="fabric-divider"]'),
      ]
    })
    expect(gap.top).toBeGreaterThanOrEqual(before.bottom - 0.5)
    expect(gap.bottom).toBeLessThanOrEqual(after.top + 0.5)
    const rowsPx = await page
      .getByTestId('fabric-canvas')
      .evaluate(canvas => canvas.getBoundingClientRect().height)
    expect(rowsPx).toBeCloseTo(366, 0)
  })
}

test('D6: a tap on a row picks its year on both sides of the divider, and a station with no handover has no divider', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await openHalifax(page, 'PM2.5')
  const canvas = page.getByTestId('fabric-canvas')
  const box = (await canvas.boundingBox())!
  const tapRow = async (year: number) => {
    const row = (await page
      .locator(`[data-testid="fabric-year"][data-year="${year}"]`)
      .boundingBox())!
    await page.mouse.click(box.x + box.width / 2, row.y + row.height / 2)
  }
  await tapRow(2017)
  await expect(page.getByTestId('fabric-outline')).toHaveAttribute(
    'data-year',
    '2017'
  )
  await tapRow(2018)
  await expect(page.getByTestId('fabric-outline')).toHaveAttribute(
    'data-year',
    '2018'
  )
  await expect(page.getByTestId('readings-year-picker')).toHaveValue('2018')
  await page.getByRole('button', { name: /All stations/ }).click()
  await tileOf(page, 'Sydney').locator('button').click()
  await expect(page.getByTestId('fabric')).toHaveAttribute('data-ready', 'true')
  await expect(page.getByTestId('fabric-divider')).toHaveCount(0)
  await expect(page.getByTestId('fabric-canvas')).toHaveJSProperty(
    'clientHeight',
    348
  )
})

test('D6: the strip of sixteen year cells on the tile marks the same boundary', async ({
  page,
}) => {
  await page.goto('./')
  await choosePollutant(page, 'PM2.5')
  const cells = tileOf(page, 'Halifax').locator('.c-years li')
  await expect(cells).toHaveCount(16)
  await expect(cells.locator(':scope[data-since]')).toHaveCount(1)
  await expect(cells.nth(8)).toHaveAttribute('data-year', '2018')
  await expect(cells.nth(8)).toHaveAttribute('data-since', '')
  await expect(cells.nth(8)).toHaveAttribute(
    'title',
    /Johnston site since 2018/
  )
  const rule = await cells
    .nth(8)
    .evaluate(element => getComputedStyle(element, '::before').width)
  expect(rule).toBe('2px')
  await expect(
    tileOf(page, 'Sydney').locator('.c-years li[data-since]')
  ).toHaveCount(0)
})
