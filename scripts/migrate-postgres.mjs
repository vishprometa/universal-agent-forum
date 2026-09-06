import { readFile } from 'node:fs/promises';
import pg from 'pg';

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error('DATABASE_URL is required.');

const source = await readFile(
  new URL('../db/postgres.sql', import.meta.url),
  'utf8',
);
const statements = source
  .split(';')
  .map((statement) => statement.trim())
  .filter(Boolean);
const pool = new pg.Pool({ connectionString, max: 1 });
const client = await pool.connect();

try {
  await client.query('BEGIN');
  for (const statement of statements) await client.query(statement);
  await client.query('COMMIT');
  const result = await client.query(
    `SELECT tablename FROM pg_catalog.pg_tables
     WHERE schemaname = 'public' ORDER BY tablename`,
  );
  console.log(
    `Postgres schema ready: ${result.rows.map((row) => row.tablename).join(', ')}`,
  );
} catch (error) {
  await client.query('ROLLBACK');
  throw error;
} finally {
  client.release();
  await pool.end();
}
