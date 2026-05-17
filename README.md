# CTMP Platform

This folder is the build workspace for the Corporate Tender Management Platform (CTMP).

The original project documents remain in the parent directory. This workspace is organized so implementation agents can work in focused areas with clear ownership.

## Structure

```text
apps/
  api/                 NestJS backend application
  web-admin/           Internal procurement/admin portal
  web-vendor/          External vendor portal

packages/
  ui/                  Shared UI components
  shared-types/        Shared TypeScript types and API models
  utils/               Shared utilities

database/
  migrations/          PostgreSQL migrations
  seeds/               Development/reference seed data
  docs/                ERD and database notes

api-contracts/
  openapi/             OpenAPI specifications
  schemas/             Shared request/response schemas

infrastructure/
  docker/              Docker Compose and Dockerfiles
  k8s/                 Future Kubernetes manifests
  terraform/           Future infrastructure definitions
  scripts/             Deployment and maintenance scripts

docs/
  specs/               Build-ready specifications
  architecture/        Architecture decisions and diagrams
  security/            Security and compliance notes
  qa/                  QA strategy and test plans
  runbooks/            Operational runbooks
  source-documents/    References to original document packs

design/
  wireframes/          Screen workflows and wireframe notes
  design-system/       UI tokens, components, and UX rules

qa/
  manual-test-cases/   Manual UAT and regression cases
  playwright/          End-to-end browser tests
  api-tests/           API/integration tests

agents/
  backlog/             Agent-ready task breakdowns
  prompts/             Reusable prompts/instructions for agents
  handoffs/            Agent handoff notes and decisions
  work-areas/          Ownership notes by agent type
```

## Source Of Truth

Start here first:

1. `START_HERE_FOR_AI_AGENTS.md`

Then continue with:

1. `docs/specs/implementation-spec.md`
2. `agents/backlog/MASTER_TASK_TRACKER.md`
3. `agents/handoffs/HANDOVER.md`
4. `agents/backlog/00-build-sequence.md`

Project memory:

- `docs/PROJECT_DOCUMENTATION_MAP.md`
- `docs/decisions/DECISION_LOG.md`
- `agents/skills/PROJECT_SKILLS.md`

Key project rules:

- Commercial envelope state and commercial visibility are separate concerns.
- Commercial details remain permission-controlled even after committee opening.
- Submitted bids and documents are immutable.
- Late submissions require authorized, audited exceptions.
- Vendor registration must include bot protection.
- All sensitive actions must be audit logged.
