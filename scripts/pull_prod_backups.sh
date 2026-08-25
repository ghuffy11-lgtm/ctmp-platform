#!/usr/bin/env bash
# Pull production backups to a second machine.
#
# RUNS ON THE BUILD BOX (10.1.13.98), not on production.
#
# WHY PULL AND NOT PUSH
#   Production cannot SSH to the build box — no host key, no trust in that
#   direction — while the build box can already reach production (it is the
#   deploy path). Rather than open a new trust direction, this pulls.
#
#   That is also the better security property. Production holds no credentials
#   to the backup store, so compromising the production host does not give an
#   attacker the ability to delete its own off-host backups. Push-based backup
#   loses that.
#
# WHAT IT COPIES
#   Both halves of each nightly backup, which must stay together:
#     ctmp-YYYYmmdd-HHMMSS.dump        the database
#     ctmp-files-YYYYmmdd-HHMMSS.tar.gz  bid / tender / report / branding files
#   Plus the manual ctmp_pre*.dump pre-deploy dumps.
#
# HONEST LIMIT
#   The build box is in the same building on the same network. This protects
#   against losing the production host or its disk. It does NOT protect against
#   fire, flood, theft or a site-wide event. Real off-site backup is a separate
#   decision — see docs/runbooks/BACKUP_RESTORE.md.
#
# USAGE
#   scripts/pull_prod_backups.sh            # dry run (default)
#   scripts/pull_prod_backups.sh --confirm  # actually copy
#
# ENV
#   SSH_ALIAS       production host alias (default cts-prod)
#   DEST            local destination (default /mnt/repo/ctmp-backups)
#   RETENTION_DAYS  local copies to keep (default 30 — deliberately longer than
#                   production's 14, so the off-host copy outlives the original)

set -euo pipefail

CONFIRM="${1:-}"
SSH_ALIAS="${SSH_ALIAS:-cts-prod}"
REMOTE_DIR="${REMOTE_DIR:-/var/lib/docker/ctmp-platform/backups}"
DEST="${DEST:-/mnt/repo/ctmp-backups}"
RETENTION_DAYS="${RETENTION_DAYS:-30}"

# Colour only for a human at a terminal; under cron this appends to a log file
# where escape codes are noise. Y is the warning colour, blank when not a tty.
if [[ -t 1 ]]; then
  B=$'\033[1m'; R=$'\033[0m'; Y=$'\033[33m'
else
  B=''; R=''; Y=''
  printf '\n===== %s =====\n' "$(date -u '+%Y-%m-%d %H:%M:%S UTC')"
fi

printf "\n${B}Pull production backups${R}\n"
printf '  from: %s:%s\n' "$SSH_ALIAS" "$REMOTE_DIR"
printf '  to:   %s\n' "$DEST"

REMOTE_COUNT=$(ssh "$SSH_ALIAS" "ls -1 $REMOTE_DIR/ctmp*.dump $REMOTE_DIR/ctmp-files-*.tar.gz 2>/dev/null | wc -l")
printf '  remote files: %s\n' "$REMOTE_COUNT"

if [[ "$REMOTE_COUNT" == "0" ]]; then
  printf "\n${B}Nothing on the remote to pull. Is the nightly backup running?${R}\n"
  printf 'Check: ssh %s "tail -5 %s/backup.log"\n\n' "$SSH_ALIAS" "$REMOTE_DIR"
  exit 1
fi

# Pair check: every .dump should have a matching files archive. A dump without
# its files is only half a restore, and worth knowing about before you need it.
UNPAIRED=$(ssh "$SSH_ALIAS" "cd $REMOTE_DIR 2>/dev/null && for d in ctmp-2*.dump; do
  [ -e \"\$d\" ] || continue
  s=\${d#ctmp-}; s=\${s%.dump}
  [ -f \"ctmp-files-\$s.tar.gz\" ] || echo \"\$d\"
done" || true)
if [[ -n "$UNPAIRED" ]]; then
  printf "\n  ${Y}NOTE: dumps with no matching file archive (pre-dating volume backup, or a failed run):${R}\n"
  echo "$UNPAIRED" | sed 's/^/    /'
fi

if [[ "$CONFIRM" != "--confirm" ]]; then
  printf "\n${B}DRY RUN — nothing copied.${R}\n"
  printf 'Re-run with --confirm.\n\n'
  exit 0
fi

mkdir -p "$DEST"

# -a preserves timestamps so local retention ages by the ORIGINAL backup time,
# not by when it was copied. --ignore-existing keeps this cheap on re-runs.
rsync -a --ignore-existing \
  --include='ctmp-*.dump' --include='ctmp_pre*.dump' --include='ctmp-files-*.tar.gz' \
  --exclude='*' \
  "$SSH_ALIAS:$REMOTE_DIR/" "$DEST/"

LOCAL_COUNT=$(ls -1 "$DEST"/ctmp*.dump "$DEST"/ctmp-files-*.tar.gz 2>/dev/null | wc -l)
printf "\n${B}Copied.${R}\n"
printf '  local files now: %s (%s)\n' "$LOCAL_COUNT" "$(du -sh "$DEST" 2>/dev/null | cut -f1)"

find "$DEST" -name 'ctmp-*.dump' -type f -mtime +"$RETENTION_DAYS" -print -delete
find "$DEST" -name 'ctmp-files-*.tar.gz' -type f -mtime +"$RETENTION_DAYS" -print -delete
printf '  pruned local copies older than %sd\n\n' "$RETENTION_DAYS"
