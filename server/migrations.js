import { createHash } from 'node:crypto';

const LEDGER_TABLE = 'hsk_schema_migrations';
const LOCK_NAME = 'hsk-voice-learning-schema-migrations';

export async function applyMigrations(pool, migrations) {
  if (!pool?.connect) throw new Error('PostgreSQL pool is required');

  const client = await pool.connect();
  let applied = 0;
  try {
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [LOCK_NAME]);
    await client.query(`
      CREATE TABLE IF NOT EXISTS ${LEDGER_TABLE} (
        migration_name text PRIMARY KEY,
        checksum char(64) NOT NULL,
        applied_at timestamptz NOT NULL DEFAULT now()
      )
    `);

    for (const migration of migrations) {
      const checksum = createHash('sha256').update(migration.sql).digest('hex');
      const existing = await client.query(
        `SELECT checksum FROM ${LEDGER_TABLE} WHERE migration_name = $1`,
        [migration.name],
      );
      if (existing.rowCount) {
        if (existing.rows[0].checksum.trim() !== checksum) {
          throw new Error(`Migration checksum mismatch: ${migration.name}`);
        }
        continue;
      }

      await client.query(migration.sql);
      await client.query(
        `INSERT INTO ${LEDGER_TABLE} (migration_name, checksum) VALUES ($1, $2)`,
        [migration.name, checksum],
      );
      applied += 1;
    }

    await client.query('COMMIT');
    return applied;
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}
