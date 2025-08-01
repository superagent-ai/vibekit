import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    setupFiles: ["./test/setup.ts"],
    exclude: ["test/integration/**", "node_modules/**"],
    env: {
      // Ensure environment variables are loaded
      dotenv: '.env'
    }
  },
});