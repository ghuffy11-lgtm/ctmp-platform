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

## Phase 3: Backend Scaffold

- [x] Initialize API app framework.
  - Completed 2026-05-17. NestJS v11 app scaffolded manually at `apps/api/`. pnpm workspace root configured with `pnpm-workspace.yaml`. All 842 packages installed. Key files: `apps/api/package.json`, `apps/api/tsconfig.json`, `apps/api/nest-cli.json`, `apps/api/src/main.ts`.
- [x] Add configuration module.
  - Completed 2026-05-17. Typed config factories for app, database, jwt, ad. Key files: `apps/api/src/config/`.
- [x] Add database connection/migration tooling.
  - Completed 2026-05-17. ORM: Prisma v6. Full schema generated from SQL migrations (33 models, 17+ enums). Prisma client generated. Key files: `apps/api/prisma/schema.prisma`, `apps/api/src/database/prisma.service.ts`, `apps/api/src/database/database.module.ts`.
- [x] Add auth module.
  - Completed 2026-05-17. JWT + AD strategy skeleton. Public/protected guards. Key files: `apps/api/src/modules/auth/`.
- [x] Add vendor-auth module with CAPTCHA and password reset.
  - Completed 2026-05-17. Vendor JWT strategy with separate secret. CAPTCHA, rate-limit, email-verify, MFA, password-reset stubs. Key files: `apps/api/src/modules/vendor-auth/`.
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

- [ ] Initialize admin frontend app.
- [ ] Add shell layout and navigation.
- [ ] Add dashboard.
- [ ] Add tender list/detail/create/edit.
- [ ] Add approval queue.
- [ ] Add clarification center.
- [ ] Add technical evaluation workspace.
- [ ] Add committee commercial opening screen.
- [ ] Add commercial comparison screen with permission-controlled visibility.
- [ ] Add vendor management.
- [ ] Add reports.
- [ ] Add audit log viewer.
- [ ] Add system configuration screens.

## Phase 5: Vendor Portal

- [ ] Initialize vendor frontend app.
- [ ] Add vendor login.
- [ ] Add vendor registration with CAPTCHA.
- [ ] Add email verification flow.
- [ ] Add forgot/reset password flow.
- [ ] Add vendor dashboard.
- [ ] Add public/invited tender list.
- [ ] Add tender detail.
- [ ] Add clarification center.
- [ ] Add bid submission wizard.
- [ ] Add technical envelope upload step.
- [ ] Add commercial envelope upload step.
- [ ] Add submission receipt screen.
- [ ] Add company profile and document repository.

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
- [ ] Create Playwright test plan.
- [ ] Test vendor registration CAPTCHA.
- [ ] Test vendor password reset.
- [ ] Test immutable bid submission.
- [ ] Test technical envelope opening after submission closure.
- [ ] Test commercial envelope remains sealed before committee opening.
- [ ] Test commercial visibility remains permission-controlled after opening.
- [ ] Test late submission exception flow.
- [ ] Test audit logging.
- [ ] Test report exports.

## Phase 8: Documentation And Handover

- [ ] Keep `agents/handoffs/HANDOVER.md` updated after each task.
- [ ] Keep `docs/decisions/DECISION_LOG.md` updated after decisions.
- [ ] Keep `agents/skills/PROJECT_SKILLS.md` updated with reusable patterns.
- [ ] Keep this task tracker updated.
