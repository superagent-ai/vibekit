import { defineConfig } from 'tsup';

const workspacePackages = [
  '@vibe-kit/auth',
  '@vibe-kit/mcp-client',
  '@vibe-kit/projects',
];

export default defineConfig([
  // Main build
  {
    entry: ['src/index.ts'],
    format: ['cjs', 'esm'],
    dts: false, // Disable TypeScript declarations for now
    splitting: false,
    sourcemap: true,
    clean: true,
    outDir: 'dist',
    target: 'node18',
    external: ['react', 'react-dom', ...workspacePackages],
  },
  // Components build
  {
    entry: ['src/components/index.ts'],
    format: ['cjs', 'esm'],
    dts: false, // Disable TypeScript declarations for now
    splitting: false,
    sourcemap: true,
    outDir: 'dist/components',
    external: ['react', 'react-dom', 'katex/dist/katex.min.css', ...workspacePackages],
  },
  // Hooks build
  {
    entry: ['src/hooks/index.ts'],
    format: ['cjs', 'esm'],
    dts: false, // Disable TypeScript declarations for now
    splitting: false,
    sourcemap: true,
    outDir: 'dist/hooks',
    external: ['react', 'react-dom', ...workspacePackages],
  },
]);