#!/usr/bin/env bash
# =============================================================================
# backup_ctmp_db.sh — nightly logical backup of the CTMP production database.
#
# Writes a compressed custom-format dump (pg_dump -Fc) to
# /var/lib/docker/ctmp-platform/backups (on /dev/sdb — NOT the / partition) and
# prunes dumps older than RETENTION_DAYS.
#
# Install as a nightly cron (run `crontab -e` as the claude user):
#   15 1 * * * /var/lib/docker/ctmp-platform/scripts/backup_ctmp_db.sh >> \
#     /var/lib/docker/ctmp-platform/backups/backup.log 2>&1
#
# Restore (DESTRUCTIVE — overwrites the live DB; stop the api first):
#   docker compose --env-file .env.admin-prod -f docker-compose.admin-prod.yml \
#     -p ctmp exec -T postgres pg_restore -U ctmp -d ctmp --clean --if-exists \
#     < /var/lib/docker/ctmp-platform/backups/ctmp-YYYYmmdd-HHMMSS.dump
# =============================================================================
set -euo pipefail

PROJECT_DIR="${PROJECT_DIR:-/var/lib/docker/ctmp-platform}"
COMPOSE_DIR="$PROJECT_DIR/infrastructure/docker"
BACKUP_DIR="${BACKUP_DIR:-$PROJECT_DIR/backups}"
ENV_FILE="${ENV_FILE:-.env.admin-prod}"
RETENTION_DAYS="${RETENTION_DAYS:-14}"

cd "$COMPOSE_DIR"
set -a; # shellcheck disable=SC1090
. "./$ENV_FILE"; set +a
PGUSER="${POSTGRES_USER:-ctmp}"
PGDB="${POSTGRES_DB:-ctmp}"

mkdir -p "$BACKUP_DIR"
STAMP="$(date +%Y%m%d-%H%M%S)"
OUT="$BACKUP_DIR/ctmp-$STAMP.dump"

COMPOSE=(docker compose --env-file "$ENV_FILE" -f docker-compose.admin-prod.yml -p ctmp)

echo "[$(date -Is)] dumping $PGDB -> $OUT"
"${COMPOSE[@]}" exec -T postgres pg_dump -U "$PGUSER" -d "$PGDB" -Fc > "$OUT"

# Fail loudly on an empty/short dump rather than silently keeping junk.
if [[ ! -s "$OUT" ]] || [[ "$(stat -c%s "$OUT")" -lt 1024 ]]; then
  echo "[$(date -Is)] ERROR: dump looks empty/too small, removing $OUT" >&2
  rm -f "$OUT"
  exit 1
fi

echo "[$(date -Is)] ok: $(du -h "$OUT" | cut -f1)"
find "$BACKUP_DIR" -name 'ctmp-*.dump' -type f -mtime +"$RETENTION_DAYS" -print -delete
echo "[$(date -Is)] pruned dumps older than ${RETENTION_DAYS}d"
