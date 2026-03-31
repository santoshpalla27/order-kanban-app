-- Customer link tokens: one active link per product, given to customers
CREATE TABLE IF NOT EXISTS customer_links (
    id          BIGSERIAL PRIMARY KEY,
    product_id  BIGINT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    token       VARCHAR(64) NOT NULL UNIQUE,
    created_by  BIGINT NOT NULL REFERENCES users(id),
    is_active   BOOLEAN NOT NULL DEFAULT TRUE,
    created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_customer_links_token      ON customer_links(token);
CREATE INDEX IF NOT EXISTS idx_customer_links_product_id ON customer_links(product_id);

-- Track whether a comment came from the internal team or via the customer portal
ALTER TABLE comments
    ADD COLUMN IF NOT EXISTS source        VARCHAR(20) NOT NULL DEFAULT 'internal',
    ADD COLUMN IF NOT EXISTS portal_sender VARCHAR(255) NOT NULL DEFAULT '';

-- Track the portal sender name for customer-submitted attachments
-- (the source column already exists from migration 000010)
ALTER TABLE attachments
    ADD COLUMN IF NOT EXISTS portal_sender VARCHAR(255) NOT NULL DEFAULT '';
