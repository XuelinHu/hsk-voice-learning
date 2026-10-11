import assert from 'node:assert/strict';
import test from 'node:test';

import { createPostgresStore } from '../../server/database.js';
import { hashPassword, verifyPassword } from '../../server/password.js';

test('数据库密码使用 scrypt 哈希并拒绝错误密码', async () => {
  const password = 'example-test-password-491';
  const record = await hashPassword(password, Buffer.alloc(16, 7));

  assert.notEqual(record.hash, password);
  assert.equal(await verifyPassword(password, record), true);
  assert.equal(await verifyPassword('wrong', record), false);
});

test('PostgreSQL 会话历史使用 created_at 与 id 游标并按时间正序返回', async () => {
  const queries = [];
  const conversation = {
    id: '22222222-2222-4222-8222-222222222222',
    hsk_level: 4,
    scenario: '求职面试',
  };
  const rowsByPage = [
    [
      { id: '103', role: 'assistant', content: '三', source: 'ai', created_at: new Date(), cursor_created_at: '2026-10-11 10:00:00.000003+00' },
      { id: '102', role: 'user', content: '二', source: 'text', created_at: new Date(), cursor_created_at: '2026-10-11 10:00:00.000002+00' },
      { id: '101', role: 'assistant', content: '一', source: 'ai', created_at: new Date(), cursor_created_at: '2026-10-11 10:00:00.000001+00' },
    ],
    [
      { id: '100', role: 'user', content: '零', source: 'text', created_at: new Date(), cursor_created_at: '2026-10-11 10:00:00.000000+00' },
    ],
  ];
  const pool = {
    async connect() {
      throw new Error('Unexpected transaction connection');
    },
    async query(sql, values) {
      queries.push({ sql, values });
      if (sql.includes('FROM learning_conversations')) {
        return { rowCount: 1, rows: [conversation] };
      }
      if (sql.includes('FROM conversation_messages')) {
        return { rowCount: rowsByPage[queries.filter((query) => query.sql.includes('FROM conversation_messages')).length - 1].length, rows: rowsByPage[queries.filter((query) => query.sql.includes('FROM conversation_messages')).length - 1] };
      }
      throw new Error(`Unexpected query: ${sql}`);
    },
  };
  const store = createPostgresStore(pool);

  const first = await store.getLatestConversation({
    userId: 'student-001',
    clientApp: 'com.example.hsk',
    limit: 2,
  });
  assert.deepEqual(first.messages.map((message) => message.content), ['二', '三']);
  assert.equal(first.hasMore, true);
  assert.deepEqual(first.nextCursor, {
    conversationId: conversation.id,
    id: '102',
    createdAt: '2026-10-11 10:00:00.000002+00',
  });

  const second = await store.getLatestConversation({
    userId: 'student-001',
    clientApp: 'com.example.hsk',
    limit: 2,
    cursor: first.nextCursor,
  });
  assert.deepEqual(second.messages.map((message) => message.content), ['零']);
  assert.equal(second.hasMore, false);
  assert.equal(second.nextCursor, null);

  const pageQueries = queries.filter((query) => query.sql.includes('FROM conversation_messages'));
  assert.match(pageQueries[0].sql, /ORDER BY created_at DESC, id DESC\s+LIMIT \$2/);
  assert.deepEqual(pageQueries[0].values, [conversation.id, 3]);
  assert.match(pageQueries[1].sql, /\(created_at, id\) < \(\$2::timestamptz, \$3::bigint\)/);
  assert.deepEqual(pageQueries[1].values, [
    conversation.id,
    first.nextCursor.createdAt,
    first.nextCursor.id,
    3,
  ]);
  assert.deepEqual(queries[2].values, [
    conversation.id,
    'student-001',
    'com.example.hsk',
  ]);
});
