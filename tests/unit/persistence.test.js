import assert from 'node:assert/strict';
import test from 'node:test';

import { hashPassword, verifyPassword } from '../../server/password.js';

test('数据库密码使用 scrypt 哈希并拒绝错误密码', async () => {
  const record = await hashPassword('Hsk@2026', Buffer.alloc(16, 7));

  assert.notEqual(record.hash, 'Hsk@2026');
  assert.equal(await verifyPassword('Hsk@2026', record), true);
  assert.equal(await verifyPassword('wrong', record), false);
});
