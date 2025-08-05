import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts', 'src/connection.ts', 'src/operations.ts', 'src/schema.ts', 'src/types.ts'],
  format: ['cjs', 'esm'],
  dts: true,
  splitting: false,
  sourcemap: true,
  clean: true,
  external: ['better-sqlite3'],
  esbuildOptions(options) {
    options.banner = {
      js: '"use client";',
    };
  },
}); 