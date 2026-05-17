# Decision Log

Record project decisions here so future agents can understand why the system works the way it does.

Add newest decisions at the top.

Decision entry format:

```text
Date:
Decision:
Context:
Options considered:
Outcome:
Impact:
Related files:
```

## Decisions

### 2026-05-17 - ORM: Prisma Selected Over TypeORM

Date: 2026-05-17

Decision:

Prisma v6 selected as the ORM for `apps/api`. TypeORM was the main alternative.

Context:

Phase 3 scaffold required selecting an ORM before adding the database connection module. Both are first-class NestJS options.

Options considered:

1. **TypeORM** — Decorator-based, ships with `@nestjs/typeorm`. Closer to SQL. Rougher migration tooling historically; generated migrations are sometimes incomplete for complex schemas. More boilerplate for complex relations.
2. **Prisma v6** — Schema-first (`schema.prisma`). Generates a fully-typed client. `prisma migrate` produces clean, reviewable SQL diffs. Strong N+1 protection via `include`/`select`. Better DX for maintainability of a long-running enterprise system.

Outcome:

Prisma v6 adopted. Schema at `apps/api/prisma/schema.prisma` (33 models, 17+ enums). Client generated via `prisma generate`. Migration workflow: `prisma migrate dev` for development, `prisma migrate deploy` for on-prem production.

Impact:

- All service code uses `PrismaService` (extends `PrismaClient`) injected from `DatabaseModule` (global).
- Database schema changes require a new Prisma migration file, not TypeORM `synchronize`.
- SHA-256 hash format is enforced at DB layer (CHECK constraint in migration 002); Prisma passes values through without transformation — application must produce lowercase hex.
- `prisma generate` must be run after any `schema.prisma` change before TypeScript compilation.

Related files:

`apps/api/prisma/schema.prisma`, `apps/api/src/database/prisma.service.ts`, `apps/api/src/database/database.module.ts`

---

### 2026-05-17 - Spectral OAS Lint: 0 Errors, 71 Warnings (operationId missing)

Date: 2026-05-17

Decision:

Spectral lint run on `api-contracts/openapi/ctmp.openapi.yaml` as first Phase 3 task. Result: 0 errors, 71 warnings. Warnings deferred.

Context:

71 warnings are all `operation-operationId` (every endpoint missing `operationId`) plus 1 unused component (`VendorStatus`). No structural or semantic errors. Contract is valid for Phase 3 implementation.

Outcome:

`operationId` population deferred to a dedicated API annotation pass. Controllers in Phase 3 scaffold already include `operationId` values in `@ApiOperation()` decorators — the OpenAPI YAML file itself is the backlog item.

Impact:

`operationId` values in YAML must match the controller decorator values when the annotation pass happens.

Related files:

`api-contracts/openapi/ctmp.openapi.yaml`, `ctmp-platform/.spectral.yaml`

---

### 2026-05-17 - SHA-256 Hex Format Enforced At Database Layer

Decision:

All CHAR(64) columns storing SHA-256 digests or hash-chain values carry a `CHECK (col ~ '^[a-f0-9]{64}$')` constraint. Nullable hash-chain columns use `CHECK (col IS NULL OR col ~ '^[a-f0-9]{64}$')`.

Context:

CHAR(64) constrains length only. Without a format check, uppercase hex, truncated values, or arbitrary strings can be stored silently and will fail checksum verification at read time — after a bid is sealed and immutable.

Options considered:

1. Application-only validation — rejected; application code can be bypassed by direct DB access or bugs.
2. DB CHECK constraint — adopted; enforces format regardless of insert path.
3. Encode as BYTEA — would require application changes and offers no practical advantage for an on-prem system that logs/displays hashes as hex strings.

Outcome:

Added via `002_schema_hardening.sql`. Application must compute and store lowercase hex; the DB rejects uppercase or non-hex strings.

Impact:

API and service code must call `hashlib.sha256(...).hexdigest()` (Python) or `crypto.createHash('sha256').digest('hex')` (Node) — not `.hexdigest().upper()`. Add this to code-review checklist.

Related files:

`database/migrations/002_schema_hardening.sql`

---

### 2026-05-17 - captcha_verification_id Nullable By Design, Enforced At API Layer

Decision:

`vendor_registration_requests.captcha_verification_id` is nullable in the schema. A column comment documents that public self-registration must supply it; admin-created records may omit it.

