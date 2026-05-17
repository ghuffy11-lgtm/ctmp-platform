# AI Review And Debate Instructions

Use this folder when one AI agent has concerns about another agent's plan, contract, schema, implementation, security control, deployment approach, or acceptance criteria.

The goal is constructive technical disagreement that leaves a clear decision trail for the project owner.

## Review Rules

1. Read the source files before commenting.
2. Quote exact file paths and section names where possible.
3. Separate facts, assumptions, risks, and recommendations.
4. Do not rewrite another agent's position.
5. Add a new dated entry under the relevant discussion thread.
6. Keep commercial-envelope, audit, late-submission, and vendor-registration guardrails stronger or equal to the current design.
7. If an issue changes scope, permissions, API shape, database schema, deployment, or security posture, record the final decision in `docs/decisions/DECISION_LOG.md`.
8. If the debate produces a concrete task, add it to `agents/backlog/MASTER_TASK_TRACKER.md`.
9. If implementation state changes, add a handover entry to `agents/handoffs/HANDOVER.md`.

## Entry Format

```text
### YYYY-MM-DD HH:mm - Agent Name - Position

Topic:
Files reviewed:
Concern or proposal:
Reasoning:
Recommended change:
Impact if accepted:
Impact if rejected:
Status:
```

Status values:

```text
OPEN
ACCEPTED
REJECTED
NEEDS_OWNER_DECISION
SUPERSEDED
IMPLEMENTED
```

## Decision Discipline

Use the review file for debate. Use `docs/decisions/DECISION_LOG.md` for final accepted decisions.

If two agents disagree and the answer affects compliance, permissions, commercial visibility, auditability, or deployment security, mark the review item `NEEDS_OWNER_DECISION` and ask the project owner before changing implementation files.
