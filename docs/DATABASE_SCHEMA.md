# CTMP — Database Schema

**Generated 2026-08-21 by introspecting the live development database** (`ctmp-postgres` on the
build box), not by reading the migration files. Where dev and production differ, the difference is
called out explicitly.

- **Engine:** PostgreSQL 16 (`postgres:16-alpine`)
- **Database / user:** `ctmp` / `ctmp`
- **Tables:** 59 · **Columns:** 571 · **Foreign keys:** 119 · **Enum types:** 25
- **Access layer:** Prisma 6 (`apps/api/prisma/schema.prisma`) — the API never issues raw DDL
- **Migrations:** `database/migrations/*.sql`, applied in filename order (latest: `056`)

## How migrations actually reach a database

The compose file mounts `database/migrations/` into `/docker-entrypoint-initdb.d`. Postgres runs
that directory **only when the data directory is empty** — i.e. on a first-ever boot. On any
already-initialised database (which includes both production servers and the long-lived dev box)
migrations **do not re-run**. A new migration must therefore be applied by hand:

```bash
cat database/migrations/NNN_name.sql \
  | ssh cts-prod 'docker exec -i ctmp-postgres psql -U ctmp -d ctmp -v ON_ERROR_STOP=1'
```

Migrations are written to be idempotent (`DO $$ ... EXCEPTION WHEN duplicate_object`) so a repeat
run is safe.

**On the numbering gaps at `008` and `040`** — corrected 2026-08-21 after the first GitHub fetch
exposed the earlier claim here as wrong:

- **`040` genuinely never existed.** No commit in the repository has ever added it.
- **`008` DID exist**: `008_audit_chain_rebake_2026-05-23.sql`, a deliberate *documentation-only
  no-op*. It recorded an audit-chain rebake that was performed on staging by
  `apps/api/scripts/rebake-audit-chain.js`, because the canonicalisation rules are
  application-level and reimplementing them in plpgsql byte-for-byte was judged riskier than
  reusing the JS. The file was removed from the working tree at some point after 2026-06-22 and
  deleted from the repository in the 2026-08-21 sync, on the owner's instruction. It remains
  recoverable from git history at `origin/develop` commit `b37170f`, along with the script and the
  root-cause analysis in `agents/reviews/AUDIT_CHAIN_BREAK_RCA_2026-05-23.md`.

## Dev / production drift

**None as of 2026-08-21.** Migrations `054` and `055` were deployed to production on 2026-08-21;
dev and production now report an identical 571 columns with identical types, verified by comparing
`table_name.column_name:data_type(precision,scale)` across both hosts.

Both environments are at migration **`055`**.

Re-run the comparison after any migration:

```bash
Q="SELECT table_name||'.'||column_name||':'||data_type||coalesce('('||numeric_precision||','||numeric_scale||')','') \
   FROM information_schema.columns WHERE table_schema='public';"
docker exec ctmp-postgres psql -U ctmp -d ctmp -t -A -c "$Q" | sort > /tmp/dev.txt
ssh cts-prod "docker exec ctmp-postgres psql -U ctmp -d ctmp -t -A -c \"$Q\"" | sort > /tmp/prod.txt
diff /tmp/dev.txt /tmp/prod.txt && echo "schemas identical"
```

Note this form compares **types as well as names**, which a plain column-count check does not —
migration `055` changed only column types and would have been invisible to a count comparison.

## Conventions

- Primary keys are `uuid`, defaulted by `gen_random_uuid()`.
- Timestamps are `timestamptz`, defaulted `now()`.
- File checksums are `char(64)`, lowercase SHA-256 hex, enforced by CHECK constraints at the
  database layer rather than trusted from the application. Password and token hashes are `text`
  (bcrypt / SHA-256 hex respectively) and deliberately not length-constrained.
- Fixed business states are PostgreSQL `ENUM` types, not free strings — see the enum list below.

### Money precision — uniform since migration 055 (2026-08-21)

Kuwaiti Dinar carries **3** decimal places (fils). Every money column now stores all three.

| Type | Columns |
|---|---|
| `numeric(15,3)` | `tender_boq_items.qty`, `bid_boq_items.unit_price`, `bid_negotiation_boq_items.unit_price`, `bid_negotiation_submissions.total_price` |
| `numeric(16,3)` | `tenders.awarded_amount`, `tenders.budget_estimate`, `commercial_evaluations.total_price` |

**Before migration `055` those last three were `numeric(15,2)`** and silently rounded to nearest on
write: a BoQ total of `84317.499` was stored as `84317.50`, and a bid line of `29.998` became a
`30.00` contract. Rounding went either direction, up to 5 fils. The Award Minutes PDF then printed
the rounded figure as the contract value.

Migration `055` widened the three columns. Precision is **16**, not 15, deliberately —
`numeric(15,3)` would allow only 12 whole-dinar digits where `numeric(15,2)` allowed 13;
`numeric(16,3)` keeps all 13 and adds the fils digit, so no existing value can fall out of range.
Widening is non-destructive: values keep their value and gain a trailing zero. Verified by
comparing all 63 stored values before and after — zero numerically changed.

The fix landed while **no stored row had lost anything** (every award to date is a round figure), so
there is no historical corruption to repair. Had it been left until an award landed on a fils value,
the correction would have meant reconciling contract values already issued to vendors.

Scores and weights are `numeric(6,2)` / `numeric(5,2)`; `warranty_years` is `numeric(5,2)` even
though the UI restricts it to a 1–10 integer dropdown.

## Enum types

**`audit_risk_level`** — `LOW` · `MEDIUM` · `HIGH` · `CRITICAL`

**`bid_boq_status`** — `BIDDING` · `NOT_BIDDING`

**`bid_status`** — `DRAFT` · `SUBMITTED` · `LATE_SUBMITTED` · `LATE_ACCEPTED` · `WITHDRAWN` · `DISQUALIFIED` · `EVALUATED` · `AWARDED` · `NOT_AWARDED`

**`captcha_result`** — `SUCCESS` · `FAILURE`

**`clarification_status`** — `OPEN` · `ANSWERED` · `CLOSED`

**`committee_session_status`** — `SCHEDULED` · `IN_SESSION` · `COMPLETED` · `CANCELLED`

**`delivery_period_unit`** — `WEEKS` · `MONTHS`

**`envelope_status`** — `DRAFT` · `SUBMITTED` · `SEALED` · `OPENED` · `LOCKED`

**`envelope_type`** — `TECHNICAL` · `COMMERCIAL`

**`late_exception_status`** — `PENDING_APPROVAL` · `GRANTED` · `REJECTED` · `EXPIRED` · `USED`

**`negotiation_invitation_status`** — `INVITED` · `SUBMITTED`

**`notification_status`** — `QUEUED` · `SENT` · `FAILED` · `BOUNCED`

**`report_export_job_format`** — `XLSX` · `PDF`

**`report_export_job_status`** — `QUEUED` · `RUNNING` · `COMPLETED` · `FAILED`

**`technical_result`** — `PENDING` · `PASS` · `FAIL`

**`tender_status`** — `DRAFT` · `INTERNAL_REVIEW` · `APPROVED` · `PUBLISHED` · `CLARIFICATION_PERIOD` · `SUBMISSION_CLOSED` · `TECHNICAL_OPENING` · `TECHNICAL_EVALUATION` · `COMMERCIAL_SEALED` · `COMMITTEE_COMMERCIAL_OPENING` · `COMMERCIAL_EVALUATION` · `NEGOTIATION` · `AWARD_RECOMMENDATION` · `AWARDED` · `TENDER_CLOSED` · `CANCELLED` · `SUSPENDED` · `ARCHIVED`

**`tender_visibility`** — `PUBLIC` · `INVITATION_ONLY`

**`user_auth_type`** — `AD` · `LOCAL`

**`user_status`** — `ACTIVE` · `SUSPENDED` · `DISABLED`

**`vendor_registration_status`** — `PENDING_VERIFICATION` · `PENDING_REVIEW` · `APPROVED` · `REJECTED`

**`vendor_status`** — `PENDING` · `APPROVED` · `REJECTED` · `SUSPENDED` · `BLACKLISTED`

**`workflow_instance_status`** — `PENDING` · `IN_PROGRESS` · `APPROVED` · `REJECTED` · `CANCELLED`

**`workflow_step_type`** — `SEQUENTIAL` · `PARALLEL`

**`workflow_subject_type`** — `TENDER_CREATION` · `TENDER_PUBLISH` · `TENDER_CANCEL` · `LATE_SUBMISSION_EXCEPTION` · `TECHNICAL_FINALIZE` · `AWARD_RECOMMENDATION` · `AWARD_FINALIZE`

**`workflow_task_status`** — `PENDING` · `APPROVED` · `REJECTED` · `SKIPPED` · `EXPIRED`

