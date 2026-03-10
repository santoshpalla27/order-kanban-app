-- Revert cascade/set-null constraints back to plain REFERENCES

ALTER TABLE products DROP CONSTRAINT IF EXISTS products_created_by_fkey;
ALTER TABLE products ALTER COLUMN created_by SET NOT NULL;
ALTER TABLE products ADD CONSTRAINT products_created_by_fkey
    FOREIGN KEY (created_by) REFERENCES users(id);

ALTER TABLE comments DROP CONSTRAINT IF EXISTS comments_user_id_fkey;
ALTER TABLE comments ADD CONSTRAINT comments_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES users(id);

ALTER TABLE chat_messages DROP CONSTRAINT IF EXISTS chat_messages_user_id_fkey;
ALTER TABLE chat_messages ADD CONSTRAINT chat_messages_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES users(id);

ALTER TABLE attachments DROP CONSTRAINT IF EXISTS attachments_uploaded_by_fkey;
ALTER TABLE attachments ADD CONSTRAINT attachments_uploaded_by_fkey
    FOREIGN KEY (uploaded_by) REFERENCES users(id);
