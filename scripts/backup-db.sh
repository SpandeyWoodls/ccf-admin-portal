#!/bin/bash
# =============================================================================
# CCF Admin Portal - Database Backup Script
# =============================================================================
# Backs up the MySQL database and rotates old backups.
#
# Usage:
#   ./scripts/backup-db.sh production
#   ./scripts/backup-db.sh staging
#
# Cron (production, daily at 1:00 AM):
#   0 1 * * * ~/admin-portal/scripts/backup-db.sh production >> ~/logs/db-backup.log 2>&1
#
# Cron (staging, weekly on Sunday at 2:00 AM):
#   0 2 * * 0 ~/admin-portal/scripts/backup-db.sh staging >> ~/logs/db-backup.log 2>&1
# =============================================================================

set -euo pipefail

ENV="${1:-production}"
BACKUP_DIR="$HOME/backups/db/${ENV}"
RETENTION_DAYS=30
TIMESTAMP=$(date +%Y%m%d_%H%M%S)

# ─── Read database credentials from the appropriate .env ─────────────────────

if [ "$ENV" = "production" ]; then
  ENV_FILE="$HOME/admin-portal/backend/.env"
elif [ "$ENV" = "staging" ]; then
  ENV_FILE="$HOME/admin-portal-staging/backend/.env"
else
  echo "[$(date)] ERROR: Unknown environment '$ENV'. Use 'production' or 'staging'."
  exit 1
fi

if [ ! -f "$ENV_FILE" ]; then
  echo "[$(date)] ERROR: .env file not found at $ENV_FILE"
  exit 1
fi

# Parse DATABASE_URL from .env
# Format: mysql://user:password@host:port/dbname
DATABASE_URL=$(grep '^DATABASE_URL=' "$ENV_FILE" | sed 's/^DATABASE_URL=//' | tr -d '"')

if [ -z "$DATABASE_URL" ]; then
  echo "[$(date)] ERROR: DATABASE_URL not found in $ENV_FILE"
  exit 1
fi

# Extract components from mysql://user:password@host:port/dbname
DB_USER=$(echo "$DATABASE_URL" | sed 's|mysql://||' | cut -d: -f1)
DB_PASS=$(echo "$DATABASE_URL" | sed 's|mysql://||' | cut -d: -f2 | cut -d@ -f1)
DB_HOST=$(echo "$DATABASE_URL" | sed 's|mysql://||' | cut -d@ -f2 | cut -d: -f1)
DB_PORT=$(echo "$DATABASE_URL" | sed 's|mysql://||' | cut -d@ -f2 | cut -d: -f2 | cut -d/ -f1)
DB_NAME=$(echo "$DATABASE_URL" | sed 's|mysql://||' | cut -d/ -f2)

# ─── Perform backup ─────────────────────────────────────────────────────────

mkdir -p "$BACKUP_DIR"

BACKUP_FILE="$BACKUP_DIR/${DB_NAME}_${TIMESTAMP}.sql.gz"

echo "[$(date)] Starting backup of $DB_NAME ($ENV)..."

mysqldump \
  -u "$DB_USER" \
  -p"$DB_PASS" \
  -h "$DB_HOST" \
  -P "$DB_PORT" \
  "$DB_NAME" \
  --single-transaction \
  --routines \
  --triggers \
  --events \
  | gzip > "$BACKUP_FILE"

FILESIZE=$(du -h "$BACKUP_FILE" | cut -f1)
echo "[$(date)] Backup saved to $BACKUP_FILE ($FILESIZE)"

# ─── Rotate old backups ─────────────────────────────────────────────────────

DELETED=$(find "$BACKUP_DIR" -name "*.sql.gz" -mtime +$RETENTION_DAYS -delete -print | wc -l)
echo "[$(date)] Cleaned up $DELETED backup(s) older than $RETENTION_DAYS days"

echo "[$(date)] Backup complete."