> `tender_status` carries 18 values. Anything that maps a tender status for display (badges,
> Arabic labels, vendor-facing refusal messages) must handle all 18 — partial maps have shipped
> bugs here before.

## Identity, access control and audit

### `users`
11 rows on dev

| # | Column | Type | Null | Default | Notes |
|---|---|---|---|---|---|
| 1 | `id` | uuid | no | `gen_random_uuid()` | PK |
| 2 | `ad_username` | varchar(255) | yes | — | unique |
| 3 | `email` | varchar(255) | no | — | unique |
| 4 | `display_name` | varchar(255) | no | — |  |
| 5 | `auth_type` | enum | no | `'AD'::user_auth_type` |  |
| 6 | `password_hash` | text | yes | — |  |
| 7 | `mfa_enabled` | boolean | no | `false` |  |
| 8 | `status` | enum | no | `'ACTIVE'::user_status` |  |
| 9 | `last_login_at` | timestamptz | yes | — |  |
| 10 | `created_at` | timestamptz | no | `now()` |  |
| 11 | `updated_at` | timestamptz | no | `now()` |  |
| 12 | `token_version` | integer | no | `0` |  |
| 13 | `mfa_secret` | text | yes | — |  |
| 14 | `failed_login_count` | integer | no | `0` |  |
| 15 | `locked_until` | timestamptz | yes | — |  |

CHECK constraints:

- `users_ad_or_local_credentials` — `CHECK ((((auth_type = 'AD'::user_auth_type) AND (ad_username IS NOT NULL)) OR ((auth_type = 'LOCAL'::user_auth_type) AND (password_hash IS NOT NULL))))`

Referenced by: `approval_actions.actor_user_id`, `audit_logs.actor_user_id`, `award_minutes.generated_by`, `awards.confirmed_by`, `bid_envelopes.opened_by_user_id`, `commercial_comparisons.generated_by`, `commercial_evaluations.evaluator_user_id`, `committee_attendance.recorded_by`, `committee_members.user_id`, `committee_opening_records.recorded_by`, `committee_sessions.created_by`, `committee_sessions.opened_by`, `document_view_log.user_id`, `evaluation_criteria_library.created_by`, `file_integrity_checks.verified_by_user_id`, `late_submission_exceptions.granted_by`, `negotiation_rounds.closed_by`, `negotiation_rounds.launched_by`, `notification_logs.recipient_user_id`, `report_export_jobs.requested_by`, `security_alerts.acknowledged_by`, `system_settings.updated_by`, `technical_evaluations.evaluator_user_id`, `tender_clarification_replies.replied_by_user_id`, `tender_clarifications.asked_by_user_id`, `tender_documents.uploaded_by`, `tender_vendors.invited_by`, `tender_versions.created_by`, `tenders.created_by`, `tenders.owning_user_id`, `user_departments.user_id`, `user_roles.granted_by`, `user_roles.user_id`, `vendor_registration_requests.reviewed_by`, `vendor_status_history.changed_by`, `vendors.approved_by`, `workflow_instances.initiated_by`, `workflow_tasks.assignee_user_id`, `workflow_tasks.completed_by`, `workflow_templates.created_by`

### `roles`
16 rows on dev

| # | Column | Type | Null | Default | Notes |
|---|---|---|---|---|---|
| 1 | `id` | uuid | no | `gen_random_uuid()` | PK |
| 2 | `code` | varchar(64) | no | — | unique |
| 3 | `name` | varchar(255) | no | — |  |
| 4 | `description` | text | yes | — |  |
| 5 | `is_system` | boolean | no | `false` |  |
| 6 | `created_at` | timestamptz | no | `now()` |  |
| 7 | `hidden_sidebar_items` | ARRAY | no | `'{}'::text[]` |  |
| 8 | `sidebar_label_overrides` | jsonb | no | `'{}'::jsonb` |  |

Referenced by: `role_permissions.role_id`, `user_roles.role_id`, `workflow_steps.required_role_id`, `workflow_tasks.assignee_role_id`

### `permissions`
77 rows on dev

| # | Column | Type | Null | Default | Notes |
|---|---|---|---|---|---|
| 1 | `id` | uuid | no | `gen_random_uuid()` | PK |
| 2 | `code` | varchar(128) | no | — | unique |
| 3 | `category` | varchar(64) | no | — |  |
| 4 | `description` | text | yes | — |  |
| 5 | `created_at` | timestamptz | no | `now()` |  |
| 6 | `name` | varchar(255) | no | — |  |

Referenced by: `role_permissions.permission_id`

### `role_permissions`
224 rows on dev

| # | Column | Type | Null | Default | Notes |
|---|---|---|---|---|---|
| 1 | `role_id` | uuid | no | — | PK; FK → `roles.id` ON DELETE CASCADE |
| 2 | `permission_id` | uuid | no | — | PK; FK → `permissions.id` ON DELETE CASCADE |
| 3 | `granted_at` | timestamptz | no | `now()` |  |

### `user_roles`
12 rows on dev

| # | Column | Type | Null | Default | Notes |
|---|---|---|---|---|---|
| 1 | `user_id` | uuid | no | — | PK; FK → `users.id` ON DELETE CASCADE |
| 2 | `role_id` | uuid | no | — | PK; FK → `roles.id` ON DELETE CASCADE |
| 3 | `granted_by` | uuid | yes | — | FK → `users.id` |
| 4 | `granted_at` | timestamptz | no | `now()` |  |

### `departments`
12 rows on dev

| # | Column | Type | Null | Default | Notes |
|---|---|---|---|---|---|
| 1 | `id` | uuid | no | `gen_random_uuid()` | PK |
| 2 | `code` | varchar(64) | no | — | unique |
| 3 | `name` | varchar(255) | no | — |  |
| 4 | `parent_id` | uuid | yes | — | FK → `departments.id` ON DELETE SET NULL |
| 5 | `is_active` | boolean | no | `true` |  |
| 6 | `created_at` | timestamptz | no | `now()` |  |
| 7 | `updated_at` | timestamptz | no | `now()` |  |
| 8 | `name_ar` | varchar(255) | yes | — | **dev only (054)** |

Referenced by: `departments.parent_id`, `tenders.department_id`, `user_departments.department_id`

### `user_departments`
41 rows on dev

| # | Column | Type | Null | Default | Notes |
|---|---|---|---|---|---|
| 1 | `user_id` | uuid | no | — | PK; FK → `users.id` ON DELETE CASCADE |
| 2 | `department_id` | uuid | no | — | PK; FK → `departments.id` ON DELETE CASCADE |
| 3 | `is_primary` | boolean | no | `false` |  |
| 4 | `assigned_at` | timestamptz | no | `now()` |  |

### `audit_logs`
978 rows on dev

| # | Column | Type | Null | Default | Notes |
|---|---|---|---|---|---|
| 1 | `id` | bigint | no | `nextval('audit_logs_id_seq…` | PK |
| 2 | `event_type` | varchar(128) | no | — |  |
| 3 | `actor_user_id` | uuid | yes | — | FK → `users.id` |
| 4 | `actor_vendor_user_id` | uuid | yes | — | FK → `vendor_users.id` |
| 5 | `actor_role_code` | varchar(64) | yes | — |  |
| 6 | `entity_type` | varchar(64) | no | — |  |
| 7 | `entity_id` | uuid | yes | — |  |
| 8 | `tender_id` | uuid | yes | — |  |
| 9 | `vendor_id` | uuid | yes | — | FK → `vendors.id` |
| 10 | `bid_id` | uuid | yes | — |  |
| 11 | `ip_address` | inet | yes | — |  |
| 12 | `user_agent` | text | yes | — |  |
| 13 | `before_value` | jsonb | yes | — |  |
| 14 | `after_value` | jsonb | yes | — |  |
| 15 | `reason` | text | yes | — |  |
| 16 | `metadata` | jsonb | yes | — |  |
| 17 | `risk_level` | enum | no | `'LOW'::audit_risk_level` |  |
| 18 | `prev_hash_chain_value` | char | yes | — |  |
| 19 | `hash_chain_value` | char | no | — |  |
| 20 | `event_time` | timestamptz | no | `now()` |  |

CHECK constraints:

- `audit_logs_hash_chain_value_hex` — `CHECK ((hash_chain_value ~ '^[a-f0-9]{64}$'::text))`
- `audit_logs_prev_hash_chain_value_hex` — `CHECK (((prev_hash_chain_value IS NULL) OR (prev_hash_chain_value ~ '^[a-f0-9]{64}$'::text)))`

### `security_alerts`
98 rows on dev

