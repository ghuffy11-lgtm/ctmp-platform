# Next Session Prompt — Read This First

**Created:** 2026-05-27
**Last updated:** 2026-05-28 (after Phase G shipped + locked-plan redesign complete)
**Status:** Active — read at the start of every new Claude session working on CTMP

This file is your **session-start prompt**. Read it before doing anything else. It tells you (a future Claude session) exactly where the project is, what's locked, what's pending, and what to do next.

---

## ⚡ TL;DR — what changed

The full 7-phase in-app comparison + award redesign (Phases A → G, master plan locked 2026-05-27) is **shipped end-to-end** and live on staging. All 11 new BUG-NNN entries (BUG-035 → BUG-045) are in the Fixed table. Latest commit on `origin/develop` = `fc9e484` (2026-05-28).

**What's left:**
- Owner end-to-end click-through (the locked plan never required Claude to do it — owner verifies)
- 5 documented deferrals in the Open bug-tracker table (each has a reason)
- Anything new the owner surfaces from click-through → open as BUG-046+

There is no "next phase" — the redesign is closed.

---

## Step 1 — Read these files, in this order, before any work

```text
1. agents/handoffs/NEXT_SESSION_PROMPT.md   ← you are here
2. agents/handoffs/HANDOVER.md               ← latest session record (TOP entry is the most recent)
3. docs/qa/BUG_TRACKER_2026-05-25.md         ← bugs (Open table = 5 deferrals; Fixed table = 44 rows)
4. docs/specs/IN_APP_COMPARISON_MASTER_PLAN_2026-05-27.md   ← LOCKED master plan (still the rule book)
5. docs/qa/IN_APP_COMPARISON_TRACKER_2026-05-27.md          ← phase tracker — all A.1 to G.5 are [x]
6. docs/decisions/DECISION_LOG.md            ← decisions, newest at top (top entry = Phase G closure)
7. CLAUDE.md                                 ← project-wide guardrails (kept current)
```

Skip the flowchart + deployment-gaps docs unless the owner specifically asks — they were design-time artefacts.

---

## Step 2 — Know what's left

### Priority 1 — Owner end-to-end click-through (no code required of you)

The owner verifies the full lifecycle of one fresh tender against the new surfaces:
- Create → set procurement type + budget + at least 1 RFQ doc + at least 1 invited vendor (if INVITATION_ONLY) + per-tender criteria with weights = 100%
- Submit for Approval → Approve → Publish
- Vendor side: vendor logs in, sees the tender, submits a bid (PDF-only)
- Owner side: Close Submissions → Open Technical Envelopes → score on Technical Evaluation → finalize → check Technical Comparison page renders per-criterion consensus
- Committee opening session: mark attendance + Chair present, Open Commercial Envelopes
- Commercial Comparison page: matrix shows lowest-PASS highlighted, expand vendor card → see all 5 blocks
- Click Recommend → AwardConfirmDialog opens with quorum chip → for lowest-PASS, one-click Confirm
- After Confirm: tender = Awarded; Generate Award Minutes PDF; check vendor portal banners; (optionally) Amend Award

If anything breaks during click-through, open a new `BUG-046+` entry in the bug tracker with the symptom + the file:line you suspect.

### Priority 2 — 5 documented deferrals (Open table)

In `docs/qa/BUG_TRACKER_2026-05-25.md` Open. Each has a one-line "why deferred" comment.

| ID | Why deferred | Effort estimate |
|---|---|---|
| BUG-016 | Publish-notification dispatch — needs owner approval before broadcasting emails to vendors | Small once approved |
| BUG-017 | Clarification attachments — new tables + storage + UI (~7 files) | Medium (one focused session) |
| BUG-018 (Export only) | Clarification PDF export — depends on a Reports module renderer | Medium — bundle with a Reports session |
| BUG-020 | Owner question — who performs technical evaluation + how notified | Owner answer + doc update, no code |
| BUG-028 Part B | Dept-scoped data filtering — `user.departments` on JWT payload + coordinated token rotation | One dedicated session (heaviest single change remaining) |

### Priority 3 — New entries from owner click-through

If the owner asks for fixes after click-through, capture as the next `BUG-NNN` (sequential after BUG-045) in the bug tracker before working on it. Don't skip the tracking step.

---

## Step 3 — Things you MUST NOT change without explicit owner approval

The locked rules from the 2026-05-27 master plan still apply (the redesign is shipped, the rules are now living invariants):

- PDF-only viewer; no Office docs, no images in v1
- Modal overlay viewer pattern (not inline-embedded, not split-pane, not new-tab)
- Single-winner only (no split awards)
- Gate-only PASS/FAIL (total weighted score is for ranking only)
- Vendor notifications default OFF (opt-in toggles at Confirm time)
- Awards are never deleted — amendments add a new row that supersedes via `superseded_by_award_id`
- System Admin does NOT receive commercial visibility by default
- Audit logging on document view is mandatory and writes BEFORE the PDF is streamed (no failing-open)

And from the spec (always have been the rules, still are):

- Submitted bids are immutable
- Technical envelopes open only after `Submission Closed`
- Commercial envelopes open only through official committee commercial opening
- Late submissions are blocked by default
- Vendor self-registration requires CAPTCHA
- All sensitive actions must be audit-logged

If a need arises to amend any of these, **stop, ask the owner, and append a dated amendment block** to `IN_APP_COMPARISON_MASTER_PLAN_2026-05-27.md`.

---

## Step 4 — Things you can and should do

