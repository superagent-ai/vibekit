import { defineConfig } from 'vitest/config';
import { resolve } from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    setupFiles: ['./packages/cli/test/setup.js'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: [
        'node_modules/',
        'test/',
        'dist/',
        '**/*.test.js',
        '**/*.spec.js'
      ]
    },
    testTimeout: 10000, // 10 seconds for Docker operations
    hookTimeout: 10000
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, '../src'),
      '@test': resolve(__dirname, '../test')
    }
  }
});