| # | Column | Type | Null | Default | Notes |
|---|---|---|---|---|---|
| 1 | `id` | bigint | no | `nextval('security_alerts_i…` | PK |
| 2 | `alert_type` | varchar(64) | no | — |  |
| 3 | `severity` | enum | no | `'MEDIUM'::audit_risk_level` |  |
| 4 | `source_ip` | inet | yes | — |  |
| 5 | `target_entity_type` | varchar(64) | yes | — |  |
| 6 | `target_entity_id` | uuid | yes | — |  |
| 7 | `message` | text | no | — |  |
| 8 | `metadata` | jsonb | yes | — |  |
| 9 | `acknowledged_by` | uuid | yes | — | FK → `users.id` |
| 10 | `acknowledged_at` | timestamptz | yes | — |  |
| 11 | `created_at` | timestamptz | no | `now()` |  |

### `system_settings`
24 rows on dev

| # | Column | Type | Null | Default | Notes |
|---|---|---|---|---|---|
| 1 | `key` | varchar(128) | no | — | PK |
| 2 | `value` | text | yes | — |  |
| 3 | `value_type` | varchar(32) | no | `'string'::character varying` |  |
| 4 | `description` | text | yes | — |  |
| 5 | `updated_by` | uuid | yes | — | FK → `users.id` |
| 6 | `updated_at` | timestamptz | no | `now()` |  |
| 7 | `category` | varchar(64) | yes | — |  |
| 8 | `read_only` | boolean | no | `false` |  |
| 9 | `is_encrypted` | boolean | no | `false` |  |
| 10 | `encrypted_value` | bytea | yes | — |  |

### `file_integrity_checks`
0 rows on dev

| # | Column | Type | Null | Default | Notes |
|---|---|---|---|---|---|
| 1 | `id` | bigint | no | `nextval('file_integrity_ch…` | PK |
| 2 | `bid_document_id` | uuid | yes | — | FK → `bid_documents.id` ON DELETE CASCADE |
| 3 | `expected_checksum` | char | no | — |  |
| 4 | `actual_checksum` | char | no | — |  |
| 5 | `success` | boolean | no | — |  |
| 6 | `verified_by_user_id` | uuid | yes | — | FK → `users.id` |
| 7 | `context` | varchar(64) | yes | — |  |
| 8 | `notes` | text | yes | — |  |
| 9 | `verified_at` | timestamptz | no | `now()` |  |

CHECK constraints:

- `file_integrity_checks_actual_checksum_hex` — `CHECK ((actual_checksum ~ '^[a-f0-9]{64}$'::text))`
- `file_integrity_checks_expected_checksum_hex` — `CHECK ((expected_checksum ~ '^[a-f0-9]{64}$'::text))`

### `document_view_log`
32 rows on dev

| # | Column | Type | Null | Default | Notes |
|---|---|---|---|---|---|
| 1 | `id` | uuid | no | `gen_random_uuid()` | PK |
| 2 | `user_id` | uuid | no | — | FK → `users.id` |
| 3 | `bid_document_id` | uuid | no | — | FK → `bid_documents.id` ON DELETE CASCADE |
| 4 | `tender_id` | uuid | yes | — | FK → `tenders.id` ON DELETE SET NULL |
| 5 | `bid_id` | uuid | yes | — | FK → `bids.id` ON DELETE SET NULL |
| 6 | `view_context` | varchar(64) | no | — |  |
| 7 | `viewed_at` | timestamptz | no | `now()` |  |
| 8 | `ip_address` | varchar(45) | yes | — |  |
| 9 | `user_agent` | text | yes | — |  |

## Vendors and vendor self-service

### `vendors`
17 rows on dev

| # | Column | Type | Null | Default | Notes |
|---|---|---|---|---|---|
| 1 | `id` | uuid | no | `gen_random_uuid()` | PK |
| 2 | `company_name` | varchar(255) | no | — | part of a unique key |
| 3 | `registration_number` | varchar(128) | yes | — | part of a unique key |
| 4 | `tax_number` | varchar(128) | yes | — |  |
| 5 | `country` | char | yes | — |  |
| 6 | `address` | text | yes | — |  |
| 7 | `phone` | varchar(64) | yes | — |  |
| 8 | `website` | varchar(255) | yes | — |  |
| 9 | `status` | enum | no | `'PENDING'::vendor_status` |  |
| 10 | `blacklist_reason` | text | yes | — |  |
| 11 | `suspension_reason` | text | yes | — |  |
| 12 | `approved_by` | uuid | yes | — | FK → `users.id` |
| 13 | `approved_at` | timestamptz | yes | — |  |
| 14 | `created_at` | timestamptz | no | `now()` |  |
| 15 | `updated_at` | timestamptz | no | `now()` |  |
| 16 | `company_name_ar` | varchar(255) | yes | — | **dev only (054)** |

Composite unique: (`company_name`, `registration_number`)

Referenced by: `audit_logs.vendor_id`, `awards.recommended_vendor_id`, `bids.vendor_id`, `late_submission_exceptions.vendor_id`, `tender_clarifications.vendor_id`, `tender_vendors.vendor_id`, `tenders.awarded_vendor_id`, `vendor_documents.vendor_id`, `vendor_registration_requests.vendor_id`, `vendor_status_history.vendor_id`, `vendor_users.vendor_id`

### `vendor_users`
17 rows on dev

| # | Column | Type | Null | Default | Notes |
|---|---|---|---|---|---|
| 1 | `id` | uuid | no | `gen_random_uuid()` | PK |
| 2 | `vendor_id` | uuid | no | — | FK → `vendors.id` ON DELETE CASCADE |
| 3 | `email` | varchar(255) | no | — | unique |
| 4 | `password_hash` | text | no | — |  |
| 5 | `full_name` | varchar(255) | no | — |  |
| 6 | `phone` | varchar(64) | yes | — |  |
| 7 | `is_primary_contact` | boolean | no | `false` |  |
| 8 | `mfa_enabled` | boolean | no | `false` |  |
| 9 | `status` | enum | no | `'ACTIVE'::user_status` |  |
| 10 | `email_verified_at` | timestamptz | yes | — |  |
| 11 | `last_login_at` | timestamptz | yes | — |  |
| 12 | `failed_login_count` | integer | no | `0` |  |
| 13 | `locked_until` | timestamptz | yes | — |  |
| 14 | `created_at` | timestamptz | no | `now()` |  |
| 15 | `updated_at` | timestamptz | no | `now()` |  |
| 16 | `token_version` | integer | no | `0` |  |
| 17 | `mfa_secret` | text | yes | — |  |

Referenced by: `audit_logs.actor_vendor_user_id`, `bid_negotiation_submissions.submitted_by_vendor_user_id`, `bid_submission_receipts.generated_for_vendor_user_id`, `bid_supporting_documents.uploaded_by_vendor_user_id`, `bids.submitted_by_vendor_user_id`, `notification_logs.recipient_vendor_user_id`, `tender_clarification_replies.replied_by_vendor_user_id`, `tender_clarifications.asked_by_vendor_user_id`, `vendor_documents.uploaded_by_vendor_user_id`, `vendor_email_verification_tokens.vendor_user_id`, `vendor_password_reset_tokens.vendor_user_id`

### `vendor_documents`
0 rows on dev

| # | Column | Type | Null | Default | Notes |
|---|---|---|---|---|---|
| 1 | `id` | uuid | no | `gen_random_uuid()` | PK |
| 2 | `vendor_id` | uuid | no | — | FK → `vendors.id` ON DELETE CASCADE |
| 3 | `document_type` | varchar(64) | no | — |  |
| 4 | `original_filename` | varchar(255) | no | — |  |
| 5 | `storage_key` | text | no | — |  |
| 6 | `mime_type` | varchar(128) | no | — |  |
| 7 | `file_size` | bigint | no | — |  |
| 8 | `checksum_sha256` | char | no | — |  |
| 9 | `expiry_date` | date | yes | — |  |
| 10 | `uploaded_by_vendor_user_id` | uuid | yes | — | FK → `vendor_users.id` |
| 11 | `uploaded_at` | timestamptz | no | `now()` |  |

CHECK constraints:

- `vendor_documents_checksum_sha256_hex` — `CHECK ((checksum_sha256 ~ '^[a-f0-9]{64}$'::text))`
- `vendor_documents_file_size_check` — `CHECK ((file_size >= 0))`

### `vendor_registration_requests`
12 rows on dev

| # | Column | Type | Null | Default | Notes |
|---|---|---|---|---|---|
| 1 | `id` | uuid | no | `gen_random_uuid()` | PK |
| 2 | `vendor_id` | uuid | yes | — | FK → `vendors.id` ON DELETE SET NULL |
| 3 | `company_name` | varchar(255) | no | — |  |
| 4 | `registration_number` | varchar(128) | yes | — |  |
| 5 | `contact_email` | varchar(255) | no | — |  |
| 6 | `contact_name` | varchar(255) | yes | — |  |
| 7 | `captcha_verification_id` | bigint | yes | — | FK → `captcha_verification_logs.id` |
| 8 | `submitted_ip` | inet | yes | — |  |
| 9 | `submitted_user_agent` | text | yes | — |  |
| 10 | `status` | enum | no | `'PENDING_VERIFICATION'::ve…` |  |
| 11 | `rejection_reason` | text | yes | — |  |
| 12 | `reviewed_by` | uuid | yes | — | FK → `users.id` |
| 13 | `reviewed_at` | timestamptz | yes | — |  |
| 14 | `submitted_at` | timestamptz | no | `now()` |  |

