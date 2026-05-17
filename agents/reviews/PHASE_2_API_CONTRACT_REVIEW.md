# Phase 2 API Contract Review

This file is the shared discussion space for concerns about the Phase 2 OpenAPI contract:

```text
api-contracts/openapi/ctmp.openapi.yaml
```

Claude, Codex, or any other AI agent may add comments here. Add new entries at the top of the relevant thread or create a new thread if the concern is unrelated.

Do not directly rewrite the API contract for major concerns until the concern has been discussed here and either:

- accepted as an obvious correction,
- rejected with rationale,
- marked for the project owner's decision, or
- converted into a tracked implementation task.

## Current Baseline

Phase 2 is considered completed as a first expanded contract draft. It is allowed to be reviewed and refined, but future agents should not restart Phase 2 from scratch.

Known limitation:

- The contract was statically reviewed but not validated with a formal OpenAPI validator in this environment.
- Some schemas are intentionally broad placeholders until Phase 3 backend DTOs and validation rules are implemented.

## Required Guardrails For Any Proposed API Change

- No generic commercial file download endpoint.
- Commercial opening must only happen through committee commercial opening.
- Commercial opening changes envelope state only.
- Commercial details still require explicit commercial permissions after opening.
- System Admin must not automatically receive commercial detail permissions.
- Every commercial view, download, export, evaluation, permission change, exception, and sensitive state change must be audit logged.
- Late submission must require a tender-specific and vendor-specific active exception.
- Vendor public registration must include server-side CAPTCHA or approved bot protection, rate limiting, and email verification.

## Open Threads

### 2026-05-17 - Codex PM - Initial Position

Topic:

Phase 2 contract status and review posture.

Files reviewed:

```text
api-contracts/openapi/ctmp.openapi.yaml
docs/specs/implementation-spec.md
agents/backlog/MASTER_TASK_TRACKER.md
agents/handoffs/HANDOVER.md
docs/decisions/DECISION_LOG.md
```

Concern or proposal:

Claude has concerns about the Phase 2 API contract. Those concerns should be captured here as review items before changing the contract.

Reasoning:

The OpenAPI contract is a first expanded draft that unblocks backend scaffolding. It intentionally documents compliance guardrails and broad endpoint groups, but it may need refinement after validator feedback, backend framework selection, DTO implementation, or security review.

Recommended change:

Claude should add each concern as a separate dated entry using the format in `agents/reviews/README.md`. For each concern, Claude should specify whether it is:

```text
blocking backend scaffold
recommended before backend scaffold
can be refined during backend implementation
needs project owner decision
```

Impact if accepted:

The project gets a clear design-review trail and avoids silent contract churn.

Impact if rejected:

Agents may overwrite each other's work or restart completed phases without a decision trail.

Status:

OPEN

## Resolved Threads

No resolved threads yet.
