import { defineConfig } from 'vitest/config';
import { resolve } from 'path';

export default defineConfig({
  test: {
    // Integration test configuration
    name: 'integration',
    include: ['test/integration/**/*.test.ts'],
    exclude: ['test/unit/**/*'], // Exclude unit tests
    
    // Longer timeouts for Docker operations
    testTimeout: 60000, // 60 seconds per test
    hookTimeout: 30000, // 30 seconds for setup/teardown
    
    // Run integration tests sequentially to avoid Docker conflicts
    poolOptions: {
      threads: {
        singleThread: true
      }
    },
    
    // More detailed reporting for integration tests
    reporter: ['verbose', 'json'],
    
    // Environment setup for integration tests
    globals: true,
    environment: 'node',
    
    // Coverage settings (optional for integration tests)
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json'],
      exclude: [
        'test/**/*',
        'dist/**/*',
        '**/*.config.*',
        'node_modules/**/*'
      ]
    }
  },
  
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src')
    }
  },
  
  // Define environment variables for tests
  define: {
    'process.env.NODE_ENV': '"test"',
    'process.env.VIBEKIT_TEST_MODE': '"integration"'
  }
});