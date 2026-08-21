# CTMP — AI Decision Log

Why the system is built the way it is, what has been refactored, and **what must not be changed**.
Written 2026-08-21 by consolidating `docs/decisions/DECISION_LOG.md` (now **32** dated decisions),
`agents/handoffs/HANDOVER.md` (now **71** change entries, May–August 2026) and `AGENTS.md`.
Refreshed the same day after the production deploy.

This file is a **summary and an index**. The full argument for each decision, with options
considered, stays in `docs/decisions/DECISION_LOG.md` — that file is still the authority and new
decisions still go there, newest at the top.

---

## 1. DO NOT TOUCH — hard constraints

These are not preferences. Several encode regulatory separation of duties; others encode a
deployment reality that will break production if ignored.

### Regulatory: sealed commercial envelopes

- **Never weaken sealed commercial-envelope controls.** Technical envelopes open after submission
  closes. Commercial envelopes open **only** through a committee session with quorum — enforced by
  the `commercial_open_requires_session` CHECK constraint *and* in the service layer. Do not add a
  code path that opens a commercial envelope outside a session.
- **Opening is not visibility.** After opening, reading commercial detail still requires explicit
  permission. `commercial:view` and `commercial:export` are deliberately separate grants.
- **Never give System Admin automatic commercial visibility.** This was granted once and
  deliberately reverted (migration `007`, then locked down again in `015`). System Admin
  administers the system; it does not see supplier pricing.
- **Never add a generic commercial file download endpoint.** Downloads are per-document,
  permission-checked and audited.
- **Audit every** sensitive state change, view, download, export, permission change and exception.

### Regulatory: late submissions and vendor registration

- Late submission is **blocked by default**. It requires an exception that is specific to both the
  tender and the vendor, carries a reason, an expiry and a granting user, and is audited. One
  active exception per (tender, vendor).
- Vendor registration requires bot protection (hCaptcha), server-side validation, rate limiting and
  email verification. Do not add a registration path that bypasses any of these.

### Data integrity

- **`audit_logs` is append-only** and hash-chained, enforced at the database layer. Never
  `UPDATE` or `DELETE` a row. The chain is verified on API boot and a break raises a `CRITICAL`
  `security_alerts` row.
- The tender purge script (`scripts/purge_tender.sh`) deliberately **leaves `audit_logs`
  untouched** — that is the entire reason migration `053` dropped the audit FKs. Do not "improve"
  it by cascading into the audit trail.
- File checksums are SHA-256 hex, validated by CHECK constraints at the database layer. Do not
  move that validation into application code only.

### Deployment reality

- **The production admin host `10.1.27.99` has no internet egress.** It cannot pull or build
  images. Build on the build box, `docker save | gzip | ssh | docker load`, and always bring up
  production with **`--no-build`**.
