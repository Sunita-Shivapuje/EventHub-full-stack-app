import { afterAll, beforeAll } from 'vitest';
import { pool } from '../src/db.js';
import { runMigrations } from '../src/scripts/migrate.js';

beforeAll(async () => {
  await runMigrations(pool, () => {});
});
afterAll(async () => {
  await pool.end();
});
