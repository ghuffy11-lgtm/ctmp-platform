# Continuous Handover

This is the live handover document for CTMP.

Every agent must add the newest entry at the top. Do not remove previous entries.

## Current Project State

- Dev environment fully provisioned. Phase 3 scaffold is unblocked and ready to start.
- Workspace scaffold created under `ctmp-platform/`.
- Final implementation spec copied into `docs/specs/implementation-spec.md`.
- Original implementation spec also copied as `CTMP_Implementation_Spec.md`.
- Agent guidance, build sequence, and ownership docs created.
- Initial production database schema authored at `database/migrations/001_initial_schema.sql`.
- Baseline roles/permissions seed at `database/seeds/001_baseline_roles_permissions.sql`.
- Expanded API contract authored at `api-contracts/openapi/ctmp.openapi.yaml`.
- Accepted Phase 2 API contract correction patch applied.
- AI review/debate process added under `agents/reviews/`; Phase 2 API concerns should be captured in `agents/reviews/PHASE_2_API_CONTRACT_REVIEW.md`.
- Codex PM session recovery instructions added at `agents/prompts/CODEX_PM_SELF_INSTRUCTIONS.md`.
- No application code (apps/api, apps/web-*) has been generated yet.

## Next Recommended Step

Begin Phase 3 (Backend Scaffold). Start with `Initialize API app framework` per `MASTER_TASK_TRACKER.md`, using the corrected `api-contracts/openapi/ctmp.openapi.yaml` as the contract baseline.

## Handover Entries

### 2026-05-17 - Dev Environment Provisioned

Agent/task:

Installed and verified all Phase 3 development prerequisites on the build server (Windows Server 2022).

Files changed:

```text
agents/handoffs/HANDOVER.md
```

What changed:

