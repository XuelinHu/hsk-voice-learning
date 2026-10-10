import assert from 'node:assert/strict';
import test from 'node:test';

import { authenticate, issueToken, verifyToken } from '../../server/auth.js';

test('测试学员账号可以登录，错误密码会被拒绝', () => {
  assert.deepEqual(authenticate('hskstudent', 'Hsk@2026'), {
    id: 'student-001',
    username: 'hskstudent',
    displayName: '林晓语',
    role: 'student',
  });
  assert.equal(authenticate('hskstudent', 'wrong'), null);
});

test('登录令牌可以签发、校验并拒绝篡改', () => {
  const user = authenticate('hskstudent', 'Hsk@2026');
  const token = issueToken(user, 'test-secret', 60_000);

  assert.equal(verifyToken(token, 'test-secret').username, 'hskstudent');
  assert.equal(verifyToken(`${token}tampered`, 'test-secret'), null);
});
