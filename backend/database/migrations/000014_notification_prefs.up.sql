ALTER TABLE users
ADD COLUMN IF NOT EXISTS notification_prefs JSONB NOT NULL DEFAULT '{
  "mode": "all",
  "web": {"enabled": true, "types": ["status_change","comment","mention","assignment","attachment","chat","product_created","product_deleted","delivery_reminder"]},
  "push": {"enabled": true, "types": ["status_change","comment","mention","assignment","attachment","chat","product_created","product_deleted","delivery_reminder"]}
}';
