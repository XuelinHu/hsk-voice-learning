import assert from 'node:assert/strict';
import test from 'node:test';

import { createAppServer } from '../../server/app.js';
import { issueToken, verifyToken } from '../../server/auth.js';

test('没有数据库时拒绝内置演示账号', async () => {
  const server = createAppServer({
    tokenSecret: 'test-secret',
    aiClient: { async chat() { return 'ok'; } },
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/api/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ username: 'hskstudent', password: 'hsk-fallback-must-not-work' }),
    });
    assert.equal(response.status, 401);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test('登录令牌可以签发、校验并拒绝篡改', () => {
  const user = {
    id: 'student-001',
    username: 'hskstudent',
    displayName: '林晓语',
    role: 'student',
  };
  const token = issueToken(user, 'test-secret', 60_000);

  assert.equal(verifyToken(token, 'test-secret').username, 'hskstudent');
  assert.equal(verifyToken(`${token}tampered`, 'test-secret'), null);
});
