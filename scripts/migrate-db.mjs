import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { getTestAccountSummary } from '../server/auth.js';
import { createDatabasePool } from '../server/database.js';
import { hashPassword } from '../server/password.js';

const pool = createDatabasePool();
if (!pool) throw new Error('请先配置 DB_HOST、DB_USER、DB_PASSWORD 和 DB_NAME');

try {
  const migration = await readFile(resolve('database/migrations/001_initial.sql'), 'utf8');
  await pool.query(migration);
  for (const user of getTestAccountSummary()) {
    const password = await hashPassword(user.password);
    await pool.query(
      `INSERT INTO app_users
        (id, username, display_name, role, password_salt, password_hash)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (username) DO UPDATE SET
         display_name = EXCLUDED.display_name,
         role = EXCLUDED.role,
         password_salt = EXCLUDED.password_salt,
         password_hash = EXCLUDED.password_hash,
         is_active = true,
         updated_at = now()`,
      [user.id, user.username, user.displayName, user.role, password.salt, password.hash],
    );
  }
  console.log('Database migration completed.');
} finally {
  await pool.end();
}
