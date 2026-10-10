CREATE TABLE IF NOT EXISTS app_users (
  id text PRIMARY KEY,
  username text NOT NULL UNIQUE,
  display_name text NOT NULL,
  role text NOT NULL CHECK (role IN ('student', 'teacher')),
  password_salt text NOT NULL,
  password_hash text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (username = lower(username))
);

CREATE TABLE IF NOT EXISTS login_events (
  id bigserial PRIMARY KEY,
  user_id text REFERENCES app_users(id) ON DELETE SET NULL,
  attempted_username text NOT NULL,
  success boolean NOT NULL,
  client_app text,
  remote_address inet,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS learning_conversations (
  id uuid PRIMARY KEY,
  user_id text NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  client_app text NOT NULL,
  hsk_level smallint NOT NULL DEFAULT 3 CHECK (hsk_level BETWEEN 1 AND 6),
  scenario text NOT NULL DEFAULT '自由对话',
  started_at timestamptz NOT NULL DEFAULT now(),
  last_active_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS conversation_messages (
  id bigserial PRIMARY KEY,
  conversation_id uuid NOT NULL REFERENCES learning_conversations(id) ON DELETE CASCADE,
  user_id text NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('user', 'assistant')),
  source text NOT NULL CHECK (source IN ('text', 'voice', 'ai')),
  content text NOT NULL CHECK (length(content) BETWEEN 1 AND 20000),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS transcription_events (
  id uuid PRIMARY KEY,
  conversation_id uuid NOT NULL REFERENCES learning_conversations(id) ON DELETE CASCADE,
  user_id text NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  transcript text NOT NULL CHECK (length(transcript) BETWEEN 1 AND 20000),
  locale text NOT NULL DEFAULT 'zh-CN',
  audio_bytes integer NOT NULL CHECK (audio_bytes > 0),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_login_events_user_created
  ON login_events (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_conversations_user_app_active
  ON learning_conversations (user_id, client_app, last_active_at DESC);
CREATE INDEX IF NOT EXISTS idx_messages_conversation_created
  ON conversation_messages (conversation_id, created_at, id);
CREATE INDEX IF NOT EXISTS idx_transcriptions_user_created
  ON transcription_events (user_id, created_at DESC);

COMMENT ON TABLE transcription_events IS
  'Stores transcript text and metadata only. Audio remains in the Android app cache.';
