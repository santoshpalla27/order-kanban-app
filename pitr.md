pgBackRest + S3 + PITR — Complete Guide for Your App
What pgBackRest Does vs Raw WAL Archiving
Raw archive_command (cp/aws s3 cp) pgBackRest
Base backup pg_basebackup manually pgbackrest --stanza=kanban backup
WAL archiving One file at a time Batched, parallel, compressed
S3 upload You write the script Built-in, native
Encryption You handle it Built-in AES-256-CBC
Restore Manual WAL replay setup One command
Backup verification None pgbackrest --stanza=kanban check
Retention You write cleanup cron Built-in policy
Backup types Full only Full + Differential + Incremental
pgBackRest handles everything — WAL archiving, S3 upload, compression, encryption, retention, and restore — in one tool.

Architecture for Your Setup
Your Postgres runs in Docker with a named volume postgres-data. pgBackRest runs as a sidecar container that shares the same volume, talks to S3, and executes backup/restore commands.

┌─────────────────────────────────┐
│ Docker Host │
│ │
│ ┌──────────────┐ │
│ │ postgres │ │
│ │ container │ │
│ │ │ │
│ │ WAL files ──┼──► pgbackrest │
│ └──────────────┘ sidecar │
│ │ │ │
│ postgres-data S3 Bucket │
│ (volume) ◄──────────── │
└─────────────────────────────────┘
Step 1 — Changes to docker-compose.yml
You need to add 3 things:

1. WAL archiving flags to your postgres command
2. A pgbackrest config file volume
3. A pgbackrest sidecar container

postgres:
image: postgres:16-alpine
container_name: kanban-postgres
restart: unless-stopped
command: - postgres - -c - shared_buffers=128MB - -c - effective_cache_size=256MB - -c - work_mem=2MB - -c - maintenance_work_mem=32MB - -c - max_connections=50 - -c - wal_buffers=8MB - -c - checkpoint_completion_target=0.9 - -c - random_page_cost=1.1 # ── ADD THESE for WAL archiving ── - -c - wal_level=replica - -c - archive_mode=on - -c - archive_command=pgbackrest --stanza=kanban archive-push %p - -c - archive_timeout=60
environment: - POSTGRES_DB=${POSTGRES_DB:-kanban}
    - POSTGRES_USER=${POSTGRES_USER:-kanban} - POSTGRES_PASSWORD=${POSTGRES_PASSWORD}
volumes: - postgres-data:/var/lib/postgresql/data - pgbackrest-config:/etc/pgbackrest # shared config - pgbackrest-spool:/var/spool/pgbackrest # spool dir
networks: - kanban-net

# ... rest stays the same

# ── ADD this new service ──

pgbackrest:
image: pgbackrest/pgbackrest:2.54
container_name: kanban-pgbackrest
restart: unless-stopped
environment: - PGBACKREST_STANZA=kanban - PGBACKREST_REPO1_TYPE=s3 - PGBACKREST_REPO1_S3_BUCKET=${BACKUP_S3_BUCKET}
    - PGBACKREST_REPO1_S3_REGION=${BACKUP_S3_REGION} - PGBACKREST_REPO1_S3_KEY=${BACKUP_S3_KEY}
    - PGBACKREST_REPO1_S3_KEY_SECRET=${BACKUP_S3_SECRET} - PGBACKREST_REPO1_S3_ENDPOINT=s3.amazonaws.com - PGBACKREST_REPO1_CIPHER_TYPE=aes-256-cbc - PGBACKREST_REPO1_CIPHER_PASS=${BACKUP_ENCRYPTION_PASS}
    - PGBACKREST_REPO1_RETENTION_FULL=4          # keep 4 full backups (~1 month)
    - PGBACKREST_REPO1_RETENTION_DIFF=6          # keep 6 differential backups
    - PGBACKREST_LOG_LEVEL_CONSOLE=info
    - PGHOST=postgres
    - PGPORT=5432
    - PGUSER=${POSTGRES_USER:-kanban} - PGPASSWORD=${POSTGRES_PASSWORD}
    - PGDATABASE=${POSTGRES_DB:-kanban}
