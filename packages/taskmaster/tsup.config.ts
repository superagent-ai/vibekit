import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['cjs', 'esm'],
  dts: true,
  splitting: false,
  sourcemap: true,
  clean: true,
  treeshake: true,
  external: [
    '@vibe-kit/projects', 
    'chokidar', 
    'anymatch',
    '@dnd-kit/core',
    '@dnd-kit/sortable',
    '@dnd-kit/utilities'
  ],
});