- Docker Engine 27.5.1 installed via static binary at `C:\Program Files\docker\docker\`. Registered as Windows service (`docker`). Daemon running.
- pnpm 11.1.2 installed globally.
- NestJS CLI 11.0.21 installed globally.
- Spectral CLI 6.16.0 installed globally (OpenAPI linter — run this as first Phase 3 task).
- Bun 1.3.14 and Node 24.15.0 were already installed.

Why:

Phase 3 backend scaffold requires NestJS CLI to initialize the app, Docker to run PostgreSQL and Redis locally, pnpm for monorepo package management, and Spectral to validate the OpenAPI contract before implementation.

Verification:

- `docker --version` → 27.5.1 (run in new terminal after PATH refresh)
- `pnpm --version` → 11.1.2
- `nest --version` → 11.0.21
- `spectral --version` → 6.16.0

Open questions:

- ORM decision not made: TypeORM vs Prisma. Decide before `Add database connection/migration tooling` task.

Next recommended step:

Open new terminal (Docker now in PATH). Run `spectral lint api-contracts/openapi/ctmp.openapi.yaml` to validate contract, then begin `Initialize API app framework` per MASTER_TASK_TRACKER.md.

---

### 2026-05-17 - Codex PM Session Recovery Instructions Added

Agent/task:

Created persistent self-instructions so Codex can resume as project manager after a lost or new session.

Files changed:

```text
agents/prompts/CODEX_PM_SELF_INSTRUCTIONS.md   (new)
START_HERE_FOR_AI_AGENTS.md
agents/prompts/00-master-kickoff-prompt.md
agents/handoffs/HANDOVER.md
```

What changed:

- Added Codex PM role definition, startup reading order, current phase state, remote server development context, non-negotiable guardrails, and Claude-management workflow.
- Updated `START_HERE_FOR_AI_AGENTS.md` so the current recommended next task is no longer the completed database migration.
- Linked the PM self-instructions from the master kickoff prompt and handover.

Why:

The project owner is coordinating Claude and other AI agents from Codex PM instructions. A persistent recovery file prevents future sessions from losing context or accidentally acting as an implementation agent.

Verification:

- Static documentation update only.

Open questions:

- None.

Next recommended step:

Use `agents/prompts/CODEX_PM_SELF_INSTRUCTIONS.md` as the first recovery file in any new Codex PM session. Continue with Phase 3 backend scaffold.

---

### 2026-05-17 - Phase 2 API Contract Correction Patch Applied

Agent/task:

Applied all PM-accepted corrections from `agents/reviews/PHASE_2_API_CONTRACT_REVIEW.md` to the OpenAPI contract.

Files changed:

```text
api-contracts/openapi/ctmp.openapi.yaml
agents/backlog/MASTER_TASK_TRACKER.md
agents/handoffs/HANDOVER.md
agents/reviews/PHASE_2_API_CONTRACT_REVIEW.md
```

What changed:

- `/auth/refresh` and `/auth/mfa/verify`: added `security: []` — both were incorrectly inheriting global `bearerAuth`.
- Added `POST /vendor-auth/login` with `security: []` and `VendorLoginRequest` schema — vendors had no login endpoint.
- Added `GET /tenders/{tenderId}/documents/{documentId}` — tender document download with visibility and audit rules.
- Added `GET /bids/{bidId}/documents/{documentId}` — bid document download; commercial documents require envelope OPENED + `commercial:download`; every commercial download is audit logged.
- Added `GET /reports/jobs/{jobId}` and `GET /reports/jobs/{jobId}/download` — report export job polling and result download with `reports:export` + `commercial:export` requirements.
- Added `departmentId`, `visibility`, `submissionDeadlineBefore`, `submissionDeadlineAfter` query params to `GET /tenders`.
- Added `DocumentId` and `JobId` path parameters to `components.parameters`.
- Added `NotFound` shared response to `components.responses`.
- `TenderStatus` enum: converted 17 values from human-readable strings to `SCREAMING_SNAKE_CASE`, matching `database/migrations/001_initial_schema.sql` exactly.
- `TenderUpdateRequest`: replaced `allOf: [TenderCreateRequest]` with standalone partial schema — no required fields (correct PATCH semantics).
- `CommercialOpeningRequest`: removed `confirmChecksumVerification` — server always verifies; result is already in `CommercialOpeningRecord.checksumVerified`.
- `AwardRecommendationRequest`: added `recommendedBidId` to required array.

Why:

PM reviewed and accepted all blocking/recommended concerns. Contract had authentication-flow errors (infinite logout loop risk), missing vendor login, enum divergence from DB, and missing download/export routes.

Verification:

- Static review only. `security: []` confirmed on 9 public endpoints. `TenderStatus` confirmed as 17 SCREAMING_SNAKE_CASE values matching DB migration. `VendorLoginRequest` referenced by `/vendor-auth/login`. `NotFound` response referenced by both download endpoints. `confirmChecksumVerification` confirmed absent.
- No OpenAPI validator available in this environment. First Phase 3 task should run `npx @stoplight/spectral-cli lint api-contracts/openapi/ctmp.openapi.yaml`.

Open questions:

- Multipart `EnvelopeUploadRequest` encoding deferred to Phase 3 (NestJS file upload tooling selection).

Next recommended step:

Phase 3 backend scaffold is now unblocked. Begin with `Initialize API app framework` per `MASTER_TASK_TRACKER.md`.
---

### 2026-05-17 - Codex PM Response To Claude API Review

Agent/task:

Reviewed Claude's Phase 2 API contract concerns and added a consolidated Codex PM response.

Files changed:

```text
agents/reviews/PHASE_2_API_CONTRACT_REVIEW.md
agents/handoffs/HANDOVER.md
```

What changed:

- Accepted Claude's blocking concerns for `/auth/refresh`, `/auth/mfa/verify`, missing `/vendor-auth/login`, `TenderStatus` enum mismatch, and `TenderUpdateRequest` PATCH semantics.
- Made PM calls on ambiguous items: checksum verification is mandatory server-side and should not depend on an optional request flag; award recommendation should require explicit `recommendedBidId`; MVP file serving should use explicit API streaming proxy endpoints so permission checks and audit logging happen on every download.
- Accepted report export job status/download routes.
- Deferred tender list filters and multipart upload encoding to backend implementation unless included in the same contract patch.

Why:

Backend scaffolding should not begin from a contract with known authentication-flow and enum/schema issues. Fixing the contract now reduces drift between API, frontend, database, and security/audit expectations.

Verification:

- Checked `database/migrations/001_initial_schema.sql`; `tender_status` already uses `SCREAMING_SNAKE_CASE`.
- Reviewed Claude's entries against the OpenAPI contract and implementation spec.

Open questions:

- None requiring owner decision at this stage; Codex PM accepted the safer compliance-preserving interpretations.

Next recommended step:

Ask Claude to apply a focused OpenAPI correction patch based on the accepted items in `agents/reviews/PHASE_2_API_CONTRACT_REVIEW.md`, then update tracker/handover.

---

### 2026-05-17 - AI Review Channel Added

Agent/task:

Added a structured project review channel so Claude, Codex, and other AI agents can discuss concerns about Phase 2 or future work without silently overwriting completed outputs.

Files changed:

```text
agents/reviews/README.md   (new)
agents/reviews/PHASE_2_API_CONTRACT_REVIEW.md   (new)
AI_BUILD_INSTRUCTIONS.md
agents/handoffs/HANDOVER.md
```

What changed:

- Added instructions for structured AI-to-AI review and disagreement.
- Added a dedicated Phase 2 API contract review file.
- Added an initial Codex PM position explaining that Phase 2 is complete as a first expanded draft but open to review/refinement.
- Linked the review process from `AI_BUILD_INSTRUCTIONS.md` and current handover state.

Why:

The project owner is using Claude and other AI agents to implement from Codex PM instructions. A shared review file gives agents a durable place to raise concerns, argue tradeoffs, request changes, and preserve final decisions.

Verification:

- Static documentation update only.

Open questions:

- Claude should add its concrete API contract concerns to `agents/reviews/PHASE_2_API_CONTRACT_REVIEW.md`.

Next recommended step:

Ask Claude to write its Phase 2 API concerns into the review file, then have Codex PM respond item by item before backend scaffolding changes the contract.

---

### 2026-05-17 - Expanded OpenAPI Contract

Agent/task:

Recovered from the prior lost session, confirmed Phase 1 database work was complete, and completed Phase 2 by authoring the expanded OpenAPI contract.

Files changed:

```text
api-contracts/openapi/ctmp.openapi.yaml   (new)
agents/backlog/MASTER_TASK_TRACKER.md
agents/handoffs/HANDOVER.md
```

What changed:

- Added the versioned CTMP OpenAPI 3.0 contract at `/api/v1`.
- Defined endpoint groups for internal auth, vendor auth, tenders, clarifications, bids, late submission exceptions, technical evaluation, committee commercial opening, commercial evaluation/comparison, award, audit, and reports.
- Added request/response schemas, shared path/query parameters, shared `ErrorResponse`, common error responses, enums, and permission-focused operation notes.
- Documented key guardrails directly in the contract: vendor CAPTCHA/rate limiting, immutable bid submission, technical opening after submission close, commercial opening only through committee session endpoints, status-only commercial comparison for unauthorized users, and audit logging for sensitive actions.

Why:

The handover and tracker identified API contract expansion as the next recommended step after the database schema and hardening migrations. This contract now gives backend and frontend agents a concrete integration target.

Verification:

- Static review against spec section 13 endpoint groups and project guardrails.
- Checked that the contract has expected OpenAPI root sections and no non-empty bearer auth scope arrays.
- No OpenAPI validator is installed in this workspace, so formal schema validation was not run.

Open questions:

- Backend scaffold should decide the implementation framework and contract validation tooling.
- Future backend work should tighten schemas as exact DTO fields and validation rules are implemented.

Next recommended step:

Begin Phase 3: initialize the API app framework and add configuration, database connection/migration tooling, auth, vendor-auth, RBAC, vendor, tender, clarification, bid/envelope, late submission, technical evaluation, committee opening, commercial evaluation, award, audit, notification, and reports modules.

---

### 2026-05-17 - Schema Hardening Migration

Agent/task:

Static schema review identified missing hex-format constraints on all SHA-256 / hash-chain columns, and undocumented nullability intent on `captcha_verification_id`. A hardening migration was authored to close both gaps.

Files changed:

```text
database/migrations/002_schema_hardening.sql   (new)
agents/backlog/MASTER_TASK_TRACKER.md
agents/handoffs/HANDOVER.md
docs/decisions/DECISION_LOG.md
agents/skills/PROJECT_SKILLS.md
```

What changed:

- `002_schema_hardening.sql` adds `CHECK (col ~ '^[a-f0-9]{64}$')` constraints to all eight SHA-256 / hash-chain columns: `vendor_documents.checksum_sha256`, `tender_documents.checksum_sha256`, `bid_documents.checksum_sha256`, `bid_submission_receipts.receipt_hash`, `file_integrity_checks.expected_checksum`, `file_integrity_checks.actual_checksum`, `audit_logs.hash_chain_value`, `audit_logs.prev_hash_chain_value` (nullable variant: `IS NULL OR hex`).
- `COMMENT ON COLUMN vendor_registration_requests.captcha_verification_id` documents that NULL is permitted only for admin-created records; the public self-registration API must validate CAPTCHA, insert a `captcha_verification_logs` row, and supply the FK before INSERT.

Why:

SHA-256 digests stored in CHAR(64) with no format check allow uppercase hex or arbitrary 64-char strings to be inserted silently, breaking checksum verification at read time. The captcha nullable rule must be documented at the column so future API developers see the constraint without reading source code.

Verification:

- Static review only; psql not available in this environment.
- First agent to provision PostgreSQL must apply both migrations in order and confirm no errors.

Open questions:

- None new. Existing open questions from 001 still apply.

Next recommended step:

Begin Phase 2: expand `api-contracts/openapi/ctmp.openapi.yaml` per spec section 13.

---

### 2026-05-17 - Initial Database Schema And Baseline Seed

Agent/task:

Authored the first production database migration and baseline RBAC seed.

Files changed:

```text
database/migrations/001_initial_schema.sql   (new)
database/seeds/001_baseline_roles_permissions.sql   (new)
agents/backlog/MASTER_TASK_TRACKER.md
agents/handoffs/HANDOVER.md
docs/decisions/DECISION_LOG.md
agents/skills/PROJECT_SKILLS.md
```

What changed:

- New PostgreSQL schema covering organization (departments, users, user_departments), RBAC (roles, permissions, role_permissions, user_roles), vendors and vendor security artefacts (registration requests, email verification tokens, password reset tokens, documents, status history), tenders and clarifications, workflow templates/steps/instances/tasks/approval actions, late submission exceptions, committee sessions and opening records, bids and bid envelopes with technical/commercial separation, bid documents with SHA-256 checksums, submission receipts, technical and commercial evaluations, commercial comparison snapshots, file integrity checks, append-only `audit_logs` with hash-chain columns, security alerts, CAPTCHA verification logs, notification templates and logs, and system settings.
- Append-only enforcement on `audit_logs` implemented via a trigger function (`audit_logs_block_modifications`) on UPDATE/DELETE/TRUNCATE.
- Commercial envelope check constraint (`commercial_open_requires_session`) prevents marking a commercial envelope OPENED without a `committee_session_id`.
- Partial unique index limits one active late submission exception per (tender, vendor).
- Seed grants baseline role/permission matrix. System Admin deliberately receives `commercial:view_status` only (no commercial:view/download/evaluate/export) to preserve separation of duties.

Why:

This was the next planned task per the tracker and spec. Phase 1 (Database) goals are now substantially complete and unblock API contract work in Phase 2.

Verification:

- Schema reviewed against spec sections 3, 5-15, 18 and section 12 ("Database Model") priority table list.
- Append-only audit trigger covers UPDATE, DELETE, and TRUNCATE.
- Seed is idempotent (`ON CONFLICT DO NOTHING`).
- Static review only: no database engine was available in this environment to execute the migration. The first agent to provision PostgreSQL must run `psql -f database/migrations/001_initial_schema.sql` then `psql -f database/seeds/001_baseline_roles_permissions.sql` and report any issues here.

Open questions:

- Should we adopt a migration tool (e.g. Flyway, Liquibase, node-pg-migrate) before adding further migrations, or keep raw SQL with a custom `schema_migrations` ledger? Decision deferred to DevOps phase.
- Does the business want to allow vendor "alternative bids" at MVP? Schema models it via `bids.is_alternative` but the API/UI default should remain a single primary bid until product confirms.
- Hash chain seeding: should there be a genesis `audit_logs` row inserted at migration time so subsequent rows always have a previous hash? Currently `prev_hash_chain_value` is nullable.

Next recommended step:

Begin Phase 2: expand `api-contracts/openapi/ctmp.openapi.yaml` per spec section 13, referencing the role/permission codes seeded today.

### 2026-05-16 - Single AI Entry Point Added

Agent/task:

Created one root start-here file for all future AI agents.

Files changed:

```text
START_HERE_FOR_AI_AGENTS.md
README.md
AGENTS.md
AI_BUILD_INSTRUCTIONS.md
docs/PROJECT_DOCUMENTATION_MAP.md
agents/prompts/00-master-kickoff-prompt.md
agents/backlog/MASTER_TASK_TRACKER.md
agents/handoffs/HANDOVER.md
```

What changed:

Added `START_HERE_FOR_AI_AGENTS.md` as the single first document every agent should read. Updated existing instruction files to point to it.

Why:

The project has several useful instruction files, but future agents need one unmistakable entry point to avoid confusion.

Verification:

References to `START_HERE_FOR_AI_AGENTS.md` were added to root and agent guidance files.

Open questions:

None.

Next recommended step:

Use `agents/prompts/01-database-agent-prompt.md` to create `database/migrations/001_initial_schema.sql`.

### 2026-05-16 - Agent Prompt Library Added

Agent/task:

Created role-specific startup prompts for future agents.

Files changed:

```text
agents/prompts/README.md
agents/prompts/00-master-kickoff-prompt.md
agents/prompts/01-database-agent-prompt.md
agents/prompts/02-backend-agent-prompt.md
agents/prompts/03-frontend-admin-agent-prompt.md
agents/prompts/04-frontend-vendor-agent-prompt.md
agents/prompts/05-devops-agent-prompt.md
agents/prompts/06-qa-agent-prompt.md
agents/prompts/07-security-compliance-agent-prompt.md
docs/PROJECT_DOCUMENTATION_MAP.md
agents/backlog/MASTER_TASK_TRACKER.md
```

What changed:

Added copy-ready prompts for master kickoff and role-specific work.

Why:

Future agents need a consistent starting point and must preserve CTMP procurement controls.

Verification:

Prompt files were created and linked in the documentation map.

Open questions:

None.

Next recommended step:

Use `agents/prompts/01-database-agent-prompt.md` to start the database schema task.

### 2026-05-16 - Project Scaffold And Agent Controls

Agent/task:

Created the agent-ready folder structure and project control documentation.

Files changed:

```text
README.md
AGENTS.md
AI_BUILD_INSTRUCTIONS.md
CTMP_Implementation_Spec.md
docs/specs/implementation-spec.md
agents/backlog/00-build-sequence.md
agents/backlog/MASTER_TASK_TRACKER.md
agents/handoffs/HANDOVER.md
docs/decisions/DECISION_LOG.md
agents/skills/PROJECT_SKILLS.md
```

What changed:

- Created the working monorepo structure.
- Added source-of-truth implementation spec.
- Added AI build instructions.
- Added continuous handover process.
- Added master task tracker.
- Added decision log and project skills register.

Why:

Future agents need a stable place to understand current status, completed work, open tasks, and project-specific rules.

Verification:

- Folder tree reviewed.
- Key docs added and linked.

Open questions:

- Final database schema still needs to be generated.
- OpenAPI contract still needs expansion.
- Actual app scaffolding has not started.

Next recommended step:

Start with `database/migrations/001_initial_schema.sql`.
