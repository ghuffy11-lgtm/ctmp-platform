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

