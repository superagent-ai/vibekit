import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    setupFiles: ["./test/setup-integration.ts"],
    include: ["test/integration/**/*.test.ts"],
    env: {
      // Ensure environment variables are loaded
      dotenv: '.env'
    },
    testTimeout: 30000, // Integration tests may take longer
  },
});