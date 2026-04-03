#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# setup-backup-cron.sh  –  One-time setup: configure rclone R2 + install cron
# Run as root (or with sudo) on the Ubuntu VPS
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKUP_SCRIPT="${SCRIPT_DIR}/backup-db.sh"
LOG_FILE="/var/log/kanban-backup.log"
CRON_SCHEDULE="0 2 * * *"   # 2:00 AM UTC daily

# ── R2 credentials (edit these or export them before running) ─────────────────
R2_ACCOUNT_ID="${R2_ACCOUNT_ID:-7fef758b83150d68cbd0628094f31716}"
R2_ACCESS_KEY="${R2_ACCESS_KEY:-fa9e4eb788b8172edf423bf0710f461a}"
R2_SECRET_KEY="${R2_SECRET_KEY:-e3b8fa3261196f5a45b267e62c6ea01f8f618df7df445f4a0c6facee7e1b4f10}"
R2_BUCKET="${R2_BUCKET:-santosh-test}"

# ── 1. Install rclone if missing ──────────────────────────────────────────────
if ! command -v rclone &>/dev/null; then
  echo "Installing rclone..."
  curl -fsSL https://rclone.org/install.sh | bash
fi
echo "rclone: $(rclone --version | head -1)"

# ── 2. Configure rclone R2 remote ─────────────────────────────────────────────
RCLONE_CONF_DIR="/root/.config/rclone"
mkdir -p "$RCLONE_CONF_DIR"

cat > "${RCLONE_CONF_DIR}/rclone.conf" <<EOF
[r2]
type = s3
provider = Cloudflare
access_key_id = ${R2_ACCESS_KEY}
secret_access_key = ${R2_SECRET_KEY}
endpoint = https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com
acl = private
no_check_bucket = false
EOF

echo "rclone R2 remote configured."

# ── 3. Test R2 connectivity ───────────────────────────────────────────────────
if rclone lsd "r2:${R2_BUCKET}" &>/dev/null; then
  echo "R2 connection OK — bucket '${R2_BUCKET}' is accessible."
else
  echo "WARNING: Could not connect to R2 bucket '${R2_BUCKET}'. Check credentials."
  echo "         You can test manually: rclone lsd r2:${R2_BUCKET}"
fi

# ── 4. Make backup script executable ─────────────────────────────────────────
chmod +x "$BACKUP_SCRIPT"

# ── 5. Install cron job ───────────────────────────────────────────────────────
# Write to /etc/cron.d for system-level cron (root), includes PATH with docker
CRON_FILE="/etc/cron.d/kanban-db-backup"

cat > "$CRON_FILE" <<EOF
# Kanban DB backup — daily at 2:00 AM UTC
PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin

POSTGRES_USER=kanban
POSTGRES_DB=kanban
R2_BUCKET=${R2_BUCKET}

${CRON_SCHEDULE} root ${BACKUP_SCRIPT} >> ${LOG_FILE} 2>&1
EOF

chmod 644 "$CRON_FILE"
echo "Cron job installed at: ${CRON_FILE}"
echo "Schedule: ${CRON_SCHEDULE} (daily 2:00 AM UTC)"

# ── 6. Create log file ────────────────────────────────────────────────────────
touch "$LOG_FILE"
chmod 640 "$LOG_FILE"

echo ""
echo "Setup complete. To run a manual backup now:"
echo "  sudo ${BACKUP_SCRIPT}"
echo ""
echo "To watch logs:"
echo "  tail -f ${LOG_FILE}"
