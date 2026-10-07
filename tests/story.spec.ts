import {
  STORY_NUMBER_KEYS,
  parseManifest,
  parseStory,
} from '../shared/contract.ts'
import { expect, test, type Page } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const DATA_DIR = join(import.meta.dirname, '../public/data')
const story = parseStory(
  JSON.parse(readFileSync(join(DATA_DIR, 'story.json'), 'utf8'))
)
const manifest = parseManifest(
  JSON.parse(readFileSync(join(DATA_DIR, 'manifest.json'), 'utf8'))
)

// Two numbers of the story sheet feed no sentence: the station-days judged
// for fine particles alone, and the zero readings of Halifax Johnston, which
// the page shows as the hatched row.
const UNSHOWN_KEYS = [
  'c4_station_days_judged',
  'c2_halifax_johnston_pm25_june2023_readings',
]

const SIZES = [
  { width: 390, height: 844 },
  { width: 1440, height: 900 },
]

// The oracle of the fabric sheet for the worst day of the province, each value
// checked there by two routes. The card lists the stations from high to low.
const ORACLE_DAY = '2021-07-27'
const ORACLE_DATE = 'Tuesday 27 July 2021'
const ORACLE_ROWS = [
  ['Kentville', '30.0 ▲ over the limit'],
  ['Pictou', '23.1'],
  ['Halifax Johnston', '17.7'],
  ['Port Hawkesbury', '16.9'],
  ['Lake Major', '15.4'],
  ['Sydney', '11.6'],
  ['Aylesford', 'Not enough hours that day'],
]

// The page fails a test on any console error and on any request that leaves
// the origin of the site.
const watch = (page: Page, baseUrl: string) => {
  const siteHost = new URL(baseUrl).host
  const errors: string[] = []
  const foreign: string[] = []
  page.on('console', message => {
    if (message.type() === 'error') errors.push(message.text())
  })
  page.on('pageerror', error => errors.push(error.message))
  page.on('request', request => {
    const url = new URL(request.url())
    if (url.protocol === 'data:') {
      return
    }
    if (url.host !== siteHost) {
      foreign.push(request.url())
    }
  })
  return { errors, foreign }
}

const openStory = async (page: Page) => {
  await page.goto('./#/')
  await expect(page.locator('.fabric-canvas')).toBeVisible()
}

const showChapter = async (page: Page, chapter: number) => {
  await page
    .locator(`#chapter-${chapter}`)
    .evaluate(element => element.scrollIntoView({ block: 'start' }))
  await expect(page.locator('.fabric-canvas')).toHaveAttribute(
    'data-chapter',
    String(chapter)
  )
}

const expectOracleCard = async (page: Page) => {
  const card = page.getByRole('dialog')
  await expect(card.getByRole('heading')).toHaveText(ORACLE_DATE)
  await expect(card.locator('.day-card-line')).toHaveText(
    `The worst day of the decade for the whole province. ${story.values.c4_province_top1_stations} stations averaged ${story.values.c4_province_top1_mean.toFixed(1)}.`
  )
  const rows = card.locator('.day-card-rows li')
  await expect(rows.locator('.day-card-station')).toHaveText(
    ORACLE_ROWS.map(([station]) => station)
  )
  await expect(rows.locator('.day-card-value')).toHaveText(
    ORACLE_ROWS.map(([, value]) => value)
  )
  await expect(rows.locator('.day-card-hours').first()).toContainText(
    'hours reported'
  )
  const rowsRead = manifest.datasets.reduce((sum, set) => sum + set.rows, 0)
  await expect(card.locator('.day-card-how')).toContainText(
    `How we know: each value is the daily average`
  )
  await expect(card.locator('.day-card-how')).toContainText(
    `${rowsRead.toLocaleString('en-US')} hourly rows of ${manifest.source.name}`
  )
}

