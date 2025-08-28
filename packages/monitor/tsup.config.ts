import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm', 'cjs'],
  dts: true,
  splitting: false,
  sourcemap: true,
  clean: true,
  treeshake: true,
  minify: false,
  external: ['@vibe-kit/logger'],
  esbuildOptions(options) {
    options.platform = 'node';
    options.target = 'node18';
  },
});