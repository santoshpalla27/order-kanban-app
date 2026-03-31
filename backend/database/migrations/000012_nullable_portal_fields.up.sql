-- Allow portal-submitted comments and attachments to have no associated user.
-- The foreign key constraints are retained (so existing non-null values are still validated),
-- but the columns become nullable so customer portal rows can omit user_id / uploaded_by.

ALTER TABLE comments    ALTER COLUMN user_id    DROP NOT NULL;
ALTER TABLE attachments ALTER COLUMN uploaded_by DROP NOT NULL;
