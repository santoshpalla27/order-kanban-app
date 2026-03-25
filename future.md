# Operations & Development Guide

A practical reference for deploying, maintaining, and extending this application.

---

## Table of Contents

1. [Production Deployment](#1-production-deployment)
2. [Database Backups](#2-database-backups)
3. [Backup Strategies](#3-backup-strategies)
4. [Restore from Backup](#4-restore-from-backup)
5. [Adding a New Feature](#5-adding-a-new-feature)
6. [Database Configuration & Migrations](#6-database-configuration--migrations)
7. [Environment Variables Reference](#7-environment-variables-reference)
8. [Mobile App Release](#8-mobile-app-release)

---

## 1. Production Deployment

### Prerequisites

- A Linux VPS with at least **2 GB RAM** (Ubuntu 22.04 recommended)
- Docker + Docker Compose v2 installed
- A domain name pointed at your server's IP (A record)
- Cloudflare R2 bucket and credentials (for file storage)

### First-Time Setup

**1. SSH into your server and clone the repo:**
```bash
git clone <your-repo-url> /opt/kanban
cd /opt/kanban
```

**2. Create your `.env` file from the template:**
```bash
cp .env.example .env
nano .env
```

Fill in every value — see [Section 7](#7-environment-variables-reference) for the full list. Critical ones:
```env
DOMAIN=app.yourdomain.com
ACME_EMAIL=you@yourdomain.com
POSTGRES_PASSWORD=change_this_to_a_strong_password
JWT_SECRET=change_this_to_a_64_char_random_string
R2_BUCKET=your-bucket-name
R2_ACCOUNT_ID=your-cloudflare-account-id
R2_ACCESS_KEY=your-r2-access-key
R2_SECRET_KEY=your-r2-secret-key
```

**3. Create Traefik's ACME storage file:**
```bash
mkdir -p /opt/kanban/traefik
touch /opt/kanban/traefik/acme.json
chmod 600 /opt/kanban/traefik/acme.json
```

**4. Pull images and start all services:**
```bash
docker compose -f docker-compose.prod.yml pull
docker compose -f docker-compose.prod.yml up -d
```

**5. Wait ~30 seconds, then verify everything is running:**
```bash
docker compose -f docker-compose.prod.yml ps
docker compose -f docker-compose.prod.yml logs backend --tail=30
```

**6. Create the first admin account:**

Visit `https://app.yourdomain.com/register` and register. Then promote that user to admin:
```bash
docker compose -f docker-compose.prod.yml exec postgres \
  psql -U kanban -d kanban -c \
  "UPDATE users SET role_id = (SELECT id FROM roles WHERE name='admin') WHERE email='your@email.com';"
```

### Updating to a New Version

```bash
cd /opt/kanban
git pull

# Rebuild and push images (on your dev machine):
docker build -t santoshpalla27/gift-highway:backend ./backend
docker build -t santoshpalla27/gift-highway:frontend ./frontend
docker push santoshpalla27/gift-highway:backend
docker push santoshpalla27/gift-highway:frontend

# On the server:
docker compose -f docker-compose.prod.yml pull
docker compose -f docker-compose.prod.yml up -d --remove-orphans
```

Database migrations run automatically when the backend starts — no manual step needed.

### Useful Commands

```bash
# View live logs for all services
docker compose -f docker-compose.prod.yml logs -f

# Restart a single service (e.g. after a config change)
docker compose -f docker-compose.prod.yml restart backend

# Open a PostgreSQL shell
docker compose -f docker-compose.prod.yml exec postgres psql -U kanban -d kanban

# Check disk usage
docker system df
```

---

## 2. Database Backups

The database lives inside a named Docker volume (`postgres_data`). All backups use `pg_dump`, which produces a portable SQL dump that can be restored on any PostgreSQL 16 server.

### Manual Backup

Run this on the server. Replace the date in the filename as needed:

```bash
docker compose -f docker-compose.prod.yml exec -T postgres \
  pg_dump -U kanban -d kanban --no-owner --no-acl -F c \
  > /opt/backups/kanban_$(date +%Y%m%d_%H%M%S).dump
```

- `-F c` = custom format (compressed, faster restore)
- `--no-owner --no-acl` = portable across different usernames

### Automated Daily Backup (Cron)

Create the backup directory and script:

```bash
mkdir -p /opt/backups

cat > /opt/kanban/backup.sh << 'EOF'
#!/bin/bash
set -e

BACKUP_DIR="/opt/backups"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
FILE="$BACKUP_DIR/kanban_$TIMESTAMP.dump"

# Dump
docker compose -f /opt/kanban/docker-compose.prod.yml exec -T postgres \
  pg_dump -U kanban -d kanban --no-owner --no-acl -F c > "$FILE"

echo "Backup saved: $FILE ($(du -sh $FILE | cut -f1))"

# Delete backups older than 30 days
find "$BACKUP_DIR" -name "*.dump" -mtime +30 -delete
echo "Old backups cleaned."
EOF

chmod +x /opt/kanban/backup.sh
```

Add to crontab (runs every day at 2 AM):

```bash
crontab -e
# Add this line:
0 2 * * * /opt/kanban/backup.sh >> /var/log/kanban-backup.log 2>&1
```

### Verify a Backup

```bash
# List the tables in a backup file (quick sanity check)
pg_restore --list /opt/backups/kanban_20260325_020000.dump | head -30
```

### Off-Site Copy

Always copy backups off the server. Options:

```bash
# Copy to another machine via scp
scp /opt/backups/kanban_*.dump user@backup-server:/backups/

# Or upload to Cloudflare R2 using rclone
rclone copy /opt/backups/ r2:your-backup-bucket/db-backups/
```

---

## 3. Backup Strategies

### Recommended Schedule

| Frequency | Retention | Method |
|-----------|-----------|--------|
| Daily (2 AM) | 30 days | `pg_dump` via cron (see above) |
| Weekly (Sunday 3 AM) | 3 months | Same script, different directory |
| Before every deploy | Keep 3 | Manual dump before `docker compose up` |

**Weekly backup addition to crontab:**
```bash
0 3 * * 0 /opt/kanban/backup.sh /opt/backups/weekly >> /var/log/kanban-backup.log 2>&1
```

### What to Back Up

| Data | Location | Backup method |
|------|----------|---------------|
| PostgreSQL data | Docker volume `postgres_data` | `pg_dump` (above) |
| User-uploaded files | Cloudflare R2 | R2 handles durability; optionally enable R2 versioning |
| `.env` file | `/opt/kanban/.env` | Copy to password manager / secrets vault |
| `acme.json` (TLS certs) | `/opt/kanban/traefik/acme.json` | Copy alongside `.env` |

### Cloudflare R2 Files

R2 has 99.999999999% durability — no extra backup needed for most cases. For extra safety, enable **Object Versioning** in the R2 dashboard so deleted files are recoverable for 30 days.

### Testing Backups

Run a restore test every month into a temporary container:

```bash
# Start a temp postgres container
docker run -d --name pgtest \
  -e POSTGRES_USER=kanban \
  -e POSTGRES_PASSWORD=test \
  -e POSTGRES_DB=kanban \
  postgres:16-alpine

# Wait for it to start
sleep 5

# Restore your latest backup
cat /opt/backups/kanban_latest.dump | \
  docker exec -i pgtest pg_restore -U kanban -d kanban --no-owner -F c

# Verify row counts
docker exec pgtest psql -U kanban -d kanban \
  -c "SELECT 'users' as tbl, count(*) FROM users UNION ALL SELECT 'products', count(*) FROM products;"

# Clean up
docker rm -f pgtest
```

---

## 4. Restore from Backup

### Full Restore (Disaster Recovery)

Use this when the production database is corrupted or lost.

```bash
# 1. Stop the backend (prevents writes during restore)
docker compose -f docker-compose.prod.yml stop backend push-service

# 2. Drop and recreate the database
docker compose -f docker-compose.prod.yml exec postgres \
  psql -U kanban -c "DROP DATABASE IF EXISTS kanban; CREATE DATABASE kanban;"

# 3. Restore from dump
cat /opt/backups/kanban_20260325_020000.dump | \
  docker compose -f docker-compose.prod.yml exec -T postgres \
  pg_restore -U kanban -d kanban --no-owner -F c

# 4. Restart all services
docker compose -f docker-compose.prod.yml start backend push-service

# 5. Verify
docker compose -f docker-compose.prod.yml exec postgres \
  psql -U kanban -d kanban -c "SELECT count(*) FROM users;"
```

### Partial Restore (Single Table)

If you only need to recover data from one table (e.g., accidentally deleted products):

```bash
# Restore only the products table from the dump
docker compose -f docker-compose.prod.yml exec -T postgres \
  pg_restore -U kanban -d kanban --no-owner -F c \
  --table=products /opt/backups/kanban_20260325_020000.dump
```

---

## 5. Adding a New Feature

This stack follows a consistent pattern. Here is the exact sequence for adding any new feature end-to-end.

### Step 1: Database Migration

If the feature needs a new table or column, create a migration file pair:

```bash
# Name it sequentially (next number after the last migration in /backend/database/migrations/)
touch backend/database/migrations/000009_your_feature_name.up.sql
touch backend/database/migrations/000009_your_feature_name.down.sql
```

`000009_your_feature_name.up.sql`:
```sql
-- Example: adding a priority field to products
ALTER TABLE products ADD COLUMN priority INTEGER NOT NULL DEFAULT 0;
CREATE INDEX idx_products_priority ON products(priority);
```

`000009_your_feature_name.down.sql`:
```sql
ALTER TABLE products DROP COLUMN IF EXISTS priority;
```

Migrations run automatically when the backend starts. The migration runner tracks which have been applied and only runs new ones.

### Step 2: Backend Model

Add or update the GORM struct in `backend/internal/models/`:

```go
// backend/internal/models/product.go
type Product struct {
    // ... existing fields ...
    Priority int `json:"priority" gorm:"default:0"`
}
```

### Step 3: Backend API Handler

Create a handler in `backend/internal/api/handlers/`:

```go
// backend/internal/api/handlers/priority_handler.go
func (h *ProductHandler) UpdatePriority(c *gin.Context) {
    // 1. Extract userID from context (auth middleware sets this)
    userID := c.GetUint("user_id")

    // 2. Parse request
    var req struct { Priority int `json:"priority"` }
    if err := c.ShouldBindJSON(&req); err != nil {
        c.JSON(400, gin.H{"error": err.Error()})
        return
    }

    // 3. Call service layer
    // 4. Broadcast WS event so all clients update
    database.EmitBroadcast(wsMsg)

    // 5. Return response
    c.JSON(200, gin.H{"ok": true})
}
```

**Key conventions:**
- Get the current user: `userID := c.GetUint("user_id")`, `role, _ := c.Get("role")`
- Notifications to others: `services.CreateNotificationForAllExcept(userID, nil, message, "type", "product", entityID, content, senderName)`
- Activity log: `services.CreateActivityLog(&models.ActivityLog{...})`
- Real-time broadcast: `database.EmitBroadcast(wsMsg)` or `database.EmitBroadcastExcept(userID, wsMsg)`

### Step 4: Register the Route

Add the route in `backend/cmd/main.go` inside the appropriate route group:

```go
// Inside the protected routes group
products.PUT("/:id/priority", productHandler.UpdatePriority)
```

Wrap with RBAC middleware if needed:
```go
products.PUT("/:id/priority",
    middleware.RequireRole("admin", "manager", "organiser"),
    productHandler.UpdatePriority,
)
```

### Step 5: Frontend API Client

Add the API call to `frontend/src/api/client.ts`:

```typescript
export const productsApi = {
  // ... existing methods ...
  updatePriority: (id: number, priority: number) =>
    apiClient.put(`/products/${id}/priority`, { priority }),
};
```

### Step 6: Frontend Component / Hook

Use React Query for data that needs caching and background refetch:

```typescript
// Mutation (write operation)
const updatePriority = useMutation({
  mutationFn: ({ id, priority }: { id: number; priority: number }) =>
    productsApi.updatePriority(id, priority),
  onSuccess: () => {
    queryClient.invalidateQueries({ queryKey: ['products'] });
  },
});
```

Handle the WebSocket event in `frontend/src/hooks/useWebSocket.ts` if needed:

```typescript
case 'priority_updated':
  queryClient.invalidateQueries({ queryKey: ['products'] });
  break;
```

### Step 7: Mobile

Mirror the frontend changes:
- Add the API call in `mobile-main/src/api/services.ts`
- Update the relevant screen in `mobile-main/src/screens/`
- Handle the WS event in `mobile-main/src/hooks/useWsEvents.ts`

### Step 8: Types

Update TypeScript types in both `frontend/src/types/index.ts` and `mobile-main/src/types/index.ts`:

```typescript
export interface Product {
  // ... existing fields ...
  priority: number;
}
```

### Checklist for a New Feature

- [ ] Migration file pair created (up + down)
- [ ] Backend model updated
- [ ] Service function written (business logic separated from handler)
- [ ] Handler written (thin — just parse, call service, respond)
- [ ] Route registered with correct RBAC middleware
- [ ] Activity log created where appropriate
- [ ] Notification sent where appropriate (via `CreateNotificationForAllExcept`)
- [ ] WS broadcast emitted so all connected clients update live
- [ ] Frontend API client updated
- [ ] React Query key invalidated on mutation success
- [ ] WS event handled in `useWebSocket.ts`
- [ ] Mobile API call added
- [ ] Mobile WS event handled in `useWsEvents.ts`
- [ ] TypeScript types updated in both frontend and mobile

---

## 6. Database Configuration & Migrations

### Connection Pool Settings

The pool is configured in `backend/database/database.go`. Current production values:

```go
MaxOpenConns:    25   // max simultaneous DB connections
MaxIdleConns:    5    // kept alive when idle
ConnMaxLifetime: 30m  // connection recycled after 30 min
ConnMaxIdleTime: 5m   // idle connection closed after 5 min
```

For a **2 GB VPS** with default PostgreSQL settings (`max_connections = 100`), 25 is a safe ceiling. If you add more services sharing the same DB, reduce this.

### PostgreSQL Tuning (in docker-compose.prod.yml)

The production compose already passes tuned PostgreSQL flags for a 512 MB container:

```yaml
command: >
  postgres
  -c shared_buffers=128MB
  -c effective_cache_size=384MB
  -c work_mem=4MB
  -c maintenance_work_mem=32MB
  -c max_connections=50
```

If you upgrade to a server with more RAM:

| Server RAM | `shared_buffers` | `effective_cache_size` | `max_connections` |
|------------|------------------|------------------------|-------------------|
| 1 GB       | 256 MB           | 768 MB                 | 100               |
| 2 GB       | 512 MB           | 1.5 GB                 | 150               |
| 4 GB       | 1 GB             | 3 GB                   | 200               |

### Migration System

Migrations are in `backend/database/migrations/` as numbered SQL pairs:

```
000001_init.up.sql / 000001_init.down.sql
000002_refresh_tokens.up.sql / ...
...
000008_multi_assignees.up.sql / ...
```

**How they run:** On startup, `golang-migrate` compares the `schema_migrations` table in the DB against the files in the directory. Any unapplied `up.sql` files run in order.

**To roll back a migration manually:**
```bash
docker compose -f docker-compose.prod.yml exec backend \
  /app/server -migrate-down 1
```
*(Only if you've wired a `-migrate-down` flag — otherwise do it manually via psql using the `.down.sql` content)*

**To run migrations manually without starting the server:**
```bash
# Install migrate CLI locally
go install -tags 'postgres' github.com/golang-migrate/migrate/v4/cmd/migrate@latest

# Run against production DB (via SSH tunnel or direct)
migrate -path ./backend/database/migrations \
  -database "postgres://kanban:password@localhost:5432/kanban?sslmode=disable" up
```

### Adding Seed Data

For initial data (like default roles), put it in a migration file:

```sql
-- 000009_seed_default_data.up.sql
INSERT INTO roles (name) VALUES ('admin'), ('manager'), ('organiser'), ('employee'), ('view_only')
  ON CONFLICT (name) DO NOTHING;
```

For development-only test data, keep it separate and never run it in production:
```bash
# dev-seed.sql — run manually in dev only
psql -U kanban -d kanban < dev-seed.sql
```

### Useful Database Queries

```sql
-- Check unread notification counts per user
SELECT u.email, count(n.id) as unread
FROM users u
LEFT JOIN notifications n ON n.user_id = u.id AND n.is_read = false
GROUP BY u.email ORDER BY unread DESC;

-- Check product counts by status
SELECT status, count(*) FROM products WHERE deleted_at IS NULL GROUP BY status;

-- Find large notifications (cleanup candidates)
SELECT count(*), pg_size_pretty(pg_total_relation_size('notifications'))
FROM notifications;

-- Check active WebSocket sessions (if using pg_stat_activity)
SELECT pid, usename, application_name, state, query_start
FROM pg_stat_activity
WHERE state = 'active';

-- Manual purge old notifications (backend does this automatically)
DELETE FROM notifications WHERE created_at < NOW() - INTERVAL '90 days';
```

---

## 7. Environment Variables Reference

All values go in the `.env` file at the project root. Docker Compose reads this file automatically.

| Variable | Required | Description | Example |
|----------|----------|-------------|---------|
| `DOMAIN` | Yes | Your public domain | `app.yourdomain.com` |
| `ACME_EMAIL` | Yes | Email for Let's Encrypt TLS cert renewal | `you@yourdomain.com` |
| `POSTGRES_DB` | Yes | Database name | `kanban` |
| `POSTGRES_USER` | Yes | Database user | `kanban` |
| `POSTGRES_PASSWORD` | Yes | Database password (use strong value) | `s3cr3t!` |
| `JWT_SECRET` | Yes | JWT signing key — keep secret, never change after launch | 64-char random string |
| `CORS_ORIGINS` | Yes | Allowed browser origins (comma-separated) | `https://app.yourdomain.com` |
| `LOG_FORMAT` | No | `json` for production, omit for human-readable dev | `json` |
| `R2_BUCKET` | Yes | Cloudflare R2 bucket name | `kanban-uploads` |
| `R2_ACCOUNT_ID` | Yes | Cloudflare account ID | `abc123...` |
| `R2_ACCESS_KEY` | Yes | R2 access key ID | `...` |
| `R2_SECRET_KEY` | Yes | R2 secret access key | `...` |
| `R2_ENDPOINT` | No | Custom R2 endpoint (auto-generated if blank) | Leave blank |
| `EXPO_ACCESS_TOKEN` | No | Expo push token for higher rate limits | Optional |

**Mobile app** (in `mobile-main/.env`):

| Variable | Description |
|----------|-------------|
| `EXPO_PUBLIC_API_BASE_URL` | Backend URL: `https://app.yourdomain.com/api` |
| `EXPO_PUBLIC_PUSH_SERVICE_URL` | Push service URL: `https://app.yourdomain.com/push-api` |

---

## 8. Mobile App Release

### Building for Production

The mobile app uses **Expo** (EAS Build is recommended for production builds):

```bash
cd mobile-main

# Install EAS CLI
npm install -g eas-cli
eas login

# First time: configure the project
eas build:configure

# Build Android APK / AAB for Play Store
eas build --platform android --profile production

# Build iOS IPA for App Store
eas build --platform ios --profile production
```

### OTA Updates (without store review)

For JS-only changes (no native code changes), use Expo Updates:

```bash
eas update --branch production --message "Fix delivery date picker"
```

Users get the update on next app launch — no store submission needed.

### Before Every Release

1. Bump the version in `mobile-main/app.json`:
   ```json
   "version": "1.2.0",
   "android": { "versionCode": 12 }
   ```

2. Set `EXPO_PUBLIC_API_BASE_URL` to production URL in `.env`

3. Build using EAS and download the artifact

4. Test on a real device before submitting to stores

### Push Notification Setup

Push notifications require:
1. **Android:** `google-services.json` already in the project root — ensure it matches your Firebase project
2. **iOS:** Apple Push Notification service (APNs) credentials configured in EAS
3. The push service running at `EXPO_PUBLIC_PUSH_SERVICE_URL` on the server
4. Device registers its Expo push token on login via `POST /push/register`
