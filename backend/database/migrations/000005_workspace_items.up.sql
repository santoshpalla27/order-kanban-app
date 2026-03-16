CREATE TABLE IF NOT EXISTS workspace_items (
    id         BIGSERIAL    PRIMARY KEY,
    user_id    BIGINT       NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    product_id BIGINT       NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    CONSTRAINT udx_workspace_user_product UNIQUE (user_id, product_id)
);

CREATE INDEX IF NOT EXISTS idx_workspace_user_id ON workspace_items (user_id);
