# Start Here For AI Agents

**Read `CLAUDE.md` in the repository root first** — it is the traffic controller for every AI
session and carries the mandatory initialization, maintenance and boundary directives.

## Current project context (consolidated 2026-08-21)

Read these four before anything else — they are reconciled against the running system:

- `docs/PROJECT_STATE.md` — what is built, what is in flight, what is queued.
- `docs/ARCHITECTURE.md` — stack and topology. CTMP is **web-only**; there is no mobile app.
- `docs/DATABASE_SCHEMA.md` — schema introspected from the live database.
- `docs/AI_DECISION_LOG.md` — decisions, refactors, and the do-not-touch list.

Older status files were archived to `docs/archive/2026-08-21-consolidation/`.

This is the first file every AI agent must read before working on CTMP.

If you read only one instruction file first, read this one.

## 1. What This Project Is

CTMP is an on-prem Corporate Tender Management Platform for procurement teams and vendors.

The system manages tender creation, approvals, vendor registration, technical and commercial bid envelopes, technical evaluation, committee commercial opening, commercial comparison, award recommendation, audit, reports, and notifications.

## 2. Read These Files In Order

Do not start editing until you have read these:

```text
START_HERE_FOR_AI_AGENTS.md
agents/prompts/CODEX_PM_SELF_INSTRUCTIONS.md   (required when acting as Codex PM)
docs/specs/implementation-spec.md
agents/backlog/MASTER_TASK_TRACKER.md
agents/handoffs/HANDOVER.md
docs/decisions/DECISION_LOG.md
AGENTS.md
```

Then read the role prompt for your task from:

```text
agents/prompts/
```

Use `agents/prompts/00-master-kickoff-prompt.md` if no role-specific prompt is provided.

## 3. Source Of Truth

Primary business and technical source of truth:

```text
docs/specs/implementation-spec.md
```

Current task status:

```text
agents/backlog/MASTER_TASK_TRACKER.md
```

Latest project state:

```text
agents/handoffs/HANDOVER.md
```

Accepted decisions:

```text
docs/decisions/DECISION_LOG.md
```

Reusable CTMP-specific patterns:

```text
agents/skills/PROJECT_SKILLS.md
```

## 4. Rules You Must Not Break

```text
Submitted bids are immutable.
Technical envelopes open only after Submission Closed.
Commercial envelopes open only through official committee commercial opening.
Commercial opening changes envelope state only.
Commercial details remain permission-controlled after opening.
System Admin does not automatically get commercial bid visibility.
Late submissions are blocked by default and require an audited exception.
Vendor registration requires CAPTCHA or approved bot protection.
Sensitive actions must be audit logged.
```

## 5. Folder Ownership

```text
apps/api/              Backend API
apps/web-admin/        Internal procurement/admin portal
apps/web-vendor/       Vendor portal
packages/ui/           Shared UI components
packages/shared-types/ Shared TypeScript types
packages/utils/        Shared utilities
database/              PostgreSQL migrations, seeds, schema docs
api-contracts/         OpenAPI and shared API schemas
infrastructure/        Docker, deployment, scripts
docs/                  Specs, decisions, architecture, security, QA, runbooks
qa/                    Manual, API, and Playwright tests
agents/                Prompts, tracker, handover, skills, templates
```

Stay inside your assigned ownership area unless the task clearly requires a cross-cutting change.

## 6. Required Work Cycle

For every task:

1. Read the source-of-truth files listed above.
2. Identify your role prompt and ownership area.
3. Check task status in `MASTER_TASK_TRACKER.md`.
4. Check latest handover notes in `HANDOVER.md`.
5. Make the smallest complete change.
6. Verify your work.
7. Update the task tracker.
8. Add a new entry at the top of the handover file.
9. Update the decision log if a decision was made.
10. Update project skills if you learned a reusable project pattern.

## 7. Completion Checklist

Before you say a task is complete, confirm:

```text
[ ] Code/docs changed as required.
[ ] Verification performed or limitation documented.
[ ] MASTER_TASK_TRACKER.md updated.
[ ] HANDOVER.md updated.
[ ] DECISION_LOG.md updated if needed.
[ ] PROJECT_SKILLS.md updated if needed.
[ ] Next recommended step written in handover.
```

## 8. Current Recommended Next Task

Begin Phase 3 Backend Scaffold:

```text
agents/prompts/02-backend-agent-prompt.md
api-contracts/openapi/ctmp.openapi.yaml
```

For Codex PM session recovery, read:

```text
agents/prompts/CODEX_PM_SELF_INSTRUCTIONS.md
```
