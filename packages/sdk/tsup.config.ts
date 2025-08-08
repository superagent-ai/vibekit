import { defineConfig } from "tsup";

export default defineConfig({
  // Single main entry point to avoid duplication
  entry: {
    index: "src/index.ts",
  },
  format: ["esm", "cjs"],
  dts: true,
  clean: true,
  splitting: true, // Enable code splitting for tree shaking
  sourcemap: false,
  outDir: "dist",
  treeshake: true, // Enable tree shaking
  external: [
    "@ai-sdk/anthropic",
    "@ai-sdk/openai", 
    "@ai-sdk/openai-compatible",
    "ai",
    "uuid",
    "zod"
  ], // Don't bundle dependencies
});
