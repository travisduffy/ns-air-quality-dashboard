import { defineConfig } from '@playwright/test'

const SITE_URL = 'http://127.0.0.1:4173/ns-air-quality-dashboard/'

export default defineConfig({
  testDir: 'tests',
  testMatch: '*.spec.ts',
  timeout: 60_000,
  use: {
    baseURL: SITE_URL,
    viewport: { width: 1440, height: 900 },
  },
  webServer: {
    command: 'npm run build && npx vite preview --strictPort',
    url: SITE_URL,
    timeout: 120_000,
  },
})
