-- Add updated_at to products so drag-and-drop ordering persists after server refetch
ALTER TABLE products ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

-- Backfill existing rows
UPDATE products SET updated_at = created_at WHERE updated_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_products_updated_at ON products (updated_at DESC);
