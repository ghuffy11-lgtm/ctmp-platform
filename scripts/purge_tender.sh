#!/usr/bin/env bash
# Purge one tender and everything hanging off it — bids, envelopes, documents,
# evaluations, committee sessions, negotiation rounds, awards, notifications and
# the files on disk. Used to remove a TEST tender from a live environment.
#
# audit_logs is deliberately NOT touched. It is append-only and hash-chained;
# deleting or rewriting rows there breaks verification for every later row and
# the API logs "AUDIT CHAIN BREAK" on boot. After this script runs, the audit
# trail still shows the tender existed and was worked on — only the operational
# data is gone. Migration 053 drops the audit FKs so that is possible.
#
# USAGE
#   scripts/purge_tender.sh TDR-2026-0042              # dry run (default)
#   scripts/purge_tender.sh TDR-2026-0042 --confirm    # actually delete
#   SSH_ALIAS=cts-prod scripts/purge_tender.sh TDR-2026-0042 --confirm
#
# The argument is a tender reference OR a tender UUID.
#
# ENV
#   SSH_ALIAS   run against a remote host (e.g. cts-prod). Unset = local docker.
#   PG_CONTAINER  default ctmp-postgres
#   API_CONTAINER default ctmp-api          (used to unlink stored files)
#   STORAGE_ROOT  default /data             (STORAGE_LOCAL_ROOT inside the api)
#
# A dry run prints exactly what would be deleted and changes nothing.
# A confirmed run takes a pg_dump first and refuses to continue if it fails.

set -euo pipefail

TARGET="${1:-}"
CONFIRM="${2:-}"
PG_CONTAINER="${PG_CONTAINER:-ctmp-postgres}"
API_CONTAINER="${API_CONTAINER:-ctmp-api}"
STORAGE_ROOT="${STORAGE_ROOT:-/data}"
DB_USER="${DB_USER:-ctmp}"
DB_NAME="${DB_NAME:-ctmp}"

if [[ -z "$TARGET" ]]; then
  echo "usage: $0 <tender-reference|tender-uuid> [--confirm]" >&2
  exit 2
fi

# Every docker call goes through this so the script works locally or over ssh.
run() {
  if [[ -n "${SSH_ALIAS:-}" ]]; then
    ssh "$SSH_ALIAS" "$@"
  else
    bash -c "$*"
  fi
}

psql_q() {  # quiet, tuples-only, single value/rows out
  run "docker exec -i $PG_CONTAINER psql -U $DB_USER -d $DB_NAME -t -A -v ON_ERROR_STOP=1 -c \"$1\""
}

psql_script() {  # multi-statement, fails the script on any error
  run "docker exec -i $PG_CONTAINER psql -U $DB_USER -d $DB_NAME -v ON_ERROR_STOP=1"
}

banner() { printf '\n\033[1m%s\033[0m\n' "$*"; }

# ── Resolve the tender ───────────────────────────────────────────────────────
TENDER_ID=$(psql_q "SELECT id FROM tenders WHERE id::text = '$TARGET' OR reference = '$TARGET' LIMIT 1;" | tr -d '[:space:]')
if [[ -z "$TENDER_ID" ]]; then
  echo "No tender matches '$TARGET'." >&2
  exit 1
fi

read -r REFERENCE TITLE STATUS <<<"$(psql_q "SELECT reference || ' ' || replace(title, ' ', '_') || ' ' || status FROM tenders WHERE id='$TENDER_ID';")"

banner "TARGET"
echo "  id:        $TENDER_ID"
echo "  reference: $REFERENCE"
echo "  title:     ${TITLE//_/ }"
echo "  status:    $STATUS"
[[ -n "${SSH_ALIAS:-}" ]] && echo "  host:      $SSH_ALIAS" || echo "  host:      local"

# ── Guard: migration 053 must have been applied ──────────────────────────────
FK_LEFT=$(psql_q "SELECT count(*) FROM pg_constraint WHERE conrelid='audit_logs'::regclass AND conname IN ('audit_logs_tender_id_fkey','audit_logs_bid_id_fkey');" | tr -d '[:space:]')
if [[ "$FK_LEFT" != "0" ]]; then
  cat >&2 <<EOF

REFUSING: audit_logs still has its tender_id/bid_id foreign keys, so this delete
would either fail or force rewriting the hash-chained audit trail.

Apply migration 053 first:
  cat database/migrations/053_audit_logs_entity_fk_drop.sql | \\
    ${SSH_ALIAS:+ssh $SSH_ALIAS }docker exec -i $PG_CONTAINER psql -U $DB_USER -d $DB_NAME -v ON_ERROR_STOP=1
EOF
  exit 1
fi

