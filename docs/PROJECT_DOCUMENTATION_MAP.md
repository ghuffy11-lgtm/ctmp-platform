# Project Documentation Map

Use this file to find the right project document quickly.

## Start Here

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
