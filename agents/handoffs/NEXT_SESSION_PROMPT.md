# Next Session Prompt — Read This First

**Created:** 2026-05-27
**Status:** Active — read at the start of every new Claude session working on CTMP

This file is your **session-start prompt**. Read it before doing anything else. It tells you (a future Claude session) exactly where the project is, what's locked, what's pending, and what to do next.

---

## Step 1 — Read these files, in this order, before any work

```text
1. agents/handoffs/NEXT_SESSION_PROMPT.md   ← you are here
2. agents/handoffs/HANDOVER.md               ← latest session record (TOP entry is the most recent)
3. docs/qa/BUG_TRACKER_2026-05-25.md         ← bugs (Open + In Progress + Fixed)
4. docs/qa/RETEST_2026-05-26.md              ← failed retest items
5. docs/specs/IN_APP_COMPARISON_MASTER_PLAN_2026-05-27.md   ← LOCKED master plan
6. docs/specs/IN_APP_COMPARISON_FLOWCHART_2026-05-27.md     ← LOCKED flowchart
7. docs/qa/IN_APP_COMPARISON_TRACKER_2026-05-27.md          ← implementation tracker
8. docs/specs/DEPLOYMENT_GAPS_2026-05-27.md                 ← gap analysis for deploying the new features
9. docs/decisions/DECISION_LOG.md            ← decisions, newest at top
10. CLAUDE.md                                ← project-wide guardrails
```

Steps 5–8 are the **new in-app comparison redesign documents** from the 2026-05-27 design session. Treat them as authoritative.

---

## Step 2 — Know the four bodies of work

The project has four distinct workstreams, in this priority order:

### Priority 1 — 5 failed retest items (from 2026-05-26 retest)

These are regressions on fixes that already shipped. Some auto-resolve when later phases land. See `docs/qa/RETEST_2026-05-26.md` for full details.

| ID | Bug | What broke |
|---|---|---|
| A2 | BUG-002 | Category still empty in serializer response |
| A3 | BUG-003 | Procurement Type still empty in serializer response |
| A4 | BUG-006 | Days Left widget has right styling but count is empty |
| D1 | BUG-021 | Save Evaluation button still cramped — owner wants Save on its own row below Pass/Fail |
| D2 | BUG-022 | View Full Proposal → 401 Unauthorized (auto-resolved by BUG-037 Phase A) |
| F4 | BUG-033 | Commercial comparison export bundles ALL tenders into one file (should be scoped to current tender) |

### Priority 2 — 21 still-Open bugs

In `docs/qa/BUG_TRACKER_2026-05-25.md` Open table. Every one has a **locked agreed approach** already negotiated with the project owner — do NOT re-decide; execute. Pre-decided bundles for efficient deploys:

| Bundle | Bugs | Outcome |
|---|---|---|
| Tender form completeness | 008+009+010+011 | Prisma field rename + DTO + create/edit forms |
| Commercial docs surface | 023+025 | Shared `<CommercialDocumentsList>` on 2 pages |
| Tender doc upload pipeline | 004+012+014 | Endpoints + storage service + UI |
| Invitation workflow | 015+016 | Visibility selector + invited-vendors panel + notifications |
| Clarification overhaul | 017+018+019+031 | Attachments + Print/Export + Timeline + visibility model rewrite |
| Standalone | 005, 020, 026, 028, 030, 032 | Individual fixes |

**Critical: BUG-028 (RBAC sidebar gating + dept-scoped data filtering).** Biggest remaining single change; fully scoped; touches sidebar + 6 list endpoints.

### Priority 3 — In-app comparison redesign (BUG-035 to BUG-045)

11 new feature entries created on 2026-05-27. Master plan is **LOCKED** — do not re-design. Implementation phase order (per `IN_APP_COMPARISON_TRACKER_2026-05-27.md`):

