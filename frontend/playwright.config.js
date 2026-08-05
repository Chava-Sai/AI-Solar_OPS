import { defineConfig, devices } from '@playwright/test'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const backendDir = path.join(__dirname, '..', 'backend')

// Isolated data files so a test run never touches real dev data — same
// pattern as backend/tests/conftest.py's tmp_path fixture.
const backendEnv = {
  USERS_DATA_PATH: '/tmp/astra_e2e_users.json',
  CONVERSATIONS_DATA_PATH: '/tmp/astra_e2e_conversations.json',
  USAGE_DATA_PATH: '/tmp/astra_e2e_usage.json',
  LOGIN_MIN_RESPONSE_SECONDS: '0',
}

export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
  webServer: [
    {
      command: 'venv/bin/python -m uvicorn main:app --port 8000',
      cwd: backendDir,
      env: backendEnv,
      port: 8000,
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
    },
    {
      command: 'npm run dev',
      cwd: __dirname,
      port: 5173,
      reuseExistingServer: !process.env.CI,
      timeout: 30_000,
    },
  ],
})
