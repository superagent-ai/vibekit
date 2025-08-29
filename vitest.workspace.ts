import { defineWorkspace } from 'vitest/config'

export default defineWorkspace([
  // Include all package vitest configs
  'packages/*/vitest.config.{ts,js}',
  // Root tests that don't have their own config
  {
    test: {
      name: 'root',
      root: '.',
      environment: 'node',
      setupFiles: ['./test/setup.ts'],
      include: ['test/**/*.{test,spec}.{ts,js}'],
      env: {
        dotenv: '.env'
      }
    }
  }
])