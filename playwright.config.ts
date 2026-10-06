import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: 'tests',
  testMatch: '*.spec.ts',
  use: {
    baseURL: 'http://127.0.0.1:4173',
    viewport: { width: 1440, height: 900 },
  },
  webServer: {
    command: 'npm run build && npx vite preview --strictPort',
    url: 'http://127.0.0.1:4173',
    timeout: 120_000,
  },
})
