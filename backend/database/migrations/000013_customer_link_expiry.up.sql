ALTER TABLE customer_links ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ;

-- For existing links, give them a fresh 7-day TTL from the current time
UPDATE customer_links SET expires_at = NOW() + INTERVAL '7 days' WHERE expires_at IS NULL;

-- Enforce NOT NULL for future links
ALTER TABLE customer_links ALTER COLUMN expires_at SET NOT NULL;

-- Add index for expiry checks
CREATE INDEX IF NOT EXISTS idx_customer_links_expires_at ON customer_links(expires_at);
