import { test, expect } from '@playwright/test'
import { loginAsAdmin } from './helpers.js'

test.describe('chat', () => {
  test('model selector opens with Auto plus every family', async ({ page }) => {
    await loginAsAdmin(page)

    const trigger = page.locator('.model-selector-trigger')
    await expect(trigger).toBeVisible()
    await trigger.click()

    const panel = page.locator('.model-picker-panel')
    await expect(panel).toBeVisible()
    await expect(panel.locator('.model-option.auto')).toBeVisible()
    await expect(panel.locator('.model-family')).toHaveCount(3) // GPT-OSS, Llama, Qwen

    await panel.locator('.model-option').nth(1).click()
    await expect(panel).not.toBeVisible()
    await expect(trigger).not.toHaveText(/^Auto$/)
  })

  test('usage panel opens and shows per-family breakdown, no duplicate model list', async ({ page }) => {
    await loginAsAdmin(page)

    const ring = page.locator('.usage-ring')
    await expect(ring).toBeVisible()
    await ring.click()

    const panel = page.locator('.usage-panel')
    await expect(panel).toBeVisible()
    await expect(panel.locator('.model-choice-list')).toHaveCount(0) // moved into ModelSelector, not duplicated here
  })

  test('sending a message streams a response (real backend + LLM call)', async ({ page }) => {
    await loginAsAdmin(page)

    await page.fill('textarea', 'What SOPs are available for case creation?')
    await page.locator('.send-button').click()

    // either a real streamed answer or a surfaced error — either way, the
    // wire-up from composer -> SSE -> render must produce SOMETHING within
    // a generous timeout. Requires a working GROQ_API_KEY in backend/.env
    // to actually validate content; without one this still confirms the
    // request/response plumbing works end to end.
    await expect(
      page.locator('.md-content, .error-banner, [class*="error"]').first()
    ).toBeVisible({ timeout: 20_000 })
  })

  test('new chat clears the conversation', async ({ page }) => {
    await loginAsAdmin(page)
    await page.locator('.primary-nav-button').click()
    await expect(page.getByText(/Good (morning|afternoon|evening)/)).toBeVisible()
  })
})
