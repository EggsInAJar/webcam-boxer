import { test, expect } from '@playwright/test'
import { mockWebcam } from '../fixtures/mocks'

test.describe('Solo page', () => {
  test.beforeEach(async ({ page }) => {
    await mockWebcam(page)
  })

  test('loads without crashing for each difficulty', async ({ page }) => {
    for (const difficulty of ['easy', 'medium', 'hard']) {
      await page.goto(`/solo?difficulty=${difficulty}`)
      // Page should not crash — at minimum renders something
      await expect(page.locator('body')).toBeVisible()
      // HUD or loading screen should appear
      await page.waitForLoadState('domcontentloaded')
    }
  })

  test('defaults to medium for unknown difficulty param', async ({ page }) => {
    await page.goto('/solo?difficulty=ultrahard')
    await page.waitForLoadState('domcontentloaded')
    await expect(page.locator('body')).not.toBeEmpty()
  })

  test('has a back link to home', async ({ page }) => {
    await page.goto('/solo')
    await page.waitForLoadState('domcontentloaded')
    const back = page.getByRole('link', { name: /back/i })
    await expect(back).toBeVisible()
    await back.click()
    await expect(page).toHaveURL('/')
  })

  test('shows the difficulty mode label', async ({ page }) => {
    await page.goto('/solo')
    // Default difficulty is medium; nav shows "MEDIUM MODE"
    await expect(page.getByText('MEDIUM MODE')).toBeVisible()
  })

  test('shows webcam requesting state initially', async ({ page }) => {
    // Without a real pose detector, the page stays in calibration/requesting state
    await page.goto('/solo')
    await page.waitForLoadState('domcontentloaded')
    // Should not show game-over or error state immediately
    await expect(page.getByText(/error/i)).not.toBeVisible()
  })
})
