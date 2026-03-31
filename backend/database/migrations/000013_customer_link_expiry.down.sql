DROP INDEX IF EXISTS idx_customer_links_expires_at;
ALTER TABLE customer_links DROP COLUMN IF EXISTS expires_at;