volumes: - postgres-data:/var/lib/postgresql/data:ro # read-only access to PG data - pgbackrest-config:/etc/pgbackrest - pgbackrest-spool:/var/spool/pgbackrest
networks: - kanban-net
depends_on:
postgres:
condition: service_healthy
deploy:
resources:
limits:
memory: 128M
cpus: "0.25"

volumes:
postgres-data:
letsencrypt-data:
pgbackrest-config: # ADD
pgbackrest-spool: # ADD
Step 2 — New .env Variables to Add

# Backup S3 bucket (separate from R2 — use real AWS S3 for backups)

BACKUP_S3_BUCKET=your-kanban-backups
BACKUP_S3_REGION=us-east-1
BACKUP_S3_KEY=AKIAIOSFODNN7EXAMPLE
BACKUP_S3_SECRET=wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY

# Encryption passphrase — keep this somewhere safe (password manager)

BACKUP_ENCRYPTION_PASS=very-long-random-string-at-least-32-chars
Why separate S3 from R2? Cloudflare R2 is S3-compatible but pgBackRest works most reliably with real AWS S3 for backups. You could use R2 by setting PGBACKREST_REPO1_S3_ENDPOINT=<your-account-id>.r2.cloudflarestorage.com — it works but AWS S3 is more battle-tested for this.

Step 3 — One-Time Setup (Run After First Deploy)

# 1. Create the stanza (initializes pgBackRest metadata in S3)

docker exec kanban-pgbackrest pgbackrest --stanza=kanban stanza-create

# 2. Verify everything is connected and working

docker exec kanban-pgbackrest pgbackrest --stanza=kanban check

# 3. Take the FIRST full backup (required before PITR works)

docker exec kanban-pgbackrest pgbackrest --stanza=kanban backup --type=full
After stanza-create, pgBackRest creates a folder structure in your S3 bucket:

s3://your-kanban-backups/
kanban/
archive/ ← WAL segments land here automatically
backup/
20260413-020000F/ ← full backup folder
Step 4 — Scheduled Backups (Cron on the Host)

# Edit host crontab

crontab -e

# Full backup every Sunday at 2 AM

0 2 \* \* 0 docker exec kanban-pgbackrest pgbackrest --stanza=kanban backup --type=full

# Differential backup Mon-Sat at 2 AM (only changes since last full)

0 2 \* \* 1-6 docker exec kanban-pgbackrest pgbackrest --stanza=kanban backup --type=diff

# WAL archiving happens automatically every 60s via archive_timeout

# No cron needed for WAL — postgres handles it

Backup types explained:

Full — complete copy of the entire database. Slowest, largest.
Differential — only changes since the last full backup. Fast.
Incremental — only changes since the last backup of any type. Fastest, smallest.
WAL — continuous stream of every single change. Enables PITR between backups.

Week timeline:
Sun Mon Tue Wed Thu Fri Sat Sun
[FULL] [DIFF] [DIFF] [DIFF] [DIFF] [DIFF] [DIFF] [FULL]
↑ ↑ ↑ ↑
WAL continuously fills the gaps between these
Step 5 — Verify Backups Are Working

# List all backups and their status

docker exec kanban-pgbackrest pgbackrest --stanza=kanban info
Output looks like:

stanza: kanban
status: ok
cipher: aes-256-cbc

    db (current)
        wal archive min/max (16): 000000010000000000000001/000000010000000000000045

        full backup: 20260413-020000F
            timestamp start/stop: 2026-04-13 02:00:00+00 / 2026-04-13 02:01:23+00
            wal start/stop: 000000010000000000000001 / 000000010000000000000002
            database size: 45.6MB, database backup size: 45.6MB
            repo1: backup size: 8.2MB (compressed+encrypted)

        diff backup: 20260414-020000D
            timestamp start/stop: 2026-04-14 02:00:00+00 / 2026-04-14 02:00:45+00
            wal start/stop: 000000010000000000000040 / 000000010000000000000041
            database size: 46.1MB, database backup size: 512KB

