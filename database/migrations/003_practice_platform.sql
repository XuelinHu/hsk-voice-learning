CREATE TABLE IF NOT EXISTS hsk_practice_questions (
  id text PRIMARY KEY,
  level smallint NOT NULL CHECK (level BETWEEN 1 AND 6),
  section text NOT NULL CHECK (section IN ('listening', 'reading', 'speaking')),
  question text NOT NULL CHECK (length(question) BETWEEN 1 AND 4000),
  options jsonb NOT NULL CHECK (jsonb_typeof(options) = 'array' AND jsonb_array_length(options) BETWEEN 2 AND 6),
  answer smallint NOT NULL CHECK (answer > 0),
  explanation text NOT NULL DEFAULT '',
  audio_text text NOT NULL DEFAULT '',
  source text NOT NULL DEFAULT 'HSK 题型结构参考练习',
  created_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (answer <= jsonb_array_length(options))
);

CREATE INDEX IF NOT EXISTS idx_hsk_practice_questions_level_section_created
  ON hsk_practice_questions (level, section, created_at DESC);

CREATE TABLE IF NOT EXISTS hsk_practice_attempts (
  id bigserial PRIMARY KEY,
  user_id text NOT NULL,
  question_id text NOT NULL,
  level smallint NOT NULL CHECK (level BETWEEN 1 AND 6),
  section text NOT NULL CHECK (section IN ('listening', 'reading', 'speaking')),
  is_correct boolean NOT NULL,
  attempted_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_hsk_practice_attempts_user_time
  ON hsk_practice_attempts (user_id, attempted_at DESC);
