#!/usr/bin/env bash
# =============================================================================
# bootstrap_admin.sh — create the first LOCAL SYSTEM_ADMIN login on a fresh
# production database.
#
# The seeds (001_baseline_roles_permissions.sql) create the SYSTEM_ADMIN role
# and the permission matrix, but NO user. This one-off creates a single LOCAL
# admin so the portal can be logged into. Idempotent: re-running never
# duplicates the user or the role grant.
#
# Run from infrastructure/docker on the admin host, AFTER the stack is up and
# seeds are applied:
#
#   ADMIN_EMAIL=admin@hadiclinic.com.kw ADMIN_NAME="System Admin" \
#     bash ../../scripts/bootstrap_admin.sh
#
# Password: pass ADMIN_PASSWORD=... in the env, or you'll be prompted (hidden).
# bcrypt hashing (cost 12, matching users.service.ts) runs inside the api
# container so no node/bcrypt is needed on the host.
# =============================================================================
set -euo pipefail

COMPOSE_DIR="${COMPOSE_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../infrastructure/docker" && pwd)}"
cd "$COMPOSE_DIR"

ENV_FILE="${ENV_FILE:-.env.admin-prod}"
COMPOSE=(docker compose --env-file "$ENV_FILE" -f docker-compose.admin-prod.yml -p ctmp)

# Load POSTGRES_USER / POSTGRES_DB for the psql invocation.
set -a; # shellcheck disable=SC1090
. "./$ENV_FILE"; set +a
PGUSER="${POSTGRES_USER:-ctmp}"
PGDB="${POSTGRES_DB:-ctmp}"

ADMIN_EMAIL="${ADMIN_EMAIL:-}"
ADMIN_NAME="${ADMIN_NAME:-System Admin}"
ADMIN_PASSWORD="${ADMIN_PASSWORD:-}"

if [[ -z "$ADMIN_EMAIL" ]]; then
  read -rp "Admin email: " ADMIN_EMAIL
fi
if [[ -z "$ADMIN_PASSWORD" ]]; then
  read -rsp "Admin password: " ADMIN_PASSWORD; echo
  read -rsp "Confirm password: " ADMIN_PASSWORD2; echo
  [[ "$ADMIN_PASSWORD" == "$ADMIN_PASSWORD2" ]] || { echo "Passwords do not match." >&2; exit 1; }
fi
[[ -n "$ADMIN_EMAIL" && -n "$ADMIN_PASSWORD" ]] || { echo "Email and password are required." >&2; exit 1; }

# Guard: the SYSTEM_ADMIN role must exist (seeds applied) before we grant it.
ROLE_COUNT=$("${COMPOSE[@]}" exec -T postgres \
  psql -U "$PGUSER" -d "$PGDB" -tAc "SELECT count(*) FROM roles WHERE code='SYSTEM_ADMIN';")
if [[ "${ROLE_COUNT//[[:space:]]/}" != "1" ]]; then
  echo "ERROR: SYSTEM_ADMIN role not found. Apply database/seeds/001_*.sql first." >&2
  exit 1
fi

# Hash inside the api container (bcrypt cost 12, same as users.service.ts).
HASH=$("${COMPOSE[@]}" exec -T -e P="$ADMIN_PASSWORD" api \
  node -e 'require("bcrypt").hash(process.env.P,12).then(h=>process.stdout.write(h))')
HASH="${HASH//[$'\r\n']/}"
[[ "$HASH" == \$2* ]] || { echo "ERROR: bcrypt hashing failed (got: ${HASH:0:8}...)." >&2; exit 1; }

# Insert user + role grant. psql variables (:'var') keep the $-laden hash and
# any odd characters from being re-interpreted. Both inserts are idempotent.
"${COMPOSE[@]}" exec -T \
  -e PGEMAIL="$ADMIN_EMAIL" -e PGNAME="$ADMIN_NAME" -e PGHASH="$HASH" \
  postgres psql -U "$PGUSER" -d "$PGDB" \
  -v email="$ADMIN_EMAIL" -v name="$ADMIN_NAME" -v hash="$HASH" <<'SQL'
\set ON_ERROR_STOP on
INSERT INTO users (email, display_name, auth_type, password_hash, status)
VALUES (:'email', :'name', 'LOCAL', :'hash', 'ACTIVE')
ON CONFLICT (email) DO NOTHING;

INSERT INTO user_roles (user_id, role_id)
SELECT u.id, r.id
FROM users u CROSS JOIN roles r
WHERE u.email = :'email' AND r.code = 'SYSTEM_ADMIN'
ON CONFLICT (user_id, role_id) DO NOTHING;

SELECT u.email, u.status, u.auth_type, r.code AS role
FROM users u
JOIN user_roles ur ON ur.user_id = u.id
JOIN roles r ON r.id = ur.role_id
WHERE u.email = :'email';
SQL

echo "Done. SYSTEM_ADMIN '$ADMIN_EMAIL' is ready (LOCAL auth)."
