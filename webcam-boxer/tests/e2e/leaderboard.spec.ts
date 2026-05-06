import { test, expect } from '@playwright/test'

test.describe('Leaderboard page', () => {
  test('shows the LEADERBOARD heading', async ({ page }) => {
    await page.goto('/leaderboard')
    await expect(page.getByRole('heading', { name: /leaderboard/i })).toBeVisible()
  })

  test('has a back link to home', async ({ page }) => {
    await page.goto('/leaderboard')
    const backLink = page.getByRole('link', { name: /back/i })
    await expect(backLink).toBeVisible()
    await backLink.click()
    await expect(page).toHaveURL('/')
  })

  test('renders without crashing even when DB is unavailable', async ({ page }) => {
    // Intercept Supabase calls to simulate DB failure
    await page.route('**/rest/v1/**', (route) =>
      route.fulfill({ status: 500, body: 'Internal Server Error' })
    )
    await page.goto('/leaderboard')

    // Should show either the empty state, error message, or the table headers — not a crash
    const body = page.locator('main')
    await expect(body).toBeVisible()
    // Page title still rendered
    await expect(page.getByText(/leaderboard/i).first()).toBeVisible()
  })

  test('column headers are rendered when DB is available, or error state otherwise', async ({ page }) => {
    await page.goto('/leaderboard')
    const hasError = await page.getByText('FAILED TO LOAD LEADERBOARD').isVisible()
    if (hasError) {
      // DB unavailable — error state is acceptable; headers won't render
      await expect(page.getByText('FAILED TO LOAD LEADERBOARD')).toBeVisible()
    } else {
      await expect(page.getByText('PLAYER')).toBeVisible()
      await expect(page.getByText('RATING')).toBeVisible()
      const headers = page.locator('span', { hasText: /^W$/ })
      await expect(headers.first()).toBeVisible()
    }
  })
})
