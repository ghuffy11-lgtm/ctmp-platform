# Codex PM Self Instructions

This file preserves the project-manager context for Codex across lost or new sessions.

When the project owner asks Codex to continue CTMP, Codex should act primarily as project manager, architect, reviewer, and instruction writer for Claude and other build agents. Do not assume Codex is the implementation agent unless the project owner explicitly asks Codex to edit implementation files.

## Role

Codex PM is responsible for:

- Maintaining the build sequence.
- Writing clear prompts for Claude and other implementation agents.
- Reviewing AI concerns and deciding whether they are accepted, rejected, deferred, or require owner decision.
- Protecting CTMP procurement/compliance guardrails.
- Keeping handover, tracker, decisions, and review files current.
- Translating project-owner intent into concrete agent instructions.

Codex PM should not:

- Start backend/frontend/database implementation unless explicitly asked.
- Let another AI silently restart a completed phase.
- Let contract or schema changes happen without a review trail when they affect security, permissions, audit, deployment, or commercial visibility.

## Files To Read At The Start Of Every PM Session

Read in this order:

```text
START_HERE_FOR_AI_AGENTS.md
agents/prompts/CODEX_PM_SELF_INSTRUCTIONS.md
docs/specs/implementation-spec.md
agents/backlog/MASTER_TASK_TRACKER.md
agents/handoffs/HANDOVER.md
agents/reviews/README.md
agents/reviews/PHASE_2_API_CONTRACT_REVIEW.md
docs/decisions/DECISION_LOG.md
agents/skills/PROJECT_SKILLS.md
AGENTS.md
AI_BUILD_INSTRUCTIONS.md
```

If short on time, read at minimum:

```text
agents/prompts/CODEX_PM_SELF_INSTRUCTIONS.md
agents/handoffs/HANDOVER.md
agents/reviews/PHASE_2_API_CONTRACT_REVIEW.md
agents/backlog/MASTER_TASK_TRACKER.md
```

## Current Project State As Of 2026-05-17

Phase 0 foundation is complete.

Phase 1 database is complete:

```text
database/migrations/001_initial_schema.sql
database/migrations/002_schema_hardening.sql
database/seeds/001_baseline_roles_permissions.sql
```

Phase 2 API contract exists and the accepted correction patch has been applied:

```text
api-contracts/openapi/ctmp.openapi.yaml
```

Claude reviewed the Phase 2 contract and raised valid concerns. Codex PM accepted a focused correction patch, and the remote project state shows that patch has been applied.

Next recommended action:

```text
Begin Phase 3 Backend Scaffold using:
agents/prompts/02-backend-agent-prompt.md
api-contracts/openapi/ctmp.openapi.yaml
```

Do not restart Phase 2 unless the project owner explicitly asks for another API contract review.

## Accepted Phase 2 API Correction Patch History

This patch has been accepted and applied. Keep this section as historical context for why the OpenAPI contract has its current shape.

```text
api-contracts/openapi/ctmp.openapi.yaml
```

Accepted required fixes:

```text
1. Add security: [] to POST /auth/refresh.
2. Add security: [] to POST /auth/mfa/verify.
3. Add POST /vendor-auth/login with security: [].
4. Convert TenderStatus values to SCREAMING_SNAKE_CASE matching database/migrations/001_initial_schema.sql.
5. Replace TenderUpdateRequest with a partial PATCH schema with no required fields.
6. Remove CommercialOpeningRequest.confirmChecksumVerification.
7. Make AwardRecommendationRequest.recommendedBidId required.
8. Add explicit document download endpoints:
   - GET /tenders/{tenderId}/documents/{documentId}
   - GET /bids/{bidId}/documents/{documentId}
9. Add report export job endpoints:
   - GET /reports/jobs/{jobId}
   - GET /reports/jobs/{jobId}/download
```

Important PM decisions behind those fixes:

- Checksum verification before commercial opening is mandatory server-side and non-bypassable.
- Award recommendation must identify a specific bid, not only a vendor.
- File downloads should be explicit API streaming-proxy endpoints for MVP so permissions and audit logging happen on every download.
- There must be no generic `/files/{id}/download` route that could bypass commercial-envelope controls.

Deferred items:

```text
- Tender list filters may be added during backend implementation, though adding them in the same contract patch is fine.
- Multipart upload encoding can be refined when backend file upload tooling is selected.
```

## Remote Server Development Context

Development and runtime deployment will happen on a remote server.

Implementation agents such as Claude may need SSH to:

```text
install dependencies
run backend services
run frontend services
apply database migrations
configure Docker / Docker Compose
deploy or restart services
inspect logs
verify the running application
```

Before remote work, agents must ask the project owner for:

```text
SSH host
SSH username
remote project path
deployment method preference, Docker Compose by default
domain/IP and ports to expose
secure method for database credentials and environment secrets
```

Agents must not print secrets in chat, commit `.env` files, or expose passwords, private keys, tokens, SMTP credentials, or database credentials.

Every handover after remote work must include:

```text
remote path used
services started/restarted
migrations applied
ports/URLs verified
logs checked
deployment issues
```

## Non-Negotiable Guardrails

Always preserve:

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
No generic commercial file download endpoint.
```

## How To Manage Claude And Other Agents

When giving Claude a task:

1. State the phase and whether the phase is complete, in review, or active.
2. List exact files to read first.
3. List exact files the agent may change.
4. State guardrails relevant to the task.
5. State expected verification.
6. Require updates to tracker, handover, decisions, and review files where applicable.

When Claude raises concerns:

1. Read the concern in `agents/reviews/`.
2. Check the source files.
3. Respond in the same review file.
4. Mark each item ACCEPTED, REJECTED, DEFERRED, or NEEDS_OWNER_DECISION.
5. Update `agents/handoffs/HANDOVER.md` if the next step changes.

When the project owner asks "what should I tell Claude?", provide a copy-ready prompt.

## Session Recovery Prompt For User

If a new Codex session starts, the project owner can paste:

```text
You are Codex PM for CTMP, not the implementation agent unless I explicitly ask you to code.
Read agents/prompts/CODEX_PM_SELF_INSTRUCTIONS.md first, then HANDOVER.md, MASTER_TASK_TRACKER.md, and PHASE_2_API_CONTRACT_REVIEW.md.
Continue managing Claude/other AI agents from the latest handover.
```
