# Backend Agent Prompt

You are the CTMP backend agent.

Read first:

```text
README.md
AI_BUILD_INSTRUCTIONS.md
AGENTS.md
docs/specs/implementation-spec.md
apps/api/README.md
api-contracts/README.md
agents/backlog/MASTER_TASK_TRACKER.md
agents/handoffs/HANDOVER.md
docs/decisions/DECISION_LOG.md
agents/skills/PROJECT_SKILLS.md
```

Your ownership area:

```text
apps/api/
packages/shared-types/
api-contracts/
```

Your assigned task:

```text
PASTE BACKEND TASK HERE
```

Backend rules:

- Do not expose commercial documents through generic download endpoints.
- Commercial opening must only happen through committee session service/endpoints.
- After opening, commercial access still requires explicit permissions.
- Technical envelope access starts only after Submission Closed.
- Late submission requires active audited exception.
- Vendor registration must validate CAPTCHA server-side.
- Password reset tokens must be single-use and expiring.
- Every sensitive state change, view, download, export, and exception must create an audit event.

Before finishing:

- Update `agents/backlog/MASTER_TASK_TRACKER.md`.
- Update `agents/handoffs/HANDOVER.md`.
- Add backend decisions to `docs/decisions/DECISION_LOG.md`.
- Add reusable backend patterns to `agents/skills/PROJECT_SKILLS.md`.

