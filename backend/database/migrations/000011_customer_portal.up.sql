CREATE TABLE IF NOT EXISTS customer_links (
    id         SERIAL PRIMARY KEY,
    product_id INT  NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    token      TEXT NOT NULL UNIQUE,
    expires_at TIMESTAMP,
    revoked    BOOLEAN NOT NULL DEFAULT FALSE,
    created_by INT REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_customer_links_product_id ON customer_links(product_id);
CREATE INDEX IF NOT EXISTS idx_customer_links_token     ON customer_links(token);

CREATE TABLE IF NOT EXISTS customer_messages (
    id          SERIAL PRIMARY KEY,
    product_id  INT  NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    sender_type TEXT NOT NULL CHECK (sender_type IN ('customer', 'staff')),
    sender_name TEXT NOT NULL DEFAULT '',
    message     TEXT NOT NULL,
    reply_to_id INT  REFERENCES customer_messages(id) ON DELETE SET NULL,
    created_at  TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_customer_messages_product_id ON customer_messages(product_id);
