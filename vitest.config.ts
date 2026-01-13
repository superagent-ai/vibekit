import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    setupFiles: ["./test/setup.ts"],
    env: {
      // Ensure environment variables are loaded
      dotenv: '.env'
    },
  },
  resolve: {
    alias: {
      "@vibe-kit/core": path.resolve(__dirname, "packages/core/dist/index.js"),
      "@vibe-kit/beam": path.resolve(__dirname, "packages/beam/dist/index.js"),
      "@vibe-kit/blaxel": path.resolve(__dirname, "packages/blaxel/dist/index.js"),
      "@vibe-kit/daytona": path.resolve(__dirname, "packages/daytona/dist/index.js"),
      "@vibe-kit/e2b": path.resolve(__dirname, "packages/e2b/dist/index.js"),
      "@vibe-kit/modal": path.resolve(__dirname, "packages/modal/dist/index.js"),
    },
  },
});