### `vendor_status_history`
0 rows on dev

| # | Column | Type | Null | Default | Notes |
|---|---|---|---|---|---|
| 1 | `id` | uuid | no | `gen_random_uuid()` | PK |
| 2 | `vendor_id` | uuid | no | — | FK → `vendors.id` ON DELETE CASCADE |
| 3 | `old_status` | enum | yes | — |  |
| 4 | `new_status` | enum | no | — |  |
| 5 | `reason` | text | yes | — |  |
| 6 | `changed_by` | uuid | yes | — | FK → `users.id` |
| 7 | `changed_at` | timestamptz | no | `now()` |  |

### `vendor_email_verification_tokens`
12 rows on dev

| # | Column | Type | Null | Default | Notes |
|---|---|---|---|---|---|
| 1 | `id` | uuid | no | `gen_random_uuid()` | PK |
| 2 | `vendor_user_id` | uuid | no | — | FK → `vendor_users.id` ON DELETE CASCADE |
| 3 | `token_hash` | text | no | — | unique |
| 4 | `expires_at` | timestamptz | no | — |  |
| 5 | `used_at` | timestamptz | yes | — |  |
| 6 | `created_at` | timestamptz | no | `now()` |  |

### `vendor_password_reset_tokens`
5 rows on dev

| # | Column | Type | Null | Default | Notes |
|---|---|---|---|---|---|
| 1 | `id` | uuid | no | `gen_random_uuid()` | PK |
| 2 | `vendor_user_id` | uuid | no | — | FK → `vendor_users.id` ON DELETE CASCADE |
| 3 | `token_hash` | text | no | — | unique |
| 4 | `expires_at` | timestamptz | no | — |  |
| 5 | `used_at` | timestamptz | yes | — |  |
| 6 | `request_ip` | inet | yes | — |  |
| 7 | `request_user_agent` | text | yes | — |  |
| 8 | `created_at` | timestamptz | no | `now()` |  |

### `captcha_verification_logs`
22 rows on dev

| # | Column | Type | Null | Default | Notes |
|---|---|---|---|---|---|
| 1 | `id` | bigint | no | `nextval('captcha_verificat…` | PK |
| 2 | `target_action` | varchar(64) | no | — |  |
| 3 | `provider` | varchar(64) | yes | — |  |
| 4 | `ip_address` | inet | yes | — |  |
| 5 | `user_agent` | text | yes | — |  |
| 6 | `result` | enum | no | — |  |
| 7 | `score` | numeric(4,3) | yes | — |  |
| 8 | `error_code` | varchar(128) | yes | — |  |
| 9 | `verified_at` | timestamptz | no | `now()` |  |

Referenced by: `vendor_registration_requests.captcha_verification_id`

## Tenders

### `tenders`
28 rows on dev

| # | Column | Type | Null | Default | Notes |
|---|---|---|---|---|---|
| 1 | `id` | uuid | no | `gen_random_uuid()` | PK |
| 2 | `reference` | varchar(64) | no | — | unique |
| 3 | `title` | varchar(255) | no | — |  |
| 4 | `summary` | text | yes | — |  |
| 5 | `description` | text | yes | — |  |
| 6 | `department_id` | uuid | no | — | FK → `departments.id` |
| 7 | `category` | varchar(128) | yes | — |  |
| 8 | `tender_type` | varchar(64) | yes | — |  |
| 9 | `budget_estimate` | numeric(16,3) | yes | — |  |
| 10 | `currency` | char | yes | — |  |
| 11 | `visibility` | enum | no | `'PUBLIC'::tender_visibility` |  |
| 12 | `status` | enum | no | `'DRAFT'::tender_status` |  |
| 13 | `submission_open_at` | timestamptz | yes | — |  |
| 14 | `submission_close_at` | timestamptz | yes | — |  |
| 15 | `clarification_close_at` | timestamptz | yes | — |  |
| 16 | `technical_opening_at` | timestamptz | yes | — |  |
| 17 | `awarded_at` | timestamptz | yes | — |  |
| 18 | `awarded_vendor_id` | uuid | yes | — | FK → `vendors.id` |
| 19 | `awarded_amount` | numeric(16,3) | yes | — |  |
| 20 | `current_version` | integer | no | `1` |  |
| 21 | `created_by` | uuid | no | — | FK → `users.id` |
| 22 | `owning_user_id` | uuid | yes | — | FK → `users.id` |
| 23 | `created_at` | timestamptz | no | `now()` |  |
| 24 | `updated_at` | timestamptz | no | `now()` |  |
| 25 | `technical_pass_threshold` | numeric(8,2) | yes | — |  |
| 26 | `previous_status` | enum | yes | — |  |
| 27 | `requires_supporting_documents` | boolean | no | `false` |  |

CHECK constraints:

- `tenders_close_after_open` — `CHECK (((submission_open_at IS NULL) OR (submission_close_at IS NULL) OR (submission_close_at >= submission_open_at)))`

Referenced by: `awards.tender_id`, `bids.tender_id`, `commercial_comparisons.tender_id`, `committee_sessions.tender_id`, `document_view_log.tender_id`, `late_submission_exceptions.tender_id`, `negotiation_rounds.tender_id`, `notification_logs.tender_id`, `tender_boq_items.tender_id`, `tender_clarifications.tender_id`, `tender_documents.tender_id`, `tender_technical_criteria.tender_id`, `tender_vendors.tender_id`, `tender_versions.tender_id`

### `tender_categories`
**dev only (migration 054)** · 8 rows on dev

| # | Column | Type | Null | Default | Notes |
|---|---|---|---|---|---|
| 1 | `id` | uuid | no | `gen_random_uuid()` | PK |
| 2 | `name` | varchar(120) | no | — | unique |
| 3 | `name_ar` | varchar(120) | yes | — |  |
| 4 | `is_active` | boolean | no | `true` |  |
| 5 | `sort_order` | integer | no | `0` |  |
| 6 | `created_at` | timestamptz | no | `now()` |  |
| 7 | `updated_at` | timestamptz | no | `now()` |  |

### `tender_documents`
19 rows on dev

| # | Column | Type | Null | Default | Notes |
|---|---|---|---|---|---|
| 1 | `id` | uuid | no | `gen_random_uuid()` | PK |
| 2 | `tender_id` | uuid | no | — | FK → `tenders.id` ON DELETE CASCADE |
| 3 | `original_filename` | varchar(255) | no | — |  |
| 4 | `storage_key` | text | no | — |  |
| 5 | `mime_type` | varchar(128) | no | — |  |
| 6 | `file_size` | bigint | no | — |  |
| 7 | `checksum_sha256` | char | no | — |  |
| 8 | `is_public` | boolean | no | `true` |  |
| 9 | `uploaded_by` | uuid | no | — | FK → `users.id` |
| 10 | `uploaded_at` | timestamptz | no | `now()` |  |

CHECK constraints:

- `tender_documents_checksum_sha256_hex` — `CHECK ((checksum_sha256 ~ '^[a-f0-9]{64}$'::text))`
- `tender_documents_file_size_check` — `CHECK ((file_size >= 0))`

### `tender_versions`
0 rows on dev

| # | Column | Type | Null | Default | Notes |
|---|---|---|---|---|---|
| 1 | `id` | uuid | no | `gen_random_uuid()` | PK |
| 2 | `tender_id` | uuid | no | — | FK → `tenders.id` ON DELETE CASCADE; part of a unique key |
| 3 | `version_number` | integer | no | — | part of a unique key |
| 4 | `snapshot` | jsonb | no | — |  |
| 5 | `change_summary` | text | yes | — |  |
| 6 | `created_by` | uuid | no | — | FK → `users.id` |
| 7 | `created_at` | timestamptz | no | `now()` |  |

Composite unique: (`tender_id`, `version_number`)

### `tender_vendors`
21 rows on dev

| # | Column | Type | Null | Default | Notes |
|---|---|---|---|---|---|
| 1 | `tender_id` | uuid | no | — | PK; FK → `tenders.id` ON DELETE CASCADE |
| 2 | `vendor_id` | uuid | no | — | PK; FK → `vendors.id` ON DELETE CASCADE |
| 3 | `invited_by` | uuid | yes | — | FK → `users.id` |
| 4 | `invited_at` | timestamptz | no | `now()` |  |
| 5 | `extra_notification_emails` | ARRAY | yes | — |  |
| 6 | `notified_at` | timestamptz | yes | — |  |

### `tender_boq_items`
87 rows on dev

