import { test, expect } from '@playwright/test'
import { SEED_ADMIN, login, loginAsAdmin } from './helpers.js'

test.describe('authentication', () => {
  test('logs in and lands on chat', async ({ page }) => {
    await loginAsAdmin(page)
    await expect(page).toHaveURL('http://localhost:5173/')
    await expect(page.getByText(/Good (morning|afternoon|evening)/)).toBeVisible()
  })

  test('wrong password shows an error and stays on login (no reload flash)', async ({ page }) => {
    await login(page, SEED_ADMIN.email, 'not-the-real-password')
    await expect(page.locator('.error-banner')).toBeVisible()
    await expect(page).toHaveURL(/\/login/)
  })

  test('session is an httpOnly cookie, never localStorage', async ({ page, context }) => {
    await loginAsAdmin(page)

    const cookies = await context.cookies()
    const session = cookies.find((c) => c.name === 'astra_session')
    expect(session).toBeTruthy()
    expect(session.httpOnly).toBe(true)
    expect(session.sameSite).toBe('Lax')

    const localStorageDump = await page.evaluate(() => ({ ...localStorage }))
    expect(Object.keys(localStorageDump)).not.toContain('astra_token')
    expect(Object.keys(localStorageDump)).not.toContain('astra_user')
  })

  test('session persists across a full page reload', async ({ page }) => {
    await loginAsAdmin(page)
    await page.reload({ waitUntil: 'networkidle' })
    await expect(page).not.toHaveURL(/\/login/)
    await expect(page.getByText(/Good (morning|afternoon|evening)/)).toBeVisible()
  })

  test('logout clears the cookie and blocks protected routes', async ({ page, context }) => {
    await loginAsAdmin(page)
    await page.locator('button[title="Sign out"], button[aria-label="Sign out"]').first().click()
    await expect(page).toHaveURL(/\/login/)

    const cookies = await context.cookies()
    expect(cookies.find((c) => c.name === 'astra_session')).toBeUndefined()

    await page.goto('/')
    await expect(page).toHaveURL(/\/login/)
  })

  test('unauthenticated visit to a protected route redirects to login', async ({ page }) => {
    await page.goto('/admin')
    await expect(page).toHaveURL(/\/login/)
  })
})

test.describe('forced password change', () => {
  test('a fresh account is redirected to /settings and stays locked until the password changes', async ({ page }) => {
    await loginAsAdmin(page)

    const email = `e2e-forced-${Date.now()}@amgsol.com`
    const created = await page.evaluate(async (email) => {
      const res = await fetch('/api/admin/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ email, name: 'E2E Forced', password: 'TempPass1234', role: 'user' }),
      })
      return res.ok
    }, email)
    expect(created).toBe(true)

    await page.locator('button[title="Sign out"], button[aria-label="Sign out"]').first().click()
    await login(page, email, 'TempPass1234')
    await expect(page).toHaveURL(/\/settings/)

    // direct nav to chat root should still bounce back while locked
    await page.goto('/')
    await expect(page).toHaveURL(/\/settings/)

    // actually change the password
    await page.fill('input[autocomplete="current-password"]', 'TempPass1234')
    const newPwFields = page.locator('input[autocomplete="new-password"]')
    await newPwFields.nth(0).fill('BrandNewPass123')
    await newPwFields.nth(1).fill('BrandNewPass123')
    await page.locator('button[type="submit"]').click()
    await expect(page).toHaveURL('http://localhost:5173/', { timeout: 5000 })

    // cleanup
    await page.evaluate(async () => {
      await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' })
    })
    await loginAsAdmin(page)
    await page.evaluate(async (email) => {
      await fetch(`/api/admin/users/${encodeURIComponent(email)}`, { method: 'DELETE', credentials: 'include' })
    }, email)
  })
})