Context:

A NOT NULL constraint would prevent admin staff from importing vendor records without a CAPTCHA. But leaving it nullable without documentation risks developers forgetting to enforce it on the public endpoint.

Options considered:

1. NOT NULL — rejected; breaks admin import path.
2. Nullable + no documentation — rejected; too easy to forget.
3. Nullable + column comment + API-layer validation rule — adopted.

Outcome:

Column stays nullable. `VendorAuthController` (Phase 3) must validate CAPTCHA, insert `captcha_verification_logs`, and supply the FK before any public registration INSERT.

Impact:

API integration test must assert that a public registration request missing a valid CAPTCHA token is rejected with 422.

Related files:

`database/migrations/002_schema_hardening.sql`, `database/migrations/001_initial_schema.sql`

---

### 2026-05-17 - Audit Log Append-Only Enforced At Database Layer

Decision:

`audit_logs` is enforced as append-only inside the database via triggers that raise on UPDATE, DELETE, and TRUNCATE. Tamper-evidence is layered on top via `prev_hash_chain_value` and `hash_chain_value`, computed application-side as SHA-256 over the previous row's hash plus a canonical projection of the current row.

Context:

The spec (section 15) requires append-only, tamper-evident audit. Enforcing the rule application-side alone would allow accidental or malicious DELETEs by anyone with `audit_logs` table privileges. Pushing the rule into a trigger makes the constraint independent of the application code path.

Options considered:

- Application-only enforcement (rejected: too easy to bypass).
- Revoke UPDATE/DELETE from the application role at GRANT level (kept as a complementary control to add in DevOps phase, but it does not prevent superusers, hence the trigger).
- Use a write-only foreign log store (deferred; trigger approach is simpler for on-prem MVP).

Outcome:

Trigger function `audit_logs_block_modifications()` is fired BEFORE UPDATE/DELETE/TRUNCATE on `audit_logs` and raises `insufficient_privilege`. Hash chain columns are present but populated by the application service that writes audit events.

Impact:

- Backend audit service is responsible for computing `hash_chain_value` from the prior row's hash.
- DBAs cannot mutate audit rows through the application path; admin maintenance must use a documented, audited break-glass procedure (out of MVP).
- A future verification job can re-walk the chain and raise alerts on mismatch.

Related files:

```text
database/migrations/001_initial_schema.sql
docs/specs/implementation-spec.md
```

### 2026-05-17 - Use PostgreSQL ENUM Types For Fixed Business States

Decision:

Tender status, envelope type/status, bid status, vendor status, workflow status, and similar fixed business enumerations are modelled with PostgreSQL `CREATE TYPE ... AS ENUM` rather than lookup tables.

Context:

The spec lists every state explicitly. Storing them as ENUMs gives compile-time-style validation at the database boundary and avoids accidental free-text states. New values can be added safely with `ALTER TYPE ... ADD VALUE`.

Options considered:

- Lookup tables (rejected for fixed business states: more joins, weaker invariants).
- VARCHAR + CHECK constraint (rejected: harder to evolve without enumerating values in two places).
- ENUM (chosen).

Outcome:

ENUM types are created in section 1 of `001_initial_schema.sql`. Tables reference them directly.

Impact:

- Future state additions require a small ALTER TYPE migration.
- Backend code in shared-types should mirror these enums (TypeScript union types).

Related files:

```text
database/migrations/001_initial_schema.sql
packages/shared-types/
```

### 2026-05-17 - Commercial Envelope Opening Requires Committee Session At Schema Level

Decision:

The `bid_envelopes` table has a CHECK constraint (`commercial_open_requires_session`) that prevents a row from being in state `OPENED` with `envelope_type = 'COMMERCIAL'` unless `committee_session_id` is set.

Context:

Spec section 6 and the prior decision "Commercial Opening Does Not Mean Universal Visibility" require commercial envelopes to be opened only through a formal committee session. Enforcing this at the database layer is a defence-in-depth control behind the API.

Outcome:

A direct UPDATE that sets `status = 'OPENED'` without a committee session reference will fail at the database. Permission checks for `commercial:view`, `:download`, etc. still apply at the application layer for any visibility beyond status.

Impact:

- API code must always set `committee_session_id` when opening a commercial envelope.
- Any future migration that loosens this constraint requires explicit governance review.

Related files:

