import type { Config } from 'drizzle-kit';

export default {
  schema: './src/schema.ts',
  out: './migrations',
  dialect: 'sqlite',
  dbCredentials: {
    url: '.vibekit/telemetry.db',
  },
  verbose: true,
  strict: true,
} satisfies Config; 