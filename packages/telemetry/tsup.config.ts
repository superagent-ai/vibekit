import { defineConfig } from "tsup";

export default defineConfig({
  entry: {
    index: "src/index.ts",
    "dashboard/index": "src/dashboard/server/DashboardServer.ts",
    "cli/TelemetryCLI": "src/cli/TelemetryCLI.ts",
  },
  format: ["esm", "cjs"],
  dts: false, // Disable for now to fix build issues
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