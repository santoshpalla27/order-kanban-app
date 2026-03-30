-- Allow customer-portal uploads which have no authenticated uploader
ALTER TABLE attachments ALTER COLUMN uploaded_by DROP NOT NULL;
