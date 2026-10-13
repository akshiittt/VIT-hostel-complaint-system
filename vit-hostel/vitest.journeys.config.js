// Full-stack journey tests: the real <App /> in jsdom against the real backend
// (backend/app.js) on a random local port, backed by mongodb-memory-server.
// Not browser E2E: no real browser, CSS, layout or CORS enforcement.
// Needs `npm ci` in backend/ too. Run with `npm run test:journeys`.
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

// Resolved here because inside jsdom import.meta.url is an http:// URL
const backendDir = fileURLToPath(new URL('../backend/', import.meta.url))

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: './src/test/setup.js',
    globals: false,
    env: { JOURNEY_BACKEND_DIR: backendDir },
    include: ['src/journeys/**/*.journey.test.jsx'],
    // Each file starts its own MongoDB and API server; one at a time keeps
    // them from competing for CPU and makes timings predictable
    fileParallelism: false,
    testTimeout: 30000,
    hookTimeout: 120000
  }
})
