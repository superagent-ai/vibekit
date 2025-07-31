import { defineConfig } from "tsup";

export default defineConfig({
  entry: {
    index: "src/index.ts",
    "api/TelemetryAPIServer": "src/api/TelemetryAPIServer.ts",
    "cli/TelemetryCLI": "src/cli/TelemetryCLI.ts",
  },
  format: ["esm", "cjs"],
  dts: true, // Re-enable after fixes
  clean: true,
  splitting: false,
  sourcemap: true,
  outDir: "dist",
  target: "node18",
  banner: {
    js: "#!/usr/bin/env node",
  },
  external: [
    "better-sqlite3",
    "drizzle-orm",
    "@opentelemetry/api",
    "@opentelemetry/sdk-node",
    "socket.io",
    "express",
  ],
});