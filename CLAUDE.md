# CLAUDE.md — CTMP traffic controller

This file governs every AI session in this repository. Read it before anything else, then follow the
directives below in order.

CTMP (Corporate Tender Management Platform) is **live in production** on two servers, one of them
air-gapped, serving real procurement for HadiClinic. Treat every change as production-affecting.

---

## 1. CONTEXT INITIALIZATION

> **CONTEXT INITIALIZATION: At the start of ANY new chat session or environment switch, FIRST read
> `/docs/PROJECT_STATE.md`, `/docs/ARCHITECTURE.md`, and `/docs/DATABASE_SCHEMA.md`.**

These paths are repository-relative: `docs/PROJECT_STATE.md`, `docs/ARCHITECTURE.md`,
`docs/DATABASE_SCHEMA.md` from the repo root (`/mnt/repo/ctmp-platform`).

Read them **before** exploring the tree, running searches, or answering questions about the system.
They are reconciled against the running containers and the live database, so they will save you from
re-deriving facts and from acting on assumptions that stopped being true.

Also read `docs/AI_DECISION_LOG.md` before changing anything — it carries the do-not-touch list.

---

## 2. MAINTENANCE RULE

> **MAINTENANCE RULE: Whenever you add new code, create API routes, or alter schema, immediately
> update `/docs/PROJECT_STATE.md` with the progress before ending the turn.**

Do this in the same turn as the work, not "later". Alongside it:

- **Schema changes** also update `docs/DATABASE_SCHEMA.md` — including the dev/production drift
  section, which is the only place the two environments are compared.
- **Decisions** (a chosen approach, a rejected alternative, a constraint discovered) go to
  `docs/decisions/DECISION_LOG.md`, newest at the top.
- **Every completed or blocked task** gets an entry in `agents/handoffs/HANDOVER.md`, newest first.
  Git records *what* changed; the handover records *why*, what was verified, and how to roll it
  back. Both are needed.
- **Commit and push the work in the same turn.** See § Version control below.
- **Task status** updates in `agents/backlog/MASTER_TASK_TRACKER.md`.

---

## 3. STRICT BOUNDARIES

> **STRICT BOUNDARIES: Never invent folder structures or architecture patterns that contradict
> `/docs/ARCHITECTURE.md`.**

If the work seems to need a new pattern or a new directory, say so and get agreement first. Do not
create it and explain afterwards.

Specific structures that are enforced by the tooling, not merely conventional:

- `apps/*/src/app/**/page.tsx` are **route files only** — a route file may export the page and
  nothing else. Importing a component *from* a route file fails the Next.js build.
- Shared components live in `src/components/**`, feature composites in `src/features/**`, API
  client and helpers in `src/lib/**`.
- The API is the only service that touches the database. Front-ends never talk to Postgres.

---

## Non-negotiable constraints

The full list is in `docs/AI_DECISION_LOG.md` §1. The ones most easily broken by accident:

**Regulatory**
- Never weaken sealed commercial-envelope controls. Commercial envelopes open **only** through a
  committee session with quorum. Opening is not visibility — reading detail still needs permission.
- Never grant System Admin commercial visibility. This was granted once and deliberately reverted.
- Never add a generic commercial file download endpoint.
- Audit every sensitive state change, view, download, export, permission change and exception.

**Data**
- `audit_logs` is append-only and hash-chained. Never `UPDATE` or `DELETE` a row.
- Money is `numeric(16,3)` on the award/budget/total columns — KWD carries 3 decimal places (fils).

**Deployment**
- The production admin host has **no internet egress**. Build images on the build box, transfer with
  `docker save | gzip -1 | ssh | docker load`, and bring production up with **`--no-build`**.
- **Never rebuild `web-admin` or `web-vendor` with a bare `docker build`.** `NEXT_PUBLIC_*` is baked
  into the browser bundle at build time; a bare build silently bakes `http://localhost:3000` and
  every browser then fails with "Failed to fetch". Use `docker compose build`, or pass the
  `--build-arg` values explicitly. Verify the baked origin **before** transferring.
- Migrations do **not** auto-run on an initialised database. Author the file *and* apply it by hand
  to each environment.
- Never touch the other projects on these hosts (`complainmgmt`, `hadi-intranet`, `pharmacy`).
  Never prune Docker volumes.

**Scope**
- Work only inside `/mnt/repo/ctmp-platform/`. Anything outside needs explicit permission first —
  do not find another route to the same access.

---

## Working agreements

- **Dev first, always.** Everything goes to the development server, the owner tests and confirms,
  and only then is it rolled out to production. Do not deploy to production unprompted.
- **Draw it before building it.** For UI changes the owner wants a visual — a sketch or an
  artifact — approved before implementation.
- **Verify what you claim.** Do not report something as working because the code looks right.
  Screenshot it, count the rendered elements, query the database, hit the public URL. Several bugs
  here were shipped by verification that could not have detected the failure.
- **Do the task that was asked.** Report what was done and stop. Findings belong in the deliverable,
  not appended as unrequested recommendations.

---

## Version control

The repository is under git and synced to GitHub. Before 2026-08-21 it was not, and the working
tree had drifted two months ahead of the remote — do not let that recur.

| | |
|---|---|
| Remote | `github.com/ghuffy11-lgtm/ctmp-platform` |
| Branch | `main` — the only branch; `master` and `develop` were retired on 2026-08-21 |
| Author | `HadiClinic IT <it@hadiclinic.com.kw>` (repo-local config) |

**Commit as you go.** A change that is deployed but uncommitted is invisible to everyone else, and
the box is no longer the only copy. Push to `main` when the work is done and verified.

**Two quirks of this machine:**

- Repository files are owned by `claude` while shells run as `root`, so git refuses with *"detected
  dubious ownership"* until the exception exists. It is already set; if it is ever lost:
  `git config --global --add safe.directory /mnt/repo/ctmp-platform`
- `gh` tokens on this box have expired before. `gh auth login -h github.com` is an interactive
  device-code flow, so **the owner has to run it** — you cannot complete it for them.

**Never commit secrets.** `.gitignore` covers `.env`, `.env.local`, `.env.bak*`, `*.tsbuildinfo`,
`node_modules`, `.next` and `dist`. Only `.env.example` templates belong in the repository. Check
`git diff --cached --name-only` before committing if anything under `infrastructure/docker/` is
involved.

**History is not a backup of the build box, and the box is not a superset of history.** The
2026-08-21 sync found 39 files that existed only in git, including migration `008` and an
audit-chain RCA. They were deleted on the owner's instruction and remain recoverable at `b37170f`.
Do not assume either side is complete — check.

---

## Where everything lives

| Need | File |
|---|---|
| Current build state, backlog | `docs/PROJECT_STATE.md` |
| Stack, topology, directory map | `docs/ARCHITECTURE.md` |
| Tables, columns, FKs, dev/prod drift | `docs/DATABASE_SCHEMA.md` |
| Decisions, refactors, do-not-touch | `docs/AI_DECISION_LOG.md` |
| Full decision records | `docs/decisions/DECISION_LOG.md` |
| Why a change was made, and how to roll it back | `agents/handoffs/HANDOVER.md` |
| Task tracker | `agents/backlog/MASTER_TASK_TRACKER.md` |
| Agent ownership + guardrails | `AGENTS.md` |
| Production operations, deploy | `docs/runbooks/` |
| Arabic wording for owner review | `docs/i18n/executive-dashboard-ar.md` |
| Superseded material | `docs/archive/` |

Environments, URLs and SSH aliases are in `docs/ARCHITECTURE.md` § Deployment topology.