- Pick from the deferred backlog (priority 2 above) — each has a locked agreed approach in the bug tracker
- Capture new bugs / features from the owner as `BUG-NNN` entries
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
6. Append a new top entry to `agents/handoffs/HANDOVER.md` with: Date/time, Agent/task, Files changed, What changed, Why, Verification, Open questions, Next recommended step.
7. Append a `DECISION_LOG.md` entry if a business or architecture decision was made.
8. Append to `agents/skills/PROJECT_SKILLS.md` if a reusable CTMP pattern was discovered.

**A task is not complete until the trackers and handover are updated.**

---

## Step 6 — Operating environment quick-reference

- **Working root:** `D:\Work\CTMP\ctmp-platform\` (workstation) and `/mnt/repo/ctmp-platform/` (staging server `10.1.13.98`, user `claude`).
- **Permitted server paths:** ONLY `/mnt/repo/ctmp-platform/` — see CLAUDE.md "Remote Server Access Boundaries". Never read/write other tenants' paths.
- **Deploy pattern:** Local edit → `tar cf - <files> | ssh claude@10.1.13.98 'cd /mnt/repo/ctmp-platform && tar xf - --no-same-owner'` → `docker compose --project-name ctmp build --no-cache <service>` → `up -d --force-recreate <service>` → grep markers in `.next/static/chunks/` inside the running container to confirm.
- **Pre-flight check:** Run `docker system df` before any rebuild — staging host has hit 100% disk before. The 2026-05-27/28 session burned through ~50GB of build cache; `docker builder prune -af` reclaims it cleanly.
- **API container size:** ~250MB larger since Phase E (chromium for puppeteer-core Award Minutes PDF rendering). Expected.
- **Login DTO:** `POST /api/v1/auth/login` expects `{ username, password }` — not `{ email, password }`.
- **Admin URL:** https://ctmp-admin.hadiclinic.com.kw:4202
- **Vendor URL:** https://vn.hadiclinic.com.kw:4201 (NOT :443 — firewalled)
- **Admin login:** `admin@ctmp.local` / `Admin@12345!`

---

## Step 7 — How to behave with the owner

Based on accumulated feedback (see `C:\Users\Administrator\.claude\projects\D--Work-CTMP\memory\` if you have memory access):

- **The locked plan is the contract.** If the owner asks "what's next," consult the priority order above and propose the next step — don't ask "(a) or (b) or (c)?" when the plan documents the answer.
- **Discuss first, plan second.** When the owner introduces a new feature or change, ask focused one-at-a-time questions until you understand. Do not jump to a plan or code.
- **Lock decisions explicitly.** When the owner agrees to a direction, save it (master plan, decision log) before moving to the next question.
- **Batch then verify.** Owner wants whole bundles shipped end-to-end with server-side automated checks; they do a single click-through pass at the end. Do not pause mid-bundle for "owner please verify X".
- **Permissions are configurable, not hardcoded.** Defaults in master plan §I; owner tunes per role later.
- **Deploy pattern is well-understood — do not invent new ones** unless asked.
- **Update HANDOVER and trackers as you go**, not at the end.

---

## Step 8 — If the owner asks: "where do we stand?"

A good answer covers, in order:

1. **Headline:** "The full 7-phase in-app comparison redesign is shipped end-to-end (Phases A–G). All 11 BUG-035 to BUG-045 are Fixed. Latest commit: `fc9e484`."
2. **What's open:** the 5 deferrals + their why-deferred reasons.
3. **What's next:** owner click-through if it hasn't happened, otherwise pick from the deferred backlog (BUG-028 Part B is the heaviest), otherwise standby for new owner requests.

Keep it tight. The owner reads the trackers; you summarise, you don't dump.

---

## Step 9 — Common traps to avoid

- **Do not skip the Read-First step.** Working from memory of CLAUDE.md or HANDOVER without re-reading leads to acting on stale state.
- **Do not change a "locked" decision silently.** Master plan and decision log are the contract.
- **Do not re-add `commercial_comparison` to the Reports module.** It was deliberately removed by Phase G; the in-app `/commercial-comparison` page is the canonical surface.
- **Do not invent new tender lifecycle states.** Only the states in the spec exist.
- **Do not give Admin commercial visibility by default.** Per spec.
- **Do not use destructive git commands.** No `git push --force`, no `git reset --hard`, no `--no-verify`, unless the owner asks explicitly.
- **Do not deploy before confirming `docker system df` has space.** The 2026-05-27/28 session repeatedly hit "no space left on device" — `docker builder prune -af` reclaims fast.
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

- **Master plan (still the rule book):** `docs/specs/IN_APP_COMPARISON_MASTER_PLAN_2026-05-27.md`
- **Flowchart (historical visual reference):** `docs/specs/IN_APP_COMPARISON_FLOWCHART_2026-05-27.md`
- **Phase tracker (all [x]):** `docs/qa/IN_APP_COMPARISON_TRACKER_2026-05-27.md`
- **Deployment gaps (historical; all gaps closed as of 2026-05-28):** `docs/specs/DEPLOYMENT_GAPS_2026-05-27.md`
- **Bug tracker:** `docs/qa/BUG_TRACKER_2026-05-25.md`
- **Decision log:** `docs/decisions/DECISION_LOG.md`
- **Handover (live):** `agents/handoffs/HANDOVER.md`
- **Project-wide rules:** `CLAUDE.md` at the repo root (one level above `ctmp-platform/`)

End of session-start prompt. Begin work.
