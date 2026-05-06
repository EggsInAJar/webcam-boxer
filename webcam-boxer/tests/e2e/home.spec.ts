import { test, expect } from '@playwright/test'
import { mockIdentity } from '../fixtures/mocks'

test.describe('Home page', () => {
  test.beforeEach(async ({ page }) => {
    await mockIdentity(page)
    await page.goto('/')
  })

  test('shows the game title', async ({ page }) => {
    await expect(page.getByRole('heading', { name: /webcam boxer/i })).toBeVisible()
  })

  test('shows both mode cards', async ({ page }) => {
    await expect(page.getByText('SOLO VS AI')).toBeVisible()
    await expect(page.getByText('FIGHT A STRANGER')).toBeVisible()
  })

  test('difficulty buttons are all visible', async ({ page }) => {
    await expect(page.getByRole('button', { name: 'EASY' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'MEDIUM' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'HARD' })).toBeVisible()
  })

  test('MEDIUM is selected by default', async ({ page }) => {
    const mediumBtn = page.getByRole('button', { name: 'MEDIUM' })
    // The selected button has gold border color
    await expect(mediumBtn).toBeVisible()
    const borderColor = await mediumBtn.evaluate((el) => getComputedStyle(el).borderColor)
    expect(borderColor).not.toBe('rgb(51, 51, 51)') // not the unselected grey
  })

  test('clicking EASY selects it', async ({ page }) => {
    await page.getByRole('button', { name: 'EASY' }).click()
    const easyBtn = page.getByRole('button', { name: 'EASY' })
    const color = await easyBtn.evaluate((el) => (el as HTMLElement).style.color)
    expect(color).toBe('rgb(255, 215, 0)')
  })

  test('PLAY NOW navigates to solo with selected difficulty', async ({ page }) => {
    await page.getByRole('button', { name: 'HARD' }).click()
    await page.getByRole('button', { name: 'PLAY NOW' }).click()
    await expect(page).toHaveURL(/\/solo\?difficulty=hard/)
  })

  test('FIND MATCH navigates to online page', async ({ page }) => {
    await page.getByRole('button', { name: 'FIND MATCH' }).click()
    await expect(page).toHaveURL('/online')
  })

  test('leaderboard link navigates to leaderboard', async ({ page }) => {
    await page.getByRole('link', { name: /leaderboard/i }).click()
    await expect(page).toHaveURL('/leaderboard')
  })

  test('move legend shows all punch types', async ({ page }) => {
    for (const move of ['JAB', 'CROSS', 'HOOK', 'UPPERCUT', 'BLOCK']) {
      await expect(page.getByText(move)).toBeVisible()
    }
  })

  test('shows marquee header text', async ({ page }) => {
    await expect(page.getByText(/webcam boxer/i).first()).toBeVisible()
  })
})

test.describe('Home page — username prompt', () => {
  test.beforeEach(async ({ page }) => {
    await mockIdentity(page)
    await page.goto('/')
  })

  test('username prompt opens on [EDIT] click', async ({ page }) => {
    // Wait for identity to load and [EDIT] button to appear
    const editBtn = page.getByRole('button', { name: /edit username/i })
    await editBtn.waitFor({ state: 'visible', timeout: 5000 })
    await editBtn.click()
    await expect(page.getByRole('dialog', { name: /set username/i })).toBeVisible()
  })

  test('username prompt can be cancelled', async ({ page }) => {
    const editBtn = page.getByRole('button', { name: /edit username/i })
    await editBtn.waitFor({ state: 'visible', timeout: 5000 })
    await editBtn.click()

    await page.getByRole('button', { name: 'CANCEL' }).click()
    await expect(page.getByRole('dialog')).not.toBeVisible()
  })

  test('save button disabled for invalid username format', async ({ page }) => {
    const editBtn = page.getByRole('button', { name: /edit username/i })
    await editBtn.waitFor({ state: 'visible', timeout: 5000 })
    await editBtn.click()
    await page.getByRole('dialog', { name: /set username/i }).waitFor({ state: 'visible' })

    await page.getByLabel('Username', { exact: true }).fill('ab') // too short
    await expect(page.getByRole('button', { name: 'SAVE' })).toBeDisabled()
  })

  test('shows INVALID FORMAT for username with bad chars', async ({ page }) => {
    const editBtn = page.getByRole('button', { name: /edit username/i })
    await editBtn.waitFor({ state: 'visible', timeout: 5000 })
    await editBtn.click()
    await page.getByRole('dialog', { name: /set username/i }).waitFor({ state: 'visible' })

    await page.getByLabel('Username', { exact: true }).fill('hello world') // space not allowed
    await expect(page.getByText('INVALID FORMAT')).toBeVisible()
  })

  test('shows NOT ALLOWED for profane username', async ({ page }) => {
    const editBtn = page.getByRole('button', { name: /edit username/i })
    await editBtn.waitFor({ state: 'visible', timeout: 5000 })
    await editBtn.click()
    await page.getByRole('dialog', { name: /set username/i }).waitFor({ state: 'visible' })

    await page.getByLabel('Username', { exact: true }).fill('shitboxer')
    await expect(page.getByText('NOT ALLOWED')).toBeVisible()
  })
})
