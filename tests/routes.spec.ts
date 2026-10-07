import { expect, test, type Page } from '@playwright/test'

const STORY_HEADING = 'Ten years of the air we breathe'

const getTitle = (page: Page, name: string) =>
  page.getByRole('heading', { level: 1, name, exact: true })

test('the root route shows the story view', async ({ page }) => {
  await page.goto('./')
  await expect(getTitle(page, STORY_HEADING)).toBeVisible()
})

test('the coverage route shows the coverage view', async ({ page }) => {
  await page.goto('./#/coverage')
  await expect(getTitle(page, 'Coverage')).toBeVisible()
})

test('the nav moves between the two views', async ({ page }) => {
  await page.goto('./#/')
  await page.getByRole('link', { name: 'Coverage' }).click()
  await expect(getTitle(page, 'Coverage')).toBeVisible()
  await page.getByRole('link', { name: 'The story' }).click()
  await expect(getTitle(page, STORY_HEADING)).toBeVisible()
})

test('an unknown route fails with a message', async ({ page }) => {
  await page.goto('./#/nowhere')
  await expect(page.getByText('There is no page at #/nowhere.')).toBeVisible()
})
