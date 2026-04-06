#!/usr/bin/env bash
# PostgreSQL backup for kanban app (2 GB server, Ubuntu)
# Runs pg_dump inside the existing postgres container — zero extra RAM cost.
# Off-site upload uses rclone (apt install rclone) — no AWS CLI needed.
set -euo pipefail

# ── Config ────────────────────────────────────────────────────────────────────
LOG=/var/log/kanban-backup.log
BACKUP_DIR=/var/backups/kanban
KEEP_DAYS=7
CONTAINER=kanban-postgres

# ── Load .env (get DB creds + R2 creds) ──────────────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ENV_FILE="$SCRIPT_DIR/../.env"
if [ -f "$ENV_FILE" ]; then
  # shellcheck disable=SC1090
  set -a; source "$ENV_FILE"; set +a
fi

POSTGRES_USER="${POSTGRES_USER:-kanban}"
POSTGRES_DB="${POSTGRES_DB:-kanban}"

# ── Helpers ───────────────────────────────────────────────────────────────────
log() { echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] $*" | tee -a "$LOG"; }

# Redirect all unexpected stderr to the log as well
exec 2>> "$LOG"

# ── Start ─────────────────────────────────────────────────────────────────────
mkdir -p "$BACKUP_DIR"
touch "$LOG"

DATE=$(date -u +%Y-%m-%d_%H-%M-%S)
FILENAME="kanban_${DATE}.sql.gz"
DUMP_FILE="$BACKUP_DIR/$FILENAME"

log "Starting backup"

# ── Dump ──────────────────────────────────────────────────────────────────────
# pg_dump runs *inside* the existing kanban-postgres container.
# No extra memory needed on the host; gzip pipe is ~2 MB RSS.
if ! docker exec "$CONTAINER" pg_dump \
      -U "$POSTGRES_USER" \
      -d "$POSTGRES_DB" \
    | gzip -6 > "$DUMP_FILE"; then
  log "ERROR: pg_dump or gzip failed. Removing partial file."
  rm -f "$DUMP_FILE"
  exit 1
fi

SIZE=$(du -h "$DUMP_FILE" | cut -f1)
log "Dump complete: $FILENAME ($SIZE)"

# ── Upload to Cloudflare R2 (optional — requires rclone) ─────────────────────
# Install once on the host:  sudo apt install rclone
# rclone is configured entirely via env vars below — no config file needed.
if command -v rclone &>/dev/null \
   && [ -n "${R2_ACCESS_KEY:-}" ] \
   && [ -n "${R2_SECRET_KEY:-}" ] \
   && [ -n "${R2_ACCOUNT_ID:-}" ] \
   && [ -n "${R2_BUCKET:-}" ]; then

  if RCLONE_CONFIG_R2_TYPE=s3 \
     RCLONE_CONFIG_R2_PROVIDER=Cloudflare \
     RCLONE_CONFIG_R2_ACCESS_KEY_ID="$R2_ACCESS_KEY" \
     RCLONE_CONFIG_R2_SECRET_ACCESS_KEY="$R2_SECRET_KEY" \
     RCLONE_CONFIG_R2_ENDPOINT="https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com" \
     rclone copy "$DUMP_FILE" "r2:${R2_BUCKET}/db-backups/" \
       --no-traverse \
       --log-level ERROR 2>> "$LOG"; then
    log "Uploaded to R2: db-backups/$FILENAME"
  else
    log "WARNING: R2 upload failed — local backup is still intact"
  fi
else
  log "INFO: rclone or R2 creds not found — skipping R2 upload"
fi

# ── Rotate local backups ──────────────────────────────────────────────────────
DELETED=$(find "$BACKUP_DIR" -name "kanban_*.sql.gz" -mtime "+${KEEP_DAYS}" -print -delete | wc -l)
[ "$DELETED" -gt 0 ] && log "Rotated $DELETED backup(s) older than ${KEEP_DAYS} days"

log "Done."
