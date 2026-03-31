ALTER TABLE attachments DROP COLUMN IF EXISTS portal_sender;
ALTER TABLE comments DROP COLUMN IF EXISTS portal_sender;
ALTER TABLE comments DROP COLUMN IF EXISTS source;
DROP TABLE IF EXISTS customer_links;
