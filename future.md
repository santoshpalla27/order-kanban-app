# Production Guide — Order Kanban App

> Comprehensive reference for database backup, safe feature development, deployment, and long-term maintenance.

---

## Table of Contents

1. [Current Infrastructure Overview](#1-current-infrastructure-overview)
2. [Database Backup Strategy](#2-database-backup-strategy)
3. [File Storage (R2) Backup](#3-file-storage-r2-backup)
4. [Adding New Features Safely](#4-adding-new-features-safely)
5. [Removing Features Safely](#5-removing-features-safely)
6. [Database Migrations — The Right Way](#6-database-migrations--the-right-way)
7. [CI/CD Pipeline Setup](#7-cicd-pipeline-setup)
8. [Deployment Checklist](#8-deployment-checklist)
9. [Monitoring & Alerting](#9-monitoring--alerting)
10. [Rollback Strategy](#10-rollback-strategy)
11. [Security Hardening](#11-security-hardening)
12. [Scaling Guide](#12-scaling-guide)

---

## 1. Current Infrastructure Overview

```
┌─────────────────────────────────────────────────────────────┐
│                     2 GB VPS Server                         │
│                                                             │
│  ┌─────────┐   ┌──────────┐   ┌──────────┐   ┌──────────┐  │
│  │ Traefik  │──▶│ Frontend │   │ Backend  │   │   Push   │  │
│  │  (64MB)  │   │  (32MB)  │   │ (128MB)  │   │ Service  │  │
│  │  :80/443 │   │  Nginx   │   │  Go/Gin  │   │  Node.js │  │
│  └─────────┘   └──────────┘   └──────────┘   └──────────┘  │
│       │                            │               │        │
│       │                            ▼               │        │
│       │                     ┌──────────┐           │        │
│       │                     │ Postgres │◀──────────┘        │
│       │                     │  (512MB) │                    │
│       │                     │  16-alp  │                    │
│       │                     └──────────┘                    │
│       │                            │                        │
│       │                     postgres_data (Docker volume)   │
│       │                                                     │
│  External:  Cloudflare R2 (file attachments)                │
│  SSL:       Let's Encrypt via Traefik ACME                  │
└─────────────────────────────────────────────────────────────┘
```

| Component | Image | Memory Limit | Details |
|-----------|-------|-------------|---------|
| Traefik | `traefik:v3.6.10` | 64 MB | Reverse proxy, SSL termination |
| PostgreSQL | `postgres:16-alpine` | 512 MB | `shared_buffers=128MB`, `max_connections=50` |
| Backend | `santoshpalla27/gift-highway:backend` | 128 MB | Go 1.24, distroless, `MaxOpenConns=25` |
| Frontend | `santoshpalla27/gift-highway:frontend` | 32 MB | Vite + React, served by Nginx |
| Push Service | `kanban-push-service` | — | Node.js, Expo push notifications |

**Database:** PostgreSQL 16 with Docker named volume `postgres-data`  
**File Storage:** Cloudflare R2 (S3-compatible)  
**Migrations:** 8 sequential SQL files embedded in Go binary via `golang-migrate`  
**Domain:** `app.santoshdevops.cloud`

---

## 2. Database Backup Strategy

### 2.1 Option A — Automated Daily Backups with `pg_dump` (Recommended)

Create a backup script on your server:

```bash
#!/bin/bash
# /root/scripts/backup-db.sh

set -euo pipefail

# ── Config ─────────────────────────────────────────────
BACKUP_DIR="/root/backups/postgres"
RETENTION_DAYS=30
CONTAINER="kanban-postgres"
DB_NAME="${POSTGRES_DB:-kanban}"
DB_USER="${POSTGRES_USER:-kanban}"
TIMESTAMP=$(date +"%Y-%m-%d_%H-%M-%S")
BACKUP_FILE="${BACKUP_DIR}/${DB_NAME}_${TIMESTAMP}.sql.gz"

# ── Create dir ─────────────────────────────────────────
mkdir -p "$BACKUP_DIR"

# ── Dump & compress ───────────────────────────────────
docker exec "$CONTAINER" pg_dump \
  -U "$DB_USER" \
  -d "$DB_NAME" \
  --no-owner \
  --no-privileges \
  --clean \
  --if-exists \
  | gzip > "$BACKUP_FILE"

# ── Verify ─────────────────────────────────────────────
if [ -s "$BACKUP_FILE" ]; then
  SIZE=$(du -h "$BACKUP_FILE" | cut -f1)
  echo "[OK] Backup created: $BACKUP_FILE ($SIZE)"
else
  echo "[FAIL] Backup is empty!" >&2
  rm -f "$BACKUP_FILE"
  exit 1
fi

# ── Cleanup old backups ───────────────────────────────
find "$BACKUP_DIR" -name "*.sql.gz" -mtime +$RETENTION_DAYS -delete
echo "[OK] Cleaned backups older than ${RETENTION_DAYS} days"
```

**Make it executable and schedule via cron:**

```bash
chmod +x /root/scripts/backup-db.sh

# Run daily at 2:00 AM
crontab -e
# Add:
0 2 * * * /root/scripts/backup-db.sh >> /root/backups/backup.log 2>&1
```

### 2.2 Option B — Off-site Backups to Cloudflare R2

Since you already use R2 for attachments, reuse it for database backups:

```bash
#!/bin/bash
# /root/scripts/backup-db-r2.sh
# Requires: rclone configured with R2

set -euo pipefail

CONTAINER="kanban-postgres"
DB_NAME="${POSTGRES_DB:-kanban}"
DB_USER="${POSTGRES_USER:-kanban}"
TIMESTAMP=$(date +"%Y-%m-%d_%H-%M-%S")
BACKUP_FILE="/tmp/${DB_NAME}_${TIMESTAMP}.sql.gz"

# Dump
docker exec "$CONTAINER" pg_dump -U "$DB_USER" -d "$DB_NAME" --clean --if-exists | gzip > "$BACKUP_FILE"

# Upload to R2
rclone copy "$BACKUP_FILE" r2:your-backup-bucket/postgres/

# Remove local temp file
rm -f "$BACKUP_FILE"

# Prune old R2 backups (keep 60 days)
rclone delete r2:your-backup-bucket/postgres/ --min-age 60d

echo "[OK] Backup uploaded to R2: ${DB_NAME}_${TIMESTAMP}.sql.gz"
```

**Set up rclone for R2:**

```bash
# Install rclone
curl https://rclone.org/install.sh | sudo bash

# Configure
rclone config
# Name: r2
# Type: s3
# Provider: Cloudflare
# access_key_id: (your R2 access key)
# secret_access_key: (your R2 secret key)
# endpoint: https://<account_id>.r2.cloudflarestorage.com
```

### 2.3 Option C — Docker Volume Snapshot (Quick but Basic)

```bash
# Stop containers, snapshot volume, restart
docker compose -f docker-compose.prod.yml stop postgres
docker run --rm -v postgres-data:/data -v /root/backups:/backup alpine \
  tar czf /backup/postgres-volume-$(date +%Y%m%d).tar.gz -C /data .
docker compose -f docker-compose.prod.yml start postgres
```

### 2.4 Restoring from Backup

```bash
# From pg_dump backup (Option A/B):
gunzip < /root/backups/postgres/kanban_2026-03-23.sql.gz | \
  docker exec -i kanban-postgres psql -U kanban -d kanban

# From volume snapshot (Option C):
docker compose -f docker-compose.prod.yml stop postgres
docker run --rm -v postgres-data:/data -v /root/backups:/backup alpine \
  sh -c "rm -rf /data/* && tar xzf /backup/postgres-volume-20260323.tar.gz -C /data"
docker compose -f docker-compose.prod.yml start postgres
```

### 2.5 Backup Schedule Recommendation

| Frequency | Type | Retention | Location |
|-----------|------|-----------|----------|
| **Every 6 hours** | `pg_dump` compressed | 7 days | Local server |
| **Daily** | `pg_dump` compressed | 30 days | Cloudflare R2 |
| **Weekly** | Full volume snapshot | 60 days | Cloudflare R2 |
| **Before every deploy** | Manual `pg_dump` | Keep forever | R2 / local |

---

## 3. File Storage (R2) Backup

Cloudflare R2 is already durable (11-nines). For extra safety:

```bash
# Sync R2 bucket to a local mirror or another cloud
rclone sync r2:your-bucket /root/backups/r2-mirror/ --progress

# Or cross-backup to another R2 bucket
rclone sync r2:your-bucket r2:your-backup-bucket --progress
```

---

## 4. Adding New Features Safely

### 4.1 Feature Development Workflow

```
 ┌──────────┐    ┌──────────┐    ┌──────────┐    ┌──────────┐    ┌──────────┐
 │  Branch  │───▶│  Develop │───▶│   Test   │───▶│  Review  │───▶│  Deploy  │
 │ feature/ │    │  + Write │    │  E2E +   │    │  PR +    │    │  Prod    │
 │ xyz      │    │  Migrate │    │  Manual  │    │  Merge   │    │          │
 └──────────┘    └──────────┘    └──────────┘    └──────────┘    └──────────┘
```

### 4.2 Step-by-Step: Adding a New Feature

**Example: Adding an "Invoice" feature**

#### Step 1 — Branch

```bash
git checkout main
git pull origin main
git checkout -b feature/invoices
```

#### Step 2 — Database Migration (if needed)

```bash
# Create new migration files in backend/database/migrations/
# Use the next sequential number (currently at 000008)

# 000009_invoices.up.sql
cat > backend/database/migrations/000009_invoices.up.sql << 'EOF'
CREATE TABLE IF NOT EXISTS invoices (
    id            SERIAL PRIMARY KEY,
    product_id    INTEGER NOT NULL REFERENCES products(id),
    invoice_no    VARCHAR(50) NOT NULL UNIQUE,
    amount        DECIMAL(10,2) NOT NULL,
    status        VARCHAR(20) NOT NULL DEFAULT 'draft',
    created_by    INTEGER NOT NULL REFERENCES users(id),
    created_at    TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at    TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_invoices_product ON invoices(product_id);
CREATE INDEX IF NOT EXISTS idx_invoices_status ON invoices(status);
EOF

# 000009_invoices.down.sql (ALWAYS write reversals)
cat > backend/database/migrations/000009_invoices.down.sql << 'EOF'
DROP TABLE IF EXISTS invoices;
EOF
```

> **CRITICAL:** Always create both `.up.sql` and `.down.sql`. Migrations run automatically when the backend starts.

#### Step 3 — Backend (Go)

```
backend/
├── internal/
│   ├── models/invoice.go        ← GORM model
│   ├── services/invoice_service.go  ← Business logic
│   └── api/router.go            ← Add routes
```

1. Create the model in `internal/models/invoice.go`
2. Create the service in `internal/services/invoice_service.go`
3. Register routes in `internal/api/router.go`:
   ```go
   invoices := api.Group("/invoices")
   invoices.GET("/:product_id", invoiceService.GetByProduct)
   invoices.POST("/", invoiceService.Create)
   ```

#### Step 4 — Frontend (React)

```
frontend/src/
├── api/client.ts               ← Add invoicesApi
├── types/index.ts              ← Add Invoice type
├── pages/invoices/
│   └── InvoicePage.tsx          ← New page
├── components/
│   └── InvoiceModal.tsx         ← New component
└── App.tsx                      ← Add route
```

1. Add API functions in `api/client.ts`
2. Add TypeScript types in `types/index.ts`
3. Create page component
4. Add route in `App.tsx`:
   ```tsx
   <Route path="/invoices" element={<InvoicePage />} />
   ```
5. Add sidebar link in `Layout.tsx`

#### Step 5 — Mobile (React Native) — if applicable

```
mobile-main/src/
├── api/client.ts               ← Add invoicesApi
├── screens/InvoiceScreen.tsx    ← New screen
└── navigation/                 ← Add to navigator
```

#### Step 6 — Write E2E Tests

```bash
# Create test file
cat > tests/e2e/specs/invoices.spec.ts << 'EOF'
import { test, expect } from '@playwright/test';
// ... test the Invoice page
EOF
```

#### Step 7 — Test Locally

```bash
# Backend
cd backend && go run cmd/main.go

# Frontend
cd frontend && npm run dev

# E2E tests
cd tests/e2e && npx playwright test specs/invoices.spec.ts
```

#### Step 8 — Deploy

```bash
git add . && git commit -m "feat: add invoice feature"
git push origin feature/invoices
# Create PR → Merge → Deploy (see Section 8)
```

### 4.3 Feature Safety Checklist

Before merging any feature:

- [ ] Migration has both `.up.sql` AND `.down.sql`
- [ ] Migration uses `IF NOT EXISTS` / `IF EXISTS` guards
- [ ] Backend compiles: `cd backend && go build ./...`
- [ ] Frontend builds: `cd frontend && npm run build`
- [ ] Mobile builds: `cd mobile-main && npx expo export`
- [ ] E2E tests pass: `npx playwright test`
- [ ] No hardcoded secrets or URLs
- [ ] Database backup taken before deploying
- [ ] Feature flag / environment variable for gradual rollout (optional)

---

## 5. Removing Features Safely

### 5.1 Step-by-Step

1. **Remove the UI first** — Delete frontend routes, sidebar links, and page components
2. **Remove API routes** — Delete handler registrations in `router.go`
3. **Remove backend services** — Delete service and model files
4. **Migration to drop tables** — Create a new migration (do NOT delete old migration files)
5. **Clean up types** — Remove from `types/index.ts` and `api/client.ts`
6. **Delete E2E tests** — Remove the corresponding spec file

### 5.2 Migration for Removal

```sql
-- 000010_drop_invoices.up.sql
DROP TABLE IF EXISTS invoices;

-- 000010_drop_invoices.down.sql
-- Recreate the table (copy from 000009_invoices.up.sql)
CREATE TABLE IF NOT EXISTS invoices (...);
```

> **NEVER delete old migration files.** The migration system tracks applied versions. Deleting files causes the runner to crash on fresh databases.

### 5.3 Safe Removal Checklist

- [ ] Take database backup BEFORE running removal migration
- [ ] Test on a staging copy of the database first
- [ ] Verify no other tables reference the dropped table (foreign keys)
- [ ] Remove all frontend references
- [ ] Remove all backend references
- [ ] Remove E2E tests
- [ ] Deploy and verify

---

## 6. Database Migrations — The Right Way

### 6.1 Current Setup

Your app uses **golang-migrate** with SQL files embedded in the Go binary:

```
backend/database/migrations/
├── 000001_initial_schema.up.sql       ← Tables, triggers, indexes
├── 000001_initial_schema.down.sql
├── 000002_refresh_tokens.up.sql
├── 000002_refresh_tokens.down.sql
├── 000003_cascade_user_delete.up.sql
├── 000003_cascade_user_delete.down.sql
├── 000004_product_updated_at.up.sql
├── 000004_product_updated_at.down.sql
├── 000005_workspace_items.up.sql
├── 000005_workspace_items.down.sql
├── 000006_product_delivery_at.up.sql
├── 000006_product_delivery_at.down.sql
├── 000007_product_assigned_to.up.sql
├── 000007_product_assigned_to.down.sql
├── 000008_product_multi_assignees.up.sql
└── 000008_product_multi_assignees.down.sql
```

Migrations run **automatically on startup** in `database.go`. This means deploying new code with new migrations applies them immediately.

### 6.2 Golden Rules

| Rule | Why |
|------|-----|
| Never edit an applied migration | Already ran on prod; changing it does nothing |
| Always write both `.up.sql` and `.down.sql` | Enables safe rollback |
| Use `IF NOT EXISTS` / `IF EXISTS` | Makes migrations idempotent |
| Use sequential numbering: `000009_`, `000010_` | Prevents conflicts |
| Keep migrations small and focused | Easier to debug and reverse |
| Never rename tables directly | Create new → migrate data → drop old |
| Add columns as `NULL` first, then backfill | Avoids locking entire table |
| Test migration on a backup copy first | Catches errors before prod |

### 6.3 Manually Running Migrations

```bash
# Check current migration version
docker exec kanban-postgres psql -U kanban -d kanban -c "SELECT * FROM schema_migrations;"

# Force a specific version (emergency fix)
# Install golang-migrate CLI:
# brew install golang-migrate
migrate -database "postgres://kanban:PASSWORD@localhost:5432/kanban?sslmode=disable" \
  -path backend/database/migrations \
  up      # Apply all pending
  down 1  # Rollback 1 step
  version # Show current version
  force 8 # Force version to 8 (emergency only)
```

---

## 7. CI/CD Pipeline Setup

You currently have **no CI/CD pipeline**. Here's an exact GitHub Actions setup:

### 7.1 Create `.github/workflows/ci.yml`

```yaml
name: CI/CD Pipeline

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

env:
  REGISTRY: docker.io
  BACKEND_IMAGE: santoshpalla27/gift-highway:backend
  FRONTEND_IMAGE: santoshpalla27/gift-highway:frontend

jobs:
  # ── Backend tests & build ────────────────────────────
  backend:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-go@v5
        with:
          go-version: '1.24'
      - name: Build backend
        run: cd backend && go build ./...
      - name: Run tests
        run: cd backend && go test ./... -v

  # ── Frontend lint & build ────────────────────────────
  frontend:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
      - name: Install & build
        run: |
          cd frontend
          npm ci
          npm run build

  # ── E2E tests ────────────────────────────────────────
  e2e:
    runs-on: ubuntu-latest
    needs: [backend, frontend]
    if: github.event_name == 'pull_request'
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
      - name: Install Playwright
        run: |
          cd tests/e2e
          npm ci
          npx playwright install chromium --with-deps
      - name: Run E2E tests
        env:
          E2E_BASE_URL: https://app.santoshdevops.cloud
          E2E_API_URL: https://app.santoshdevops.cloud/api
          ADMIN_EMAIL: admin@gmail.com
          ADMIN_PASSWORD: ${{ secrets.ADMIN_PASSWORD }}
        run: cd tests/e2e && npx playwright test
      - uses: actions/upload-artifact@v4
        if: always()
        with:
          name: playwright-report
          path: tests/e2e/playwright-report/

  # ── Build & push Docker images ──────────────────────
  deploy:
    runs-on: ubuntu-latest
    needs: [backend, frontend]
    if: github.ref == 'refs/heads/main'
    steps:
      - uses: actions/checkout@v4
      - uses: docker/login-action@v3
        with:
          username: ${{ secrets.DOCKER_USERNAME }}
          password: ${{ secrets.DOCKER_TOKEN }}
      - name: Build & push backend
        run: |
          docker build -t ${{ env.BACKEND_IMAGE }} ./backend
          docker push ${{ env.BACKEND_IMAGE }}
      - name: Build & push frontend
        run: |
          docker build \
            --build-arg VITE_API_URL=https://app.santoshdevops.cloud/api \
            -t ${{ env.FRONTEND_IMAGE }} ./frontend
          docker push ${{ env.FRONTEND_IMAGE }}
      - name: Deploy to server
        uses: appleboy/ssh-action@v1
        with:
          host: ${{ secrets.SERVER_HOST }}
          username: ${{ secrets.SERVER_USER }}
          key: ${{ secrets.SERVER_SSH_KEY }}
          script: |
            cd /root/order-kanban-app
            docker compose -f docker-compose.prod.yml pull
            docker compose -f docker-compose.prod.yml up -d
            docker image prune -f
```

### 7.2 Required GitHub Secrets

| Secret | Value |
|--------|-------|
| `DOCKER_USERNAME` | `santoshpalla27` |
| `DOCKER_TOKEN` | Docker Hub access token |
| `SERVER_HOST` | Your server IP |
| `SERVER_USER` | `root` |
| `SERVER_SSH_KEY` | SSH private key for server |
| `ADMIN_PASSWORD` | `admin123` (for E2E tests) |

---

## 8. Deployment Checklist

### Pre-Deployment

```bash
# 1. Take database backup (ALWAYS!)
ssh your-server "/root/scripts/backup-db.sh"

# 2. Pull latest code
git pull origin main

# 3. Build images
docker build -t santoshpalla27/gift-highway:backend ./backend
docker build --build-arg VITE_API_URL=https://app.santoshdevops.cloud/api \
  -t santoshpalla27/gift-highway:frontend ./frontend

# 4. Push images
docker push santoshpalla27/gift-highway:backend
docker push santoshpalla27/gift-highway:frontend
```

### On Server

```bash
# 5. Pull new images
cd /root/order-kanban-app
docker compose -f docker-compose.prod.yml pull

# 6. Rolling restart (zero downtime)
docker compose -f docker-compose.prod.yml up -d --no-deps backend
docker compose -f docker-compose.prod.yml up -d --no-deps frontend

# 7. Verify health
curl -s https://app.santoshdevops.cloud/api/health | jq

# 8. Check logs
docker logs kanban-backend --tail 50
docker logs kanban-frontend --tail 20

# 9. Clean up
docker image prune -f
```

### Post-Deployment

```bash
# 10. Run E2E smoke test
cd tests/e2e
E2E_BASE_URL=https://app.santoshdevops.cloud \
  npx playwright test specs/auth.spec.ts specs/kanbanboard.spec.ts
```

---

## 9. Monitoring & Alerting

### 9.1 Quick Health Monitoring Script

```bash
#!/bin/bash
# /root/scripts/health-check.sh
# Add to cron: */5 * * * * /root/scripts/health-check.sh

URL="https://app.santoshdevops.cloud/api/health"
STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$URL" --max-time 10)

if [ "$STATUS" != "200" ]; then
  echo "[$(date)] ALERT: Health check failed with status $STATUS" >> /root/logs/health.log

  # Auto-restart if down
  cd /root/order-kanban-app
  docker compose -f docker-compose.prod.yml restart backend
fi
```

### 9.2 Disk Space Monitor

```bash
#!/bin/bash
# /root/scripts/disk-check.sh
USAGE=$(df / | tail -1 | awk '{print $5}' | sed 's/%//')
if [ "$USAGE" -gt 85 ]; then
  echo "[$(date)] WARN: Disk usage at ${USAGE}%" >> /root/logs/disk.log
  docker image prune -af
  docker system prune -f
fi
```

### 9.3 Database Size Monitor

```bash
docker exec kanban-postgres psql -U kanban -d kanban -c "
  SELECT pg_size_pretty(pg_database_size('kanban')) as db_size;
  SELECT relname as table, pg_size_pretty(pg_total_relation_size(relid)) as size
  FROM pg_catalog.pg_statio_user_tables ORDER BY pg_total_relation_size(relid) DESC LIMIT 10;
"
```

### 9.4 Log Rotation (Already Configured)

Your prod compose already has log rotation:

```yaml
logging:
  driver: json-file
  options:
    max-size: "20m"  # Backend
    max-file: "5"
```

---

## 10. Rollback Strategy

### 10.1 Quick Rollback (< 5 minutes)

```bash
# If the new deploy breaks something:

# 1. Pull the previous image tag
docker pull santoshpalla27/gift-highway:backend-previous
docker pull santoshpalla27/gift-highway:frontend-previous

# 2. Update compose to use previous tags and restart
docker compose -f docker-compose.prod.yml up -d

# 3. If migration needs reversal:
docker exec kanban-backend migrate -database "$DATABASE_URL" down 1
```

### 10.2 Full Database Rollback

```bash
# 1. Stop all services
docker compose -f docker-compose.prod.yml stop

# 2. Restore from backup
gunzip < /root/backups/postgres/kanban_LATEST.sql.gz | \
  docker exec -i kanban-postgres psql -U kanban -d kanban

# 3. Restart with previous image versions
docker compose -f docker-compose.prod.yml up -d
```

### 10.3 Image Tagging for Rollback

Always tag images with version numbers, not just `latest`:

```bash
VERSION=$(git rev-parse --short HEAD)

docker build -t santoshpalla27/gift-highway:backend-${VERSION} ./backend
docker tag santoshpalla27/gift-highway:backend-${VERSION} santoshpalla27/gift-highway:backend

docker push santoshpalla27/gift-highway:backend-${VERSION}
docker push santoshpalla27/gift-highway:backend
```

---

## 11. Security Hardening

### 11.1 Current Security

| ✅ Already in place | Details |
|---------------------|---------|
| HTTPS (TLS) | Traefik + Let's Encrypt |
| JWT authentication | Stored in httpOnly considerations |
| RBAC (5 roles) | admin, manager, organiser, employee, view_only |
| Rate limiting | Backend middleware |
| Security headers | `security_headers_middleware.go` |
| Body size limits | `body_limit_middleware.go` |
| Distroless image | Minimal attack surface |
| Docker socket read-only | Traefik `docker.sock:ro` |

### 11.2 Recommended Additions

```bash
# 1. Rotate JWT secret every 90 days
openssl rand -hex 32  # Generate new JWT_SECRET

# 2. Rotate database password
openssl rand -hex 16  # Generate new POSTGRES_PASSWORD

# 3. Enable PostgreSQL SSL (when using external DB)
# Add to DATABASE_URL: ?sslmode=require

# 4. Firewall (UFW)
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw allow 22/tcp
sudo ufw enable

# 5. Fail2ban for SSH
sudo apt install fail2ban
sudo systemctl enable fail2ban
```

---

## 12. Scaling Guide

### 12.1 Vertical Scaling (Upgrade Server)

If you move to a 4 GB server, update `docker-compose.prod.yml`:

```yaml
postgres:
  deploy:
    resources:
      limits:
        memory: 1G     # Was 512M
  command:
    - postgres
    - -c
    - shared_buffers=256MB   # Was 128MB
    - -c
    - effective_cache_size=512MB  # Was 256MB
    - -c
    - max_connections=100    # Was 50

backend:
  deploy:
    resources:
      limits:
        memory: 256M   # Was 128M
```

### 12.2 Horizontal Scaling (Multiple Servers)

When you outgrow a single server:

1. **External Database** — Move PostgreSQL to a managed service (Neon, Supabase, AWS RDS)
2. **Multiple backend replicas** — Use Docker Swarm or Kubernetes
3. **CDN for frontend** — Serve static assets from Cloudflare Pages
4. **Redis for sessions** — Add Redis for JWT blacklisting and caching

### 12.3 Database Performance Tuning

```sql
-- Check slow queries (add to PostgreSQL config)
-- In docker-compose command:
- -c
- log_min_duration_statement=500   -- Log queries > 500ms

-- Useful monitoring queries
SELECT * FROM pg_stat_activity WHERE state = 'active';
SELECT * FROM pg_stat_user_tables ORDER BY n_live_tup DESC;
VACUUM ANALYZE;  -- Run periodically
```

---

## Quick Reference Cheat Sheet

```bash
# ── Backup ─────────────────────────────────────────────
/root/scripts/backup-db.sh                    # Manual backup
docker exec kanban-postgres pg_dump -U kanban kanban > dump.sql

# ── Deploy ─────────────────────────────────────────────
docker compose -f docker-compose.prod.yml pull
docker compose -f docker-compose.prod.yml up -d

# ── Logs ───────────────────────────────────────────────
docker logs kanban-backend --tail 100 -f
docker logs kanban-postgres --tail 50

# ── Database shell ─────────────────────────────────────
docker exec -it kanban-postgres psql -U kanban -d kanban

# ── Restart single service ─────────────────────────────
docker compose -f docker-compose.prod.yml restart backend

# ── Check disk / memory ───────────────────────────────
docker stats --no-stream
df -h
free -m
```