| # | Column | Type | Null | Default | Notes |
|---|---|---|---|---|---|
| 1 | `id` | uuid | no | `gen_random_uuid()` | PK |
| 2 | `tender_id` | uuid | no | — | FK → `tenders.id` ON DELETE CASCADE; part of a unique key |
| 3 | `item_no` | varchar(50) | no | — | part of a unique key |
| 4 | `description` | text | no | — |  |
| 5 | `qty` | numeric(15,3) | no | — |  |
| 6 | `unit` | varchar(50) | no | — |  |
| 7 | `sort_order` | integer | no | `0` |  |
| 8 | `created_at` | timestamptz | no | `now()` |  |

Composite unique: (`item_no`, `tender_id`)

CHECK constraints:

- `tender_boq_items_qty_check` — `CHECK ((qty > (0)::numeric))`

Referenced by: `bid_boq_items.tender_boq_item_id`, `bid_negotiation_boq_items.tender_boq_item_id`

### `tender_technical_criteria`
56 rows on dev

| # | Column | Type | Null | Default | Notes |
|---|---|---|---|---|---|
| 1 | `id` | uuid | no | `gen_random_uuid()` | PK |
| 2 | `tender_id` | uuid | no | — | FK → `tenders.id` ON DELETE CASCADE; part of a unique key |
| 3 | `code` | varchar(64) | no | — | part of a unique key |
| 4 | `name` | varchar(255) | no | — |  |
| 5 | `description` | text | yes | — |  |
| 6 | `max_score` | numeric(8,2) | no | — |  |
| 7 | `weight` | numeric(5,2) | yes | — |  |
| 8 | `mandatory` | boolean | no | `false` |  |
| 9 | `sort_order` | integer | no | `0` |  |
| 10 | `created_at` | timestamptz | no | `now()` |  |
| 11 | `evaluator_role` | varchar(32) | no | `'EITHER'::character varying` |  |

Composite unique: (`code`, `tender_id`)

CHECK constraints:

- `tender_technical_criteria_max_score_check` — `CHECK ((max_score > (0)::numeric))`

### `tender_clarifications`
26 rows on dev

| # | Column | Type | Null | Default | Notes |
|---|---|---|---|---|---|
| 1 | `id` | uuid | no | `gen_random_uuid()` | PK |
| 2 | `tender_id` | uuid | no | — | FK → `tenders.id` ON DELETE CASCADE |
| 3 | `vendor_id` | uuid | yes | — | FK → `vendors.id` ON DELETE SET NULL |
| 4 | `asked_by_user_id` | uuid | yes | — | FK → `users.id` |
| 5 | `asked_by_vendor_user_id` | uuid | yes | — | FK → `vendor_users.id` |
| 6 | `question` | text | no | — |  |
| 8 | `status` | enum | no | `'OPEN'::clarification_status` |  |
| 9 | `created_at` | timestamptz | no | `now()` |  |

CHECK constraints:

- `clarification_asker_present` — `CHECK (((asked_by_user_id IS NOT NULL) OR (asked_by_vendor_user_id IS NOT NULL)))`

Referenced by: `tender_clarification_replies.clarification_id`

### `tender_clarification_replies`
28 rows on dev

| # | Column | Type | Null | Default | Notes |
|---|---|---|---|---|---|
| 1 | `id` | uuid | no | `gen_random_uuid()` | PK |
| 2 | `clarification_id` | uuid | no | — | FK → `tender_clarifications.id` ON DELETE CASCADE |
| 3 | `replied_by_user_id` | uuid | yes | — | FK → `users.id` |
| 4 | `answer` | text | no | — |  |
| 5 | `created_at` | timestamptz | no | `now()` |  |
| 6 | `is_public` | boolean | no | `false` |  |
| 7 | `replied_by_vendor_user_id` | uuid | yes | — | FK → `vendor_users.id` ON DELETE SET NULL |

CHECK constraints:

- `tender_clarification_replies_reply_caller_check` — `CHECK ((((replied_by_user_id IS NOT NULL) AND (replied_by_vendor_user_id IS NULL)) OR ((replied_by_user_id IS NULL) AND (replied_by_vendor_user_id IS NOT NULL))))`

### `evaluation_criteria_library`
12 rows on dev

| # | Column | Type | Null | Default | Notes |
|---|---|---|---|---|---|
| 1 | `id` | uuid | no | `gen_random_uuid()` | PK |
| 2 | `name` | varchar(200) | no | — |  |
| 3 | `description` | text | yes | — |  |
| 4 | `default_weight` | numeric(5,2) | yes | — |  |
| 5 | `default_max_score` | numeric(8,2) | no | `100.00` |  |
| 6 | `default_is_gate` | boolean | no | `false` |  |
| 7 | `is_active` | boolean | no | `true` |  |
| 8 | `created_by` | uuid | yes | — | FK → `users.id` |
| 9 | `created_at` | timestamptz | no | `now()` |  |
| 10 | `updated_at` | timestamptz | no | `now()` |  |

## Bids and envelopes

### `bids`
46 rows on dev

| # | Column | Type | Null | Default | Notes |
|---|---|---|---|---|---|
| 1 | `id` | uuid | no | `gen_random_uuid()` | PK |
| 2 | `tender_id` | uuid | no | — | FK → `tenders.id`; part of a unique key |
| 3 | `vendor_id` | uuid | no | — | FK → `vendors.id`; part of a unique key |
| 4 | `status` | enum | no | `'DRAFT'::bid_status` |  |
| 5 | `submitted_at` | timestamptz | yes | — |  |
| 6 | `submitted_by_vendor_user_id` | uuid | yes | — | FK → `vendor_users.id` |
| 7 | `withdrawn_at` | timestamptz | yes | — |  |
| 8 | `technical_result` | enum | no | `'PENDING'::technical_result` |  |
| 9 | `late_exception_id` | uuid | yes | — | FK → `late_submission_exceptions.id` |
| 10 | `is_alternative` | boolean | no | `false` | part of a unique key |
| 11 | `created_at` | timestamptz | no | `now()` |  |
| 12 | `updated_at` | timestamptz | no | `now()` |  |
| 13 | `brand_manufacturer` | varchar(255) | yes | — |  |
| 14 | `country_of_origin` | varchar(120) | yes | — |  |
| 15 | `warranty_years` | numeric(5,2) | yes | — |  |
| 16 | `delivery_from` | integer | yes | — |  |
| 17 | `delivery_to` | integer | yes | — |  |
| 18 | `delivery_unit` | enum | yes | — |  |
| 19 | `payment_terms` | text | yes | — |  |

Composite unique: (`is_alternative`, `tender_id`, `vendor_id`)

CHECK constraints:

- `bids_delivery_positive` — `CHECK ((((delivery_from IS NULL) OR (delivery_from > 0)) AND ((delivery_to IS NULL) OR (delivery_to > 0))))`
- `bids_delivery_range_ordered` — `CHECK (((delivery_from IS NULL) OR (delivery_to IS NULL) OR (delivery_to >= delivery_from)))`
- `bids_delivery_requires_from` — `CHECK (((delivery_from IS NOT NULL) OR ((delivery_to IS NULL) AND (delivery_unit IS NULL))))`
- `bids_delivery_requires_unit` — `CHECK (((delivery_from IS NULL) OR (delivery_unit IS NOT NULL)))`
- `bids_warranty_years_nonneg` — `CHECK (((warranty_years IS NULL) OR (warranty_years >= (0)::numeric)))`

Referenced by: `awards.recommended_bid_id`, `bid_boq_items.bid_id`, `bid_envelopes.bid_id`, `bid_submission_receipts.bid_id`, `bid_supporting_documents.bid_id`, `commercial_evaluations.bid_id`, `document_view_log.bid_id`, `negotiation_invitations.bid_id`, `technical_evaluations.bid_id`

### `bid_envelopes`
92 rows on dev

| # | Column | Type | Null | Default | Notes |
|---|---|---|---|---|---|
| 1 | `id` | uuid | no | `gen_random_uuid()` | PK |
| 2 | `bid_id` | uuid | no | — | FK → `bids.id` ON DELETE CASCADE; part of a unique key |
| 3 | `envelope_type` | enum | no | — | part of a unique key |
| 4 | `status` | enum | no | `'DRAFT'::envelope_status` |  |
| 5 | `submitted_at` | timestamptz | yes | — |  |
| 6 | `opened_at` | timestamptz | yes | — |  |
| 7 | `opened_by_user_id` | uuid | yes | — | FK → `users.id` |
| 8 | `committee_session_id` | uuid | yes | — | FK → `committee_sessions.id` |
| 9 | `hash_verified_at` | timestamptz | yes | — |  |
| 10 | `locked_at` | timestamptz | yes | — |  |
| 11 | `created_at` | timestamptz | no | `now()` |  |
| 12 | `updated_at` | timestamptz | no | `now()` |  |

Composite unique: (`bid_id`, `envelope_type`)

