-- 000001 initial schema
-- All CREATE statements use IF NOT EXISTS so this migration is safe to run
-- against databases that were previously managed by GORM AutoMigrate.

CREATE TABLE IF NOT EXISTS roles (
    id         bigserial    PRIMARY KEY,
    name       text         NOT NULL,
    created_at timestamptz  DEFAULT now(),
    CONSTRAINT roles_name_key UNIQUE (name)
);

CREATE TABLE IF NOT EXISTS users (
    id         bigserial    PRIMARY KEY,
    name       text         NOT NULL,
    email      text         NOT NULL,
    password   text         NOT NULL,
    role_id    bigint       NOT NULL REFERENCES roles(id),
    avatar_key text         DEFAULT '',
    created_at timestamptz  DEFAULT now(),
    CONSTRAINT users_email_key UNIQUE (email)
);

CREATE TABLE IF NOT EXISTS products (
    id             bigserial    PRIMARY KEY,
    product_id     text         NOT NULL,
    customer_name  text         NOT NULL,
    customer_phone text         DEFAULT '',
    description    text         DEFAULT '',
    status         text         NOT NULL DEFAULT 'yet_to_start',
    created_by     bigint       NOT NULL REFERENCES users(id),
    deleted_by     bigint       DEFAULT 0,
    created_at     timestamptz  DEFAULT now(),
    deleted_at     timestamptz
);

-- Partial unique index: same product_id is allowed on soft-deleted rows
CREATE UNIQUE INDEX IF NOT EXISTS udx_product_id_active
    ON products (product_id)
    WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_products_deleted_at ON products (deleted_at);

CREATE TABLE IF NOT EXISTS attachments (
    id          bigserial    PRIMARY KEY,
    product_id  bigint       NOT NULL REFERENCES products(id),
    file_path   text         NOT NULL,
    file_name   text         NOT NULL,
    file_type   text         DEFAULT '',
    file_size   bigint       DEFAULT 0,
    uploaded_by bigint       NOT NULL REFERENCES users(id),
    uploaded_at timestamptz  DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_attachments_product_id ON attachments (product_id);

CREATE TABLE IF NOT EXISTS comments (
    id         bigserial    PRIMARY KEY,
    product_id bigint       NOT NULL REFERENCES products(id),
    user_id    bigint       NOT NULL REFERENCES users(id),
    message    text         NOT NULL,
    created_at timestamptz  DEFAULT now(),
    updated_at timestamptz  DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_comments_product_id ON comments (product_id);

CREATE TABLE IF NOT EXISTS chat_messages (
    id         bigserial    PRIMARY KEY,
    user_id    bigint       NOT NULL REFERENCES users(id),
    message    text         NOT NULL,
    created_at timestamptz  DEFAULT now()
);

CREATE TABLE IF NOT EXISTS notifications (
    id          bigserial    PRIMARY KEY,
    user_id     bigint       NOT NULL,
    message     text         NOT NULL,
    type        text         NOT NULL,
    entity_type text         DEFAULT '',
    entity_id   bigint       DEFAULT 0,
    content     text         DEFAULT '',
    sender_name text         DEFAULT '',
    is_read     boolean      NOT NULL DEFAULT false,
    created_at  timestamptz  DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON notifications (user_id);

CREATE TABLE IF NOT EXISTS activity_logs (
    id         bigserial    PRIMARY KEY,
    user_id    bigint       NOT NULL,
    action     text         NOT NULL,
    entity     text         NOT NULL,
    entity_id  bigint       DEFAULT 0,
    details    text         DEFAULT '',
    created_at timestamptz  DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_activity_logs_user_id    ON activity_logs (user_id);
CREATE INDEX IF NOT EXISTS idx_entity_created           ON activity_logs (entity, created_at);