```text
database/migrations/001_initial_schema.sql
docs/specs/implementation-spec.md
```

### 2026-05-17 - One Active Late Submission Exception Per (Tender, Vendor)

Decision:

`late_submission_exceptions` has a partial unique index ensuring only one exception in status `PENDING_APPROVAL` or `GRANTED` can exist per (tender_id, vendor_id) at a time. Expired/rejected/used rows are retained for audit but do not block a future exception.

Context:

The business rule is "exceptions are tender-specific and vendor-specific". Without the partial unique index, procurement could accidentally grant overlapping exceptions, which would complicate auditing and reporting.

Outcome:

The constraint is enforced at the schema level. Application must transition older rows to `EXPIRED`/`USED` before granting a fresh exception.

Impact:

- API for granting an exception must reject if an active one already exists.
- Reports of "active exceptions" can join cleanly without aggregation.

Related files:

```text
database/migrations/001_initial_schema.sql
docs/specs/implementation-spec.md
```

### 2026-05-17 - System Admin Baseline Excludes Commercial Detail Permissions

Decision:

The baseline seed grants the `SYSTEM_ADMIN` role only `commercial:view_status` from the commercial:* permission family. `commercial:view`, `commercial:download`, `commercial:evaluate`, and `commercial:export` are deliberately NOT granted.

Context:

Spec section 10 mandates that System Admin does not automatically receive commercial bid visibility. Encoding this in the baseline seed prevents accidental privilege creep on fresh deployments.

Outcome:

If an organisation needs a single user to perform both platform admin and commercial review, an explicit, audited assignment of the COMMERCIAL_EVALUATOR role (or a custom role) is required.

Impact:

- Onboarding must clarify this separation of duties to procurement teams.
- A QA test must verify that a fresh deployment does not let a System Admin view commercial details.

Related files:

```text
database/seeds/001_baseline_roles_permissions.sql
docs/specs/implementation-spec.md
```

### 2026-05-16 - Commercial Opening Does Not Mean Universal Visibility

Decision:

Commercial committee opening changes the commercial envelope state from sealed to opened, but commercial details remain visible only to users with explicit commercial permissions.

Context:

The procurement process requires official committee opening, but confidentiality must continue after opening.

Outcome:

Implement separate concepts:

```text
Envelope state: SEALED / OPENED
User permission: commercial:view / commercial:download / commercial:evaluate / commercial:export
```

Impact:

- API must check both envelope state and permissions.
- UI must show status-only views to unauthorized users.
- Commercial views/downloads/exports must be audit logged.

Related files:

```text
docs/specs/implementation-spec.md
AGENTS.md
AI_BUILD_INSTRUCTIONS.md
```

### 2026-05-16 - Technical Envelope Opens Before Commercial Committee Opening

Decision:

Technical envelopes may be opened after `Submission Closed` so technical evaluation can finish before commercial comparison.

Context:

Technical evaluation must happen before the committee commercial opening. Only technically qualified vendors proceed to commercial comparison.

Outcome:

Technical and commercial envelope controls are separate.

Impact:

- Technical evaluation workflow starts after submission period ends.
- Commercial envelope remains sealed until committee opening.

Related files:

```text
docs/specs/implementation-spec.md
```

### 2026-05-16 - Late Submission Requires Audited Exception

Decision:

Late submissions are blocked by default but may be allowed through a vendor-specific and tender-specific authorized procurement exception.

Context:

The business wants controlled flexibility while preserving auditability.

Outcome:

Late submission exceptions require reason, expiry time, granting user, and audit trail.

Impact:

- Database needs `late_submission_exceptions`.
- API needs exception endpoints.
- UI and reports must mark late accepted bids.

Related files:

```text
docs/specs/implementation-spec.md
agents/backlog/MASTER_TASK_TRACKER.md
```

### 2026-05-16 - Vendor Registration Requires Bot Protection

Decision:

Vendor self-registration must include CAPTCHA or approved bot-protection challenge.

Context:

The registration form is public-facing and must resist bot submissions.

Outcome:

CAPTCHA is validated server-side, registration is rate-limited, and suspicious attempts are logged.

Impact:

- Vendor frontend requires CAPTCHA UI.
- Backend requires CAPTCHA verification and logging.
- QA must test bot protection and abuse cases.

Related files:

```text
docs/specs/implementation-spec.md
agents/backlog/MASTER_TASK_TRACKER.md
```

