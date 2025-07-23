import { defineConfig } from "tsup";

export default defineConfig([
  // Main package and agents (with TypeScript declarations)
  {
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
    dts: true,
    clean: true,
    splitting: false,
    sourcemap: true,
    outDir: "dist",
  },
  // CLI (ESM only, no TypeScript declarations, with shebang)
  {
    entry: {
      "cli/index": "src/cli/index.ts",
      "cli/dashboard": "src/cli/index-dashboard-only.ts",
    },
    format: ["esm"],
    dts: false,
    clean: false,
    splitting: false,
    sourcemap: true,
    outDir: "dist",
    banner: {
      js: "#!/usr/bin/env node",
    },
    platform: "node",
    target: "node18",
    // Externalize all Node.js built-ins and problematic packages
    external: [
      "@vibe-kit/local",
      "@dagger.io/dagger", 
      "adm-zip",
      "fs-extra",
    ],
    noExternal: [],
    // Keep Node.js built-ins as external imports
    esbuildOptions(options) {
      options.packages = "external";
    },
  },
]);
