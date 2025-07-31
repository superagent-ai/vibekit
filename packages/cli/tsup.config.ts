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
});
