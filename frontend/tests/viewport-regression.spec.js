import { test, expect } from '@playwright/test'
import { loginAsAdmin, noHorizontalOverflow, VIEWPORTS } from './helpers.js'

for (const [name, size] of Object.entries(VIEWPORTS)) {
  test.describe(`viewport: ${name} (${size.width}x${size.height})`, () => {
    test.use({ viewport: size })

    test('login, chat, admin, and settings all render without horizontal overflow', async ({ page }) => {
      await page.goto('/login', { waitUntil: 'networkidle' })
      expect((await noHorizontalOverflow(page)).ok).toBe(true)
      await expect(page.locator('input[type="email"]')).toBeVisible()

      await loginAsAdmin(page)
      expect((await noHorizontalOverflow(page)).ok).toBe(true)
      await expect(page.locator('textarea')).toBeVisible()

      await page.goto('/admin', { waitUntil: 'networkidle' })
      expect((await noHorizontalOverflow(page)).ok).toBe(true)
      await expect(page.locator('.admin-layout')).toBeVisible()

      await page.goto('/settings', { waitUntil: 'networkidle' })
      expect((await noHorizontalOverflow(page)).ok).toBe(true)
    })

    if (size.width <= 980) {
      test('mobile nav drawer opens and closes', async ({ page }) => {
        await loginAsAdmin(page)
        const shell = page.locator('.sales-hub-shell')
        const hamburger = page.locator('.suite-topbar button').first()

        await expect(hamburger).toBeVisible()
        await expect(shell).toHaveClass(/sidebar-collapsed/)

        await hamburger.click()
        await expect(shell).not.toHaveClass(/sidebar-collapsed/)

        // the X button, not the backdrop — on narrow phones the sidebar itself
        // covers most of the screen, so a center-click on "the backdrop" can
        // land on sidebar content underneath rather than the exposed strip
        await page.locator('.sidebar-close').click()
        await expect(shell).toHaveClass(/sidebar-collapsed/)
      })
    }
  })
}