for (const size of SIZES) {
  test.describe(`at ${size.width}x${size.height}`, () => {
    test.use({ viewport: size })

    test('each chapter sets the layer and highlight of story.json', async ({
      page,
      baseURL,
    }) => {
      const seen = watch(page, baseURL!)
      await openStory(page)
      const fabric = page.locator('.fabric-canvas')

      for (const { chapter, highlight } of story.chapters) {
        await showChapter(page, chapter)
        await expect(fabric).toHaveAttribute('data-layer', highlight.layer)
        await expect(fabric).toHaveAttribute('data-from', highlight.from)
        await expect(fabric).toHaveAttribute('data-to', highlight.to)
        await expect(fabric).toHaveAttribute(
          'data-stations',
          highlight.stations.join('|')
        )
        await expect(fabric).toHaveAttribute(
          'data-months',
          highlight.months?.join('|') ?? ''
        )
        await expect(fabric).toHaveAttribute(
          'data-marks',
          (highlight.marks ?? [])
            .map(mark => `${mark.station}@${mark.day}`)
            .join('|')
        )
      }

      expect(seen.errors).toEqual([])
      expect(seen.foreign).toEqual([])
    })

    test('each chapter number equals its key in story.json', async ({
      page,
      baseURL,
    }) => {
      const seen = watch(page, baseURL!)
      await openStory(page)
      const numbers = page.locator('.chapters data[data-key]')
      const found = await numbers.evaluateAll(elements =>
        elements.map(element => ({
          key: element.getAttribute('data-key')!,
          value: Number(element.getAttribute('value')),
          text: element.textContent!,
        }))
      )
      const values: Record<string, number | string> = story.values

      expect([...new Set(found.map(item => item.key))].sort()).toEqual(
        STORY_NUMBER_KEYS.filter(key => !UNSHOWN_KEYS.includes(key)).sort()
      )
      for (const { key, value, text } of found) {
        expect(value, key).toBe(values[key])
        const shown = Number(text.replaceAll(',', ''))
        expect([value, Math.round(value)], key).toContain(shown)
      }
      await expect(
        page.locator(`data[value="${story.values.c4_province_top1_day}"]`)
      ).toHaveText('27 July 2021')
      await expect(page.locator('.chapter-big').first()).toHaveText(
        `${story.values.c14_o3_pm25_station_days_over} of ${story.values.c14_o3_pm25_station_days_judged.toLocaleString('en-US')}`
      )
      await expect(page.locator('.limit-bars .bar-label')).toHaveText([
        'Aylesford, 24 Aug 2025',
        'Sydney, 1 Jun 2023',
        'Kentville, 27 Jul 2021',
        'Port Hawkesbury, 16 Jul 2025',
      ])

      expect(seen.errors).toEqual([])
      expect(seen.foreign).toEqual([])
    })

    test('a click on the fabric opens the day card of 27 July 2021', async ({
      page,
      baseURL,
    }) => {
      const seen = watch(page, baseURL!)
      await openStory(page)
      await showChapter(page, 2)
      const fabric = page.locator('.fabric-canvas')
      const box = (await fabric.boundingBox())!
      const dayCount = Number(await fabric.getAttribute('aria-valuemax')) + 1
      const day =
        (Date.parse(ORACLE_DAY) - Date.parse('2016-01-01')) / 86_400_000
      await fabric.click({
        position: { x: ((day + 0.5) / dayCount) * box.width, y: 4 },
      })
      await expectOracleCard(page)

      await page.getByRole('button', { name: 'Close' }).click()
      await expect(page.getByRole('dialog')).toHaveCount(0)

      expect(seen.errors).toEqual([])
      expect(seen.foreign).toEqual([])
    })

    test('the keyboard opens the day card of 27 July 2021', async ({
      page,
      baseURL,
    }) => {
      const seen = watch(page, baseURL!)
      await openStory(page)
      const fabric = page.locator('.fabric-canvas')
      for (let tab = 0; tab < 6; tab++) {
        if (
          await fabric.evaluate(element => element === document.activeElement)
        )
          break
        await page.keyboard.press('Tab')
      }
      await expect(fabric).toBeFocused()
      await page.keyboard.press('PageDown')
      await expect(fabric).not.toHaveAttribute('aria-valuetext', '27 July 2021')
      await page.keyboard.press('PageUp')
      await page.keyboard.press('ArrowRight')
      await page.keyboard.press('ArrowLeft')
      await expect(fabric).toHaveAttribute('aria-valuetext', '27 July 2021')
      await page.keyboard.press('Enter')
      await expectOracleCard(page)

      await page.keyboard.press('Escape')
      await expect(page.getByRole('dialog')).toHaveCount(0)

      expect(seen.errors).toEqual([])
      expect(seen.foreign).toEqual([])
    })

    test('the data block shows how the data got in, and the checksums on one click', async ({
      page,
      baseURL,
    }) => {
      const seen = watch(page, baseURL!)
      await openStory(page)
      const block = page.getByRole('region', { name: 'How the data got in' })
      await block.scrollIntoViewIfNeeded()
      await expect(block).toBeVisible()
      await expect(block).toContainText(
        `${manifest.datasets.length} datasets of ${manifest.source.name}`
      )
      const rows = manifest.datasets.reduce((sum, set) => sum + set.rows, 0)
      await expect(block).toContainText(
        `${rows.toLocaleString('en-US')} hourly rows`
      )
      await expect(block).toContainText('6 October 2026')
      for (const set of manifest.datasets) {
        const row = block
          .locator('table')
          .first()
          .locator('tr', { hasText: set.id })
        if (set.rows === 0) {
          await expect(row).toContainText('no rows')
          await expect(row.locator('code')).toHaveCount(0)
          continue
        }
        await expect(row.locator('code')).toHaveText(set.sha256)
      }
      const file = block.locator('code', { hasText: manifest.files[0].sha256 })
      await expect(file).toBeHidden()
      await block.getByText('Show the checksums').click()
      for (const item of manifest.files) {
        await expect(
          block.locator('code', { hasText: item.sha256 }).first()
        ).toBeVisible()
      }

      expect(seen.errors).toEqual([])
      expect(seen.foreign).toEqual([])
    })

    test('a chapter change fades the fabric in', async ({ page }) => {
      await openStory(page)
      await showChapter(page, 3)
      expect(
        await page.evaluate(() => document.getAnimations().length)
      ).toBeGreaterThan(0)
    })

    test.describe('with reduced motion', () => {
      test.use({ reducedMotion: 'reduce' })

      test('nothing animates', async ({ page }) => {
        await openStory(page)
        for (const { chapter } of story.chapters) {
          await showChapter(page, chapter)
          expect(
            await page.evaluate(() =>
              document
                .getAnimations()
                .map(animation => (animation.effect as KeyframeEffect).target)
                .map(target => target?.className)
            ),
            `chapter ${chapter}`
          ).toEqual([])
        }
      })
    })
  })
}
