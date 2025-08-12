import { defineConfig } from "tsup";

export default defineConfig({
  // Single main entry point to avoid duplication
  entry: {
    index: "src/index.ts",
    services: "src/services/index.ts",
    registry: "src/registry/index.ts",
  },
  format: ["esm", "cjs"],
  dts: true,
  clean: true,
  splitting: true, // Enable code splitting for tree shaking
  sourcemap: false,
  outDir: "dist",
  treeshake: true, // Enable tree shaking
  // No external dependencies needed - everything is bundled
});
