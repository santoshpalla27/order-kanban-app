CREATE TABLE IF NOT EXISTS purge_logs (
    id           BIGSERIAL    PRIMARY KEY,
    job_name     TEXT         NOT NULL,
    rows_deleted BIGINT       NOT NULL DEFAULT 0,
    ran_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    status       TEXT         NOT NULL DEFAULT 'ok',
    error_msg    TEXT         NOT NULL DEFAULT ''
);

CREATE INDEX IF NOT EXISTS idx_purge_logs_ran_at ON purge_logs (ran_at DESC);
