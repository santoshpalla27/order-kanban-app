copy to opt/kanban/scripts/

export R2_ACCOUNT_ID=
export R2_ACCESS_KEY=
export R2_SECRET_KEY=
export R2_BUCKET=santosh-test
export POSTGRES_USER=kanban
export POSTGRES_DB=kanban

sudo -E bash /opt/kanban/scripts/setup-backup-cron.sh

To verify cron is installed:

cat /etc/cron.d/kanban-db-backup
To test the backup manually right now:

sudo bash /opt/kanban/scripts/backup-db.sh
tail -f /var/log/kanban-backup.log
