import { test, expect } from '@playwright/test'
import { loginAsAdmin } from './helpers.js'

test.describe('admin console', () => {
  test('back-to-chat link and rail user actions are visible on desktop', async ({ page }) => {
    await loginAsAdmin(page)
    await page.goto('/admin', { waitUntil: 'networkidle' })

    await expect(page.locator('.suite-back-link')).toBeVisible()
    await expect(page.locator('.rail-user-actions')).toBeVisible()
    await expect(page.locator('.rail-user-actions button[title="Logout"]')).toBeVisible()
  })

  test('logout from the admin rail works', async ({ page }) => {
    await loginAsAdmin(page)
    await page.goto('/admin', { waitUntil: 'networkidle' })
    await page.locator('.rail-user-actions button[title="Logout"]').click()
    await expect(page).toHaveURL(/\/login/)
  })

  test.describe('mobile', () => {
    test.use({ viewport: { width: 390, height: 844 } })

    test('rail user footer (with logout) is reachable through the mobile drawer', async ({ page }) => {
      await loginAsAdmin(page)
      await page.goto('/admin', { waitUntil: 'networkidle' })

      const menuButton = page.locator('.admin-menu-button')
      await expect(menuButton).toBeVisible()
      await menuButton.click()

      await expect(page.locator('.admin-rail')).toBeVisible()
      await expect(page.locator('.rail-user-actions button[title="Logout"]')).toBeVisible()
    })
  })

  test('non-admin cannot reach /admin', async ({ page }) => {
    await loginAsAdmin(page)

    const email = `e2e-nonadmin-${Date.now()}@amgsol.com`
    await page.evaluate(async (email) => {
      await fetch('/api/admin/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ email, name: 'E2E Non-Admin', password: 'TempPass1234', role: 'user' }),
      })
    }, email)

    await page.evaluate(() => fetch('/api/auth/logout', { method: 'POST', credentials: 'include' }))
    await page.goto('/login', { waitUntil: 'networkidle' })
    await page.fill('input[type="email"]', email)
    await page.fill('input[type="password"]', 'TempPass1234')
    await page.click('button[type="submit"]')
    await expect(page).toHaveURL(/\/settings/) // forced password change first

    // unlock, then confirm /admin still redirects away (role check)
    await page.fill('input[autocomplete="current-password"]', 'TempPass1234')
    const newPwFields = page.locator('input[autocomplete="new-password"]')
    await newPwFields.nth(0).fill('BrandNewPass123')
    await newPwFields.nth(1).fill('BrandNewPass123')
    await page.locator('button[type="submit"]').click()
    await expect(page).toHaveURL('http://localhost:5173/', { timeout: 5000 })

    await page.goto('/admin')
    await expect(page).toHaveURL('http://localhost:5173/')

    // cleanup
    await page.evaluate(() => fetch('/api/auth/logout', { method: 'POST', credentials: 'include' }))
    await loginAsAdmin(page)
    await page.evaluate(async (email) => {
      await fetch(`/api/admin/users/${encodeURIComponent(email)}`, { method: 'DELETE', credentials: 'include' })
    }, email)
  })
})
