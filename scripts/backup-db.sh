#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# backup-db.sh  –  Stream PostgreSQL backup → gzip → R2 (no local disk used)
# Requires: docker, rclone (configured as "r2" remote)
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

# ── Config ───────────────────────────────────────────────────────────────────
CONTAINER="kanban-postgres"
DB_USER="${POSTGRES_USER:-kanban}"
DB_NAME="${POSTGRES_DB:-kanban}"
KEEP_DAYS=7

R2_REMOTE="r2"
R2_BUCKET="${R2_BUCKET:-santosh-test}"
R2_PREFIX="db-backups"

# ── Filename ──────────────────────────────────────────────────────────────────
TIMESTAMP="$(date -u +%Y%m%dT%H%M%SZ)"
FILENAME="kanban_${TIMESTAMP}.sql.gz"
REMOTE_PATH="${R2_REMOTE}:${R2_BUCKET}/${R2_PREFIX}/${FILENAME}"

echo "[$(date -u +%FT%TZ)] Starting backup → ${REMOTE_PATH}"

# ── Stream directly to R2 — zero local disk usage ────────────────────────────
docker exec "$CONTAINER" \
  pg_dump -U "$DB_USER" --no-password "$DB_NAME" \
  | gzip -6 \
  | rclone rcat "$REMOTE_PATH" \
      --s3-upload-cutoff 5M \
      --buffer-size 8M \
      --retries 3 \
      --low-level-retries 5

echo "[$(date -u +%FT%TZ)] Upload complete → ${REMOTE_PATH}"

# ── Prune R2 backups older than KEEP_DAYS ────────────────────────────────────
rclone delete "${R2_REMOTE}:${R2_BUCKET}/${R2_PREFIX}" \
  --min-age "${KEEP_DAYS}d" \
  --include "kanban_*.sql.gz"

echo "[$(date -u +%FT%TZ)] Pruned backups older than ${KEEP_DAYS} days. Done."
