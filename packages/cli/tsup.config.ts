import { defineConfig } from "tsup";

export default defineConfig({
  entry: {
    index: "src/index.ts",
  },
  format: ["esm"],
  dts: true,
  clean: true,
  splitting: false,
  sourcemap: true,
  outDir: "dist",
  banner: {
    js: "#!/usr/bin/env node",
  },
  // Externalize Node.js built-ins and large dependencies
  external: [
    "@vibe-kit/dagger",
    "@vibe-kit/telemetry",
    "@vibe-kit/db",
    "@dagger.io/dagger",
    "adm-zip",
    "fs-extra",
    "better-sqlite3",
    "drizzle-orm",
    "drizzle-orm/better-sqlite3",
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
  esbuildOptions(options) {
    // Suppress the direct-eval warning from dependencies
    options.logOverride = {
      "direct-eval": "silent",
    };
  },
});
