import { Pool } from 'pg';

type QueryResult<T> = { results: T[] };
type RunResult = { meta: { changes: number } };

export interface DatabaseStatement {
  bind(...values: unknown[]): DatabaseStatement;
  all<T = Record<string, unknown>>(): Promise<QueryResult<T>>;
  first<T = Record<string, unknown>>(): Promise<T | null>;
  run(): Promise<RunResult>;
}

export interface DatabaseLike {
  prepare(query: string): DatabaseStatement;
  batch(statements: DatabaseStatement[]): Promise<RunResult[]>;
}

type PoolCache = typeof globalThis & { __uafPostgresPool?: Pool };

function connectionString() {
  const value = process.env.DATABASE_URL;
  if (!value) throw new Error('DATABASE_URL is not configured.');
  return value;
}

function pool() {
  const cache = globalThis as PoolCache;
  cache.__uafPostgresPool ??= new Pool({
    connectionString: connectionString(),
    max: 15,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
  });
  return cache.__uafPostgresPool;
}

function numberedPlaceholders(query: string) {
  let index = 0;
  return query.replaceAll('?', () => `$${++index}`);
}

class PostgresStatement implements DatabaseStatement {
  readonly query: string;
  values: unknown[] = [];

  constructor(query: string) {
    this.query = numberedPlaceholders(query);
  }

  bind(...values: unknown[]) {
    this.values = values;
    return this;
  }

  async execute() {
    return pool().query(this.query, this.values);
  }

  async all<T>() {
    const result = await this.execute();
    return { results: result.rows as T[] };
  }

  async first<T>() {
    const result = await this.all<T>();
    return result.results[0] ?? null;
  }

  async run() {
    const result = await this.execute();
    return { meta: { changes: result.rowCount ?? 0 } };
  }
}

class PostgresDatabase implements DatabaseLike {
  prepare(query: string) {
    return new PostgresStatement(query);
  }

  async batch(statements: DatabaseStatement[]) {
    const client = await pool().connect();
    try {
      await client.query('BEGIN');
      const results: RunResult[] = [];
      for (const statement of statements) {
        const prepared = statement as PostgresStatement;
        const result = await client.query(prepared.query, prepared.values);
        results.push({ meta: { changes: result.rowCount ?? 0 } });
      }
      await client.query('COMMIT');
      return results;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
}

const database = new PostgresDatabase();

export function getD1(): DatabaseLike {
  return database;
}

export function databaseEngine() {
  return 'postgresql';
}

export function isUniqueViolation(error: unknown) {
  if (!error || typeof error !== 'object') return false;
  return 'code' in error && error.code === '23505';
}
