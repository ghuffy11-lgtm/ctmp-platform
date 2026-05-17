# Agent Working Guide

This file defines how coding agents should work in this repository.

## General Rules

- Read `START_HERE_FOR_AI_AGENTS.md` first.
- Read `AI_BUILD_INSTRUCTIONS.md` before starting a task.
- Read `docs/specs/implementation-spec.md` before implementation.
- Check `agents/backlog/MASTER_TASK_TRACKER.md` for current task status.
- Check `agents/handoffs/HANDOVER.md` for the latest project state.
- Check `docs/decisions/DECISION_LOG.md` for accepted decisions.
- Keep changes inside the area assigned to your task.
- Do not weaken sealed commercial-envelope controls.
- Do not give System Admin automatic commercial bid visibility.
- Do not add generic commercial file download endpoints.
- Audit every sensitive state change, view, download, export, permission change, and exception.
- Prefer explicit workflow actions over generic update endpoints for regulated steps.

## Ownership Areas

Backend agent:

- `apps/api/`
- `packages/shared-types/`
- Backend portions of `api-contracts/`

Frontend admin agent:

- `apps/web-admin/`
- Shared UI additions in `packages/ui/`

Frontend vendor agent:

- `apps/web-vendor/`
- Shared UI additions in `packages/ui/`

Database agent:

- `database/`
- Schema-related docs in `docs/architecture/`

DevOps agent:

- `infrastructure/`
- Deployment runbooks in `docs/runbooks/`

QA agent:

- `qa/`
- QA docs in `docs/qa/`

Security/compliance agent:

- `docs/security/`
- Security checks in backend/frontend/database tasks

## Required Guardrails

Commercial envelope:

- Technical envelope opens after `Submission Closed`.
- Commercial envelope opens only through committee commercial opening.
- After opening, commercial details still require explicit permissions.
- Every commercial view/download/export is audit logged.

Late submission:

- Blocked by default.
- Requires tender-specific and vendor-specific exception.
- Requires reason, expiry, approving/granting user, and audit trail.

Vendor registration:

- Requires CAPTCHA or approved bot-protection challenge.
- Requires server-side validation.
- Requires rate limiting.
- Requires email verification.

## Handoff Format

Each agent must update `agents/handoffs/HANDOVER.md` after completing or blocking a task.

Each handoff should include:

```text
Task:
Files changed:
Decisions made:
Open questions:
Tests run:
Risks:
Next recommended step:
```

## Completion Checklist

Before marking a task complete:

- Update `agents/backlog/MASTER_TASK_TRACKER.md`.
- Update `agents/handoffs/HANDOVER.md`.
- Add decisions to `docs/decisions/DECISION_LOG.md` when applicable.
- Add reusable CTMP patterns to `agents/skills/PROJECT_SKILLS.md` when applicable.
- Record tests or verification performed.
