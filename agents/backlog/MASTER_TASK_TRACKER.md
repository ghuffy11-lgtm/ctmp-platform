# CTMP Master Task Tracker

Status markers:

```text
- [ ] Not started
- [~] In progress
- [x] Completed
- [!] Blocked
```

When a task is completed, add a short completion note with date and key files.

## Phase 0: Project Control And Foundation

- [x] Create agent-ready folder structure.
  - Completed 2026-05-16. Key folder: `ctmp-platform/`.
- [x] Add implementation specification to workspace.
  - Completed 2026-05-16. Key files: `docs/specs/implementation-spec.md`, `CTMP_Implementation_Spec.md`.
- [x] Add agent ownership guide.
  - Completed 2026-05-16. Key file: `AGENTS.md`.
- [x] Add build sequence.
  - Completed 2026-05-16. Key file: `agents/backlog/00-build-sequence.md`.
- [x] Add continuous handover document.
  - Completed 2026-05-16. Key file: `agents/handoffs/HANDOVER.md`.
- [x] Add master task tracker.
  - Completed 2026-05-16. Key file: `agents/backlog/MASTER_TASK_TRACKER.md`.
- [x] Add AI build instructions.
  - Completed 2026-05-16. Key file: `AI_BUILD_INSTRUCTIONS.md`.
- [x] Add decision log and project skills register.
  - Completed 2026-05-16. Key files: `docs/decisions/DECISION_LOG.md`, `agents/skills/PROJECT_SKILLS.md`.
- [x] Add reusable agent prompt library.
  - Completed 2026-05-16. Key folder: `agents/prompts/`.
- [x] Add single AI agent entry point.
  - Completed 2026-05-16. Key file: `START_HERE_FOR_AI_AGENTS.md`.

## Phase 1: Database

- [x] Create `database/migrations/001_initial_schema.sql`.
  - Completed 2026-05-17. Key file: `database/migrations/001_initial_schema.sql`.
- [x] Add enum/status definitions for tender, bid, envelope, workflow, vendor, and audit states.
  - Completed 2026-05-17 in `001_initial_schema.sql` (section 1).
- [x] Add RBAC tables: roles, permissions, user_roles.
  - Completed 2026-05-17 (section 4). Also adds `role_permissions` join table.
- [x] Add organization tables: departments, users, user_departments.
  - Completed 2026-05-17 (section 3).
- [x] Add vendor registration and password reset tables.
  - Completed 2026-05-17 (section 6): `vendor_registration_requests`, `vendor_email_verification_tokens`, `vendor_password_reset_tokens`.
- [x] Add tender lifecycle tables.
  - Completed 2026-05-17 (section 7): `tenders`, `tender_versions`, `tender_documents`, `tender_vendors`, `tender_clarifications`, `tender_clarification_replies`.
- [x] Add bid, envelope, document, checksum, and receipt tables.
  - Completed 2026-05-17 (section 11): `bids`, `bid_envelopes`, `bid_documents`, `bid_submission_receipts`. Checksum stored on documents and verified in `file_integrity_checks`.
- [x] Add late submission exception tables.
  - Completed 2026-05-17 (section 9). Partial unique index limits one active exception per (tender, vendor).
- [x] Add committee session and commercial opening tables.
  - Completed 2026-05-17 (sections 10, 12).
- [x] Add workflow template and workflow instance tables.
  - Completed 2026-05-17 (section 8): `workflow_templates`, `workflow_steps`, `workflow_instances`, `workflow_tasks`, `approval_actions`.
- [x] Add append-only audit log structure.
  - Completed 2026-05-17 (section 15). UPDATE/DELETE/TRUNCATE blocked via `audit_logs_block_modifications()` triggers; hash chain columns present.
- [x] Add notification templates and delivery log tables.
  - Completed 2026-05-17 (section 16).
- [x] Add indexes and constraints.
  - Completed 2026-05-17 (section 18). Plus inline UNIQUE / CHECK constraints throughout.
- [x] Add seed data for baseline roles and permissions.
  - Completed 2026-05-17. Key file: `database/seeds/001_baseline_roles_permissions.sql`. System Admin intentionally has no commercial:view/download/evaluate/export.
- [x] Add schema hardening migration (hex checks on all SHA-256/hash columns, captcha nullability documentation).
  - Completed 2026-05-17. Key file: `database/migrations/002_schema_hardening.sql`. Covers 8 columns across 5 tables.

## Phase 2: API Contract

- [x] Create expanded OpenAPI file at `api-contracts/openapi/ctmp.openapi.yaml`.
  - Completed 2026-05-17. Key file: `api-contracts/openapi/ctmp.openapi.yaml`.
- [x] Define auth and vendor-auth endpoints.
  - Completed 2026-05-17. Includes internal auth, vendor registration, email verification, password reset, and MFA.
- [x] Define tender lifecycle endpoints.
  - Completed 2026-05-17. Uses explicit workflow actions for submit-for-approval, publish, cancel, and close-submissions.
- [x] Define clarification endpoints.
  - Completed 2026-05-17. Captures private-vendor vs general/public reply visibility.
- [x] Define bid draft, envelope upload, submit, and receipt endpoints.
  - Completed 2026-05-17. Documents immutability, checksum, receipt, and late-exception requirements.
- [x] Define late submission exception endpoints.
  - Completed 2026-05-17. Requires vendor-specific/tender-specific reason and expiry.
- [x] Define technical evaluation endpoints.
  - Completed 2026-05-17. Technical opening remains separate from commercial opening.
- [x] Define committee commercial opening endpoints.
  - Completed 2026-05-17. Committee opening is the only commercial envelope state-opening path.
- [x] Define commercial comparison endpoints with permission notes.
  - Completed 2026-05-17. Status-only behavior and explicit commercial permissions documented.
- [x] Define award endpoints.
  - Completed 2026-05-17.
- [x] Define audit/report endpoints.
  - Completed 2026-05-17. Includes audit search and report export permission notes.
- [x] Define request/response schemas.
  - Completed 2026-05-17. Core request/response schemas added under OpenAPI components.
- [x] Define error response model.
  - Completed 2026-05-17. Shared `ErrorResponse` and common error responses added.
- [x] Apply Phase 2 API contract correction patch (PM-accepted review items).
  - Completed 2026-05-17. Key file: `api-contracts/openapi/ctmp.openapi.yaml`. Fixed auth flows, added vendor login, aligned TenderStatus enum with DB, fixed PATCH semantics, removed ambiguous checksum flag, required recommendedBidId, added document download and report job endpoints, added tender list filters.
