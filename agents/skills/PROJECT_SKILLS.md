# Project Skills And Reusable Patterns

This is not a replacement for the implementation spec. It is a concise memory of reusable CTMP-specific implementation patterns that future agents should apply.

Add a new skill/pattern when implementation reveals a repeatable rule, convention, or safe way to do something.

Entry format:

```text
Skill:
Use when:
Pattern:
Do not:
Related files:
```

## Skills

### Cross-Agent Review Process

Use when:

You have a concern about a completed-phase artifact (OpenAPI contract, database schema, seed data, security control, deployment approach). Do not silently edit the artifact — log the concern first.

Pattern:

1. Read `agents/reviews/README.md` for the entry format.
2. Read or create the relevant review file (naming: `PHASE_<N>_<AREA>_REVIEW.md`).
3. Add a new entry under `## Open Threads` using this structure:

```text
### YYYY-MM-DD HH:mm - Agent Name - Concern

Topic:
Files reviewed:
Concern or proposal:
Reasoning:
Recommended change:
Impact if accepted:
Impact if rejected:
Status: OPEN — <classification>
```

Classification must be one of:
- `blocking backend scaffold` — must resolve before next phase starts
- `recommended before backend scaffold` — address but not hard-blocking
- `can be refined during backend implementation` — low risk, defer to impl
- `needs project owner decision` — compliance/scope ambiguity; do not proceed without PM

4. Commit the review file. Do not change the artifact.
5. Wait for PM response in the review file before editing the artifact.

Do not:

- Edit a completed-phase file to fix a concern before logging it here.
- Mark an item as ACCEPTED or IMPLEMENTED without a PM or tech-lead response in the review file.
- Start the next phase if any item is classified `blocking`.

Related files:

`agents/reviews/README.md`, `agents/reviews/PHASE_2_API_CONTRACT_REVIEW.md`

---

### One-Time Token Storage (email verify / password reset)

Use when:

Generating any short-lived one-time token sent to a user via email (email verification, password reset, magic link).

Pattern:

```typescript
import { randomBytes, createHash } from 'crypto';

function newToken() {
  const rawToken = randomBytes(32).toString('hex');  // 64 hex chars, 256 bits
  const tokenHash = createHash('sha256').update(rawToken).digest('hex');
  return { rawToken, tokenHash };
}
```

Store `tokenHash` in the DB (`CHAR(64)` column). Send `rawToken` in the email only. Lookup by `tokenHash`. On use, check `usedAt IS NULL` and `expiresAt > NOW()` before accepting.

When a password reset succeeds, increment `tokenVersion` on the user row so existing refresh tokens are also revoked.

Do not:

- Do not store the raw token.
- Do not use bcrypt for tokens — tokens are already max entropy, bcrypt is overkill and slow.
- Do not reuse the SHA-256 Checksum Columns pattern (that is for document integrity, uses `CHAR(64) NOT NULL` with a hex CHECK). Tokens should have a nullable `usedAt` and an `expiresAt`.

Related files:

`apps/api/src/modules/vendor-auth/vendor-auth.service.ts` (`newToken()`/`hashToken()` helpers), `database/migrations/001_initial_schema.sql` (token tables)

---

### Vendor Account Login Gate

Use when:

Implementing any login or authenticated action for vendor users.

Pattern:

Check all four gates in order before issuing tokens:

```typescript
if (user.lockedUntil && user.lockedUntil > new Date()) throw lockout error
if (!passwordMatch) { increment failedLoginCount, set lockedUntil at threshold; throw }
if (!user.emailVerifiedAt) throw forbidden
if (vendor.status !== 'APPROVED') throw forbidden
if (user.status !== 'ACTIVE') throw unauthorized
```

On success: reset `failedLoginCount = 0`, `lockedUntil = null`, set `lastLoginAt`.

Lockout config: `auth.maxFailedLogins` (default 5), `auth.lockoutMinutes` (default 15).

Do not:

- Do not check the password before checking lockout — avoids bcrypt timing attack on locked accounts.
- Do not reveal whether the email exists via different error messages.
- Do not issue tokens to vendors with `vendor.status = PENDING` even after email verification — admin approval is required.

Related files:

`apps/api/src/modules/vendor-auth/vendor-auth.service.ts`

---

### SHA-256 Checksum Columns

Use when:

Adding any column that stores a SHA-256 digest (document checksums, hash-chain values, receipt hashes).

Pattern:

```sql
checksum_sha256  CHAR(64) NOT NULL,
    CONSTRAINT <table>_checksum_sha256_hex CHECK (checksum_sha256 ~ '^[a-f0-9]{64}$')
```

For nullable hash-chain predecessors:

```sql
prev_hash  CHAR(64),
    CONSTRAINT <table>_prev_hash_hex CHECK (prev_hash IS NULL OR prev_hash ~ '^[a-f0-9]{64}$')
```

Application code must produce lowercase hex (e.g. Node `digest('hex')`, Python `.hexdigest()`).

Do not:

- Store uppercase hex — DB will reject it.
- Use VARCHAR(64) without the regex check — length alone does not enforce format.
- Accept the hash from client input; always compute server-side.

Related files:

`database/migrations/002_schema_hardening.sql`

---

### Append-Only Audit Table

Use when:

Adding any table that must be tamper-resistant (audit logs, immutable receipts, append-only chains).

Pattern:

Block mutation at the database with a trigger plus a hash-chain pair of columns:

