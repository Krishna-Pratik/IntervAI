// Drizzle + Neon (serverless) client, created once and reused.

import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import * as schema from '../../db/schema.js';

let dbInstance: ReturnType<typeof drizzle> | null = null;

function getDb() {
  if (!dbInstance) {
    const databaseUrl = process.env.DATABASE_URL;

    if (!databaseUrl) {
      throw new Error(
        'DATABASE_URL is not set. Ensure a Neon PostgreSQL connection string is configured.',
      );
    }

    const sql = neon(databaseUrl);
    dbInstance = drizzle(sql, { schema });
  }

  return dbInstance;
}

export const db = new Proxy({} as ReturnType<typeof drizzle>, {
  get(_target, prop) {
    const instance = getDb();
    const value = instance[prop as keyof ReturnType<typeof drizzle>];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return typeof value === 'function' ? value.bind(instance) : value;
  },
});

export type Db = typeof db;
