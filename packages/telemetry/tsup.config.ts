import { defineConfig } from "tsup";

export default defineConfig({
  entry: {
    index: "src/index.ts",
    "api/TelemetryAPIServer": "src/api/TelemetryAPIServer.ts",
    "api/start-server": "src/api/start-server.ts",
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
    js: "",
  },
  external: [
    "better-sqlite3",
    "drizzle-orm",
    "@opentelemetry/api",
    "@opentelemetry/sdk-node",
    "socket.io",
    "express",
  ],
  esbuildOptions(options) {
    // Suppress the direct-eval warning from dependencies
    options.logOverride = {
      "direct-eval": "silent",
    };
  },
});