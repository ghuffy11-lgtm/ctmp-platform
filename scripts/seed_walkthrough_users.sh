#!/usr/bin/env bash
# Seed walkthrough users for the owner's end-to-end procurement scenario.
#
# Idempotent: re-runs harmlessly. ON CONFLICT clauses skip existing rows.
# Run on staging:  ssh claude@10.1.13.98 'cd /mnt/repo/ctmp-platform && bash scripts/seed_walkthrough_users.sh'
#
# Owner-approved plan: ~/.claude/plans/before-i-start-the-merry-hammock.md
set -euo pipefail

PASSWORD='Walkthrough@2026!'

PSQL='docker exec -i ctmp-postgres psql -U ctmp -d ctmp -v ON_ERROR_STOP=1'

echo "==> Hashing shared password via the api container's bcrypt"
HASH=$(docker exec ctmp-api node -e "console.log(require('bcrypt').hashSync('${PASSWORD}', 10))")
if [ -z "$HASH" ]; then
  echo "FAIL: bcrypt hash empty" >&2
  exit 1
fi
echo "    hash prefix: ${HASH:0:7}..."

echo "==> Reverting admin@ctmp.local's dev-only PROCUREMENT_ADMIN grant"
$PSQL <<SQL
DELETE FROM user_roles
WHERE user_id = (SELECT id FROM users WHERE email = 'admin@ctmp.local')
  AND role_id = (SELECT id FROM roles WHERE code = 'PROCUREMENT_ADMIN');
UPDATE users SET token_version = token_version + 1 WHERE email = 'admin@ctmp.local';
SQL

echo "==> Inserting 4 new internal users (officer, engineer, manager, finance)"
$PSQL <<SQL
INSERT INTO users (email, display_name, auth_type, password_hash, status, mfa_enabled)
VALUES
  ('officer@ctmp.local',  'Procurement Officer',  'LOCAL', '${HASH}', 'ACTIVE', false),
  ('engineer@ctmp.local', 'Technical Engineer',   'LOCAL', '${HASH}', 'ACTIVE', false),
  ('manager@ctmp.local',  'Procurement Manager',  'LOCAL', '${HASH}', 'ACTIVE', false),
  ('finance@ctmp.local',  'Finance',              'LOCAL', '${HASH}', 'ACTIVE', false)
ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash, status = 'ACTIVE';
SQL

echo "==> Mapping internal users to roles"
$PSQL <<'SQL'
WITH new_grants(email, role_code) AS (VALUES
  ('officer@ctmp.local',  'PROCUREMENT_OFFICER'),
  ('engineer@ctmp.local', 'TECHNICAL_EVALUATOR'),
  ('engineer@ctmp.local', 'APPROVER'),
  ('manager@ctmp.local',  'PROCUREMENT_ADMIN'),
  ('finance@ctmp.local',  'COMMERCIAL_COMMITTEE_MEMBER'),
  ('finance@ctmp.local',  'COMMERCIAL_EVALUATOR')
)
INSERT INTO user_roles (user_id, role_id)
SELECT u.id, r.id
FROM new_grants g
JOIN users u ON u.email = g.email
JOIN roles r ON r.code = g.role_code
ON CONFLICT DO NOTHING;
SQL

echo "==> Patching role-permission gaps the workflow needs (idempotent)"
# These grants close gaps in the baseline role definitions surfaced by the
# owner's procurement walk: TECHNICAL_EVALUATOR couldn't reply to clarifications,
# PROCUREMENT_ADMIN couldn't open or finalize technical envelopes, etc.
$PSQL <<'SQL'
WITH role_grants(role_code, perm_code) AS (VALUES
  ('TECHNICAL_EVALUATOR', 'clarification:reply'),
  ('TECHNICAL_EVALUATOR', 'clarification:view_internal'),
  ('PROCUREMENT_ADMIN',   'tender:approve'),
  ('PROCUREMENT_ADMIN',   'technical:open'),
  ('PROCUREMENT_ADMIN',   'technical:view'),
  ('PROCUREMENT_ADMIN',   'technical:finalize'),
  ('PROCUREMENT_ADMIN',   'committee:open_commercial')
)
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM role_grants g
JOIN roles r ON r.code = g.role_code
JOIN permissions p ON p.code = g.perm_code
ON CONFLICT DO NOTHING;
SQL

echo "==> Bumping token_version for affected users (forces re-login)"
$PSQL <<'SQL'
UPDATE users SET token_version = token_version + 1
WHERE email IN ('engineer@ctmp.local', 'manager@ctmp.local', 'finance@ctmp.local');
SQL

echo "==> Inserting 3 vendor companies"
$PSQL <<'SQL'
INSERT INTO vendors (company_name, registration_number, country, status, approved_at)
VALUES
  ('Vendor 1', 'V1-REG-001', 'KW', 'APPROVED', NOW()),
  ('Vendor 2', 'V2-REG-002', 'KW', 'APPROVED', NOW()),
  ('Vendor 3', 'V3-REG-003', 'KW', 'APPROVED', NOW())
ON CONFLICT (company_name, registration_number) DO UPDATE SET status = 'APPROVED', approved_at = COALESCE(vendors.approved_at, NOW());
SQL

echo "==> Inserting 3 vendor primary contacts"
$PSQL <<SQL
INSERT INTO vendor_users (vendor_id, email, password_hash, full_name, is_primary_contact, status, email_verified_at)
SELECT v.id, x.email, '${HASH}', x.full_name, true, 'ACTIVE', NOW()
FROM (VALUES
  ('Vendor 1', 'vendor1@vendor.test', 'Vendor 1 Primary'),
  ('Vendor 2', 'vendor2@vendor.test', 'Vendor 2 Primary'),
  ('Vendor 3', 'vendor3@vendor.test', 'Vendor 3 Primary')
) AS x(company_name, email, full_name)
JOIN vendors v ON v.company_name = x.company_name
ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash, status = 'ACTIVE', email_verified_at = COALESCE(vendor_users.email_verified_at, NOW());
SQL

echo
echo "==================== CAST + CREDENTIALS ===================="
$PSQL -t <<'SQL'
SELECT '  '|| u.email ||'  ['|| string_agg(r.code, ', ' ORDER BY r.code) ||']'
FROM users u
LEFT JOIN user_roles ur ON ur.user_id = u.id
LEFT JOIN roles r ON r.id = ur.role_id
WHERE u.email IN ('officer@ctmp.local','engineer@ctmp.local','manager@ctmp.local','finance@ctmp.local','admin@ctmp.local')
GROUP BY u.email
ORDER BY u.email;
SQL
echo
echo "  Vendor accounts:"
$PSQL -t <<'SQL'
SELECT '    '|| vu.email ||'  ('|| v.company_name ||', primary_contact='|| vu.is_primary_contact ||')'
FROM vendor_users vu
JOIN vendors v ON v.id = vu.vendor_id
WHERE vu.email IN ('vendor1@vendor.test','vendor2@vendor.test','vendor3@vendor.test')
ORDER BY vu.email;
SQL
echo
echo "  Shared password for ALL accounts above:  ${PASSWORD}"
echo "============================================================"
echo
echo "Done."
