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
      "auth/index": "src/auth/index.ts",
      "auth/oauth": "src/auth/oauth.ts",
      "auth/oauth-web": "src/auth/oauth-web.ts",
      "mcp/types": "src/mcp/types.ts",
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
    // Keep all dependencies external to avoid bundling issues
    noExternal: [],
    // Externalize Node.js built-ins and large dependencies
    external: [
      "@vibe-kit/dagger",
      "@dagger.io/dagger",
      "adm-zip",
      "fs-extra",
      "child_process",
      "fs",
      "path",
      "os",
      "util",
      "crypto",
      "stream",
      "events",
      "url",
      "http",
      "https",
      "net",
      "tls",
      "querystring",
      "zlib",
      "buffer",
      "fs/promises",
      "process",
      "tty",
      "readline",
    ],
  },
]);
