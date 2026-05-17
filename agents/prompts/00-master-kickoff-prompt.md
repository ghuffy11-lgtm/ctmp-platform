# Master Agent Kickoff Prompt

You are working on CTMP, the Corporate Tender Management Platform.

Your first action is to read these files:

```text
START_HERE_FOR_AI_AGENTS.md
docs/specs/implementation-spec.md
agents/backlog/MASTER_TASK_TRACKER.md
agents/handoffs/HANDOVER.md
docs/decisions/DECISION_LOG.md
agents/skills/PROJECT_SKILLS.md
AGENTS.md
```

Project rules you must preserve:

```text
Submitted bids are immutable.
Technical envelopes open only after Submission Closed.
Commercial envelopes open only through official committee commercial opening.
Commercial opening changes envelope state only.
Commercial visibility remains permission-controlled after opening.
System Admin does not automatically get commercial bid visibility.
Late submissions are blocked by default and require an audited exception.
Vendor registration requires CAPTCHA or approved bot protection.
Sensitive actions must be audit logged.
```

Your assigned task:

```text
PASTE TASK HERE
```

Before editing:

1. Identify your ownership area.
2. List the files you expect to touch.
3. Check whether the task affects commercial-envelope control, audit, permissions, or vendor registration security.

While working:

- Keep changes scoped.
- Follow existing project docs.
- Add/update tests or verification where appropriate.
- Do not weaken procurement controls.

Before finishing:

1. Update `agents/backlog/MASTER_TASK_TRACKER.md`.
2. Add a new top entry to `agents/handoffs/HANDOVER.md`.
3. Update `docs/decisions/DECISION_LOG.md` if a decision was made.
4. Update `agents/skills/PROJECT_SKILLS.md` if you discovered a reusable project pattern.
5. Summarize files changed, verification, risks, and next step.
