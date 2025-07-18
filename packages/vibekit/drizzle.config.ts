import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  dialect: 'sqlite',
  schema: './src/db/schema.ts',
  out: './src/db/migrations',
  dbCredentials: {
    url: process.env.NODE_ENV === 'production' 
      ? '.vibekit/telemetry.db'
      : '.vibekit/telemetry-dev.db',
  },
  verbose: true,
  strict: true,
}); 