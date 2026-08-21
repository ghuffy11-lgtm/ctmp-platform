# Archive — 2026-08-21 documentation consolidation

Nothing here was deleted; every file was **moved**, and each original location carries a pointer to
its replacement. Restore any of it with a plain `mv` if a decision here turns out to be wrong.

## Why these were archived

| File | Reason |
|---|---|
| `STATUS.2026-08-13.md` | Superseded by `docs/PROJECT_STATE.md`. Some of it was already stale — it stated dev and production were in step, which ceased to be true when migration `054` landed on dev. |
| `CTMP_Implementation_Spec.root-copy.md` | Byte-identical duplicate (md5 `3116369b…`) of the canonical spec. |
| `CTMP_Implementation_Spec.specs-copy.md` | The same duplicate again — the spec existed in **three** identical copies. `docs/specs/implementation-spec.md` is canonical; it is the path the agent prompts and `AGENTS.md` reference. |
| `docker-config-backups/` | Six `.env.bak*` files and one `docker-compose.yml.bak.*`, all from May 2026, superseded by the live `.env` (June 2026). |
| `PLAN-2026-05-19-ci-security-alerts-audit-tests.COMPLETED.md` | An implementation plan carrying **20 unchecked `- [ ]` boxes** for work that shipped in May 2026 — the CI workflow (`.github/workflows/e2e.yml`), the `/security-alerts` admin page and `audit.service.spec.ts` all exist. A future session would have read those boxes as pending work. Archived in the second audit pass, 2026-08-21. Its parent directory `docs/superpowers/plans/` was left empty and removed. |

## Security note on `docker-config-backups/`

Those `.env.bak*` files contain **real credentials** from May 2026. They were sitting in
`infrastructure/docker/` and were **not** matched by `.gitignore` — the existing `*.env` pattern
matches files *ending* in `.env`, not `.env.bak`. Had this checkout been pushed, they would have
gone with it.

`.gitignore` was updated on 2026-08-21 to cover `.env.bak*`, `*.bak`, `*.bak.*` and this archive
directory.

**Recommended follow-up (owner's call, not done):** any secret in those files that is still live
should be rotated. The obvious candidates are the database password, `JWT_SECRET` and
`SETTINGS_ENCRYPTION_KEY`. Note `SETTINGS_ENCRYPTION_KEY` was already rotated off its in-source
fallback on 2026-06-27, so that one may already be clear.

## Second pass — 2026-08-21 (end of day)

The audit was re-run after the production deploy. Findings:

- No new stray `*.bak` / `*.orig` / scratch files anywhere in the tree.
- `STATUS.md` is still a pointer stub; the four consolidated docs are current.
- One stale plan found and archived (above).
- One code-level trap recorded rather than archived: `VendorDirectory` accepts an `interactive`
  prop it never reads. Nothing leaks today, but it is the same defect that made Arabic KPI tiles
  navigate to English for eight days. See `docs/PROJECT_STATE.md` → Known gaps.

## What was deliberately NOT archived

- **`agents/handoffs/HANDOVER.md`** (250 KB, 67 entries). It is large, but it is chronological,
  newest-first, and internally consistent — not fragmented. More importantly, this checkout has no
  `.git` directory, so the handover log **is** the project's change history. It stays whole.
- **`agents/backlog/MASTER_TASK_TRACKER.md`** — still the per-phase task list, referenced by
  `AGENTS.md`.
- **`docs/decisions/DECISION_LOG.md`** — still the authority for decision records.
  `docs/AI_DECISION_LOG.md` summarises and indexes it; it does not replace it.
- `START_HERE_FOR_AI_AGENTS.md`, `AI_BUILD_INSTRUCTIONS.md`, `AGENTS.md` — all actively referenced.