CHECK constraints:

- `commercial_open_requires_session` — `CHECK (((envelope_type <> 'COMMERCIAL'::envelope_type) OR (status <> 'OPENED'::envelope_status) OR (committee_session_id IS NOT NULL)))`

Referenced by: `bid_documents.bid_envelope_id`, `committee_opening_records.bid_envelope_id`

### `bid_documents`
93 rows on dev

| # | Column | Type | Null | Default | Notes |
|---|---|---|---|---|---|
| 1 | `id` | uuid | no | `gen_random_uuid()` | PK |
| 2 | `bid_envelope_id` | uuid | no | — | FK → `bid_envelopes.id` ON DELETE CASCADE |
| 3 | `original_filename` | varchar(255) | no | — |  |
| 4 | `storage_key` | text | no | — |  |
| 5 | `mime_type` | varchar(128) | no | — |  |
| 6 | `file_size` | bigint | no | — |  |
| 7 | `checksum_sha256` | char | no | — |  |
| 8 | `uploaded_at` | timestamptz | no | `now()` |  |
| 9 | `submitted_at` | timestamptz | yes | — |  |
| 10 | `locked_at` | timestamptz | yes | — |  |

CHECK constraints:

- `bid_documents_checksum_sha256_hex` — `CHECK ((checksum_sha256 ~ '^[a-f0-9]{64}$'::text))`
- `bid_documents_file_size_check` — `CHECK ((file_size >= 0))`

Referenced by: `document_view_log.bid_document_id`, `file_integrity_checks.bid_document_id`

### `bid_supporting_documents`
13 rows on dev

| # | Column | Type | Null | Default | Notes |
|---|---|---|---|---|---|
| 1 | `id` | uuid | no | `gen_random_uuid()` | PK |
| 2 | `bid_id` | uuid | no | — | FK → `bids.id` ON DELETE CASCADE |
| 3 | `original_filename` | varchar(255) | no | — |  |
| 4 | `storage_key` | text | no | — |  |
| 5 | `mime_type` | varchar(128) | no | — |  |
| 6 | `file_size` | bigint | no | — |  |
| 7 | `checksum_sha256` | char | no | — |  |
| 8 | `uploaded_by_vendor_user_id` | uuid | yes | — | FK → `vendor_users.id` |
| 9 | `uploaded_at` | timestamptz | no | `now()` |  |
| 10 | `locked_at` | timestamptz | yes | — |  |

### `bid_boq_items`
151 rows on dev

| # | Column | Type | Null | Default | Notes |
|---|---|---|---|---|---|
| 1 | `id` | uuid | no | `gen_random_uuid()` | PK |
| 2 | `bid_id` | uuid | no | — | FK → `bids.id` ON DELETE CASCADE; part of a unique key |
| 3 | `tender_boq_item_id` | uuid | no | — | FK → `tender_boq_items.id` ON DELETE RESTRICT; part of a unique key |
| 4 | `status` | enum | no | `'BIDDING'::bid_boq_status` |  |
| 5 | `unit_price` | numeric(15,3) | yes | — |  |
| 6 | `remarks` | text | yes | — |  |
| 7 | `created_at` | timestamptz | no | `now()` |  |
| 8 | `updated_at` | timestamptz | no | `now()` |  |

Composite unique: (`bid_id`, `tender_boq_item_id`)

CHECK constraints:

- `bid_boq_items_status_price_consistent` — `CHECK ((((status = 'BIDDING'::bid_boq_status) AND (unit_price IS NOT NULL) AND (unit_price >= (0)::numeric)) OR ((status = 'NOT_BIDDING'::bid_boq_status) AND (unit_price IS NULL))))`

### `bid_submission_receipts`
40 rows on dev

| # | Column | Type | Null | Default | Notes |
|---|---|---|---|---|---|
| 1 | `id` | uuid | no | `gen_random_uuid()` | PK |
| 2 | `bid_id` | uuid | no | — | FK → `bids.id` ON DELETE CASCADE; unique |
| 3 | `receipt_number` | varchar(64) | no | — | unique |
| 4 | `generated_for_vendor_user_id` | uuid | yes | — | FK → `vendor_users.id` |
| 5 | `receipt_hash` | char | no | — |  |
| 6 | `snapshot` | jsonb | no | — |  |
| 7 | `generated_at` | timestamptz | no | `now()` |  |

CHECK constraints:

- `bid_submission_receipts_receipt_hash_hex` — `CHECK ((receipt_hash ~ '^[a-f0-9]{64}$'::text))`

### `late_submission_exceptions`
0 rows on dev

| # | Column | Type | Null | Default | Notes |
|---|---|---|---|---|---|
| 1 | `id` | uuid | no | `gen_random_uuid()` | PK |
| 2 | `tender_id` | uuid | no | — | FK → `tenders.id` ON DELETE CASCADE |
| 3 | `vendor_id` | uuid | no | — | FK → `vendors.id` ON DELETE CASCADE |
| 4 | `granted_by` | uuid | yes | — | FK → `users.id` |
| 5 | `granted_at` | timestamptz | yes | — |  |
| 6 | `reason` | text | no | — |  |
| 7 | `expires_at` | timestamptz | no | — |  |
| 8 | `status` | enum | no | `'PENDING_APPROVAL'::late_e…` |  |
| 9 | `approval_workflow_instance_id` | uuid | yes | — | FK → `workflow_instances.id` |
| 10 | `audit_log_id` | bigint | yes | — |  |
| 11 | `created_at` | timestamptz | no | `now()` |  |
| 12 | `updated_at` | timestamptz | no | `now()` |  |

CHECK constraints:

- `late_exception_expiry_after_grant` — `CHECK (((granted_at IS NULL) OR (expires_at > granted_at)))`

Referenced by: `bids.late_exception_id`

## Evaluation, committee and comparison

### `technical_evaluations`
35 rows on dev

| # | Column | Type | Null | Default | Notes |
|---|---|---|---|---|---|
| 1 | `id` | uuid | no | `gen_random_uuid()` | PK |
| 2 | `bid_id` | uuid | no | — | FK → `bids.id` ON DELETE CASCADE; part of a unique key |
| 3 | `evaluator_user_id` | uuid | no | — | FK → `users.id`; part of a unique key |
| 4 | `overall_score` | numeric(6,2) | yes | — |  |
| 5 | `result` | enum | no | `'PENDING'::technical_result` |  |
| 6 | `comments` | text | yes | — |  |
| 7 | `finalized_at` | timestamptz | yes | — |  |
| 8 | `created_at` | timestamptz | no | `now()` |  |
| 9 | `updated_at` | timestamptz | no | `now()` |  |

Composite unique: (`bid_id`, `evaluator_user_id`)

Referenced by: `technical_evaluation_scores.technical_evaluation_id`

### `technical_evaluation_scores`
107 rows on dev

| # | Column | Type | Null | Default | Notes |
|---|---|---|---|---|---|
| 1 | `id` | uuid | no | `gen_random_uuid()` | PK |
| 2 | `technical_evaluation_id` | uuid | no | — | FK → `technical_evaluations.id` ON DELETE CASCADE |
| 3 | `criterion` | varchar(255) | no | — |  |
| 4 | `weight` | numeric(6,2) | no | — |  |
| 5 | `score` | numeric(6,2) | no | — |  |
| 6 | `comments` | text | yes | — |  |

### `committee_sessions`
17 rows on dev

| # | Column | Type | Null | Default | Notes |
|---|---|---|---|---|---|
| 1 | `id` | uuid | no | `gen_random_uuid()` | PK |
| 2 | `tender_id` | uuid | no | — | FK → `tenders.id` ON DELETE CASCADE |
| 3 | `scheduled_at` | timestamptz | no | — |  |
| 4 | `location` | varchar(255) | yes | — |  |
| 5 | `status` | enum | no | `'SCHEDULED'::committee_ses…` |  |
| 6 | `opened_by` | uuid | yes | — | FK → `users.id` |
| 7 | `opened_at` | timestamptz | yes | — |  |
| 8 | `minutes_text` | text | yes | — |  |
| 9 | `created_by` | uuid | no | — | FK → `users.id` |
| 10 | `created_at` | timestamptz | no | `now()` |  |
| 11 | `updated_at` | timestamptz | no | `now()` |  |
| 12 | `required_quorum_count` | integer | yes | — |  |
| 13 | `required_role_code` | varchar(50) | yes | `'CHAIR'::character varying` |  |

Referenced by: `bid_envelopes.committee_session_id`, `committee_attendance.session_id`, `committee_members.session_id`, `committee_opening_records.session_id`

### `committee_members`
51 rows on dev

