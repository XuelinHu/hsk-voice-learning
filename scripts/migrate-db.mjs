import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { applyMigrations } from '../server/migrations.js';
import { createDatabasePool } from '../server/database.js';

const pool = createDatabasePool();
if (!pool) throw new Error('请先配置 DB_HOST、DB_USER、DB_PASSWORD 和 DB_NAME');

const migrationDirectory = fileURLToPath(new URL('../database/migrations/', import.meta.url));

try {
  const names = (await readdir(migrationDirectory))
    .filter((name) => /^\d+_[a-z0-9_-]+\.sql$/i.test(name))
    .sort();
  const migrations = await Promise.all(names.map(async (name) => ({
    name,
    sql: await readFile(join(migrationDirectory, name), 'utf8'),
  })));
  if (!migrations.length) throw new Error('未找到数据库迁移文件');

  const applied = await applyMigrations(pool, migrations);
  console.log(`Database migrations complete (${applied} applied, ${migrations.length - applied} already current).`);
} finally {
  await pool.end();
}