- [x] Phase 7+ e2e expansion — late-submission, email-verification (MailHog), multi-vendor, commercial-visibility specs.
  - Completed 2026-05-19. 4 new Playwright specs under `qa/playwright/tests/`. Replaced AD-bound `adminLogin` with `signAdminToken` (HMAC-SHA256 JWT signer using the api's `JWT_SECRET`) so QA bypasses AD. Added `signAdminTokenWithPermissions(userId, perms[])` for the visibility matrix and `signVendorToken(vendorUserId)` to bypass bcrypt + email-verify gate when seeding. New helpers: `helpers/mailhog.ts` (`waitForEmail`, `extractVerificationToken`, `clearMailbox`), `helpers/db.ts` extended with `ensureApprovedVendor` (idempotent APPROVED vendor + verified primary contact, bcrypt rehash on replay) + `ensurePastDeadlineTender` (submission_close_at in the past). `late-submission.spec.ts` proves the bid rejects on past deadline without exception, accepts with exception, and persists `LATE_SUBMITTED`. `email-verification.spec.ts` exercises the full MailHog round-trip end-to-end. `multi-vendor.spec.ts` runs 3 vendors with one below pass threshold and asserts commercial-comparison ranks the 2 PASS bids by price. `commercial-visibility.spec.ts` covers 3 admin-token shapes: full perms / no `commercial:view` (403) / `commercial:view` without `commercial:export` (`canExport=false`). Golden-path updated to call `signAdminToken` instead of the removed `adminLogin`. `qa/playwright` tsc clean.
- [x] Production hardening (Phase 7+) — S3/MinIO storage abstraction, audit hash-chain advisory lock, startup chain verifier.
  - Completed 2026-05-19. New `apps/api/src/common/storage/` module: `StorageBackend` interface, `LocalStorageBackend` (path-traversal guard, mkdir-recursive), `S3StorageBackend` (auto-create-buckets in dev, NoSuchKey→404 translation), `StorageModule` provides `STORAGE_BACKEND` symbol via `STORAGE_DRIVER` env. `BidStorageService` + `ReportStorageService` refactored to delegate to the backend; downstream `ReadStream` types loosened to `Readable`. New `apps/api/src/config/storage.config.ts`. `apps/api/src/config/audit.config.ts` adds `AUDIT_VERIFY_ON_START` + `AUDIT_VERIFY_LIMIT`. `AuditService.log()` now acquires `pg_advisory_xact_lock(0x6354_4d50)` inside the txn so concurrent replicas serialize through the same lock and cannot fork the chain. `AuditService.onModuleInit` runs `verifyChain(limit)` on boot, logs success, or emits a CRITICAL `security_alerts` row tagged `AUDIT_CHAIN_BREAK` on integrity failure. Docker compose: added MinIO service (port 9000 API + 9001 console, named volume `minio_data`); api service exports STORAGE_*, AUDIT_VERIFY_* env vars. `.env.example` documents all new knobs. Deps: `@aws-sdk/client-s3` ^3.700.0, `@aws-sdk/lib-storage` ^3.700.0. All 4 packages (`api`/`web-admin`/`web-vendor`/`qa/playwright`) tsc clean.
- [x] Phase 5 Part 2 — Vendor Portal bid wizard + clarifications + profile + 3 backend gaps closed.
  - Completed 2026-05-19. Backend: 4 new endpoints (`GET /vendor-auth/me`, `PATCH /vendor-auth/me`, `GET /vendor-auth/me/bids`, multipart `POST /bids/{id}/envelopes/{type}/documents` with server-side SHA-256, plus `DELETE /bids/{id}/documents/{docId}` and `GET /bids/{id}/envelopes/{type}/documents` and pivoted existing `GET /bids/{id}/documents/{docId}` to stream the file). New `BidStorageService` (mirrors `ReportStorageService` — path-traversal guard, mkdir, stream, delete). New `OptionalVendorOrUserGuard` so vendors can re-download their own DRAFT envelope docs while admins still hit the same endpoint for opened envelopes. AuditModule wired into vendor-auth + already-wired into bids. New audit event types: `BID_DOCUMENT_UPLOADED`, `BID_DOCUMENT_DELETED`, `VENDOR_PROFILE_UPDATED`. Frontend: replaced 3 placeholder pages — `bids/page.tsx` (stat cards + table from `/vendor-auth/me/bids`), `clarifications/page.tsx` (tender list + thread cards + ask form), `profile/page.tsx` (view+edit with email/MFA marked read-only). New pages — `bids/[bidId]/page.tsx` (detail + receipt), `bids/wizard/[tenderId]/page.tsx` (4-step wizard with stepper, FileDropZone, per-doc SHA-256 display, atomic submit-to-receipt), `tenders/[id]/page.tsx` (tender detail with Start-Bid CTA), `components/ui/StatusBadge.tsx` (copy of admin badge + bid-status entries), `components/forms/FileDropZone.tsx` (drag/drop + click multipart upload with auth header). OpenAPI: 4 new paths + 5 new schemas (`VendorProfileResponse`, `VendorProfileUpdateRequest`, `MyBidsListResponse`/`MyBidSummary`, `BidDocumentUploadResponse`, `BidEnvelopeContents`). Docker compose: added `bid_storage` named volume mounted at `/data/bid-documents` + `BID_STORAGE_PATH` env var. All 3 apps tsc clean; redocly lint 0 errors / 158 warnings (operationId deferred pattern preserved).
- [x] BullMQ report-export worker (Phase 3 continuation, Part 4).
  - Completed 2026-05-18. Added bullmq, exceljs, pdfkit deps. New files: `apps/api/src/config/reports.config.ts`, `apps/api/src/modules/reports/report-storage.service.ts` (local-disk persistence with path-traversal guard, stream helper), `report-renderer.service.ts` (Prisma datasets for 9 report codes + XLSX via exceljs + landscape A4 PDF via pdfkit), `report-queue.service.ts` (BullMQ Queue + Worker on configurable Redis, RUNNING→COMPLETED/FAILED transitions, retries 3 w/ exponential backoff). `reports.service.exportReport` enqueues after DB insert (rolls row to FAILED if enqueue throws); `download` streams via `ReportStorageService.stream()` + caller-scope check; controller pipes file with proper Content-Type/Disposition. Docker compose now mounts `report_storage` volume at `/data/reports` and exports REDIS_HOST/REPORT_* env vars. `.env.example` documents knobs. `pnpm-workspace.yaml` flips `msgpackr-extract: false` so optional native module no longer blocks install. API tsc clean.
- [x] Phase 3 Part 3 — Schema migration 005 + service backfill (read + write) across all remaining stubs.
  - Completed 2026-05-18. Migration 005 adds `tender_technical_criteria` table, `report_export_jobs` table, plus `Permission.name`, `NotificationTemplate.name`, `SystemSetting.category`, `SystemSetting.read_only`, `Tender.technical_pass_threshold` columns. Prisma schema updated + client regenerated. Backfilled services:
    - tenders: findAll/findOne/create/update/lifecycle (publish/cancel/closeSubmissions/submitForApproval/downloadDocument). Tender reference auto-generated `TDR-{year}-{4-digit}`. Status enum API↔DB translation map.
    - bids: draftBid/uploadTechnical/uploadCommercial/submit/getReceipt/downloadDocument. Submit generates SHA-256 receipt over canonical snapshot; both envelopes flipped + docs lockedAt in single txn. Late submission honored only when active GRANTED exception exists.
    - clarifications: findAll/create/reply with vendor visibility filter (own clarifications + public replies), tender status guard (PUBLISHED/CLARIFICATION_PERIOD).
    - late-submissions: findAll/create with one-active-per-(tender, vendor) check + isExceptionActive helper used by bids submit.
    - technical-evaluation: openEnvelopes (SUBMISSION_CLOSED → TECHNICAL_OPENING, opens all SUBMITTED technical envelopes), evaluate (upserts per evaluator+bid with pass threshold from tender or 70 default), finalize (majority-vote across evaluators determines bid PASS/FAIL, seals passing commercials + locks failing commercials, transitions tender → COMMERCIAL_SEALED).
    - committee: createSession (creates members with first as Chair), recordAttendance (replaces attendance rows atomically), openEnvelopes (quorum check, opens ONLY technically-passed commercial envelopes, transitions tender via COMMITTEE_COMMERCIAL_OPENING → COMMERCIAL_EVALUATION), getRecords, findOne, listForTender.
    - commercial-evaluation: getComparison (rank by totalPrice, hides amount per-row when caller lacks commercial:view, audit-logged view), evaluate (upsert per evaluator + bid).
    - award: recommend (transitions COMMERCIAL_EVALUATION → AWARD_RECOMMENDATION, sets awardedVendorId), approve (true → AWARDED + awardedAt; false reverts to COMMERCIAL_EVALUATION), issue (AWARDED → TENDER_CLOSED + marks winning bid AWARDED).
    - reports: 9-entry hardcoded catalog grouped by category, exportReport (enqueues real DB row, audit log, commercial:export gate), getJob/download/listJobs (caller-scoped).
  - AuditModule wired into 5 additional modules (technical-evaluation, committee, commercial-evaluation, award, reports). All state-changing services now emit hash-chained audit entries with appropriate risk levels (CRITICAL for COMMERCIAL_ENVELOPES_OPENED + AWARD_ISSUED + AWARD_APPROVED; HIGH for finalize/cancel/recommend/commercial-evaluation/system-setting-update; MEDIUM for tender lifecycle + envelope opening + comparison view; LOW for routine reads/creates).
- [x] Phase 5 — Vendor Portal scaffold (`apps/web-vendor/`).
  - Completed 2026-05-18. Next.js 15 + React 19 + Tailwind. Key files: `apps/web-vendor/package.json`, `next.config.ts`, `tsconfig.json`, `tailwind.config.ts`, `postcss.config.mjs`. Auth pages: `login/`, `register/` (with CAPTCHA token field — non-negotiable rule), `forgot-password/`. Portal shell: `(portal)/layout.tsx` with sidebar nav (Dashboard / Tenders / My Bids / Clarifications / Company Profile). Dashboard with stat cards + available tender list. Tenders list with search. `bids/` and `clarifications/` and `profile/` placeholders pending full implementation. `lib/api.ts` + `lib/auth.ts` (vendor cookie keys distinct from admin). Portal uses brand=`#1E40AF` accent=`#2563EB`. TypeScript clean.
- [x] Phase 6 — Docker Compose stack.
  - Completed 2026-05-18. `infrastructure/docker/docker-compose.yml` defines postgres:16-alpine, redis:7-alpine, api, web-admin, web-vendor services with healthchecks, volumes, env-var contract. Postgres auto-loads `database/migrations/*.sql` on first start. Three multi-stage Dockerfiles (api, web-admin, web-vendor) using pnpm + corepack. `.env.example` template + `README.md` with quick-start, secret-generation guidance, production deployment notes (reverse proxy, CAPTCHA hard requirement, audit-log integrity warning, SMTP fail-open caveat).
- [x] Implement write API endpoints + hash-chained audit logging (Phase 3 continuation, Part 2).
  - Completed 2026-05-18. Built `AuditService.log()` with SHA-256 hash chain (`prev_hash || canonical(payload) → hash_chain_value`); uses Prisma `$transaction` so the prev-hash read + insert cannot race; DB triggers continue to reject UPDATE/DELETE. Also implemented `AuditService.search()` and `getTenderLogs()` for the audit-log viewer page. Wired `AuditModule` into 5 modules via `imports:`. Implemented writes with state-machine validation + atomic txns + audit:
    - `tenders.approve` — INTERNAL_REVIEW → APPROVED, MEDIUM risk. Comments captured as reason.
    - `tenders.reject` — INTERNAL_REVIEW → DRAFT, MEDIUM risk. Reason required.
    - `vendors.approve` — PENDING → APPROVED, blocks if primary contact email unverified; sets approvedBy + approvedAt. MEDIUM risk.
    - `vendors.reject` — PENDING → REJECTED. MEDIUM risk. Reason required.
    - `vendors.suspend` — APPROVED → SUSPENDED. Atomic txn also bumps `vendor_users.token_version` for every linked VendorUser to revoke active sessions. HIGH risk. Reason required.
    - `roles.setPermissions` — diff old vs new; deleteMany + createMany in single txn; system roles return 403; HIGH risk audit with `metadata.added` + `metadata.removed`.
    - `notifications.updateTemplate` — partial PATCH on subjectTemplate/bodyTemplate/isActive; rejects empty bodyTemplate; MEDIUM risk; no-op short-circuits without audit.
    - `system-settings.batchUpdate` — pre-validation pass (sensitive-key block, read-only-key block, type-aware parse against `valueType`); atomic update txn; per-key HIGH-risk audit emitted after txn (since AuditService.log opens its own txn). Duplicates and unknown keys rejected at validation.
  - `apps/api` tsc clean.
  - Completed 2026-05-18. Replaced `throw new Error('Not implemented')` with real Prisma logic in:
    - `vendors.service.findAll/findOne` — paginated list with primary-contact VendorUser join, document count, API↔DB status enum translation (PENDING_APPROVAL ↔ PENDING).
    - `roles.service.findAll/findOne/getPermissions` — list with `_count` for permissionCount + userCount, system-role flag preserved.
    - `permissions.service.findAll/getPermissionsForUser` — catalogue ordered by category + code; getPermissionsForUser joins user_roles → role_permissions to return permission codes (replaces stub used by JWT enrichment).
    - `notifications.service.listTemplates` — schema maps `subject_template` → `subject`, `is_active` → `enabled`.
    - `system-settings.service.list` — filters sensitive keys (jwt.secret, smtp.password, etc.), derives category from key prefix, normalizes `valueType` → STRING|NUMBER|BOOLEAN|JSON.
    - `bids.service.listForTender` — joins vendor.companyName, derives technical/commercial envelope status from BidEnvelope rows. commercialDetailsVisible=false by design (commercial:view path is /commercial-comparison).
    - `committee.service.listForTender` — sessions newest first with members (name from user.displayName, role from roleInCommittee or Chair/Member fallback) and attendance flag.
    - `technical-evaluation.service.listCriteria` — returns SYSTEM_DEFAULT 4-row criteria (matches UI hardcoded set) until tender_technical_criteria table migration lands. Verifies tender exists.
    - `reports.service.listJobs` — returns empty list until report_export_jobs table + job persistence land. Stub documents schema migration requirement.
  - API tsc clean.
  - Completed 2026-05-18. Added to `api-contracts/openapi/ctmp.openapi.yaml`: `POST /tenders/{id}/approve|reject`, `GET /tenders/{id}/bids`, `GET /tenders/{id}/technical-criteria`, `GET /tenders/{id}/committee-sessions`, `/vendors` admin CRUD (list with status filter, approve, reject, suspend), `/roles/{id}/permissions` GET+PATCH, `GET /permissions`, `/notification-templates` GET + PATCH, `/system-settings` GET + `/system-settings/batch` POST, `GET /reports/jobs`. Added 15 new schemas (Vendor, VendorListResponse, VendorUpdateRequest, Role, RoleListResponse, Permission, PermissionListResponse, NotificationTemplate + list, PlatformSetting + list, ReportExportJobListResponse, TenderBidsListResponse, TenderBidSummary, TechnicalCriterion, TechnicalCriteriaResponse, CommitteeMember, CommitteeSessionWithMembers, CommitteeSessionListResponse). Added VendorId + RoleId path parameters. Created `apps/api/src/modules/system-settings/` module (controller + service + module + wired in AppModule). Added stub endpoints in tenders, bids, technical-evaluation, committee, vendors, roles, notifications, reports controllers/services. Vendor controller flattened from `/vendors/registrations/{id}/*` to `/vendors/{id}/*` to match UI. API tsc clean; web-admin tsc clean; redocly lint: 0 errors, 146 warnings (deferred operationId, pre-existing pattern).

## Phase 3: Backend Scaffold

- [x] Initialize API app framework.
  - Completed 2026-05-17. NestJS v11 app scaffolded manually at `apps/api/`. pnpm workspace root configured with `pnpm-workspace.yaml`. All 842 packages installed. Key files: `apps/api/package.json`, `apps/api/tsconfig.json`, `apps/api/nest-cli.json`, `apps/api/src/main.ts`.
- [x] Add configuration module.
  - Completed 2026-05-17. Typed config factories for app, database, jwt, ad. Key files: `apps/api/src/config/`.
- [x] Add database connection/migration tooling.
  - Completed 2026-05-17. ORM: Prisma v6. Full schema generated from SQL migrations (33 models, 17+ enums). Prisma client generated. Key files: `apps/api/prisma/schema.prisma`, `apps/api/src/database/prisma.service.ts`, `apps/api/src/database/database.module.ts`.
- [x] Add auth module.
  - Completed 2026-05-17. JWT + AD strategy skeleton. Public/protected guards. Key files: `apps/api/src/modules/auth/`.
- [x] Implement auth service (TDD).
  - Completed 2026-05-17. Full TDD cycle: 20 tests written RED, implementation written, all 20 GREEN. Covers login (AD bind, MFA gate, permissions in JWT), logout (tokenVersion increment), refresh (version-based revocation), verifyMfa (TOTP), validateUser. Migration 003 adds token_version + mfa_secret columns. Key files: `apps/api/src/modules/auth/auth.service.ts`, `apps/api/src/modules/auth/auth.service.spec.ts`, `database/migrations/003_auth_tokens.sql`, `apps/api/prisma/schema.prisma`.
- [x] Add vendor-auth module with CAPTCHA and password reset.
  - Completed 2026-05-17. Vendor JWT strategy with separate secret. CAPTCHA, rate-limit, email-verify, MFA, password-reset stubs. Key files: `apps/api/src/modules/vendor-auth/`.
- [x] Implement vendor-auth service (TDD).
  - Completed 2026-05-17. 34 tests, all green. Covers register (CAPTCHA validation + Vendor+VendorUser+RegistrationRequest atomic txn), verifyEmail (SHA-256 token), login (bcrypt + lockout + email/vendor gates + MFA), logout (tokenVersion bump), refresh (vendor-refresh type + version check), forgotPassword (always 204), resetPassword, verifyMfa (TOTP). Migration 004 adds `vendor_users.token_version` + `mfa_secret`. Added CaptchaService stub. Key files: `apps/api/src/modules/vendor-auth/vendor-auth.service.ts`, `vendor-auth.service.spec.ts`, `database/migrations/004_vendor_auth_tokens.sql`, `apps/api/src/common/services/captcha.service.ts`.
- [x] Add users, roles, permissions modules.
  - Completed 2026-05-17. RBAC-gated controllers with `RequirePermissions` decorator. `PermissionsService.getPermissionsForUser()` stub. Key files: `apps/api/src/modules/users/`, `apps/api/src/modules/roles/`, `apps/api/src/modules/permissions/`.
- [x] Add vendor management module.
  - Completed 2026-05-17. Registration approval/rejection flow, vendor profile management. Key files: `apps/api/src/modules/vendors/`.
- [x] Add tender module.
  - Completed 2026-05-17. Full lifecycle endpoints: create, update, submit-for-approval, publish, cancel, close-submissions, document download. Key files: `apps/api/src/modules/tenders/`.
- [x] Add clarification module.
  - Completed 2026-05-17. Vendor-scoped vs public reply visibility enforced in service TODOs. Key files: `apps/api/src/modules/clarifications/`.
- [x] Add bid/envelope module.
  - Completed 2026-05-17. Immutability guardrail documented in submit stub. Envelope-state + permission check documented for download. Key files: `apps/api/src/modules/bids/`.
- [x] Add late submission exception module.
  - Completed 2026-05-17. One active exception per (tender, vendor) enforced by DB. Key files: `apps/api/src/modules/late-submissions/`.
- [x] Add technical evaluation module.
  - Completed 2026-05-17. Open-only-after-Submission-Closed guardrail documented. Key files: `apps/api/src/modules/technical-evaluation/`.
- [x] Add committee commercial opening module.
  - Completed 2026-05-17. Only path to open commercial envelopes. Envelope-state-only change; visibility still requires explicit permissions. System Admin commercial exclusion noted. Key files: `apps/api/src/modules/committee/`.
- [x] Add commercial evaluation module.
  - Completed 2026-05-17. Gated by `commercial:view` and `commercial:evaluate` separately. Key files: `apps/api/src/modules/commercial-evaluation/`.
- [x] Add award module.
  - Completed 2026-05-17. Recommend → approve/reject → issue award lifecycle. Key files: `apps/api/src/modules/award/`.
- [x] Add audit module.
  - Completed 2026-05-17. Append-only `log()` method. System-wide + tender-scoped search. Key files: `apps/api/src/modules/audit/`.
- [x] Add notification module.
  - Completed 2026-05-17. Template-driven email via nodemailer. No controller (internal only). Key files: `apps/api/src/modules/notifications/`.
- [x] Add reports module.
  - Completed 2026-05-17. Async job pattern: enqueue → poll → download. Key files: `apps/api/src/modules/reports/`.

## Phase 4: Admin Portal

- [x] Initialize admin frontend app.
  - Completed 2026-05-18. Next.js 15 + React 19 + Tailwind CSS. Key files: `apps/web-admin/package.json`, `apps/web-admin/next.config.ts`, `apps/web-admin/tsconfig.json`, `apps/web-admin/src/app/layout.tsx`. pnpm install passes. TypeScript clean.
- [x] Add shell layout and navigation.
  - Completed 2026-05-18. Sidebar `#0F172A` with permission-gated nav (commercial:view hides Commercial Comparison). Key files: `apps/web-admin/src/components/layout/Sidebar.tsx`, `apps/web-admin/src/app/(admin)/layout.tsx`.
- [x] Add dashboard.
  - Completed 2026-05-18. Full implementation. 6 stat cards (active tenders, pending approvals, open clarifications, in evaluation, awaiting opening, pending vendors), recent tenders table, upcoming deadlines panel, quick actions. Parallel-fetch by status. Key file: `apps/web-admin/src/app/(admin)/dashboard/page.tsx`. TypeScript clean.
- [x] Add tender list/detail/create/edit.
  - Completed 2026-05-18. Key files: `apps/web-admin/src/app/(admin)/tenders/page.tsx` (list + filter + pagination), `apps/web-admin/src/app/(admin)/tenders/[id]/page.tsx` (detail with tabs, workflow progress, document list, lifecycle actions), `apps/web-admin/src/app/(admin)/tenders/new/page.tsx` (create form — Step 1), `apps/web-admin/src/app/(admin)/tenders/[id]/edit/page.tsx` (edit form pre-filled from API), `apps/web-admin/src/components/ui/StatusBadge.tsx` (reusable badge for all 17 lifecycle states). TypeScript clean.
- [x] Add approval queue.
  - Completed 2026-05-18. Key file: `apps/web-admin/src/app/(admin)/approvals/page.tsx`. Split-pane layout: left task list (Tender Approval + Award Approval), right detail panel with comments + approve/reject actions. Filters: search, task type, date. Fetches `GET /tenders?status=Internal%20Review` and `GET /tenders?status=Award%20Recommendation` in parallel. TypeScript clean. NOTE: `POST /tenders/{id}/approve` and `POST /tenders/{id}/reject` are not in the OpenAPI contract — need to be added.
- [x] Add clarification center.
  - Completed 2026-05-18. Key file: `apps/web-admin/src/app/(admin)/clarifications/page.tsx`. 3-panel layout: left tender list (Clarification Period tenders), center thread list with All/Pending/Answered tabs + sort, right icon toolbelt. Thread cards expand in-place with reply form (visibility toggle: Private/Public), collapsed cards show status. TypeScript clean.
- [x] Add technical evaluation workspace.
  - Completed 2026-05-18. Key file: `apps/web-admin/src/app/(admin)/technical-evaluation/page.tsx`. 3-col layout (tender list / bid list / scorecard). Compliance banner. POST `/bids/{id}/technical-evaluations` + POST `/tenders/{id}/finalize-technical-results`. NOTE: `GET /tenders/{id}/bids` not in OpenAPI contract — page degrades gracefully. Per-tender criteria currently hardcoded (4 rows, 70-pt threshold) — needs `GET /tenders/{id}/technical-criteria` or embedded config. TypeScript clean.
- [x] Add committee commercial opening screen.
  - Completed 2026-05-18. Key file: `apps/web-admin/src/app/(admin)/committee-opening/page.tsx`. Tender list (Commercial Sealed / Committee Commercial Opening), session header, attendance grid with quorum check, opening remarks, technically-qualified vendor table, primary `Open Commercial Envelopes` action gated on quorum+remarks. Wires `POST /committee-sessions/{id}/attendance` + `POST /committee-sessions/{id}/open-commercial-envelopes`. GAP: `GET /tenders/{id}/committee-sessions` not contracted — speculative call.
- [x] Add commercial comparison screen with permission-controlled visibility.
  - Completed 2026-05-18. Key file: `apps/web-admin/src/app/(admin)/commercial-comparison/page.tsx`. Hard `commercial:view` gate at page top with friendly NoAccessScreen. Tender list, ranked comparison table, per-cell `commercialDetailsVisible` honored (hides amount if false), permission chips (view/download/evaluate/export), `Recommend Award` action (rank 1), `Export Comparison` (gated by `commercial:export`). Reads `GET /tenders/{id}/commercial-comparison`.
- [x] Add vendor management.
  - Completed 2026-05-18. Key file: `apps/web-admin/src/app/(admin)/vendors/page.tsx`. 4 stat cards (total/pending/approved/rejected), search + status filter, list/detail split. Approve gated on email verification. Approve/Reject/Suspend all require audit reason. GAP: `/vendors`, `/vendors/{id}/approve|reject|suspend` not in OpenAPI but backend module exists.
- [x] Add reports.
  - Completed 2026-05-18. Key file: `apps/web-admin/src/app/(admin)/reports/page.tsx`. Catalog grouped by category, format toggle (XLSX/PDF), enqueue via `POST /reports/{code}/export`, job history polls every 5s for QUEUED/RUNNING jobs, blob-download with Authorization header. `commercial:export` gate on requiring reports. GAP: `GET /reports/jobs` (history) not contracted — speculative.
- [x] Add audit log viewer.
  - Completed 2026-05-18. Key file: `apps/web-admin/src/app/(admin)/audit-log/page.tsx`. Hard `audit:view` gate. Filters: search, eventType, entityType, risk level. Paginated table (50/pg). Row expansion shows IP/UA, before/after JSON, hash chain prefix. Notes hash-chain immutability at footer.
- [x] Add security alerts page.
  - Completed 2026-05-19. Key files: `apps/web-admin/src/app/(admin)/security-alerts/page.tsx`, `apps/web-admin/src/components/layout/Sidebar.tsx`. Hard `audit:view` gate. Lists AUDIT_CHAIN_BREAK and other security_alerts rows. Unacknowledged alerts highlighted in red. One-click Acknowledge calls PATCH `/security-alerts/:id/acknowledge`. Expandable rows show metadata, source IP, and acknowledger. Sidebar nav item added (gated by `audit:view`). TypeScript clean.
- [x] Add system configuration screens.
  - Completed 2026-05-18. Key file: `apps/web-admin/src/app/(admin)/settings/page.tsx`. 3 tabs: Roles &amp; Permissions (table + permission editor grouped by category, blocks edits on System roles), Notification Templates (per-template inline edit with subject/body/enabled), Platform Settings (grouped by category, type-aware inputs, batch save with dirty tracking). GAP: All endpoints (`/roles`, `/permissions`, `/notification-templates`, `/system-settings`) not contracted — backend modules exist per Phase 3.

**Phase 4 foundation complete as of 2026-05-18:**
  - Stitch designs: 14 HTML mockups in `apps/web-admin/stitch-designs/`. Use for layout reference only — colors are old palette.
  - Color palette locked: Sidebar `#0F172A`, Accent `#3B82F6`, BG `#F1F5F9`, Card `#FFFFFF`, Text `#0F172A`/`#475569`, Success `#22C55E`, Danger `#EF4444`, Border `#E2E8F0`. Defined in `tailwind.config.ts` + `globals.css`.
  - Auth: `apps/web-admin/src/app/login/page.tsx` — AD login + MFA step wired to API.
  - API client: `apps/web-admin/src/lib/api.ts`, `apps/web-admin/src/lib/auth.ts`.
  - Next session starts at: Add approval queue.

## Phase 5: Vendor Portal

- [x] Initialize vendor frontend app.
  - Completed 2026-05-18. Next.js 15 + React 19 + Tailwind scaffold at `apps/web-vendor/`. See Phase 2 entry "Phase 5 — Vendor Portal scaffold" for full file list.
- [x] Add vendor login.
  - Completed 2026-05-18. `apps/web-vendor/src/app/login/page.tsx`.
- [x] Add vendor registration with CAPTCHA.
  - Completed 2026-05-18. `apps/web-vendor/src/app/register/page.tsx` includes CAPTCHA token field (server-side validation in `vendor-auth` module).
- [x] Add email verification flow.
  - Completed 2026-05-19 (covered by Phase 7+ e2e `email-verification.spec.ts` MailHog round-trip).
- [x] Add forgot/reset password flow.
  - Completed 2026-05-18. `apps/web-vendor/src/app/forgot-password/page.tsx` + backend `vendor-auth.service` forgot/reset methods.
- [x] Add vendor dashboard.
  - Completed 2026-05-18. Dashboard with stat cards + available tender list.
- [x] Add public/invited tender list.
  - Completed 2026-05-18. Tenders list with search.
- [x] Add tender detail.
  - Completed 2026-05-19. `apps/web-vendor/src/app/(portal)/tenders/[id]/page.tsx` with Start-Bid CTA.
- [x] Add clarification center.
  - Completed 2026-05-19. `apps/web-vendor/src/app/(portal)/clarifications/page.tsx` — tender list + thread cards + ask form.
- [x] Add bid submission wizard.
  - Completed 2026-05-19. `apps/web-vendor/src/app/(portal)/bids/wizard/[tenderId]/page.tsx` — 4-step wizard with stepper, FileDropZone, per-doc SHA-256, atomic submit-to-receipt.
- [x] Add technical envelope upload step.
  - Completed 2026-05-19 (wizard step 2). Server-side SHA-256 via multipart `POST /bids/{id}/envelopes/TECHNICAL/documents`.
- [x] Add commercial envelope upload step.
  - Completed 2026-05-19 (wizard step 3). Same pattern as TECHNICAL.
- [x] Add submission receipt screen.
  - Completed 2026-05-19. `apps/web-vendor/src/app/(portal)/bids/[bidId]/page.tsx` shows receipt after submit.
- [x] Add company profile and document repository.
  - Completed 2026-05-19. `apps/web-vendor/src/app/(portal)/profile/page.tsx` view+edit; email/MFA read-only. Backed by `GET/PATCH /vendor-auth/me`.
- [x] Phase 5 redesign — VENDOR•CONNECT theme (deployed to staging, light theme as of 2026-05-26).
  - First pass 2026-05-24 (dark navy theme). Light-theme conversion completed 2026-05-26. Vendor portal at `https://vn.hadiclinic.com.kw:4201` now uses soft `#F8FAFC → #EFF6FF` gradient + white glass cards + slate-900 text + electric-blue accents. 17/17 Playwright smoke tests pass against live URL. See HANDOVER.md entry 2026-05-26.
  - **Original 2026-05-24 entry preserved below for history:** Reskinned the vendor portal against `agents/frontend/vendorui.html`: navy gradient + electric-blue glass-morphism aesthetic, Space Grotesk display font, top-nav layout (replaces left sidebar). All data wiring preserved. **Files (20 total):** new design tokens in `tailwind.config.ts` + `app/globals.css`; new primitives in `components/ui/` (`GlassCard.tsx`, `Button.tsx`, `Input.tsx`, `PageHeader.tsx`, `Empty.tsx`); rewritten `StatusBadge.tsx` (tone-based, also exports `Chip`); new `lib/cn.ts`; new layout shells `components/layout/PortalShell.tsx` (rewritten — top nav with vendor chip from `/vendor-auth/me`) and `components/layout/AuthShell.tsx` (new — shared auth-page wrapper); rebuilt portal pages `(portal)/dashboard/page.tsx`, `(portal)/tenders/page.tsx`, `(portal)/tenders/[id]/page.tsx`, `(portal)/bids/page.tsx`, `(portal)/clarifications/page.tsx`, `(portal)/profile/page.tsx`; reskinned auth pages `login/page.tsx`, `register/page.tsx`, `forgot-password/page.tsx`, `verify-email/page.tsx`. `npm run type-check` clean, `npm run build` ✓ (13 routes). **Testing status: ⚠️ NOT YET COMPLETED.** Build passes but no manual browser smoke test has been done — 73-item test plan + end-to-end registration→admin-approval→login handshake handed to the user, results pending. Until walked through, the redesigned UI is visually unverified (only the code compiles). Requires all three local services running together: `web-admin` :4200 (for admin to approve the test vendor — note admin portal is still on its old light theme, intentionally unchanged this pass), `web-vendor` :4300, and `docker compose --project-name ctmp up -d`. **Still pending (Phase 5b follow-up):** `(portal)/bids/[bidId]/page.tsx` and `(portal)/bids/wizard/[tenderId]/page.tsx` — these still use the old token names; legacy tailwind aliases keep them compiling and roughly readable but they don't match the new look.

## Phase 6: Infrastructure

- [x] Create local Docker Compose.
  - Completed 2026-05-18. Full stack in `infrastructure/docker/docker-compose.yml`.
- [x] Add PostgreSQL service.
  - Completed 2026-05-18. postgres:16-alpine with auto-migration loading.
- [x] Add Redis service.
  - Completed 2026-05-18. redis:7-alpine with persistence.
- [x] Add API service.
  - Completed 2026-05-18. NestJS API with health checks.
- [x] Add admin portal service.
  - Completed 2026-05-18. Next.js 15 web-admin.
- [x] Add vendor portal service.
  - Completed 2026-05-18. Next.js 15 web-vendor.
- [x] Add environment variable templates.
  - Completed 2026-05-18. `.env.example` with all knobs documented.
- [x] Add SMTP configuration documentation.
  - Completed 2026-05-18. MailHog for dev/QA; production SMTP guidance in README.
- [x] Add setup/cleanup helper scripts for local development.
  - Completed 2026-05-20. `infrastructure/scripts/docker-setup.sh` (generates secrets, starts stack, seeds DB), `docker-clean.sh` (cleanup), comprehensive README.
- [ ] Add backup and restore runbook.
- [ ] Add on-prem deployment runbook.

## Phase 7: QA And Security

- [ ] Create manual UAT test suite.
- [ ] Create API test plan.
- [x] Create Playwright test plan.
  - Completed 2026-05-19. New workspace package `qa/playwright/` (added to `pnpm-workspace.yaml`). `playwright.config.ts` single-worker, serial. Helpers: `helpers/db.ts` (pg-driven seed/reset for admin user + tender + vendor), `helpers/api.ts` (admin/vendor login + authed fetch), `helpers/fixtures.ts` (text buffers as bid docs). Single golden-path spec `tests/golden-path.spec.ts` walks: vendor register → email force-verify → admin approve → vendor login → bid wizard upload×2 + submit → admin close + technical open + evaluate + finalize → committee session + attendance + commercial open + commercial eval → award recommend/approve/issue → audit-log assertion. MailHog added to `docker-compose.yml` (ports 1025+8025) + SMTP defaults updated. Tracker entries below covered by this single spec.
- [x] Test immutable bid submission (covered by golden path).
- [x] Test technical envelope opening after submission closure (covered by golden path).
- [x] Test commercial envelope remains sealed before committee opening (covered by golden path).
- [x] Test commercial visibility remains permission-controlled after opening.
  - Completed 2026-05-19. `qa/playwright/tests/commercial-visibility.spec.ts` — three token shapes (full perms / no `commercial:view` → 403 / `commercial:view` only → `canExport=false`).
- [x] Test late submission exception flow.
  - Completed 2026-05-19. `qa/playwright/tests/late-submission.spec.ts`.
- [x] Test audit logging (covered across golden-path + per-spec spot checks).
- [x] Wire CI e2e pipeline (GitHub Actions).
  - Completed 2026-05-19. Key file: `.github/workflows/e2e.yml`. Boots full Docker Compose stack on `ubuntu-latest`, waits for postgres/api/web-admin/web-vendor health (30×5 s loops), runs `pnpm --filter @ctmp/qa-playwright run test` with all 5 specs, uploads `playwright-report` (14 d) + `playwright-traces` (7 d) artifacts. Dumps compose logs on failure.
  - Follow-up fix 2026-05-19 (commit `4018f1e`): the initial push to `develop` failed at YAML-parse time (run `26090377501`, 0 s, "workflow file issue") because the `Create .env` step's heredoc body sat at column 0 — outside the 10-space `run: |` block scalar strip prefix — so YAML ended the script after the `cat` line and rejected the env-var lines as root-level keys. Fixed by indenting the heredoc body + closing `EOF` to match the `cat` line; YAML strips the consistent indent before bash sees the script, so the resulting `.env` still has no leading whitespace.
- [x] Add security-alerts backend API.
  - Completed 2026-05-19. Key files: `apps/api/src/modules/audit/audit.service.ts`, `apps/api/src/modules/audit/audit.controller.ts`. `GET /security-alerts` — paginated list (page/pageSize/unacknowledgedOnly), BigInt id serialized as string, page clamped to ≥1, pageSize clamped to 1–200. `PATCH /security-alerts/:id/acknowledge` — regex guard on id, Prisma P2025 → 404. Both gated by `audit:view`.
- [x] Add audit-chain unit tests (verifyChain + log + onModuleInit).
  - Completed 2026-05-19. Key file: `apps/api/src/modules/audit/audit.service.spec.ts`. 17 Jest tests: 6 for `verifyChain` (empty chain → true, single genesis, valid 3-row chain, broken prevHash, tampered hashChainValue, limit param), 4 for `log` (advisory lock first in txn, genesis hash when no prior row, chain continuation, exact SHA-256 recomputation), 3 for `onModuleInit` (skip when AUDIT_VERIFY_ON_START=false, success path, AUDIT_CHAIN_BREAK alert on break). All green. Fix: `clearAllMocks()` wipes callback-style `$transaction` mock — restored in `beforeEach`.
- [x] Post-CI warm-up cleanups (four follow-ups from 2026-05-19 17/17 green handover).
  - Completed 2026-05-19. (1) `qa/playwright/helpers/db.ts` — role lookup/insert uses `SYSTEM_ADMIN` (was `system_admin`), eliminates duplicate role row in CI. (2) `apps/web-admin/src/components/layout/Sidebar.tsx` — logout fetch now hits `${NEXT_PUBLIC_API_URL}/api/v1/auth/logout` with Bearer header (was relative `/api/auth/logout` → 404). (3) `apps/web-admin/src/app/(admin)/reports/page.tsx` — report download fetch path bumped `/api` → `/api/v1`. (4) `apps/api/src/modules/vendor-auth/vendor-auth.service.spec.ts` — added `AuditService` mock provider; suite restored from 34/34 failing to 34/34 passing in 11s. `apps/web-admin` + `qa/playwright` tsc clean.
- [x] Test vendor registration CAPTCHA (e2e).
  - Completed 2026-05-19. Key file: `qa/playwright/tests/vendor-registration-captcha.spec.ts`. Four serial cases exercise the CAPTCHA gate against the public stub provider: (1) missing `captchaToken` returns 400 from DTO `@IsNotEmpty` and writes **no** `captcha_verification_logs` row, (2) `captchaToken: 'invalid'` returns 400 with `CAPTCHA verification failed`, increments the FAILURE row count by 1, and leaves no `vendor_users` row behind, (3) any other non-empty token returns 201 with `PENDING_VERIFICATION`, increments the SUCCESS row count by 1, and the new `vendor_registration_requests.captcha_verification_id` FK resolves to a `SUCCESS` row with `provider='stub'`, (4) replay of the same email returns 400 "Email already registered". Spec resets vendor state with `resetVendorByEmail` in `beforeAll`. `qa/playwright` tsc clean.
- [x] Test vendor password reset (e2e).
  - Completed 2026-05-19. Key file: `qa/playwright/tests/vendor-password-reset.spec.ts`. Five serial cases exercise the self-service forgot/reset flow: (1) `POST /vendor-auth/forgot-password` with email returns 204 (no leak of email existence), (2) reset-password email arrives in MailHog with token payload, (3) `POST /vendor-auth/reset-password` with token + new password returns 200 and marks token `usedAt`, (4) login with new password succeeds + returns `accessToken`, (5) replay of same token returns 400 "already used|invalid". Spec seeds an APPROVED vendor with the initial password via `ensureApprovedVendor`, then resets to new password. `qa/playwright` tsc clean.
- [x] Test report exports (e2e).
  - Completed 2026-05-19. Key file: `qa/playwright/tests/report-exports.spec.ts`. Five test cases exercise the full async export lifecycle: (1) `POST /reports/{code}/export` returns 201 QUEUED immediately, (2) `GET /reports/jobs/{id}` polls until status=COMPLETED (with per-spec timeouts to flag hanging jobs), (3) download COMPLETED report as XLSX + verify ZIP magic bytes (0x504b), (4) download requires authorization (caller-scoped via `requestedBy` FK), (5) invalid format parameter returns 400. Spec seeds an admin + tender so reports have data. Uses `signAdminToken` to bypass AD. `qa/playwright` tsc clean.

## Phase 8: QA & Security (COMPLETE)

- [x] Keep `agents/handoffs/HANDOVER.md` updated after each task.
  - Completed 2026-05-20. Continuous handover maintained throughout all phases, 27 entries total.
- [x] Keep `docs/decisions/DECISION_LOG.md` updated after decisions.
  - Completed 2026-05-20. DECISION_LOG.md maintained with all architectural decisions.
- [x] Keep `agents/skills/PROJECT_SKILLS.md` updated with reusable patterns.
  - Completed 2026-05-20. PROJECT_SKILLS.md updated with reusable patterns discovered during implementation.
- [x] Keep this task tracker updated.
  - Completed 2026-05-20. MASTER_TASK_TRACKER.md maintained through all phases.
- [x] **Phase 8 COMPLETE: 27/27 E2E Tests Passing**
  - Completed 2026-05-20 09:38 GMT+3. CI run 26126511123 confirmed all tests passing.
  - All Phase 8+ follow-ups resolved: committee dedup (#11), vendor visibility filter (#7), brute-force protection (#8), registration fields (#9), vendor-auth tests (#10), report exports auth fix (#181).
  - Exceljs namespace import fix + report test authorization token await fix confirmed working.
  - Infrastructure scripts ready: wsl2-setup.ps1, wsl2-docker-start.sh, docker-setup.sh, docker-clean.sh.
  - STATUS.md created with comprehensive project state and next steps.

## Phase 9: Remote Deployment & Manual Testing

- [x] Deploy CTMP stack to remote Ubuntu server (immsrv1 / 10.1.13.98).
  - Completed 2026-05-20. Code at `/mnt/repo/ctmp-platform/`. All 7 containers healthy via `docker compose --project-name ctmp`. SSH key: `C:\Users\Administrator\.ssh\ctmp_github_ed25519`.
- [x] Bootstrap LOCAL admin user for testing.
  - Completed 2026-05-20. `admin@ctmp.local` / `Admin@12345!`, SYSTEM_ADMIN role. Login verified via API.
- [x] Configure .env for remote server (secrets, port remapping).
  - Completed 2026-05-20. Postgres on host port 5433 (5432 taken). CAPTCHA=stub. Fresh 64-char JWT secrets.
- [x] Establish server access boundary rules.
  - Completed 2026-05-20. `AGENTS.md` + root `CLAUDE.md` updated. Rule: `/mnt/repo/ctmp-platform/` only; ask permission for anything outside.
- [x] Phase 9 manual-testing fixes — 6 rounds of UI/API gaps closed during Chrome-extension testing.
  - Completed 2026-05-21. Tests 1–8 drove a sequence of fixes that unlocked the full tender → bid → evaluate → committee → award lifecycle. Files: `apps/web-admin/src/lib/api.ts` (NestJS nested error unwrap), `apps/web-vendor/src/lib/api.ts` (same), `apps/web-admin/src/app/(admin)/tenders/new/page.tsx` (added Department dropdown, refs+DOM fallback for JS-set values, always-clickable Save), `apps/api/src/modules/departments/*` (new module — `GET /departments`), `apps/web-vendor/src/app/verify-email/page.tsx` (new page, Suspense-wrapped), `apps/api/src/modules/vendor-auth/vendor-auth.service.ts` (verifyUrl + resetUrl in email payload), `infrastructure/docker/docker-compose.yml` (VENDOR_PORTAL_URL env), `apps/web-vendor/package.json` (+ lucide-react), `apps/api/src/modules/tenders/tenders.service.ts` (bidCount in serializeDetail), `apps/web-admin/src/app/(admin)/tenders/[id]/page.tsx` (Open Technical Envelopes + Issue Award buttons), `apps/web-admin/src/app/(admin)/technical-evaluation/page.tsx` (DTO-aligned `{ score, notes }` payload), `apps/api/src/modules/clarifications/clarifications.controller.ts` (vendor JWT via OptionalVendorOrUserGuard), `apps/web-admin/src/app/(admin)/committee-opening/page.tsx` (Schedule Committee Session inline form), `apps/api/src/modules/users/users.service.ts` (implemented findAll), `apps/web-admin/src/app/(admin)/commercial-comparison/page.tsx` (price-input cell, fixed recommend-award URL/payload, fixed export URL), `apps/web-admin/src/app/(admin)/approvals/page.tsx` (AWARD_APPROVAL payload aligned with DTO). DB: seeded 8 departments, granted SYSTEM_ADMIN all permissions (52) + commercial:view/evaluate/export (testing-only, spec deviation), created `committee@ctmp.local` for quorum.
- [x] Fix Material Symbols Outlined → lucide-react across all 16 web-admin pages; deploy to server.
  - Completed 2026-05-21. Root cause: Google Fonts CDN inaccessible on on-prem server; icons rendered as raw text. Replaced all material spans with bundled SVG icons from lucide-react across: login, tenders (list/detail/new/edit), approvals, audit-log, clarifications, commercial-comparison, committee-opening, reports, security-alerts, settings, technical-evaluation, vendors, dashboard, Sidebar, TopNavBar. Fixed two TypeScript build errors (`title=` → `aria-label=` on SVG icon elements in clarifications and vendors pages). SCP'd to server, rebuilt and restarted ctmp-web-admin container.
- [x] Rewrite UI_PROMPTS.md to function-only (remove design prescriptions).
  - Completed 2026-05-21. Key file: `agents/ui-prompts/UI_PROMPTS.md`. Removed all color, font, icon, spacing, and layout directives. Each of the 26 prompts now describes only: purpose, data shown, available actions, states/variants, and business rules — leaving design entirely to the generating agent.
- [x] Manual testing — admin portal tender lifecycle.
  - Completed 2026-05-21. Full lifecycle verified via 3-batch browser-extension test plan in `docs/qa/MANUAL_TEST_PLAN.md`. **76/76 tests pass.** Tender `TDR-2026-0005` walked Draft → Internal Review → Approved → Published → Submission Closed → Technical Opening → Commercial Sealed → Committee Commercial Opening → Commercial Evaluation/Comparison → Award Recommendation → Awarded → Tender Closed. Bid receipt `RCPT-1779380984150-4FBCD9` issued with SHA-256 checksums on both envelopes.
- [x] Manual testing — vendor portal.
  - Completed 2026-05-21. Vendor `acme@testco.com` (Acme Builders LLC) self-registered → MailHog verification → admin approved → submitted bid via 4-step wizard with file uploads → received receipt → posted clarification question (visible to admin after filter widening, see Phase 9 fixes).
- [x] Create departments via admin Settings UI.
  - Completed 2026-05-21. Admin Settings now has **Departments** + **Users** tabs. Backend: `POST/PATCH/DELETE /departments` (audited, `system:configure` permission), Users CRUD service implemented (`USER_CREATED`/`USER_UPDATED`/`USER_DISABLED` audit events). Frontend: full CRUD UI in `apps/web-admin/src/app/(admin)/settings/page.tsx`. Files: `apps/api/src/modules/departments/*`, `apps/api/src/modules/users/*`, `apps/api/src/app.module.ts` (DepartmentsModule registered), `apps/web-admin/src/app/(admin)/settings/page.tsx`, `apps/web-admin/src/lib/api.ts` (added `del` helper). Smoke-tested via curl: POST/PATCH/DELETE departments + GET users with role+department joins all return correct shapes.
- [ ] Configure AD bind for internal user auth (optional for testing, required for production).
  - Set `AD_URL`, `AD_BIND_DN`, `AD_BIND_PASSWORD` in `.env` and restart api container.
- [x] Provision HTTPS ingress for vendor portal at `vn.hadiclinic.com.kw:4201`.
  - Completed 2026-05-22 ~11:35 GMT+3 (initial :443 setup at 11:20; switched to :4201 at 11:35 after user reported :443 unreachable from their network — upstream routing blocks :443 to this host). Host nginx vhost at `/etc/nginx/sites-available/ctmp-vendor-tls.conf` (symlinked into `sites-enabled`): listens **:4201** with TLSv1.2/1.3, server_name `vn.hadiclinic.com.kw`, reuses wildcard cert `/mnt/repo/Oriciety/cert/fullchain.crt` (`*.HADICLINIC.COM.KW`, valid through 2026-09-16). Routes: `/api/` → `127.0.0.1:3000` (ctmp-api), `/` → `127.0.0.1:4300` (ctmp-web-vendor). Headers: HSTS, X-Content-Type-Options, X-Frame-Options DENY, Referrer-Policy, X-Forwarded-Proto https, X-Forwarded-Port 4201 set on upstream. Separate `:80` server with `server_name vn.hadiclinic.com.kw` 301-redirects to `https://...:4201/...`; host's default :80 catch-all untouched. `PUBLIC_API_URL` in `infrastructure/docker/.env` is now `https://vn.hadiclinic.com.kw:4201` (was `http://10.1.13.98:3000` originally; briefly was `https://vn.hadiclinic.com.kw` during the :443 attempt). Web-vendor rebuilt `--no-cache` twice to rebake `NEXT_PUBLIC_API_URL` into the JS bundle. Verified: HTTPS `:4201/register` 200, HTTPS `:4201/api/v1/health` returns API JSON, HTTP→HTTPS 301 with explicit port works, current JS bundle has the `:4201` URL and **zero** references to old `10.1.13.98:3000` or to the bare hostname without port. Direct LAN access at `:4300` unaffected. **Pattern follows the host's existing per-app TLS port convention** (Citelify uses :9090, complainmgmt-internal uses :8443) — chosen because upstream network routing only forwards specific high ports to this server. **Unblocks positive hCaptcha E2E** (was the long-standing blocker). **Test URL: `https://vn.hadiclinic.com.kw:4201/register`.**
- [x] Revert SYSTEM_ADMIN commercial grants (separation of duties).
  - Completed 2026-05-22. Migration `database/migrations/007_revert_system_admin_commercial_grants.sql` deletes all `commercial:%` permissions from SYSTEM_ADMIN except `commercial:view_status` (per spec). 4 rows deleted total (`commercial:view`, `commercial:evaluate`, `commercial:export`, `commercial:open_committee`). SYSTEM_ADMIN permission count dropped 55 → 51. Verified via `GET /roles/:id`: only `commercial:view_status` remains. **Follow-up**: assign the existing `COMMERCIAL_EVALUATOR` role to a dedicated internal user via Settings → Users so commercial evaluation flow stays functional.
- [~] Replace dev credentials before any real-world use.
  - **CAPTCHA: DONE 2026-05-22.** Implemented full hCaptcha provider (`apps/api/src/common/services/captcha.service.ts` — HTTP `siteverify` round-trip with 5s timeout, error-code surfacing, fail-closed for unknown providers, startup throw on `stub`+`production` unless `CAPTCHA_ALLOW_STUB_IN_PROD=true`). Frontend: `@hcaptcha/react-hcaptcha` widget on vendor `/register` (`apps/web-vendor/src/app/register/page.tsx`). **Production swap-out completed 2026-05-22 ~10:00 GMT+3**: staging server `.env` now carries the real `hadiclinic` hCaptcha site key `b03031a4-dab0-431a-8744-bdc2d13af2a2` and secret `ES_…b4b2`; web-vendor rebuilt `--no-cache`; api recreated; allowlisted hostname `vn.hadiclinic.com.kw`. Verified via startup log `CAPTCHA provider: hCaptcha (production)`, new bundle chunk `page-c6b994b02194d93a.js` carries the prod key (test key absent), and a bogus-token negative test produced `captcha_verification_logs` row #11 `provider=hcaptcha, result=FAILURE, error_code=invalid-input-response`. Positive E2E (real browser-solved challenge) deferred — needs human visiting `https://vn.hadiclinic.com.kw/register`.
  - MinIO root password: **ROTATED 2026-05-22 ~10:40 GMT+3.** Was `ctmpadmin_dev`, now a 64-char hex value (256-bit entropy, fingerprint `c4d9…6cfe`), generated via `openssl rand -hex 32` on the server. Stored at `~claude/minio-root-password` (0600). Rotation used `MINIO_ROOT_PASSWORD_OLD` for graceful re-encryption (no-op since no IAM users exist), then `_OLD` vars removed from `.env` and container force-recreated to scrub them. Verified: new password authenticates via `mc admin info`; old password rejected with `Access Denied`; all 7 ctmp-* containers healthy after rotation. Username kept as `ctmpadmin`. **Note:** API uses `STORAGE_DRIVER=local`, so MinIO is not currently storing app data — but the console at `0.0.0.0:9001` is reachable on LAN, so rotating root closes that exposure surface regardless.
  - JWT: **AUDITED 2026-05-22.** `infrastructure/docker/.env` gitignored (`.gitignore:16` `*.env`) and never tracked (`git ls-files` shows only `.env.example`). All 4 secrets (`JWT_SECRET`, `JWT_REFRESH_SECRET`, `VENDOR_JWT_SECRET`, `VENDOR_JWT_REFRESH_SECRET`) are 64-char hex (256-bit entropy, consistent with `openssl rand -hex 32`), all 4 SHA-256 fingerprints distinct (no reuse). `.env.example` placeholders are 31 chars (obviously not real). No rotation needed.
- [x] Align test plan wording with actual audit event names.
  - Completed 2026-05-21. Test plan and UI prompts expected `BID_SUBMITTED` and `EXCEPTION_GRANTED`, but backend emits `BID_DOCUMENT_UPLOADED` (`bids.service.ts:281`) and `LATE_SUBMISSION_EXCEPTION_GRANTED` (`late-submissions.service.ts:104`). Implementation is spec-compliant; only doc wording was off. Files: `docs/qa/TEST_BATCH_3.md`, `docs/qa/MANUAL_TEST_PLAN.md`, `agents/ui-prompts/UI_PROMPTS.md`.
- [x] AUDIT_CHAIN_BREAK root-cause analysis (8 unack'd CRITICAL alerts from manual testing).
  - Completed 2026-05-23. Root cause: `canonicalize()` in `apps/api/src/modules/audit/audit.service.ts:34–43` treats `Date` as a plain object with no enumerable keys and produces `'{}'`, while Prisma serialises the same `Date` to JSONB as an ISO-8601 string via `.toJSON()`. The write-time and verify-time canonicals disagree, the recomputed SHA-256 differs from the stored value, and the chain verifier flags the row on every boot. 8 of 72 staging audit_logs rows are affected — all `VENDOR_APPROVED` (5: ids 7,8,27,39,70) or `COMMITTEE_SESSION_CREATED` (3: ids 22,34,48), all containing a `Date` in `afterValue` (`approvedAt` from `vendors.service.ts:133`, `scheduledAt` from `committee.service.ts:56`). **Data integrity is intact** — under a Date-aware canonical, every row hashes to its stored value, confirming no tampering occurred and the advisory-lock pattern is sound. The 8 `security_alerts` rows are duplicates of the same boot-time detection (verifier stops at first break). Misleading reporting at `audit.service.ts:127–134` (`actualPrev: row.hashChainValue` instead of recomputed hash) is what made the original alerts read like a link/restart-race issue when it is actually a payload-hash asymmetry. **Fix scoped as follow-up** (see RCA doc Option A): Date-aware `canonicalize()` + one-shot chain rebake migration + fix verifier logging + acknowledge existing alerts. Key files: `agents/reviews/AUDIT_CHAIN_BREAK_RCA_2026-05-23.md` (full report + fix options), `agents/reviews/audit-chain-break-evidence-2026-05-23.md` (raw evidence), `apps/api/scripts/verify-audit-row.{js,ts}` (diagnostic, not wired into prod, delete after fix lands).
- [x] Audit log viewer — populate Actor name and client IP / User Agent columns.
  - Completed 2026-05-24. Two related UX gaps the user surfaced while verifying the previous evening's rebake in the admin audit log. (1) `audit.service.ts` `search()` + `getTenderLogs()` now eagerly load `actorUser.displayName` (internal) and `actorVendorUser.vendor.companyName` (vendor) via Prisma `include`; `serialize()` resolves `actorName` from the first non-null. The admin page (`apps/web-admin/src/app/(admin)/audit-log/page.tsx:257`) already preferred `log.actorName` and fell back to a UUID prefix — fallback no longer wins. (2) New `RequestContextModule` under `apps/api/src/common/request-context/` uses Node `AsyncLocalStorage` to carry `{ipAddress, userAgent}` from a global middleware into `AuditService.log()`'s fallback path. `main.ts` set to `app.set('trust proxy', 1)` so `req.ip` resolves to the leftmost X-Forwarded-For (real client IP) rather than nginx loopback. Zero changes to the 37 existing `audit.log` call sites across 15 services. Tests: 79/79 jest suites green incl. two new fallback tests (`falls back to RequestContextService`, `prefers explicit ipAddress / userAgent on the entry`). Deploy: image rebuilt + force-recreated, smoke-tested with synthetic `POST /reports/tender_summary/export` + custom `X-Forwarded-For` → audit row 74 carries the supplied IP/UA, post-restart `verifyChain` returns `ok` on 74 rows. Note: rows 1–73 keep showing `—` for IP/UA — back-fill is meaningless because the original IPs are lost. Files: `apps/api/src/modules/audit/audit.service.{ts,spec.ts}`, `apps/api/src/common/request-context/{request-context.service.ts,request-context.middleware.ts,request-context.module.ts}` (new), `apps/api/src/app.module.ts`, `apps/api/src/main.ts`. Pattern captured in `agents/skills/PROJECT_SKILLS.md` ("Per-request context via AsyncLocalStorage"). Design choice (ALS vs explicit threading) captured in `docs/decisions/DECISION_LOG.md` entry of 2026-05-24.
- [x] Fix Date-canonicalize bug in AuditService and rebake affected chain rows (Option A from RCA 2026-05-23).
  - Completed 2026-05-23. Code: `apps/api/src/modules/audit/audit.service.ts` `canonicalize()` now special-cases `Date` (→ `.toISOString()`) and `Buffer` (→ base64); `verifyChain()` return type split into `breakKind: 'link' | 'hash'` with `storedHash`/`recomputedHash` on hash mismatch (fixes the misleading reporting at the old lines 127–134); `onModuleInit()` + `recordSecurityAlert()` updated to consume the new shape. Tests: `apps/api/src/modules/audit/audit.service.spec.ts` 18/18 passing, including a new `round-trips a Date in afterValue` regression test that explicitly reproduces the pre-fix asymmetry. Rebake: ran `apps/api/scripts/rebake-audit-chain.js --execute` inside `ctmp-api` against staging; 66 rows (ids 7–72) rewritten in a single Prisma `$transaction` with `pg_advisory_xact_lock` held, `audit_logs_no_update` trigger disabled+re-enabled inside the txn, in-txn `verifyChain` validated end-to-end before COMMIT. Marker: `AUDIT_CHAIN_REBAKE` row appended via normal `audit.log()` (now id 73, references the RCA doc + lists the 66 rewritten ids). Alerts: `security_alerts.updateMany` acknowledged the 7 unacked `AUDIT_CHAIN_BREAK` rows (the 8th had already been acked manually 2026-05-21); 0 unacked now. Deploy: ctmp-api rebuilt with `docker compose --project-name ctmp build api` + `up -d --force-recreate api`; boot log shows `[AuditService] Audit chain verified — 73 rows OK (id 1..73)`. Marker SQL: `database/migrations/008_audit_chain_rebake_2026-05-23.sql` is a documentation-only `RAISE NOTICE` no-op; pure-SQL rebake would have risked canonicalize byte-drift vs the JS implementation. Documentation: full decision in `docs/decisions/DECISION_LOG.md` entry of 2026-05-23, operational record in `agents/handoffs/HANDOVER.md` top entry of the same date, forward-looking guidance for callers in `agents/skills/PROJECT_SKILLS.md` ("Audit Payloads Must Use Primitives Only"). Follow-up housekeeping: delete `apps/api/scripts/verify-audit-row.{ts,js}` and the container/server copies once the chain-of-evidence in this entry is no longer needed.

- [x] Vendor portal light-theme conversion.
  - Completed 2026-05-26. Converted from dark navy "VENDOR•CONNECT" theme to light theme per user request ("this is way too dark"). Soft `#F8FAFC → #EFF6FF` body gradient, white glass cards (`bg-white/92` + `rgba(15,23,42,0.08)` border), slate-900 text, retained electric-blue `#00B4FF` accent for CTAs/links/focus rings. Files: `apps/web-vendor/src/app/globals.css` (full palette rewrite, color-scheme: light), `tailwind.config.ts` (7 legacy aliases flipped, added `bg-light-gradient`, electric box-shadow alphas toned), `app/layout.tsx` (removed `className="dark"`), 6 components (Input/PageHeader/Empty/StatusBadge/PortalShell/AuthShell — text-white/* → text-slate-900/*), 10 pages (all portal + auth pages), `register/page.tsx` hCaptcha theme="dark"→"light", `qa/playwright/tests/vendor-portal-redesign.spec.ts` (dropped html.dark assertion, renamed test titles). Verified live: `color-scheme: light` in deployed CSS, body gradient `linear-gradient(135deg, #F8FAFC, #EFF6FF)`, no traces of `#0A1428` navy gradient. Plan + decisions: `C:\Users\Administrator\.claude\plans\lets-discuss-point-number-resilient-pumpkin.md`. Decision: see DECISION_LOG.md 2026-05-26 entry.
- [x] E2E bug tracker created and 13 bugs shipped in 5 deploys (2026-05-26 session).
  - Living tracker at `docs/qa/BUG_TRACKER_2026-05-25.md`. 34 entries total (BUG-001..BUG-034 + BUG-NA-001), agreed approach locked into each entry through 1-by-1 user discussion. 13 Fixed today: BUG-001/002/003/013 (serializer sweep — one Prisma include + `serializeSummary` extension on tenders.service.ts), BUG-006/021/024 (cosmetic CSS bundle), BUG-007/022/027/029 (easy-wins bundle), BUG-033/034 (reports — `commercial_comparison` code fix + defensive `.toLowerCase()` + `tenderId` filter in ExportReportDto; BUG-034 turned out to be misdiagnosis — reports module was never broken). 21 Open with full Fix scope ready to execute. Re-test sheet at `docs/qa/RETEST_2026-05-26.md` (18 items, user testing in progress). Chrome-agent prompt pack at `docs/qa/END_TO_END_CHROME_AGENT_PROMPTS.md` (18 paste-ready prompts).
- [x] Vendor portal Chrome-agent automation prompt pack.
  - Completed 2026-05-26. `docs/qa/END_TO_END_CHROME_AGENT_PROMPTS.md` — 18 self-contained prompts converting `END_TO_END_MANUAL_TEST.md` into Claude-for-Chrome side-panel instructions. Each prompt restates URL, credentials, file paths. Hard-stops on agent limitations: hCaptcha (solve manually), file upload (OS picker), `commercial:view` permission gate.

## Phase 8+ Follow-ups (queued from Phase 7 session notes)

These items emerged during Phase 7 QA work but are out of scope for Phase 7 completion. Queue for Phase 8 or Phase 9 depending on priority.

- [x] **#7 (Medium)** — GET /tenders vendor-visibility filter. **FIXED 2026-05-19**
  - tenders.controller.ts: `findAll()` and `findOne()` now pass @CurrentUser() to service methods.
  - tenders.service.ts:
    - `findAll(query, user?)` applies AND filter for vendors: `visibility = PUBLIC` AND `status IN (PUBLISHED, CLARIFICATION_PERIOD)`.
    - `findOne(id, user?)` checks vendor access; throws 403 if tender not accessible.
  - Admin users see all tenders (no visibility filter applied).
  - Spec §3.1 visibility rules now enforced at API boundary.
  - TypeScript clean across all 3 apps.
  - Impact: Vendors now correctly restricted to PUBLIC tenders in PUBLISHED/CLARIFICATION_PERIOD states.
  
- [x] **#8 (Medium)** — AuthService.login LOCAL auth branch missing brute-force protection. **FIXED 2026-05-19**
  - Migration 006 adds `failed_login_count` + `locked_until` to users table (matching vendor_users pattern).
  - Prisma schema updated with new User model fields.
  - auth.service.ts `login()` now: checks lockedUntil for LOCAL auth, calls recordFailedLogin on failed password, resets counters on successful login.
  - New helper `recordFailedLogin()` mirrors vendor-auth pattern (configurable maxFailedLogins=5, lockoutMinutes=15).
  - 6 new unit tests cover LOCAL auth lockout scenarios; all 25 auth.service tests passing.
  - Impact: LOCAL admin users now subject to same brute-force rate limiting as vendor users.

- [x] **#9 (Low)** — Vendor registration form field mismatch. **FIXED 2026-05-19**
  - Chose option 1: extend API to accept + persist all registration fields.
  - VendorRegisterDto: added optional fields (registrationNumber, taxNumber, country, address, phone) with @IsOptional() and @ApiPropertyOptional().
  - vendor-auth.service.ts register(): now passes optional fields to Vendor.create().
  - web-vendor register page: form now sends all fields to API (or undefined if empty).
  - All fields persisted in Vendor record; vendor profile now complete at registration time.
  - TypeScript clean across all 3 apps.
  - Impact: Vendor data no longer silently dropped; complete profile on first registration.
  
- [x] **#10 (Done)** — vendor-auth.service.spec.ts 34/34 red. **FIXED 2026-05-19**: added `AuditService` mock provider. All 34 tests now pass in 11s.

- [x] **#11 (Low)** — Committee session creation fails on duplicate memberIds. **FIXED 2026-05-19**
  - committee.service.ts `createSession()` now deduplicates memberIds via Set before creating CommitteeMember records.
  - Impact: Test can safely add same user twice (deduplicated to single entry); Unique(sessionId, userId) constraint no longer violated.
  - CI run in progress to verify all 27 tests pass.

## Post-Completion / Post-Launch Items

Work explicitly deferred until after the project is complete. Tracked here so it isn't forgotten; do NOT pull into a pre-launch phase without an explicit re-prioritization decision.

- [ ] **Dedicated persistent storage** — replace shared dev-host Docker named volumes with dedicated storage that is resilient against accidental data loss.
  - **Date logged:** 2026-05-22.
  - **Why:** Today's storage uses `STORAGE_DRIVER=local` writing to two Docker named volumes (`ctmp_bid_storage` mounted at `/data/bid-documents`, `ctmp_report_storage` mounted at `/data/reports`). Host paths sit under `/mnt/repo/docker/volumes/...` on the shared dev server `10.1.13.98`. Any of `docker compose down -v`, `docker volume rm`, or accidental host-side `rm -rf` would wipe vendor-submitted bid documents and generated reports — which are legally/audit-sensitive artefacts in a procurement system.
  - **Scope (to define when picked up):**
    1. Pick the target storage layout: dedicated host disk + bind mount with restrictive perms, dedicated NFS / SAN mount, or migrate to a hardened on-prem MinIO with versioning + bucket replication (this is what `STORAGE_DRIVER=s3` was designed for — see [DECISION_LOG 2026-05-19](../../docs/decisions/DECISION_LOG.md) "Storage backend abstraction").
    2. Define the backup policy (frequency, retention, offsite copy or air-gap).
    3. Define the restore drill (timed test of full restore from cold backup, at least quarterly).
    4. Document the storage architecture end-to-end: data flow, mount layout, backup schedule, restore procedure, ownership, escalation. Probably lives in `docs/runbooks/storage.md` (new) plus a summary in `docs/architecture/`.
    5. Migration plan: how to move the two existing Docker volumes into the new layout without losing the already-uploaded files.
  - **Triggers to revisit earlier than "post-completion":** if pilot vendors start submitting bids the team cannot afford to lose, or if the dev server reaches any disk-pressure / multi-tenant event that risks the docker volumes.
  - **Not blocking:** Phase 9 sign-off, MVP launch, or production cutover decisions. This is post-launch hardening.