```sql
CREATE OR REPLACE FUNCTION <table>_block_modifications()
RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION '<table> is append-only: % is not permitted', TG_OP
        USING ERRCODE = 'insufficient_privilege';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER <table>_no_update   BEFORE UPDATE ON <table>   FOR EACH ROW   EXECUTE FUNCTION <table>_block_modifications();
CREATE TRIGGER <table>_no_delete   BEFORE DELETE ON <table>   FOR EACH ROW   EXECUTE FUNCTION <table>_block_modifications();
CREATE TRIGGER <table>_no_truncate BEFORE TRUNCATE ON <table>                EXECUTE FUNCTION <table>_block_modifications();
```

Add `prev_hash_chain_value CHAR(64)` and `hash_chain_value CHAR(64) NOT NULL` columns. The application computes the new hash as `SHA-256(prev_hash || canonical_json(row))`. A separate verifier job re-walks the chain to detect tampering.

Do not:

- Do not rely on application-level enforcement alone.
- Do not allow application-issued TRUNCATE or DROP without explicit governance review.
- Do not store mutable secondary state (status, processed flags) on the same row — append a new row instead.

Related files:

```text
database/migrations/001_initial_schema.sql
docs/specs/implementation-spec.md
```

### Database-Level Workflow Gates

Use when:

A multi-step workflow has a "this state requires that input" rule that absolutely must hold even if application code is wrong.

Pattern:

Add a CHECK constraint that ties dependent columns together. Example from `bid_envelopes`:

```sql
CONSTRAINT commercial_open_requires_session CHECK (
    envelope_type <> 'COMMERCIAL'
 OR status <> 'OPENED'
 OR committee_session_id IS NOT NULL
)
```

For "only one active record per group" rules, use a partial unique index instead of a NULL trick. Example from `late_submission_exceptions`:

```sql
CREATE UNIQUE INDEX late_exception_one_active_per_vendor_tender
    ON late_submission_exceptions (tender_id, vendor_id)
    WHERE status IN ('PENDING_APPROVAL', 'GRANTED');
```

Do not:

- Do not rely on the API to be the only writer; assume a future migration script or DBA query may bypass it.
- Do not use these for soft validation (e.g. format checks) — keep them reserved for invariants where violation would be a compliance breach.

Related files:

```text
database/migrations/001_initial_schema.sql
docs/decisions/DECISION_LOG.md
```

### Seed Idempotency

Use when:

Writing any database seed file that may be re-run on existing environments (baseline roles, default templates, system settings).

Pattern:

- Use natural keys (codes) as the conflict target.
- `INSERT ... ON CONFLICT (code) DO NOTHING` for parent rows.
- For role/permission grants, resolve UUIDs via a CTE that joins on natural keys:

```sql
WITH grants(role_code, permission_code) AS ( VALUES ... )
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM grants g
JOIN roles       r ON r.code = g.role_code
JOIN permissions p ON p.code = g.permission_code
ON CONFLICT DO NOTHING;
```

Do not:

- Do not embed hard-coded UUIDs in seeds (breaks on re-seeding across environments).
- Do not seed sensitive defaults (commercial:view on SYSTEM_ADMIN, default admin passwords) — separation-of-duties rules must survive seeding.

Related files:

```text
database/seeds/001_baseline_roles_permissions.sql
```

### Commercial Envelope Access

Use when:

Implementing API, UI, reports, exports, or tests involving commercial bid data.

Pattern:

Check both:

```text
envelope.status == OPENED
user has required commercial permission
```

Required permissions depend on action:

```text
commercial:view
commercial:download
commercial:evaluate
commercial:export
```

Every sensitive action must create an audit event.

Do not:

- Do not expose commercial details just because the envelope is opened.
- Do not give System Admin automatic commercial access.
- Do not use generic document download routes for commercial files.

Related files:

```text
docs/specs/implementation-spec.md
docs/decisions/DECISION_LOG.md
```

### Late Submission Exception

Use when:

Implementing bid submission after deadline, procurement exception screens, reports, or audit logic.

Pattern:

After deadline, normal submission is blocked unless there is an active exception matching:

```text
tender_id
vendor_id
not expired
approved/granted status
```

Submission under exception must be marked as late accepted and audited.

Do not:

- Do not silently accept late bids.
- Do not create global late submission access for all vendors.
- Do not allow late submission to blend into normal reporting.

Related files:

```text
docs/specs/implementation-spec.md
agents/backlog/MASTER_TASK_TRACKER.md
```

### Vendor Registration Bot Protection

Use when:

Implementing vendor registration, forgot password, reset password, or public auth endpoints.

Pattern:

Public vendor auth endpoints should use:

```text
CAPTCHA or approved challenge
server-side validation
rate limiting
security logging
email verification where relevant
```

Do not:

- Do not trust client-side CAPTCHA only.
- Do not create vendor accounts before validation succeeds.
- Do not leak whether an email exists during password reset.

Related files:

```text
docs/specs/implementation-spec.md
docs/security/README.md
```

### Audit Events

Use when:

Implementing any workflow transition, sensitive read, download, export, permission change, exception, or security event.

Pattern:

Audit entries should include:

```text
event_type
actor
entity_type
entity_id
tender_id if applicable
vendor_id if applicable
bid_id if applicable
ip_address
user_agent
before_value
after_value
reason
metadata_json
risk_level
event_time
```

Do not:

- Do not treat audit logging as optional for regulated actions.
- Do not allow application users to edit audit logs.

Related files:

```text
docs/specs/implementation-spec.md
```

