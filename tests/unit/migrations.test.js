import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';

import { applyMigrations } from '../../server/migrations.js';

function mockPool(ledger = new Map()) {
  const calls = [];
  const client = {
    async query(sql, values = []) {
      calls.push({ sql: sql.trim(), values });
      if (sql.includes('SELECT checksum')) {
        const checksum = ledger.get(values[0]);
        return checksum ? { rowCount: 1, rows: [{ checksum }] } : { rowCount: 0, rows: [] };
      }
      if (sql.includes('INSERT INTO hsk_schema_migrations')) {
        ledger.set(values[0], values[1]);
      }
      return { rowCount: 1, rows: [] };
    },
    release() {},
  };
  return { pool: { async connect() { return client; } }, calls, ledger };
}

test('migration is applied once with a SHA-256 ledger entry under an advisory lock', async () => {
  const { pool, calls, ledger } = mockPool();
  const sql = 'CREATE TABLE example (id integer PRIMARY KEY);';
  const applied = await applyMigrations(pool, [{ name: '001_example.sql', sql }]);

  assert.equal(applied, 1);
  assert.equal(ledger.get('001_example.sql'), createHash('sha256').update(sql).digest('hex'));
  assert.ok(calls.some(({ sql: query }) => query.includes('pg_advisory_xact_lock')));
  assert.ok(calls.some(({ sql: query }) => query === sql));
  assert.equal(calls.at(-1).sql, 'COMMIT');
});

test('a current migration is skipped on repeat execution', async () => {
  const sql = 'CREATE TABLE example (id integer PRIMARY KEY);';
  const checksum = createHash('sha256').update(sql).digest('hex');
  const { pool, calls } = mockPool(new Map([['001_example.sql', checksum]]));
  const applied = await applyMigrations(pool, [{ name: '001_example.sql', sql }]);

  assert.equal(applied, 0);
  assert.equal(calls.some(({ sql: query }) => query === sql), false);
  assert.equal(calls.at(-1).sql, 'COMMIT');
});

test('migration drift is rejected and rolled back', async () => {
  const { pool, calls } = mockPool(new Map([['001_example.sql', 'old-checksum']]));

  await assert.rejects(
    applyMigrations(pool, [{ name: '001_example.sql', sql: 'SELECT 1;' }]),
    /Migration checksum mismatch: 001_example\.sql/,
  );
  assert.equal(calls.at(-1).sql, 'ROLLBACK');
});
