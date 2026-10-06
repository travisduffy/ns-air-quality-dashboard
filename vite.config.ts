import { defineConfig } from 'vite'

export default defineConfig({
  base: '/ns-air-quality-dashboard/',
  server: { host: '127.0.0.1', port: 3000 },
  preview: { host: '127.0.0.1', port: 4173 },
})
