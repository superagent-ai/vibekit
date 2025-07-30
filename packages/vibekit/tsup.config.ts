import { defineConfig } from "tsup";

export default defineConfig({
  // Main package and agents (with TypeScript declarations)
  entry: {
    index: "src/index.ts",
    "agents/base": "src/agents/base.ts",
    "agents/claude": "src/agents/claude.ts",
    "agents/codex": "src/agents/codex.ts",
    "agents/gemini": "src/agents/gemini.ts",
    "agents/opencode": "src/agents/opencode.ts",
    "agents/utils": "src/agents/utils.ts",
  },
  format: ["esm", "cjs"],
  dts: false, // Disable tsup's type generation - using tsc instead
  clean: true,
  splitting: false,
  sourcemap: true,
  outDir: "dist",
  external: [],
});
