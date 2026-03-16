CREATE TABLE product_assignees (
    product_id BIGINT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    user_id    BIGINT NOT NULL REFERENCES users(id)    ON DELETE CASCADE,
    PRIMARY KEY (product_id, user_id)
);

-- Migrate existing single-assignee data
INSERT INTO product_assignees (product_id, user_id)
SELECT id, assigned_to FROM products WHERE assigned_to IS NOT NULL;

ALTER TABLE products DROP COLUMN IF EXISTS assigned_to;
