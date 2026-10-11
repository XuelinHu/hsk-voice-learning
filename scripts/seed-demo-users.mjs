import { createDatabasePool } from '../server/database.js';
import { hashPassword } from '../server/password.js';
import { assertDemoSeedTarget, validateDemoPasswords } from '../server/demo-seed-policy.js';
import { seedDemoUsers } from '../server/demo-seed-users.js';

const users = [
  {
    id: 'student-001', username: 'hskstudent', displayName: '林晓语', role: 'student',
    password: process.env.HSK_STUDENT_PASSWORD,
  },
  {
    id: 'teacher-001', username: 'hskteacher', displayName: '周老师', role: 'teacher',
    password: process.env.HSK_TEACHER_PASSWORD,
  },
];

const databaseName = assertDemoSeedTarget({
  nodeEnv: process.env.NODE_ENV,
  allowDemoSeed: process.env.ALLOW_DEMO_SEED,
  databaseName: process.env.DB_NAME,
  expectedDatabase: process.env.DEMO_SEED_DATABASE,
});
validateDemoPasswords(users);

const pool = createDatabasePool();
if (!pool) throw new Error('请先配置 DB_HOST、DB_USER、DB_PASSWORD 和 DB_NAME');
const client = await pool.connect();
try {
  await client.query('BEGIN');
  const result = await seedDemoUsers(client, users, hashPassword);
  await client.query('COMMIT');
  console.log(`演示账号种子完成（${databaseName}）：新增 ${result.inserted} 个，保留已有 ${result.unchanged} 个。`);
} catch (error) {
  await client.query('ROLLBACK');
  throw error;
} finally {
  client.release();
  await pool.end();
}