| Phase | Bugs | Why this order |
|---|---|---|
| A | BUG-037 | Shared PDF viewer — lands first, closes retest D2, required by B+C |
| B | BUG-036 | Technical Comparison page — read-only, lower risk |
| C | BUG-035 | Commercial Comparison page redesign — biggest piece |
| D | BUG-039 + BUG-040 + BUG-041 | Award flow + Quorum + Amendment |
| E | BUG-038 + BUG-042 | Award Minutes PDF + Optional notifications |
| F | BUG-043 + BUG-044 | Criteria library + per-tender editor |
| G | BUG-045 | Cleanup: remove XLSX export from Reports |

### Priority 4 — Anything new the user raises

If the user introduces a new bug or feature mid-session, capture it as the next `BUG-NNN` in the bug tracker before working on it. Do not skip the tracking step.

---

## Step 3 — Things you MUST NOT change without explicit owner approval

These are locked decisions. Silently changing any of them is forbidden. If a need arises, **stop, ask the owner, and append a dated amendment block** to `IN_APP_COMPARISON_MASTER_PLAN_2026-05-27.md`.

### From the 2026-05-27 master plan

- PDF-only viewer; no Office docs, no images in v1
- Modal overlay viewer pattern (not inline-embedded, not split-pane, not new-tab)
- Single-winner only (no split awards)
- Gate-only PASS/FAIL (total weighted score is for ranking only)
- Vendor notifications default OFF (opt-in toggles at Confirm time)
- BUG-033 XLSX export stays working until BUG-035 ships and is verified
- Awards are never deleted — amendments add a new row that supersedes via `superseded_by_award_id`
- System Admin does NOT receive commercial visibility by default
- Audit logging on document view is mandatory and writes BEFORE the PDF is streamed (no failing-open)

### From the spec (already in CLAUDE.md, do not weaken)

- Submitted bids are immutable
- Technical envelopes open only after `Submission Closed`
- Commercial envelopes open only through official committee commercial opening
- Late submissions are blocked by default
- Vendor self-registration requires CAPTCHA
- All sensitive actions must be audit-logged

---

## Step 4 — Things you can and should do

- Implement the next item in priority order
- Refactor file names / function signatures / library choices (these are not locked)
- Add new tests
- Improve UI copy / styling within the locked design
- Capture new bugs / features from the user as `BUG-NNN` entries
- Update the relevant tracker(s) after every change
- Append to `HANDOVER.md` after every change (new top entry)
- Update `DECISION_LOG.md` when an architectural decision is made
- Ask the owner if a locked decision needs to change

---

## Step 5 — Required work cycle (for every task, large or small)

1. Read the source-of-truth files above (skip already-read in this session).
2. Confirm intended files are inside your ownership area (see CLAUDE.md "Ownership Areas").
3. Make the smallest complete change that delivers the task.
4. Update `agents/backlog/MASTER_TASK_TRACKER.md` — flip `[ ]` → `[~]` → `[x]`.
5. Update `docs/qa/BUG_TRACKER_2026-05-25.md` — move BUG-NNN from Open → Fixed, add verification line.
6. Update `docs/qa/IN_APP_COMPARISON_TRACKER_2026-05-27.md` if the change is in Phase A–G.
7. Append a new top entry to `agents/handoffs/HANDOVER.md` with: Date/time, Agent/task, Files changed, What changed, Why, Verification, Open questions, Next recommended step.
8. Append a `DECISION_LOG.md` entry if a business or architecture decision was made.
9. Append to `agents/skills/PROJECT_SKILLS.md` if a reusable CTMP pattern was discovered.

**A task is not complete until the trackers and handover are updated.**

---

## Step 6 — Operating environment quick-reference

