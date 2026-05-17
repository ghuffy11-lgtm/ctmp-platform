# Agent Prompt Library

Use these prompt files when starting a new agent.

Recommended starting point:

```text
00-master-kickoff-prompt.md
```

Role-specific prompts:

```text
01-database-agent-prompt.md
02-backend-agent-prompt.md
03-frontend-admin-agent-prompt.md
04-frontend-vendor-agent-prompt.md
05-devops-agent-prompt.md
06-qa-agent-prompt.md
07-security-compliance-agent-prompt.md
```

How to use:

1. Open the role-specific prompt.
2. Replace the task placeholder with the exact task.
3. Give the prompt to the agent.
4. Require the agent to update:
   - `agents/backlog/MASTER_TASK_TRACKER.md`
   - `agents/handoffs/HANDOVER.md`
   - `docs/decisions/DECISION_LOG.md` when needed
   - `agents/skills/PROJECT_SKILLS.md` when needed

