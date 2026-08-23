#!/usr/bin/env bash
# Purge dead vendor-registry invitations.
#
# Invitations to companies that never registered are personal data with no
# business purpose once they lapse. Owner-approved retention policy, 2026-08-24.
#
#   PURGED : status REVOKED, or PENDING more than RETENTION_DAYS past expiry
#   KEPT   : status ACCEPTED — those link to a real vendor row and are business
#            records, not stale contact data
#
# WHAT THIS CANNOT DO: the invited address is also written into audit_logs, which
# is append-only and hash-chained. Deleting a row there would break verification
# for every later row — the exact property the audit design exists to guarantee.
# So this reduces exposure; it is not complete erasure, and a data-subject
# request cannot be fully honoured. That limit is deliberate and documented in
# docs/AI_DECISION_LOG.md.
#
# USAGE
#   scripts/purge_vendor_invitations.sh              # dry run (default)
#   scripts/purge_vendor_invitations.sh --confirm    # actually delete
#   SSH_ALIAS=cts-prod scripts/purge_vendor_invitations.sh --confirm
#
# ENV
#   SSH_ALIAS       run against a remote host (e.g. cts-prod). Unset = local docker.
#   PG_CONTAINER    default ctmp-postgres
#   RETENTION_DAYS  default 90

set -euo pipefail

CONFIRM="${1:-}"
PG_CONTAINER="${PG_CONTAINER:-ctmp-postgres}"
DB_USER="${DB_USER:-ctmp}"
DB_NAME="${DB_NAME:-ctmp}"
RETENTION_DAYS="${RETENTION_DAYS:-90}"

run() {
  if [[ -n "${SSH_ALIAS:-}" ]]; then ssh "$SSH_ALIAS" "$@"; else bash -c "$*"; fi
}

psql_q() {
  run "docker exec -i $PG_CONTAINER psql -U $DB_USER -d $DB_NAME -t -A -v ON_ERROR_STOP=1 -c \"$1\""
}

WHERE="status = 'REVOKED' OR (status = 'PENDING' AND expires_at < now() - interval '${RETENTION_DAYS} days')"

printf '\n\033[1mVendor invitation purge\033[0m\n'
printf '  host:      %s\n' "${SSH_ALIAS:-local}"
printf '  retention: %s days past expiry\n\n' "$RETENTION_DAYS"

TOTAL=$(psql_q "SELECT count(*) FROM vendor_invitations;")
REVOKED=$(psql_q "SELECT count(*) FROM vendor_invitations WHERE status = 'REVOKED';")
STALE=$(psql_q "SELECT count(*) FROM vendor_invitations WHERE status = 'PENDING' AND expires_at < now() - interval '${RETENTION_DAYS} days';")
KEPT=$(psql_q "SELECT count(*) FROM vendor_invitations WHERE status = 'ACCEPTED';")
DOOMED=$(psql_q "SELECT count(*) FROM vendor_invitations WHERE ${WHERE};")

printf '\033[1mWILL DELETE\033[0m\n'
printf '  revoked                    %s\n' "$REVOKED"
printf '  expired > %-3s days         %s\n' "$RETENTION_DAYS" "$STALE"
printf '  ---------------------------------\n'
printf '  total                      %s\n\n' "$DOOMED"
printf '\033[1mWILL KEEP\033[0m\n'
printf '  accepted (real suppliers)  %s\n' "$KEPT"
printf '  audit_logs                 untouched — append-only, hash-chained\n'
printf '  table total before         %s\n\n' "$TOTAL"

if [[ "$CONFIRM" != "--confirm" ]]; then
  printf '\033[1mDRY RUN — nothing was changed.\033[0m\n'
  printf 'Re-run with --confirm to delete.\n\n'
  exit 0
fi

if [[ "$DOOMED" == "0" ]]; then
  printf 'Nothing to purge.\n\n'
  exit 0
fi

psql_q "DELETE FROM vendor_invitations WHERE ${WHERE};" >/dev/null
AFTER=$(psql_q "SELECT count(*) FROM vendor_invitations;")

printf '\033[1mDONE\033[0m\n'
printf '  rows remaining: %s (expected %s)\n\n' "$AFTER" "$((TOTAL - DOOMED))"
