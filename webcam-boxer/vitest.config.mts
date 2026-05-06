import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tsconfigPaths from 'vite-tsconfig-paths'

export default defineConfig({
  plugins: [tsconfigPaths(), react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: [],
    include: ['lib/__tests__/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: [
        'lib/env.ts',
        'lib/identity.ts',
        'lib/profanity.ts',
        'lib/gameEngine.ts',
        'lib/aiOpponent.ts',
      ],
      reporter: ['text', 'json-summary'],
    },
  },
})
