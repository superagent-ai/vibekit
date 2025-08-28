import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    setupFiles: ["./test/setup.ts"],
    // Use jsdom for React/TSX files, node for everything else
    environmentMatchGlobs: [
      ['**/*.test.tsx', 'jsdom'],
      ['**/*.test.ts', 'node'],
      ['**/*.test.js', 'node']
    ],
    env: {
      // Ensure environment variables are loaded
      dotenv: '.env'
    },
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: [
        'node_modules/**',
        'test/**',
        '**/*.test.*',
        '**/*.spec.*',
        '**/dist/**',
        '**/.next/**',
        '**/coverage/**',
        '**/*.config.*',
        '**/bin/**',
        '**/scripts/**'
      ]
    }
  },
});