- **Working root:** `D:\Work\CTMP\ctmp-platform\` (workstation) and `/mnt/repo/ctmp-platform/` (staging server `10.1.13.98`, user `claude`).
- **Permitted server paths:** ONLY `/mnt/repo/ctmp-platform/` — see CLAUDE.md "Remote Server Access Boundaries". Never read/write other tenants' paths.
- **Deploy pattern:** Local edit → `tar cf - <files> | ssh claude@10.1.13.98 'cd /mnt/repo/ctmp-platform && tar xf - --no-same-owner'` → `docker compose --project-name ctmp build --no-cache <service>` → `up -d --force-recreate <service>` → grep markers in `.next/static/chunks/` inside the running container to confirm.
- **Pre-flight check:** Run `docker system df` before any rebuild — staging host has hit 100% disk before, causing silent build failures.
- **Login DTO:** `POST /api/v1/auth/login` expects `{ username, password }` — not `{ email, password }`.
- **Admin URL:** https://ctmp-admin.hadiclinic.com.kw:4202
- **Vendor URL:** https://vn.hadiclinic.com.kw:4201 (NOT :443 — firewalled)
- **Admin login:** `admin@ctmp.local` / `Admin@12345!`

---

## Step 7 — How to behave with the owner

Based on accumulated feedback (see `C:\Users\Administrator\.claude\projects\D--Work-CTMP\memory\` if you have memory access, or recent HANDOVER entries):

- **Discuss first, plan second.** When the owner introduces a new feature or change, ask focused one-at-a-time questions until you understand. Do not jump to a plan or code.
- **Lock decisions explicitly.** When the owner agrees to a direction, save it (master plan, decision log) before moving to the next question.
- **No XLSX-as-primary-output.** The owner's strong directive: comparison work happens in-app, not via Excel exports. Reports module XLSX stays for analyst-friendly reports only.
- **Permissions are configurable, not hardcoded.** Defaults in master plan; owner tunes per role later.
- **Deploy pattern is well-understood — do not invent new ones** unless asked.
- **Update HANDOVER and trackers as you go**, not at the end. The owner expects a clean trail.

---

## Step 8 — If the owner asks: "where do we stand?"

A good answer covers, in order:

1. Last shipped: what landed on staging recently (see most-recent HANDOVER entry)
2. Open bugs: count + the critical one if any (BUG-028)
3. Failed retests: 5 items pending fix
4. New features locked: 11 entries (BUG-035 to BUG-045), master plan locked, phases A→G defined
5. Recommended next move: based on the priority list above

Keep it tight. The owner reads the trackers; you summarise, you don't dump.

---

## Step 9 — Common traps to avoid

- **Do not skip the Read-First step.** Working from memory of CLAUDE.md or HANDOVER without re-reading leads to acting on stale state.
- **Do not change a "locked" decision silently.** Master plan and decision log are the contract.
- **Do not re-fix BUG-033 differently.** It stays working as-is until BUG-035 ships.
- **Do not invent new tender lifecycle states.** Only the states in the spec exist.
- **Do not give Admin commercial visibility by default.** Per spec.
- **Do not use destructive git commands.** No `git push --force`, no `git reset --hard`, no `--no-verify`, unless the owner asks explicitly.
- **Do not deploy before confirming `docker system df` has space.**
- **Do not run any command outside `/mnt/repo/ctmp-platform/` on the staging server.** Ask the owner every time.

---

## Step 10 — Sign-off when ending a session

Before ending a session:

- [ ] All trackers updated for work performed
- [ ] HANDOVER.md top entry written with Next recommended step
- [ ] Any new decisions in DECISION_LOG.md
- [ ] Working tree status documented (committed? pushed? staging-deployed? local-only?)
- [ ] Owner has a clear "next move" articulated

That's the contract. Do not end a session with a half-told story.

---

## Cross-references

- **Master plan:** `docs/specs/IN_APP_COMPARISON_MASTER_PLAN_2026-05-27.md`
- **Flowchart:** `docs/specs/IN_APP_COMPARISON_FLOWCHART_2026-05-27.md`
- **Implementation tracker:** `docs/qa/IN_APP_COMPARISON_TRACKER_2026-05-27.md`
- **Deployment gaps:** `docs/specs/DEPLOYMENT_GAPS_2026-05-27.md`
- **Bug tracker:** `docs/qa/BUG_TRACKER_2026-05-25.md`
- **Retest sheet:** `docs/qa/RETEST_2026-05-26.md`
- **Decision log:** `docs/decisions/DECISION_LOG.md`
- **Handover (live):** `agents/handoffs/HANDOVER.md`
- **Project-wide rules:** `CLAUDE.md` at the repo root (one level above `ctmp-platform/`)

End of session-start prompt. Begin work.
