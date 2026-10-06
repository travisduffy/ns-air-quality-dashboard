import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  base: '/ns-air-quality-dashboard/',
  plugins: [react()],
  server: { host: '127.0.0.1', port: 3000 },
  preview: { host: '127.0.0.1', port: 4173 },
  build: {
    rolldownOptions: {
      output: {
        // three.js is most of the map chunk. A chunk of its own stays under
        // the size limit of the build, and it loads in parallel with the map.
        codeSplitting: {
          groups: [{ name: 'three', test: /node_modules[\\/]three[\\/]/ }],
        },
      },
    },
  },
})
