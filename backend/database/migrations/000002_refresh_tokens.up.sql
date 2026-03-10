-- 000002 refresh tokens
-- Stores long-lived refresh tokens for the access+refresh JWT pair.
-- Tokens are rotated on every use (old token revoked, new issued).

CREATE TABLE IF NOT EXISTS refresh_tokens (
    id         bigserial    PRIMARY KEY,
    user_id    bigint       NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token      varchar(64)  NOT NULL,
    expires_at timestamptz  NOT NULL,
    revoked    boolean      NOT NULL DEFAULT false,
    created_at timestamptz  DEFAULT now(),
    CONSTRAINT refresh_tokens_token_key UNIQUE (token)
);

CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user_id ON refresh_tokens (user_id);
