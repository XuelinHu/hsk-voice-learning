import assert from 'node:assert/strict';

import { createDatabasePool } from '../../server/database.js';

const pool = createDatabasePool();
if (!pool) throw new Error('Database environment variables are not configured.');

try {
  const tables = await pool.query(
    `SELECT tablename FROM pg_tables
     WHERE schemaname = 'public' ORDER BY tablename`,
  );
  const tableNames = tables.rows.map((row) => row.tablename);
  for (const required of [
    'app_users',
    'conversation_messages',
    'learning_conversations',
    'login_events',
    'transcription_events',
  ]) {
    assert.ok(tableNames.includes(required), `Missing table: ${required}`);
  }

  const columns = await pool.query(
    `SELECT column_name FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'transcription_events'`,
  );
  const columnNames = columns.rows.map((row) => row.column_name);
  assert.ok(columnNames.includes('transcript'));
  assert.ok(columnNames.includes('audio_bytes'));
  assert.equal(columnNames.some((name) => /audio_(data|blob)|recording_path/.test(name)), false);

  const users = await pool.query('SELECT count(*)::int AS count FROM app_users');
  assert.ok(users.rows[0].count >= 2);
  console.log('Database smoke test passed.');
} finally {
  await pool.end();
}
