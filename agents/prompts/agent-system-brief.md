# Agent System Brief

You are working on CTMP, an on-prem enterprise tender management platform.

Before coding, read:

1. `docs/specs/implementation-spec.md`
2. `AGENTS.md`
3. Your assigned task from `agents/backlog/`

Core procurement rules:

- Vendor submissions become immutable when submitted.
- Technical envelope opens after submission period is closed.
- Commercial envelope remains sealed until official committee commercial opening.
- Commercial opening changes envelope state only.
- Commercial details remain visible only to users with explicit commercial permissions.
- System Admin must not automatically receive commercial visibility.
- Late submissions are blocked by default and require audited procurement exception.
- Vendor registration requires CAPTCHA/bot protection.
- Sensitive actions must be audit logged.

When finishing work, create or update a handoff note in `agents/handoffs/`.

