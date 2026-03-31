ALTER TABLE attachments ALTER COLUMN uploaded_by SET NOT NULL;
ALTER TABLE comments    ALTER COLUMN user_id    SET NOT NULL;
