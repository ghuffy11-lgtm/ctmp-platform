# AI Build Instructions

These instructions are for every AI agent or developer working on CTMP.

## Start Here Every Time

Before changing files, read in this order:

1. `START_HERE_FOR_AI_AGENTS.md`
2. `docs/specs/implementation-spec.md`
3. `agents/backlog/MASTER_TASK_TRACKER.md`
4. `agents/handoffs/HANDOVER.md`
5. `docs/decisions/DECISION_LOG.md`
6. `AGENTS.md`

Then read the README in the specific folder you are assigned to work in.

## Non-Negotiable Business Rules

- Submitted bids are immutable.
- Technical envelopes open only after `Submission Closed`.
- Commercial envelopes open only through official committee commercial opening.
- Commercial opening changes envelope state only.
- Commercial details remain visible only to users with explicit commercial permissions.
- System Admin does not automatically get commercial bid visibility.
- Late submissions are blocked by default and require an audited exception.
- Vendor registration requires CAPTCHA or approved bot protection.
- Sensitive actions must be audit logged.

## Required Work Cycle

For every task:

1. Read the relevant spec and tracker entry.
2. Confirm the intended files and ownership area.
3. Make the smallest complete change.
4. Add or update tests/checks where appropriate.
5. Update `agents/backlog/MASTER_TASK_TRACKER.md`.
6. Update `agents/handoffs/HANDOVER.md`.
7. Add decisions to `docs/decisions/DECISION_LOG.md` if any architecture or business choice was made.
8. Add reusable lessons to `agents/skills/PROJECT_SKILLS.md` if the pattern will help future agents.

## Completion Rule

A task is not complete until:

- Code/docs are changed.
- Verification is recorded.
- The task tracker checkbox is updated.
- The continuous handover is updated.
- Any new decision or reusable skill is documented.

## Handover Discipline

`agents/handoffs/HANDOVER.md` is the running memory of the project.

Every agent must add a new entry at the top with:

```text
Date/time:
Agent/task:
Files changed:
What changed:
Why:
Verification:
Open questions:
Next recommended step:
```

Do not delete older handover entries unless the project owner explicitly asks.

## Task Tracker Discipline

Use checkboxes in `agents/backlog/MASTER_TASK_TRACKER.md`:

```text
- [ ] Not started
- [~] In progress
- [x] Completed
- [!] Blocked
```

When completing a task, add a short note with date and key files changed.

## Project Skills Discipline

Use `agents/skills/PROJECT_SKILLS.md` to capture reusable project-specific patterns.

Examples:

- How commercial envelope access must be checked.
- How audit events should be named.
- How vendor self-registration should validate CAPTCHA.
- How late submission exception logic should work.

Keep project skills concise. Do not duplicate the full spec.

## Documentation Update Triggers

Update documentation when:

- A workflow changes.
- A permission changes.
- A database table or status enum changes.
- An API endpoint is added, removed, or renamed.
- A security rule is clarified.
- A task is completed or blocked.
- A reusable implementation pattern is discovered.
