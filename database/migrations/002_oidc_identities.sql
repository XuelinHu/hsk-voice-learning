CREATE TABLE IF NOT EXISTS hsk_oidc_identities (
  subject text PRIMARY KEY,
  user_id text NOT NULL UNIQUE REFERENCES app_users(id) ON DELETE CASCADE,
  issuer text NOT NULL,
  linked_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_hsk_oidc_identities_user
  ON hsk_oidc_identities (user_id);
