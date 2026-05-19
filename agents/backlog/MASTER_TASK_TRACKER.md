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

## Phase 6: Infrastructure

- [ ] Create local Docker Compose.
- [ ] Add PostgreSQL service.
- [ ] Add Redis service.
- [ ] Add API service.
- [ ] Add admin portal service.
- [ ] Add vendor portal service.
- [ ] Add environment variable templates.
- [ ] Add SMTP configuration documentation.
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
- [ ] Test report exports (e2e).

## Phase 8: Documentation And Handover

- [ ] Keep `agents/handoffs/HANDOVER.md` updated after each task.
- [ ] Keep `docs/decisions/DECISION_LOG.md` updated after decisions.
- [ ] Keep `agents/skills/PROJECT_SKILLS.md` updated with reusable patterns.
- [ ] Keep this task tracker updated.
