import { defineConfig } from 'tsup';

export default defineConfig({
  entry: {
    index: 'src/index.ts'
  },
  format: ['cjs', 'esm'],
  dts: true,
  sourcemap: true,
  clean: true,
  splitting: false,
  minify: false,
  external: ['@dagger.io/dagger']
});