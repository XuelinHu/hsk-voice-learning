import { randomUUID } from 'node:crypto';

import pg from 'pg';

import { verifyPassword } from './password.js';

const { Pool } = pg;

function clampLevel(value) {
  const level = Number(value);
  return Number.isInteger(level) && level >= 1 && level <= 6 ? level : 3;
}

function normalizeApp(value) {
  return String(value || 'unknown').trim().slice(0, 120) || 'unknown';
}

function normalizeScenario(value) {
  return String(value || '自由对话').trim().slice(0, 120) || '自由对话';
}

function validUuid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value || ''));
}

export function createDatabasePool(env = process.env) {
  if (!env.DB_HOST || !env.DB_USER || !env.DB_PASSWORD || !env.DB_NAME) return null;
  return new Pool({
    host: env.DB_HOST,
    port: Number(env.DB_PORT || 5432),
    user: env.DB_USER,
    password: env.DB_PASSWORD,
    database: env.DB_NAME,
    max: Number(env.DB_POOL_SIZE || 10),
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
    ssl: env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
  });
}

async function ensureConversation(client, input) {
  if (validUuid(input.conversationId)) {
    const existing = await client.query(
      'SELECT id FROM learning_conversations WHERE id = $1 AND user_id = $2',
      [input.conversationId, input.userId],
    );
    if (existing.rowCount) return existing.rows[0].id;
  }

  const conversationId = randomUUID();
  await client.query(
    `INSERT INTO learning_conversations
      (id, user_id, client_app, hsk_level, scenario)
     VALUES ($1, $2, $3, $4, $5)`,
    [
      conversationId,
      input.userId,
      normalizeApp(input.clientApp),
      clampLevel(input.level),
      normalizeScenario(input.scenario),
    ],
  );
  return conversationId;
}

export function createPostgresStore(pool) {
  if (!pool?.query || !pool?.connect) throw new Error('PostgreSQL pool is required');

  return {
    async ping() {
      await pool.query('SELECT 1');
    },

    async authenticate(username, password) {
      const normalized = String(username || '').trim().toLowerCase();
      const result = await pool.query(
        `SELECT id, username, display_name, role, password_salt, password_hash
         FROM app_users WHERE username = $1 AND is_active = true`,
        [normalized],
      );
      if (!result.rowCount) return null;
      const row = result.rows[0];
      const valid = await verifyPassword(password, {
        salt: row.password_salt,
        hash: row.password_hash,
      });
      if (!valid) return null;
      return {
        id: row.id,
        username: row.username,
        displayName: row.display_name,
        role: row.role,
      };
    },

    async recordLogin({ userId, username, success, clientApp, remoteAddress }) {
      const address = String(remoteAddress || '').replace(/^::ffff:/, '');
      await pool.query(
        `INSERT INTO login_events
          (user_id, attempted_username, success, client_app, remote_address)
         VALUES ($1, $2, $3, $4, NULLIF($5, '')::inet)`,
        [userId || null, String(username || '').slice(0, 120), success, normalizeApp(clientApp), address],
      );
    },

    async saveTranscription(input) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const conversationId = await ensureConversation(client, input);
        await client.query(
          `INSERT INTO transcription_events
            (id, conversation_id, user_id, transcript, locale, audio_bytes)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [
            randomUUID(),
            conversationId,
            input.userId,
            input.transcript,
            String(input.locale || 'zh-CN').slice(0, 20),
            input.audioBytes,
          ],
        );
        await client.query(
          'UPDATE learning_conversations SET last_active_at = now() WHERE id = $1',
          [conversationId],
        );
        await client.query('COMMIT');
        return { conversationId };
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
    },

    async saveChatTurn(input) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const conversationId = await ensureConversation(client, input);
        await client.query(
          `INSERT INTO conversation_messages
            (conversation_id, user_id, role, source, content)
           VALUES ($1, $2, 'user', $3, $4),
                  ($1, $2, 'assistant', 'ai', $5)`,
          [conversationId, input.userId, input.source === 'voice' ? 'voice' : 'text', input.userMessage, input.assistantMessage],
        );
        await client.query(
          `UPDATE learning_conversations
           SET hsk_level = $2, scenario = $3, last_active_at = now()
           WHERE id = $1`,
          [conversationId, clampLevel(input.level), normalizeScenario(input.scenario)],
        );
        await client.query('COMMIT');
        return { conversationId };
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
    },

    async getLatestConversation({ userId, clientApp, limit = 80, cursor = null }) {
      const pageSize = Number.isInteger(Number(limit))
        ? Math.min(100, Math.max(1, Number(limit)))
        : 80;
      let conversation;
      if (cursor) {
        if (
          !validUuid(cursor.conversationId)
          || !/^[1-9]\d{0,18}$/.test(String(cursor.id))
          || BigInt(cursor.id) > 9223372036854775807n
          || !Number.isFinite(Date.parse(cursor.createdAt))
        ) {
          return null;
        }
        conversation = await pool.query(
          `SELECT id, hsk_level, scenario
           FROM learning_conversations
           WHERE id = $1 AND user_id = $2 AND client_app = $3
           LIMIT 1`,
          [cursor.conversationId, userId, normalizeApp(clientApp)],
        );
      } else {
        conversation = await pool.query(
          `SELECT id, hsk_level, scenario
           FROM learning_conversations
           WHERE user_id = $1 AND client_app = $2
           ORDER BY last_active_at DESC, id DESC LIMIT 1`,
          [userId, normalizeApp(clientApp)],
        );
      }
      if (!conversation.rowCount) return null;
      const row = conversation.rows[0];
      const messages = await pool.query(
        `SELECT id::text AS id, role, content, source, created_at,
                created_at::text AS cursor_created_at
         FROM conversation_messages
         WHERE conversation_id = $1
           ${cursor ? 'AND (created_at, id) < ($2::timestamptz, $3::bigint)' : ''}
         ORDER BY created_at DESC, id DESC
         LIMIT $${cursor ? 4 : 2}`,
        cursor
          ? [row.id, cursor.createdAt, cursor.id, pageSize + 1]
          : [row.id, pageSize + 1],
      );
      const hasMore = messages.rows.length > pageSize;
      const pageRows = messages.rows.slice(0, pageSize);
      const oldest = pageRows.at(-1);
      return {
        conversationId: row.id,
        level: row.hsk_level,
        scenario: row.scenario,
        hasMore,
        nextCursor: hasMore && oldest
          ? {
              conversationId: row.id,
              id: oldest.id,
              createdAt: oldest.cursor_created_at,
            }
          : null,
        messages: pageRows.reverse().map((message) => ({
          role: message.role,
          content: message.content,
          source: message.source,
          createdAt: message.created_at,
        })),
      };
    },

    async close() {
      await pool.end();
    },
  };
}