- **Never rebuild `web-admin` or `web-vendor` with a bare `docker build`.** `NEXT_PUBLIC_*` is
  inlined into the browser bundle at build time; a bare build silently bakes
  `http://localhost:3000` and every browser then fails with "Failed to fetch". Use
  `docker compose build`, which supplies the args from `.env`. (This shipped to dev on 2026-08-19
  and broke the owner's login for a day.)
- **Migrations do not auto-run** on an initialised database. Author the file *and* apply it by hand
  to each environment.
- **Do not touch the other projects** on these hosts — `complainmgmt` and `hadi-intranet` on the
  admin host, `pharmacy` on the vendor host. Port 443 on the admin host belongs to
  `hadi-intranet-nginx-1`. Do not prune their images or volumes.
- **Do not prune Docker volumes.** `docker builder prune -f` and dangling-image pruning are safe;
  `image prune -a` and `volume prune` are not.
- Everything stays off the `/` partition — use the `sdb` data disk.

### Repository

- Agents work **only** inside `/mnt/repo/ctmp-platform/`. Anything outside requires explicit
  permission first — do not find another route to the same access.
- **This checkout is not a git working copy** (no `.git`). There is no commit history here and no
  `git log` to consult. The change history *is* `agents/handoffs/HANDOVER.md`. Treat it as the
  system of record and keep appending to it.

---

## 2. Architectural decisions

| Decision | Rationale |
|---|---|
| **Prisma over TypeORM** (2026-05-17) | Type generation and migration ergonomics |
| **PostgreSQL ENUMs for fixed business states** (2026-05-17) | Illegal states unrepresentable at the DB layer, not just in TypeScript |
| **Append-only audit enforced in the database** (2026-05-17) | An application bug must not be able to rewrite history |
| **SHA-256 hex format enforced at the DB layer** (2026-05-17) | Same reasoning — do not trust the writer |
| **Verification/reset tokens stored as SHA-256 hashes only** (2026-05-17) | A database leak must not yield usable tokens |
| **`captcha_verification_id` nullable in DB, enforced at the API** (2026-05-17) | Keeps historical rows loadable while the live path stays mandatory |
| **Storage abstraction: local **or** S3/MinIO via `STORAGE_DRIVER`** (2026-05-19) | Prod admin is air-gapped and uses local volumes; dev uses MinIO |
| **Audit chain race closed with `pg_advisory_xact_lock`** (2026-05-19) | Superseded an earlier row-lock approach that serialised too much |
| **Audit chain verified on API boot** (2026-05-19) | A silent break is worse than a loud failure |
| **Vendor self-service namespaced under `/vendor-auth/me/*`** (2026-05-19) | Keeps vendor identity endpoints away from admin user endpoints |
| **Failing bids' commercial envelopes go to `LOCKED`, not `SEALED`** (2026-05-18) | `SEALED` implies "awaiting opening"; a failed bid never will be |
| **Commercial Comparison enforces `commercial:view` at page level** (2026-05-18) | Hiding a nav item is not access control |
| **Commercial Terms are per bid, not per BOQ line** (2026-08-06) | One supplier, one set of terms; per-line was rejected as data-entry noise |
| **Money columns widened to `numeric(16,3)`** (2026-08-21) | KWD carries 3 decimal places; the award/budget/total columns were `numeric(15,2)` and silently rounded. 16 not 15, to keep today's 13 whole-dinar digits |

### Internationalisation (2026-08-13 → 2026-08-19)

- **One implementation, two label sets.** The Arabic pages are the *same* components as the English
  ones, parameterised by `labels`/`dir`/`interactive`. A parallel Arabic implementation was rejected
  because the two would drift.
- **Every English label helper is an identity function**, so English pages render byte-identical.
  This is verified by `cmp` on before/after screenshots, not by eye.
- **Numbers, currency and dates stay Western and Gregorian**, LTR, with LEFT-TO-RIGHT MARKs around
  figures inside Arabic sentences.
- **Data names get Arabic siblings with per-row fallback** (`nameAr?.trim() || name`), all columns
  additive and nullable, so no existing consumer changes.
- **Arabic month names come from the label set; English keeps using `toLocaleDateString`.** The
  Arabic sets supply the Gulf names (`يناير … ديسمبر`), matching the dashboard's monthly-trend
  chart. English passes `null` so its output cannot drift — en-GB spells September "Sept", which a
  hand-written list has already got wrong here.
- **Arabic screens are read-only where the target is untranslated.** Rather than send a management
  reader into an English screen mid-flow, `interactive={false}` withholds the link entirely. Arabic
  rows still navigate to Arabic profiles; only targets without an Arabic version are disabled.
- **`tenders.category` stays a text column.** The `tender_categories` table is a lookup joined by
  name; introducing a `category_id` FK would touch tender forms, filters, reports and analytics for
  no gain to this feature. A rename updates the tenders carrying it in the same transaction.

---

## 3. Refactoring history

| Change | Why |
|---|---|
| **Material Symbols → `lucide-react`** across all admin pages (2026-05-21) | Icon font never loaded reliably |
| **Vendor admin routes flattened** `/vendors/registrations/{id}/*` → `/vendors/{id}/*` (2026-05-18) | A registration and a vendor were the same row |
| **SYSTEM_ADMIN commercial grants reverted** (2026-05-22, migration `007`) | Separation of duties |
| **Split technical evaluation** (migration `030`) | Evaluation and finalisation are distinct permissions |
| **hCaptcha replaced the CAPTCHA stub** (2026-05-22) | Real bot protection for public registration |
| **Row lock → advisory lock** in the audit chain (2026-05-19) | Contention |
| **Prod role-permission drift resynced from dev** (migrations `046`/`047`, 2026-06-26) | The two had diverged; SYSTEM_ADMIN deliberately excluded from the sync |
| **Plain-text → branded HTML email templates** (migrations `049`/`050`) | Inline CID logos |
| **Audit FKs dropped from `audit_logs`** (migration `053`) | So a tender can be purged with the chain intact |
| **Hardcoded category array → `tender_categories` table** (migration `054`) | The array was duplicated across both tender forms |
| **`/executive` profile pages moved from route files into `components/executive/`** (2026-08-19) | Next.js route files may only export the page; sharing them with the Arabic routes required the move |
| **`VendorsService.update()` implemented** (2026-08-13) | It was a stub that threw `Not implemented` |
| **`interactive` actually wired up** in `DepartmentOverview`, `DepartmentProfile`, `VendorProfile` (2026-08-21) | All three accepted the prop and read it nowhere; Arabic pages had been linking into English for eight days |
| **`StatusBadge` gained an optional `label` prop** (2026-08-19) | So Arabic text can show while the colour still keys off the raw status |
| **`fmtDate` parameterised by a `months` array** (2026-08-21) | Arabic dates were rendering English month names |

---

## 4. Verification lessons — how work here gets checked

Each of these was learned by shipping the mistake.

- **A mock can hide the bug you are looking for.** The screenshot harness runs inside the API
  container and rewrites every `/api/v1` request to `http://api:3000`. It proved layout and
  translation while a bundle pointing at `localhost:3000` looked perfectly healthy. Browser-facing
  changes must additionally be driven against the **public URL with interception off**, asserting on
  `requestfailed` and the final path.
- **Do not over-filter build output.** A failed API build once hid behind `grep "error TS"` and left
  a stale image running for six days. Read the tail of the build, not a filtered slice.
- **Pixel-diff the English pages after any i18n change.** Three invisible English regressions were
  caught this way (`Sept`→`Sep`, `4d`→`4 days`, an inline-block wrapper shifting text).
- **A regex sweep does not find every string.** Template literals and sub-component props were
  missed twice. Render the page and read it.
- **Positional edits are dangerous.** A one-shot `str.replace(..., 1)` patched the first matching
  Prisma select in the file rather than the intended one. Grep for all occurrences first.
- **Rehearse destructive SQL with `ROLLBACK` on dev.** Doing so caught the
  `commercial_open_requires_session` CHECK before the purge script could fail mid-transaction on
  live data.
- **A prop that is accepted but never used is worse than no prop.** As of this audit
  `VendorDirectory` still has one — see `PROJECT_STATE.md`. `interactive` was destructured
  in three components and referenced in none; the Arabic routes had passed `interactive={false}`
  for eight days with no effect. When adding a behaviour flag, grep that it is actually *read*.
- **Verify per tab, not just per page.** The KPI-link fix looked complete on every landing view;
  clicking through to one tab revealed 11 more English links.
- **Audit per tab, not per page.** The Arabic link audit looked clean on every landing view; the
  department profile's Tenders tab still held 11 links into English. Default-tab-only checks ship
  half-fixes.
- **Count the artifact, don't read the diff.** The link fixes were verified by enumerating every
  `a[href]` in a real browser per page and per tab, which is what caught the missed tab. Reading the
  diff would have looked complete.
- **In RTL, use logical CSS properties** (`ms-*`/`me-*`). A physical `ml-1` put the gap on the wrong
  side and produced `المناقصات الجارية(كل السنوات)`.

---

## 5. Working agreements

- **Dev first, always.** Standing instruction from the owner: everything is deployed to the
  development server, tested and confirmed by them, and only then rolled out to production.
- **Draw it before building it.** For UI changes the owner wants a visual — an artifact or a sketch
  — approved before implementation.
- **Do not re-litigate settled decisions.** The shared-table approach for the Commercial Comparison
  alignment is settled; two attempts to change the table *structure* were wrong, and the actual fix
  was alignment plus a `colSpan` correction.
- After completing or blocking a task: update `agents/handoffs/HANDOVER.md`, update
  `agents/backlog/MASTER_TASK_TRACKER.md`, and add a decision to `docs/decisions/DECISION_LOG.md`
  when one was made.

---

## Where the detail lives

| Topic | File |
|---|---|
| Full decision records (33, with options considered) | `docs/decisions/DECISION_LOG.md` |
| Chronological change log (67 entries, newest first) | `agents/handoffs/HANDOVER.md` |
| Task tracker by phase | `agents/backlog/MASTER_TASK_TRACKER.md` |
| Agent working rules, ownership areas, guardrails | `AGENTS.md` |
| Production operations + troubleshooting | `docs/runbooks/PRODUCTION_OPERATIONS.md` |
| Deploy runbook | `docs/runbooks/admin-prod-deploy.md` |
| Arabic wording for owner review | `docs/i18n/executive-dashboard-ar.md` |