| # | Column | Type | Null | Default | Notes |
|---|---|---|---|---|---|
| 1 | `id` | uuid | no | `gen_random_uuid()` | PK |
| 2 | `session_id` | uuid | no | — | FK → `committee_sessions.id` ON DELETE CASCADE; part of a unique key |
| 3 | `user_id` | uuid | no | — | FK → `users.id`; part of a unique key |
| 4 | `role_in_committee` | varchar(64) | yes | — |  |
| 5 | `is_chair` | boolean | no | `false` |  |
| 6 | `added_at` | timestamptz | no | `now()` |  |

Composite unique: (`session_id`, `user_id`)

Referenced by: `committee_attendance.member_id`

### `committee_attendance`
51 rows on dev

| # | Column | Type | Null | Default | Notes |
|---|---|---|---|---|---|
| 1 | `id` | uuid | no | `gen_random_uuid()` | PK |
| 2 | `session_id` | uuid | no | — | FK → `committee_sessions.id` ON DELETE CASCADE; part of a unique key |
| 3 | `member_id` | uuid | no | — | FK → `committee_members.id` ON DELETE CASCADE; part of a unique key |
| 4 | `present` | boolean | no | — |  |
| 5 | `remarks` | text | yes | — |  |
| 6 | `recorded_by` | uuid | no | — | FK → `users.id` |
| 7 | `recorded_at` | timestamptz | no | `now()` |  |

Composite unique: (`member_id`, `session_id`)

### `committee_opening_records`
32 rows on dev

| # | Column | Type | Null | Default | Notes |
|---|---|---|---|---|---|
| 1 | `id` | uuid | no | `gen_random_uuid()` | PK |
| 2 | `session_id` | uuid | no | — | FK → `committee_sessions.id` ON DELETE CASCADE; part of a unique key |
| 3 | `bid_envelope_id` | uuid | no | — | FK → `bid_envelopes.id`; part of a unique key |
| 4 | `checksum_verified` | boolean | no | — |  |
| 5 | `checksum_verified_at` | timestamptz | no | `now()` |  |
| 6 | `opening_remarks` | text | yes | — |  |
| 7 | `recorded_by` | uuid | no | — | FK → `users.id` |
| 8 | `recorded_at` | timestamptz | no | `now()` |  |

Composite unique: (`bid_envelope_id`, `session_id`)

### `commercial_evaluations`
7 rows on dev

| # | Column | Type | Null | Default | Notes |
|---|---|---|---|---|---|
| 1 | `id` | uuid | no | `gen_random_uuid()` | PK |
| 2 | `bid_id` | uuid | no | — | FK → `bids.id` ON DELETE CASCADE; part of a unique key |
| 3 | `evaluator_user_id` | uuid | no | — | FK → `users.id`; part of a unique key |
| 4 | `total_price` | numeric(16,3) | yes | — |  |
| 5 | `currency` | char | yes | — |  |
| 6 | `score` | numeric(6,2) | yes | — |  |
| 7 | `comments` | text | yes | — |  |
| 8 | `created_at` | timestamptz | no | `now()` |  |
| 9 | `updated_at` | timestamptz | no | `now()` |  |

Composite unique: (`bid_id`, `evaluator_user_id`)

### `commercial_comparisons`
0 rows on dev

| # | Column | Type | Null | Default | Notes |
|---|---|---|---|---|---|
| 1 | `id` | uuid | no | `gen_random_uuid()` | PK |
| 2 | `tender_id` | uuid | no | — | FK → `tenders.id` ON DELETE CASCADE |
| 3 | `snapshot` | jsonb | no | — |  |
| 4 | `generated_by` | uuid | no | — | FK → `users.id` |
| 5 | `generated_at` | timestamptz | no | `now()` |  |

## Negotiation

### `negotiation_rounds`
3 rows on dev

| # | Column | Type | Null | Default | Notes |
|---|---|---|---|---|---|
| 1 | `id` | uuid | no | `gen_random_uuid()` | PK |
| 2 | `tender_id` | uuid | no | — | FK → `tenders.id` ON DELETE CASCADE; part of a unique key |
| 3 | `round_number` | integer | no | — | part of a unique key |
| 4 | `launched_by` | uuid | no | — | FK → `users.id` |
| 5 | `launched_at` | timestamptz | no | `now()` |  |
| 6 | `launch_reason` | text | no | — |  |
| 7 | `closed_at` | timestamptz | yes | — |  |
| 8 | `closed_by` | uuid | yes | — | FK → `users.id` |
| 9 | `close_reason` | text | yes | — |  |

Composite unique: (`round_number`, `tender_id`)

CHECK constraints:

- `negotiation_rounds_reason_min_length` — `CHECK ((length(launch_reason) >= 20))`

Referenced by: `negotiation_invitations.round_id`

### `negotiation_invitations`
5 rows on dev

| # | Column | Type | Null | Default | Notes |
|---|---|---|---|---|---|
| 1 | `id` | uuid | no | `gen_random_uuid()` | PK |
| 2 | `round_id` | uuid | no | — | FK → `negotiation_rounds.id` ON DELETE CASCADE; part of a unique key |
| 3 | `bid_id` | uuid | no | — | FK → `bids.id` ON DELETE RESTRICT; part of a unique key |
| 4 | `invited_at` | timestamptz | no | `now()` |  |
| 5 | `status` | enum | no | `'INVITED'::negotiation_inv…` |  |

Composite unique: (`bid_id`, `round_id`)

Referenced by: `bid_negotiation_submissions.invitation_id`

### `bid_negotiation_submissions`
3 rows on dev

| # | Column | Type | Null | Default | Notes |
|---|---|---|---|---|---|
| 1 | `id` | uuid | no | `gen_random_uuid()` | PK |
| 2 | `invitation_id` | uuid | no | — | FK → `negotiation_invitations.id` ON DELETE CASCADE; unique |
| 3 | `submitted_at` | timestamptz | no | `now()` |  |
| 4 | `submitted_by_vendor_user_id` | uuid | yes | — | FK → `vendor_users.id` |
| 5 | `total_price` | numeric(15,3) | yes | — |  |
| 6 | `currency` | char | no | `'KWD'::bpchar` |  |
| 7 | `commercial_pdf_storage_key` | text | no | — |  |
| 8 | `commercial_pdf_sha256` | char | no | — |  |
| 9 | `commercial_pdf_filename` | varchar(255) | no | — |  |
| 10 | `remarks` | text | yes | — |  |
| 11 | `brand_manufacturer` | varchar(255) | yes | — |  |
| 12 | `country_of_origin` | varchar(120) | yes | — |  |
| 13 | `warranty_years` | numeric(5,2) | yes | — |  |
| 14 | `delivery_from` | integer | yes | — |  |
| 15 | `delivery_to` | integer | yes | — |  |
| 16 | `delivery_unit` | enum | yes | — |  |
| 17 | `payment_terms` | text | yes | — |  |

CHECK constraints:

- `bid_neg_sub_delivery_positive` — `CHECK ((((delivery_from IS NULL) OR (delivery_from > 0)) AND ((delivery_to IS NULL) OR (delivery_to > 0))))`
- `bid_neg_sub_delivery_range_ordered` — `CHECK (((delivery_from IS NULL) OR (delivery_to IS NULL) OR (delivery_to >= delivery_from)))`
- `bid_neg_sub_delivery_requires_from` — `CHECK (((delivery_from IS NOT NULL) OR ((delivery_to IS NULL) AND (delivery_unit IS NULL))))`
- `bid_neg_sub_delivery_requires_unit` — `CHECK (((delivery_from IS NULL) OR (delivery_unit IS NOT NULL)))`
- `bid_neg_sub_warranty_years_nonneg` — `CHECK (((warranty_years IS NULL) OR (warranty_years >= (0)::numeric)))`

Referenced by: `bid_negotiation_boq_items.submission_id`

### `bid_negotiation_boq_items`
21 rows on dev

| # | Column | Type | Null | Default | Notes |
|---|---|---|---|---|---|
| 1 | `id` | uuid | no | `gen_random_uuid()` | PK |
| 2 | `submission_id` | uuid | no | — | FK → `bid_negotiation_submissions.id` ON DELETE CASCADE; part of a unique key |
| 3 | `tender_boq_item_id` | uuid | no | — | FK → `tender_boq_items.id` ON DELETE RESTRICT; part of a unique key |
| 4 | `status` | enum | no | `'BIDDING'::bid_boq_status` |  |
| 5 | `unit_price` | numeric(15,3) | yes | — |  |
| 6 | `remarks` | text | yes | — |  |

Composite unique: (`submission_id`, `tender_boq_item_id`)

CHECK constraints:

- `bid_negotiation_boq_items_status_price_consistent` — `CHECK ((((status = 'BIDDING'::bid_boq_status) AND (unit_price IS NOT NULL) AND (unit_price >= (0)::numeric)) OR ((status = 'NOT_BIDDING'::bid_boq_status) AND (unit_price IS NULL))))`

## Award

### `awards`
11 rows on dev

