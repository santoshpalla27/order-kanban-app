ALTER TABLE attachments ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'attachment';
