import assert from 'node:assert/strict';
import test from 'node:test';

import { createAppServer } from '../../server/app.js';
import { issueToken, verifyToken } from '../../server/auth.js';
import { DEMO_ACCOUNTS } from '../../server/demo-accounts.js';

test('没有数据库时拒绝错误的内置演示账号密码', async () => {
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

test('没有数据库时允许学员和管理员测试账号一键登录', async () => {
  const server = createAppServer({
    tokenSecret: 'test-secret',
    aiClient: { async chat() { return 'ok'; } },
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    for (const { username, password, role } of DEMO_ACCOUNTS) {
      const response = await fetch(`http://127.0.0.1:${server.address().port}/api/login`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });
      const body = await response.json();
      assert.equal(response.status, 200);
      assert.equal(body.user.role, role);
      assert.equal(typeof body.token, 'string');
    }
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test('开发环境可在现有用户存储中启用默认测试身份，生产环境可禁用', async () => {
  const server = createAppServer({
    tokenSecret: 'test-secret',
    allowDemoLogin: true,
    aiClient: { async chat() { return 'ok'; } },
    store: { async authenticate() { return null; }, async recordLogin() {} },
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/api/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ username: 'hskadmin', password: 'HskAdmin2026!' }),
    });
    assert.equal(response.status, 200);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }

  const productionServer = createAppServer({
    tokenSecret: 'test-secret',
    allowDemoLogin: false,
    aiClient: { async chat() { return 'ok'; } },
  });
  await new Promise((resolve) => productionServer.listen(0, '127.0.0.1', resolve));
  try {
    const response = await fetch(`http://127.0.0.1:${productionServer.address().port}/api/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ username: 'hskadmin', password: 'HskAdmin2026!' }),
    });
    assert.equal(response.status, 401);
  } finally {
    await new Promise((resolve) => productionServer.close(resolve));
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
