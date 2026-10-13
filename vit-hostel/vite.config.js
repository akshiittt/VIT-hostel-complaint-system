import { defineConfig } from 'vite'
import { configDefaults } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: './src/test/setup.js',
    globals: false,
    // Full-stack journeys need the backend and MongoDB; they run separately
    // with `npm run test:journeys` (vitest.journeys.config.js)
    exclude: [...configDefaults.exclude, 'src/journeys/**'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.{js,jsx}'],
      exclude: ['src/**/*.test.{js,jsx}', 'src/test/**', 'src/journeys/**', 'src/main.jsx'],
      reporter: ['text', 'text-summary', 'html']
    }
  }
})
