/**
 * Drizzle Kit Configuration
 *
 * Used for:
 * - drizzle-kit generate: generate SQL migrations from schema
 * - drizzle-kit migrate: apply migrations
 * - drizzle-kit push: push schema changes directly (dev only)
 * - drizzle-kit studio: local GUI for database inspection
 */

import type { Config } from 'drizzle-kit';

export default {
  schema: './src/db/schema.ts',
  out: './src/db/migrations',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL ?? '',
  },
  // Use camelCase for TypeScript-friendly column names
  // Drizzle auto-converts snake_case column names to camelCase
} satisfies Config;
