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

# ---------------------------------------------------------------------------
# 2026-08-25: file volumes, immediately after the dump and sharing its
# timestamp.
#
# pg_dump covers the database only. Bid documents, tender RFQ documents,
# generated reports and branding live in Docker volumes, and the database
# references them by path — so a database-only restore yields rows pointing at
# evidence files that no longer exist. For a platform whose bid documents are
# SHA-256-checksummed proof of what a supplier submitted, that is the more
# serious of the two gaps.
#
# Same STAMP as the dump on purpose: the pair must be restorable together.
# Taken back-to-back to keep the window between them as small as possible.
#
# redis_data is deliberately excluded — cache and job queue, rebuilt on start.
# postgres_data is excluded too: the logical dump above is the supported
# restore path, and a raw copy of a running data directory is not consistent.
# ---------------------------------------------------------------------------
FILES_OUT="$BACKUP_DIR/ctmp-files-$STAMP.tar.gz"
VOLUMES=(ctmp_app_storage ctmp_bid_storage ctmp_tender_storage ctmp_report_storage)

echo "[$(date -Is)] archiving file volumes -> $FILES_OUT"
MOUNTS=()
VOL_COUNT=0
for v in "${VOLUMES[@]}"; do
  if docker volume inspect "$v" >/dev/null 2>&1; then
    MOUNTS+=(-v "$v:/vol/$v:ro")
    VOL_COUNT=$((VOL_COUNT + 1))
  else
    echo "[$(date -Is)] WARN: volume $v not found, skipping" >&2
  fi
done

if [[ ${#MOUNTS[@]} -eq 0 ]]; then
  echo "[$(date -Is)] ERROR: no storage volumes found — refusing to write an empty archive" >&2
  exit 1
fi

docker run --rm "${MOUNTS[@]}" -v "$BACKUP_DIR:/backup" alpine \
  tar czf "/backup/$(basename "$FILES_OUT")" -C /vol . || {
    echo "[$(date -Is)] ERROR: volume archive failed, removing partial file" >&2
    rm -f "$FILES_OUT"
    exit 1
  }

# An empty tar.gz is ~45 bytes. Anything under 200 means we archived nothing —
# fail loudly rather than keep a file that only looks like a backup.
if [[ ! -s "$FILES_OUT" ]] || [[ "$(stat -c%s "$FILES_OUT")" -lt 200 ]]; then
  echo "[$(date -Is)] ERROR: volume archive looks empty, removing $FILES_OUT" >&2
  rm -f "$FILES_OUT"
  exit 1
fi
echo "[$(date -Is)] ok: $(du -h "$FILES_OUT" | cut -f1) ($VOL_COUNT volumes)"

find "$BACKUP_DIR" -name 'ctmp-*.dump' -type f -mtime +"$RETENTION_DAYS" -print -delete
find "$BACKUP_DIR" -name 'ctmp-files-*.tar.gz' -type f -mtime +"$RETENTION_DAYS" -print -delete
echo "[$(date -Is)] pruned dumps and file archives older than ${RETENTION_DAYS}d"
