ALTER TABLE products ADD COLUMN IF NOT EXISTS assigned_to BIGINT REFERENCES users(id) ON DELETE SET NULL;

-- Restore a single assignee per product (first one found)
UPDATE products p
SET assigned_to = (
    SELECT user_id FROM product_assignees pa
    WHERE pa.product_id = p.id
    LIMIT 1
);

DROP TABLE IF EXISTS product_assignees;
