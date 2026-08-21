# Project Documentation Map

Use this file to find the right project document quickly.

## Read these first (consolidated 2026-08-21)

Four files hold the current, reconciled picture of the project. Prefer them over anything older:

- `docs/PROJECT_STATE.md`: completed features, active tasks, pending backlog, deployment state.
- `docs/ARCHITECTURE.md`: tech stack, two-server topology, directory mappings. **Note: CTMP is
  web-only — there is no iOS or Android codebase.**
- `docs/DATABASE_SCHEMA.md`: all 59 tables, columns, types, foreign keys, generated from the live
  database; includes the dev/production drift.
- `docs/AI_DECISION_LOG.md`: technical decisions, refactoring history, and the do-not-touch list.

Superseded material is in `docs/archive/2026-08-21-consolidation/` with a README explaining each
move. `STATUS.md` at the repository root is now a pointer stub.

**Current build state (2026-08-21, end of day):** dev and production are fully in step — identical
571-column schemas through migration `055`, images built from the same source, nothing queued behind
a sign-off.

## Start Here

- `CLAUDE.md`: Traffic controller — mandatory reading order, maintenance rule, boundaries.
- `START_HERE_FOR_AI_AGENTS.md`: Single entry point for all AI agents.
- `README.md`: Project structure and source-of-truth pointers.
- `AI_BUILD_INSTRUCTIONS.md`: Required workflow for AI agents.
- `AGENTS.md`: Agent ownership and guardrails.
- `docs/specs/implementation-spec.md`: Main implementation specification.

## Project Memory

- `agents/handoffs/HANDOVER.md`: Continuous handover and current project state.
- `agents/backlog/MASTER_TASK_TRACKER.md`: Task completion tracker.
- `docs/decisions/DECISION_LOG.md`: Business and architecture decisions.
- `agents/skills/PROJECT_SKILLS.md`: Reusable CTMP-specific implementation patterns.

## Planning

- `agents/backlog/00-build-sequence.md`: High-level build order.
- `agents/prompts/README.md`: Prompt library for starting role-specific agents.
- `agents/prompts/00-master-kickoff-prompt.md`: General startup prompt for any agent.
- `agents/templates/TASK_TEMPLATE.md`: Template for new tasks.
- `agents/templates/HANDOVER_ENTRY_TEMPLATE.md`: Template for handover updates.

## Architecture And Delivery

- `docs/architecture/`: Module boundaries, ERD, workflows, permissions.
- `docs/security/`: Security and compliance notes.
- `docs/qa/`: QA plans and UAT scenarios.
- `docs/runbooks/`: Deployment, backup, and operations runbooks.

## Build Areas

- `apps/api/`: Backend.
- `apps/web-admin/`: Internal portal.
- `apps/web-vendor/`: Vendor portal.
- `packages/`: Shared code.
- `database/`: PostgreSQL schema, migrations, seeds.
- `api-contracts/`: OpenAPI and schema contracts.
- `infrastructure/`: Docker, future Kubernetes, scripts.
- `qa/`: Test suites.

## Production operations (2026-06)
- `docs/runbooks/PRODUCTION_OPERATIONS.md` — topology, air-gap deploy, integrations, troubleshooting.
- `docs/runbooks/admin-prod-deploy.md` — admin server deploy runbook.
- `agents/handoffs/HANDOVER.md` — chronological change log (deploy, email, AD, key rotation, data sync).
- Skills (`~/.claude/skills/`): `ctmp-deploy`, `ctmp-email`, `ctmp-config`, `ctmp-troubleshoot`.
