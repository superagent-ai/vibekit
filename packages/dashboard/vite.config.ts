import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 3001,
    open: true,
  },
  define: {
    'process.env.VITE_TELEMETRY_API_URL': JSON.stringify(process.env.VITE_TELEMETRY_API_URL || 'http://localhost:3000'),
  },
}) 