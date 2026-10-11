import assert from 'node:assert/strict';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import pg from 'pg';
import { runCli, validateDatabaseName } from '../../scripts/pg-backup.mjs';

const { Client, Pool } = pg;
const sourceDatabase = validateDatabaseName(process.env.DB_NAME);
if (!sourceDatabase.endsWith('_test')) {
  throw new Error('This test only runs against a source database ending in _test');
}
for (const name of ['DB_HOST', 'DB_USER', 'DB_PASSWORD']) {
  if (!process.env[name]) throw new Error(`Missing ${name}`);
}

const targetDatabase = `${sourceDatabase.slice(0, 40)}_restore_${randomUUID().slice(0, 8)}_test`;
validateDatabaseName(targetDatabase);
const connection = {
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT || 5432),
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
  connectionTimeoutMillis: 8000,
};

const admin = new Client({ ...connection, database: 'postgres' });
await admin.connect();
try {
  const existing = await admin.query('SELECT 1 FROM pg_database WHERE datname = $1', [targetDatabase]);
  assert.equal(existing.rowCount, 0, 'random restore target must not already exist');
  await admin.query(`CREATE DATABASE "${targetDatabase}"`);
} finally {
  await admin.end();
}

const tempDirectory = await mkdtemp(join(tmpdir(), 'hsk-pg-backup-smoke-'));
const snapshotPath = join(tempDirectory, 'snapshot.pgbak');
const testEnv = {
  ...process.env,
  DB_BACKUP_ENCRYPTION_KEY: randomBytes(32).toString('hex'),
};

async function databaseFingerprint(database) {
  const pool = new Pool({ ...connection, database, max: 2 });
  try {
    const tables = await pool.query(`
      SELECT table_schema, table_name
      FROM information_schema.tables
      WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
      ORDER BY table_schema, table_name
    `);
    const rows = [];
    for (const { table_schema: schema, table_name: table } of tables.rows) {
      const identifier = (name) => `"${name.replaceAll('"', '""')}"`;
      const result = await pool.query(`
        SELECT count(*)::text AS row_count,
          md5(coalesce(string_agg(row_to_json(t)::text, E'\\n' ORDER BY row_to_json(t)::text), '')) AS row_hash
        FROM ${identifier(schema)}.${identifier(table)} AS t
      `);
      rows.push({ schema, table, ...result.rows[0] });
    }
    const schema = await pool.query(`
      SELECT table_schema, table_name, column_name, ordinal_position, data_type,
             udt_name, is_nullable, column_default
      FROM information_schema.columns
      WHERE table_schema = 'public'
      ORDER BY table_schema, table_name, ordinal_position
    `);
    const constraints = await pool.query(`
      SELECT n.nspname AS schema_name, c.relname AS table_name, con.conname,
             con.contype, pg_get_constraintdef(con.oid) AS definition
      FROM pg_constraint con
      JOIN pg_class c ON c.oid = con.conrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public'
      ORDER BY n.nspname, c.relname, con.conname
    `);
    const indexes = await pool.query(`
      SELECT schemaname, tablename, indexname, indexdef
      FROM pg_indexes WHERE schemaname = 'public'
      ORDER BY schemaname, tablename, indexname
    `);
    const sequenceNames = await pool.query(`
      SELECT sequence_schema, sequence_name
      FROM information_schema.sequences
      WHERE sequence_schema = 'public'
      ORDER BY sequence_schema, sequence_name
    `);
    const sequences = [];
    for (const { sequence_schema: sequenceSchema, sequence_name: sequenceName } of sequenceNames.rows) {
      const identifier = (name) => `"${name.replaceAll('"', '""')}"`;
      const result = await pool.query(`
        SELECT last_value::text, is_called
        FROM ${identifier(sequenceSchema)}.${identifier(sequenceName)}
      `);
      sequences.push({ schema: sequenceSchema, name: sequenceName, ...result.rows[0] });
    }
    const fingerprint = createHash('sha256').update(JSON.stringify({
      rows, schema: schema.rows, constraints: constraints.rows, indexes: indexes.rows, sequences,
    })).digest('hex');
    return {
      fingerprint,
      tables: rows.length,
      rowCount: rows.reduce((sum, table) => sum + Number(table.row_count), 0),
    };
  } finally {
    await pool.end();
  }
}

try {
  const before = await databaseFingerprint(sourceDatabase);
  await runCli(['backup', '--destination', snapshotPath], testEnv);
  await runCli(['restore', '--source', snapshotPath, '--database', targetDatabase, '--replace'], testEnv);
  const after = await databaseFingerprint(targetDatabase);
  assert.equal(after.fingerprint, before.fingerprint, 'schema, indexes, constraints, sequences, and table data must match after restore');
  console.log(`PostgreSQL backup/restore smoke passed: ${after.tables} tables, ${after.rowCount} rows; isolated database ${targetDatabase} is retained for review.`);
} finally {
  await rm(tempDirectory, { recursive: true, force: true });
}
