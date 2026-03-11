DROP INDEX IF EXISTS idx_products_updated_at;
ALTER TABLE products DROP COLUMN IF EXISTS updated_at;