# ── Inventory ────────────────────────────────────────────────────────────────
banner "WILL DELETE (row counts)"
psql_q "
SELECT format('  %-34s %s', label, n) FROM (
  SELECT 'bids' AS label, count(*) AS n FROM bids WHERE tender_id='$TENDER_ID'
  UNION ALL SELECT 'bid_envelopes', count(*) FROM bid_envelopes WHERE bid_id IN (SELECT id FROM bids WHERE tender_id='$TENDER_ID')
  UNION ALL SELECT 'bid_documents', count(*) FROM bid_documents WHERE bid_envelope_id IN (SELECT id FROM bid_envelopes WHERE bid_id IN (SELECT id FROM bids WHERE tender_id='$TENDER_ID'))
  UNION ALL SELECT 'bid_supporting_documents', count(*) FROM bid_supporting_documents WHERE bid_id IN (SELECT id FROM bids WHERE tender_id='$TENDER_ID')
  UNION ALL SELECT 'bid_boq_items', count(*) FROM bid_boq_items WHERE bid_id IN (SELECT id FROM bids WHERE tender_id='$TENDER_ID')
  UNION ALL SELECT 'technical_evaluations', count(*) FROM technical_evaluations WHERE bid_id IN (SELECT id FROM bids WHERE tender_id='$TENDER_ID')
  UNION ALL SELECT 'commercial_evaluations', count(*) FROM commercial_evaluations WHERE bid_id IN (SELECT id FROM bids WHERE tender_id='$TENDER_ID')
  UNION ALL SELECT 'committee_sessions', count(*) FROM committee_sessions WHERE tender_id='$TENDER_ID'
  UNION ALL SELECT 'negotiation_rounds', count(*) FROM negotiation_rounds WHERE tender_id='$TENDER_ID'
  UNION ALL SELECT 'awards', count(*) FROM awards WHERE tender_id='$TENDER_ID'
  UNION ALL SELECT 'tender_documents', count(*) FROM tender_documents WHERE tender_id='$TENDER_ID'
  UNION ALL SELECT 'tender_boq_items', count(*) FROM tender_boq_items WHERE tender_id='$TENDER_ID'
  UNION ALL SELECT 'tender_clarifications', count(*) FROM tender_clarifications WHERE tender_id='$TENDER_ID'
  UNION ALL SELECT 'notification_logs', count(*) FROM notification_logs WHERE tender_id='$TENDER_ID'
  UNION ALL SELECT 'report_export_jobs (by filter)', count(*) FROM report_export_jobs WHERE filters::text LIKE '%$TENDER_ID%'
) t ORDER BY label;"

banner "WILL KEEP"
AUDIT_N=$(psql_q "SELECT count(*) FROM audit_logs WHERE tender_id='$TENDER_ID' OR bid_id IN (SELECT id FROM bids WHERE tender_id='$TENDER_ID');" | tr -d '[:space:]')
echo "  audit_logs                         $AUDIT_N  (append-only, hash-chained — untouched)"

