import assert from 'node:assert/strict';
import test from 'node:test';

import { assertDemoSeedTarget, validateDemoPasswords } from '../../server/demo-seed-policy.js';
import { seedDemoUsers } from '../../server/demo-seed-users.js';

const validTarget = {
  nodeEnv: 'development',
  allowDemoSeed: '1',
  databaseName: 'hsk_voice_learning_dev',
  expectedDatabase: 'hsk_voice_learning_dev',
};

test('演示种子仅允许显式启用且数据库名精确匹配的隔离库', () => {
  assert.equal(assertDemoSeedTarget(validTarget), validTarget.databaseName);
  assert.throws(() => assertDemoSeedTarget({ ...validTarget, nodeEnv: 'Production' }), /disabled in production/);
  assert.throws(() => assertDemoSeedTarget({ ...validTarget, allowDemoSeed: '0' }), /ALLOW_DEMO_SEED/);
  assert.throws(() => assertDemoSeedTarget({ ...validTarget, databaseName: 'hsk_voice_learning' }), /exactly match/);
  assert.throws(() => assertDemoSeedTarget({
    ...validTarget,
    databaseName: 'hsk_voice_learning',
    expectedDatabase: 'hsk_voice_learning',
  }), /limited to databases/);
});

test('演示账号密码必须足够长、包含字母数字且不含用户名', () => {
  assert.doesNotThrow(() => validateDemoPasswords([
    { username: 'hskstudent', password: 'Local-Student-Password-91' },
  ]));
  assert.throws(() => validateDemoPasswords([{ username: 'hskstudent', password: 'Short123' }]), /at least 16/);
  assert.throws(() => validateDemoPasswords([{ username: 'hskstudent', password: 'OnlyLettersAndNoDigits' }]), /letters and digits/);
  assert.throws(() => validateDemoPasswords([{ username: 'hskstudent', password: 'hskstudent-password-91' }]), /must not contain/);
});

test('演示账号冲突时跳过，不覆盖现有口令、角色或状态', async () => {
  const queries = [];
  const users = [
    { id: 'student-001', username: 'hskstudent', displayName: 'Student', role: 'student', password: 'Local-Student-Password-91' },
    { id: 'teacher-001', username: 'hskteacher', displayName: 'Teacher', role: 'teacher', password: 'Local-Teacher-Password-92' },
  ];
  const client = {
    async query(sql, values) {
      queries.push({ sql, values });
      return { rowCount: values[1] === 'hskteacher' ? 1 : 0 };
    },
  };

  const result = await seedDemoUsers(client, users, async (password) => ({ salt: 'salt', hash: `hash:${password}` }));

  assert.deepEqual(result, { inserted: 1, unchanged: 1 });
  assert.equal(queries.length, 2);
  assert.ok(queries.every(({ sql }) => /ON CONFLICT \(username\) DO NOTHING/.test(sql)));
  assert.ok(queries.every(({ sql }) => !/DO UPDATE|UPDATE app_users/i.test(sql)));
});