How to Restore — Full Restore (No Time Target)
Use this when the server dies completely, data is corrupted, or you want to restore to the latest backup.

# 1. Stop backend and push-service (so nothing writes to DB)

docker compose stop backend push-service

# 2. Stop postgres

docker compose stop postgres

# 3. Clear the postgres data volume

docker run --rm -v postgres-data:/data alpine sh -c "rm -rf /data/\*"

# 4. Run restore (fetches latest backup from S3)

docker exec kanban-pgbackrest pgbackrest --stanza=kanban restore

# 5. Start postgres back up

docker compose start postgres

# 6. Start everything

docker compose start backend push-service
Postgres will automatically replay WAL from the backup point to the latest archived WAL when it starts — this is built in.

How to Restore to a Specific Point in Time (PITR)
Use this when someone accidentally deleted all orders at 3:47 PM and you want to go back to 3:46 PM.

# 1. Find what time the accident happened — check your app logs

docker logs kanban-backend --since=2h | grep -i "delete"

# 2. Stop app containers

docker compose stop backend push-service

# 3. Stop postgres

docker compose stop postgres

# 4. Clear postgres data volume

docker run --rm -v postgres-data:/data alpine sh -c "rm -rf /data/\*"

# 5. Restore to 1 minute BEFORE the accident

docker exec kanban-pgbackrest pgbackrest --stanza=kanban restore \
 --target="2026-04-13 15:46:00+00" \
 --target-action=promote \
 --type=time

# 6. Start postgres — it will replay WAL and stop at 15:46:00

docker compose start postgres

# 7. Verify the data looks right

docker exec kanban-postgres psql -U kanban -d kanban -c "SELECT COUNT(\*) FROM orders;"

# 8. If it looks good, start the app

docker compose start backend push-service
--target-action=promote tells Postgres: "when you reach the target time, stop replaying WAL and open the DB for normal read/write." Without this, it would stay in read-only recovery mode.

How to Restore a Specific Backup (Not Latest)

# 1. List available backups to find the one you want

docker exec kanban-pgbackrest pgbackrest --stanza=kanban info

# 2. Restore from a specific backup set

docker exec kanban-pgbackrest pgbackrest --stanza=kanban restore \
 --set=20260410-020000F # the backup label from `info` output
PITR Window — What You Can Recover

Apr 10 2 AM Apr 11 2 AM Apr 12 2 AM Apr 13 NOW
[FULL backup] ─── [DIFF backup] ─── [DIFF backup] ─── ongoing WAL
↑********************\_********************↑
You can restore to ANY second in this entire range
Your PITR window = age of oldest full backup you're retaining. With RETENTION_FULL=4 weekly backups = 4 weeks of PITR window.

Monitoring — Know If Backups Are Failing
Add this to your host crontab to alert you if the last backup is older than 25 hours:

# Check backup freshness daily at 8 AM — sends output to syslog if failed

0 8 \* \* \* docker exec kanban-pgbackrest pgbackrest --stanza=kanban check 2>&1 | grep -i "error" && echo "BACKUP CHECK FAILED" | logger -t pgbackrest
Or check the exit code and send a notification to wherever you monitor:

#!/bin/bash

# /opt/scripts/check-backup.sh

if ! docker exec kanban-pgbackrest pgbackrest --stanza=kanban check > /dev/null 2>&1; then
curl -X POST https://your-slack-webhook \
 -d '{"text":"⚠️ pgBackRest check FAILED — kanban backup may be broken"}'
fi
Summary of What Changes in Your Repo
What Where Change
docker-compose.yml postgres command: Add 4 WAL flags
docker-compose.yml postgres volumes: Add 2 shared volumes
docker-compose.yml new service Add pgbackrest sidecar
docker-compose.yml volumes: block Add pgbackrest-config + pgbackrest-spool
.env new vars 5 new backup S3 + encryption vars
Host crontab new entries Weekly full + daily diff schedule
Your app code (Go backend, frontend) changes nothing — this is entirely infrastructure-level.
