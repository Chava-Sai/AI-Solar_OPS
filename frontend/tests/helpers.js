export const SEED_ADMIN = { email: 'arunpandian@amgsol.com', password: 'Arun@123' }

export async function login(page, email, password) {
  await page.goto('/login', { waitUntil: 'networkidle' })
  await page.fill('input[type="email"]', email)
  await page.fill('input[type="password"]', password)
  await page.click('button[type="submit"]')
}

export async function loginAsAdmin(page) {
  await login(page, SEED_ADMIN.email, SEED_ADMIN.password)
  await page.waitForURL('**/', { timeout: 10_000 })
}

export async function noHorizontalOverflow(page) {
  return page.evaluate(() => {
    const docWidth = document.documentElement.clientWidth
    const scrollWidth = document.documentElement.scrollWidth
    return { ok: scrollWidth <= docWidth + 2, docWidth, scrollWidth }
  })
}

export const VIEWPORTS = {
  'mobile-se': { width: 375, height: 667 },
  'mobile-12pro': { width: 390, height: 844 },
  tablet: { width: 768, height: 1024 },
  laptop: { width: 1366, height: 768 },
  desktop: { width: 1920, height: 1080 },
}
