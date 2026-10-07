import { defineConfig } from '@playwright/test'

// Each lane runs its own server and writes its own results, so two lanes can
// run at once. The defaults are the values from before V2.
const PORT = Number(process.env.PW_PORT) || 4173
const OUT_DIR = process.env.PW_OUT || 'test-results'
// Each port builds into its own ignored directory, so one lane never serves
// the half-built files of another. Type checks run as their own gate.
const DIST_DIR = `node_modules/.pw-dist/${PORT}`

// The site lives under the base path of its Pages deploy, and each test
// resolves its paths against it.
const SITE_URL = `http://127.0.0.1:${PORT}/ns-air-quality-dashboard/`

export default defineConfig({
  testDir: 'tests',
  testMatch: '*.spec.ts',
  outputDir: OUT_DIR,
  timeout: 60_000,
  use: {
    baseURL: SITE_URL,
    viewport: { width: 1440, height: 900 },
  },
  webServer: {
    command: `npx vite build --outDir ${DIST_DIR} --emptyOutDir && npx vite preview --outDir ${DIST_DIR} --strictPort --port ${PORT}`,
    url: SITE_URL,
    timeout: 120_000,
  },
})