# ── Files on disk ────────────────────────────────────────────────────────────
FILES=$(psql_q "
SELECT 'bid-documents/' || d.storage_key FROM bid_documents d
  JOIN bid_envelopes e ON e.id = d.bid_envelope_id
  JOIN bids b ON b.id = e.bid_id WHERE b.tender_id='$TENDER_ID'
UNION ALL SELECT 'bid-supporting-documents/' || s.storage_key FROM bid_supporting_documents s
  JOIN bids b ON b.id = s.bid_id WHERE b.tender_id='$TENDER_ID'
UNION ALL SELECT 'tender-documents/' || storage_key FROM tender_documents WHERE tender_id='$TENDER_ID'
UNION ALL SELECT 'award-minutes/' || m.pdf_storage_key FROM award_minutes m
  JOIN awards a ON a.id = m.award_id WHERE a.tender_id='$TENDER_ID'
UNION ALL SELECT 'award-justifications/' || justification_pdf_storage_key FROM awards
  WHERE tender_id='$TENDER_ID' AND justification_pdf_storage_key IS NOT NULL
UNION ALL SELECT 'negotiation-submissions/' || sub.commercial_pdf_storage_key
  FROM bid_negotiation_submissions sub
  JOIN negotiation_invitations i ON i.id = sub.invitation_id
  JOIN bids b ON b.id = i.bid_id WHERE b.tender_id='$TENDER_ID'
UNION ALL SELECT 'reports/' || storage_key FROM report_export_jobs
  WHERE storage_key IS NOT NULL AND filters::text LIKE '%$TENDER_ID%';")

FILE_COUNT=$(printf '%s\n' "$FILES" | grep -c . || true)
banner "FILES ON DISK ($FILE_COUNT)"
printf '%s\n' "$FILES" | sed 's/^/  /' | head -40
[[ "$FILE_COUNT" -gt 40 ]] && echo "  … and $((FILE_COUNT - 40)) more"

# ── Stop here unless confirmed ───────────────────────────────────────────────
if [[ "$CONFIRM" != "--confirm" ]]; then
  banner "DRY RUN — nothing was changed."
  echo "Re-run with --confirm to delete."
  exit 0
fi

# ── Backup first, always ─────────────────────────────────────────────────────
STAMP=$(date +%Y%m%d-%H%M%S)
DUMP="/tmp/ctmp-pre-purge-$STAMP.dump"
banner "BACKUP"
run "docker exec $PG_CONTAINER pg_dump -U $DB_USER -Fc $DB_NAME > $DUMP && ls -lh $DUMP"
echo "  restore with: pg_restore --clean -U $DB_USER -d $DB_NAME $DUMP"

# ── Delete, in FK-safe order, in ONE transaction ─────────────────────────────
# Order matters: several FKs are NO ACTION / RESTRICT rather than CASCADE.
#   committee_opening_records -> bid_envelopes (NO ACTION)
#   bid_envelopes             -> committee_sessions (NO ACTION)
#   awards.recommended_bid_id -> bids (NO ACTION)
#   negotiation_invitations   -> bids (RESTRICT)
banner "DELETING"
psql_script <<SQL
BEGIN;

DELETE FROM committee_opening_records
 WHERE session_id IN (SELECT id FROM committee_sessions WHERE tender_id='$TENDER_ID')
    OR bid_envelope_id IN (SELECT e.id FROM bid_envelopes e JOIN bids b ON b.id=e.bid_id WHERE b.tender_id='$TENDER_ID');

DELETE FROM negotiation_invitations
 WHERE round_id IN (SELECT id FROM negotiation_rounds WHERE tender_id='$TENDER_ID')
    OR bid_id IN (SELECT id FROM bids WHERE tender_id='$TENDER_ID');
DELETE FROM negotiation_rounds WHERE tender_id='$TENDER_ID';

DELETE FROM award_minutes WHERE award_id IN (SELECT id FROM awards WHERE tender_id='$TENDER_ID');
UPDATE awards SET superseded_by_award_id = NULL WHERE tender_id='$TENDER_ID';
DELETE FROM awards WHERE tender_id='$TENDER_ID';

DELETE FROM notification_logs WHERE tender_id='$TENDER_ID';
DELETE FROM document_view_log
 WHERE tender_id='$TENDER_ID' OR bid_id IN (SELECT id FROM bids WHERE tender_id='$TENDER_ID');
DELETE FROM report_export_jobs WHERE filters::text LIKE '%$TENDER_ID%';

-- Bids MUST go before committee_sessions. bid_envelopes.committee_session_id is
-- a NO ACTION FK, so the sessions cannot be deleted while envelopes reference
-- them — and the envelopes cannot simply be detached either: the CHECK
-- constraint commercial_open_requires_session forbids a NULL session on an
-- OPENED commercial envelope. Deleting the bids cascades the envelopes away,
-- which removes the reference entirely.
-- Cascades: envelopes -> documents, receipts, boq items, evaluations, supporting docs.
DELETE FROM bids WHERE tender_id='$TENDER_ID';

-- Cascades: members, attendance, opening records.
DELETE FROM committee_sessions WHERE tender_id='$TENDER_ID';

-- Cascades: boq template, criteria, clarifications, documents, versions,
-- invited vendors, comparisons, late-submission exceptions.
DELETE FROM tenders WHERE id='$TENDER_ID';

COMMIT;
SQL

# ── Remove the files ─────────────────────────────────────────────────────────
if [[ "$FILE_COUNT" -gt 0 ]]; then
  banner "REMOVING FILES"
  while IFS= read -r rel; do
    [[ -z "$rel" ]] && continue
    run "docker exec $API_CONTAINER sh -c 'rm -f \"$STORAGE_ROOT/$rel\"'" || echo "  (missing) $rel"
    echo "  removed $rel"
  done <<<"$FILES"
fi

# ── Verify ───────────────────────────────────────────────────────────────────
banner "VERIFY"
LEFT=$(psql_q "SELECT count(*) FROM tenders WHERE id='$TENDER_ID';" | tr -d '[:space:]')
BIDS_LEFT=$(psql_q "SELECT count(*) FROM bids WHERE tender_id='$TENDER_ID';" | tr -d '[:space:]')
AUDIT_AFTER=$(psql_q "SELECT count(*) FROM audit_logs WHERE tender_id='$TENDER_ID';" | tr -d '[:space:]')
echo "  tenders row remaining: $LEFT   (expect 0)"
echo "  bids rows remaining:   $BIDS_LEFT   (expect 0)"
echo "  audit_logs preserved:  $AUDIT_AFTER   (expect $AUDIT_N)"
echo
echo "Restart the api and confirm the boot log still says 'Audit chain verified':"
echo "  ${SSH_ALIAS:+ssh $SSH_ALIAS }docker logs $API_CONTAINER --tail 40 | grep -i 'audit chain'"
