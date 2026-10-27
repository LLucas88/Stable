/* oxlint-disable typescript/no-floating-promises */
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';
import { D1_INVARIANT_STATEMENTS } from '../db/invariants.ts';
import { initializeD1Invariants } from '../lib/server/d1-invariants.ts';

function fixture() {
  const sqlite = new DatabaseSync(':memory:');
  const directory = new URL('../drizzle/', import.meta.url);
  for (const file of readdirSync(directory)
    .filter((name) => name.endsWith('.sql'))
    .sort()) {
    sqlite.exec(readFileSync(new URL(file, directory), 'utf8'));
  }
  const calls = { reads: 0, batches: 0 };
  type Statement = { sql: string; values: (string | number)[] };
  const database = {
    prepare(sql: string) {
      const statement = {
        sql,
        values: [] as (string | number)[],
        bind(...values: (string | number)[]) {
          statement.values = values;
          return statement;
        },
        async first() {
          calls.reads++;
          return sqlite.prepare(sql).get(...statement.values);
        },
      };
      return statement;
    },
    async batch(statements: Statement[]) {
      calls.batches++;
      sqlite.exec('BEGIN');
      try {
        const results = statements.map(({ sql, values }) => ({
          results: sqlite.prepare(sql).all(...values),
        }));
        sqlite.exec('COMMIT');
        return results;
      } catch (error) {
        sqlite.exec('ROLLBACK');
        throw error;
      }
    },
  };
  return { sqlite, calls, database: database as unknown as D1Database };
}

test('a new database installs all invariants in one batch; later instances only read', async () => {
  const { sqlite, calls, database } = fixture();
  try {
    await initializeD1Invariants(database);
    assert.deepEqual(calls, { reads: 1, batches: 1 });
    assert.equal(
      sqlite
        .prepare(
          `SELECT COUNT(*) AS count FROM sqlite_schema WHERE type = 'trigger' AND name IN (${D1_INVARIANT_STATEMENTS.map(() => '?').join(',')})`,
        )
        .get(...D1_INVARIANT_STATEMENTS.map(statement => /^CREATE TRIGGER IF NOT EXISTS ([a-z0-9_]+)/u.exec(statement)![1]))?.count,
      D1_INVARIANT_STATEMENTS.length,
    );
    await initializeD1Invariants(database);
    assert.deepEqual(calls, { reads: 2, batches: 1 });
  } finally {
    sqlite.close();
  }
});

test('an incomplete trigger set is repaired before returning a usable database', async () => {
  const { sqlite, database } = fixture();
  try {
    await initializeD1Invariants(database);
    sqlite.exec('DROP TRIGGER trg_gateway_reserve_quota');
    await initializeD1Invariants(database);
    assert.ok(
      sqlite
        .prepare(
          "SELECT 1 FROM sqlite_schema WHERE name = 'trg_gateway_reserve_quota'",
        )
        .get(),
    );
  } finally {
    sqlite.close();
  }
});

test('missing rules after a failed installation never allow gateway operations', async () => {
  const { sqlite, database } = fixture();
  try {
    database.batch = async () =>
      [{ success: true, results: [{ count: 0 }], meta: {} }] as never;
    await assert.rejects(initializeD1Invariants(database), /incomplete/);
  } finally {
    sqlite.close();
  }
});