| # | Column | Type | Null | Default | Notes |
|---|---|---|---|---|---|
| 1 | `id` | uuid | no | `gen_random_uuid()` | PK |
| 2 | `tender_id` | uuid | no | — | FK → `tenders.id` ON DELETE CASCADE |
| 3 | `recommended_vendor_id` | uuid | no | — | FK → `vendors.id` |
| 4 | `recommended_bid_id` | uuid | no | — | FK → `bids.id` |
| 5 | `is_lowest` | boolean | no | — |  |
| 6 | `justification_text` | text | yes | — |  |
| 7 | `justification_pdf_storage_key` | text | yes | — |  |
| 8 | `justification_pdf_sha256` | char | yes | — |  |
| 9 | `justification_pdf_filename` | varchar(255) | yes | — |  |
| 10 | `notify_winner` | boolean | no | `false` |  |
| 11 | `notify_losers` | boolean | no | `false` |  |
| 12 | `confirmed_by` | uuid | no | — | FK → `users.id` |
| 13 | `confirmed_at` | timestamptz | no | `now()` |  |
| 14 | `superseded_by_award_id` | uuid | yes | — | FK → `awards.id` |
| 15 | `superseded_at` | timestamptz | yes | — |  |

CHECK constraints:

- `awards_override_requires_justification` — `CHECK (((is_lowest = true) OR (justification_text IS NOT NULL)))`

Referenced by: `award_minutes.award_id`, `awards.superseded_by_award_id`

### `award_minutes`
26 rows on dev

| # | Column | Type | Null | Default | Notes |
|---|---|---|---|---|---|
| 1 | `id` | uuid | no | `gen_random_uuid()` | PK |
| 2 | `award_id` | uuid | no | — | FK → `awards.id` ON DELETE CASCADE |
| 3 | `pdf_storage_key` | text | no | — |  |
| 4 | `sha256` | char | no | — |  |
| 5 | `generated_by` | uuid | no | — | FK → `users.id` |
| 6 | `generated_at` | timestamptz | no | `now()` |  |

## Workflow / approvals

### `workflow_templates`
0 rows on dev

| # | Column | Type | Null | Default | Notes |
|---|---|---|---|---|---|
| 1 | `id` | uuid | no | `gen_random_uuid()` | PK |
| 2 | `code` | varchar(64) | no | — | unique |
| 3 | `name` | varchar(255) | no | — |  |
| 4 | `description` | text | yes | — |  |
| 5 | `subject_type` | enum | no | — |  |
| 6 | `is_active` | boolean | no | `true` |  |
| 7 | `created_by` | uuid | yes | — | FK → `users.id` |
| 8 | `created_at` | timestamptz | no | `now()` |  |
| 9 | `updated_at` | timestamptz | no | `now()` |  |

Referenced by: `workflow_instances.template_id`, `workflow_steps.template_id`

### `workflow_steps`
0 rows on dev

| # | Column | Type | Null | Default | Notes |
|---|---|---|---|---|---|
| 1 | `id` | uuid | no | `gen_random_uuid()` | PK |
| 2 | `template_id` | uuid | no | — | FK → `workflow_templates.id` ON DELETE CASCADE; part of a unique key |
| 3 | `sequence` | integer | no | — | part of a unique key |
| 4 | `step_type` | enum | no | `'SEQUENTIAL'::workflow_ste…` |  |
| 5 | `required_role_id` | uuid | yes | — | FK → `roles.id` |
| 6 | `required_permission_code` | varchar(128) | yes | — |  |
| 7 | `min_approvers` | integer | no | `1` |  |
| 8 | `requires_rejection_comment` | boolean | no | `true` |  |

Composite unique: (`sequence`, `template_id`)

CHECK constraints:

- `workflow_steps_min_approvers_check` — `CHECK ((min_approvers > 0))`

Referenced by: `workflow_tasks.step_id`

### `workflow_instances`
0 rows on dev

| # | Column | Type | Null | Default | Notes |
|---|---|---|---|---|---|
| 1 | `id` | uuid | no | `gen_random_uuid()` | PK |
| 2 | `template_id` | uuid | no | — | FK → `workflow_templates.id` |
| 3 | `subject_type` | enum | no | — |  |
| 4 | `subject_id` | uuid | no | — |  |
| 5 | `status` | enum | no | `'PENDING'::workflow_instan…` |  |
| 6 | `current_step` | integer | no | `1` |  |
| 7 | `initiated_by` | uuid | no | — | FK → `users.id` |
| 8 | `initiated_at` | timestamptz | no | `now()` |  |
| 9 | `completed_at` | timestamptz | yes | — |  |

Referenced by: `late_submission_exceptions.approval_workflow_instance_id`, `workflow_tasks.instance_id`

### `workflow_tasks`
0 rows on dev

| # | Column | Type | Null | Default | Notes |
|---|---|---|---|---|---|
| 1 | `id` | uuid | no | `gen_random_uuid()` | PK |
| 2 | `instance_id` | uuid | no | — | FK → `workflow_instances.id` ON DELETE CASCADE |
| 3 | `step_id` | uuid | no | — | FK → `workflow_steps.id` |
| 4 | `assignee_user_id` | uuid | yes | — | FK → `users.id` |
| 5 | `assignee_role_id` | uuid | yes | — | FK → `roles.id` |
| 6 | `status` | enum | no | `'PENDING'::workflow_task_s…` |  |
| 7 | `comments` | text | yes | — |  |
| 8 | `completed_by` | uuid | yes | — | FK → `users.id` |
| 9 | `completed_at` | timestamptz | yes | — |  |
| 10 | `created_at` | timestamptz | no | `now()` |  |

Referenced by: `approval_actions.task_id`

### `approval_actions`
0 rows on dev

| # | Column | Type | Null | Default | Notes |
|---|---|---|---|---|---|
| 1 | `id` | uuid | no | `gen_random_uuid()` | PK |
| 2 | `task_id` | uuid | no | — | FK → `workflow_tasks.id` ON DELETE CASCADE |
| 3 | `actor_user_id` | uuid | no | — | FK → `users.id` |
| 4 | `action` | varchar(32) | no | — |  |
| 5 | `comments` | text | yes | — |  |
| 6 | `action_at` | timestamptz | no | `now()` |  |

## Notifications and reporting

### `notification_templates`
11 rows on dev

| # | Column | Type | Null | Default | Notes |
|---|---|---|---|---|---|
| 1 | `id` | uuid | no | `gen_random_uuid()` | PK |
| 2 | `code` | varchar(64) | no | — | unique |
| 3 | `subject_template` | text | no | — |  |
| 4 | `body_template` | text | no | — |  |
| 5 | `channel` | varchar(32) | no | `'EMAIL'::character varying` |  |
| 6 | `locale` | varchar(8) | no | `'en'::character varying` |  |
| 7 | `is_active` | boolean | no | `true` |  |
| 8 | `created_at` | timestamptz | no | `now()` |  |
| 9 | `updated_at` | timestamptz | no | `now()` |  |
| 10 | `name` | varchar(255) | no | — |  |

### `notification_logs`
88 rows on dev

| # | Column | Type | Null | Default | Notes |
|---|---|---|---|---|---|
| 1 | `id` | bigint | no | `nextval('notification_logs…` | PK |
| 2 | `template_code` | varchar(64) | no | — |  |
| 3 | `subject` | text | no | — |  |
| 4 | `recipient_email` | varchar(255) | no | — |  |
| 5 | `recipient_user_id` | uuid | yes | — | FK → `users.id` |
| 6 | `recipient_vendor_user_id` | uuid | yes | — | FK → `vendor_users.id` |
| 7 | `tender_id` | uuid | yes | — | FK → `tenders.id` |
| 8 | `status` | enum | no | `'QUEUED'::notification_sta…` |  |
| 9 | `error` | text | yes | — |  |
| 10 | `sent_at` | timestamptz | yes | — |  |
| 11 | `created_at` | timestamptz | no | `now()` |  |

### `report_export_jobs`
52 rows on dev

| # | Column | Type | Null | Default | Notes |
|---|---|---|---|---|---|
| 1 | `id` | uuid | no | `gen_random_uuid()` | PK |
| 2 | `report_code` | varchar(128) | no | — |  |
| 3 | `report_name` | varchar(255) | yes | — |  |
| 4 | `requested_by` | uuid | no | — | FK → `users.id` |
| 5 | `status` | enum | no | `'QUEUED'::report_export_jo…` |  |
| 6 | `format` | enum | no | `'XLSX'::report_export_job_…` |  |
| 7 | `filters` | jsonb | yes | — |  |
| 8 | `enqueued_at` | timestamptz | no | `now()` |  |
| 9 | `started_at` | timestamptz | yes | — |  |
| 10 | `completed_at` | timestamptz | yes | — |  |
| 11 | `storage_key` | text | yes | — |  |
| 12 | `file_size` | bigint | yes | — |  |
| 13 | `error_message` | text | yes | — |  |

