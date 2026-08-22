# CTMP — Project State

**As of 2026-08-22 (midday).** Reconciled against the working tree, the running dev containers, and the
production hosts (image tags, schema comparison). Where a claim could be checked, it was checked.

---

## One-paragraph summary

CTMP is **live in production on both servers** and has been since June 2026. The full tender
lifecycle works end to end: create → internal review → approve → publish → vendor clarifications →
bid submission (sealed technical + commercial envelopes) → technical evaluation → committee
commercial opening → commercial comparison → optional negotiation → award recommendation → award →
close, with a hash-chained audit trail throughout.

**As of 2026-08-22 dev and production are back in step.** Identical schemas, everything through
migration `056` on both, and nothing queued. The Arabic management area shipped to production on
2026-08-21 with migrations `054` and `055`; the three fixes found by the end-to-end lifecycle test —
the APPROVED dead end, `procurementType` enum enforcement, and the vendor portal's browser-native
dialogs — shipped on 2026-08-22 with migration `056`.

**The live money path has still never been exercised.** Production holds **zero tenders**. Creating
one test tender, walking a vendor through it, and purging it afterwards is the outstanding work.

---

## Version control

**Under git and synced to GitHub since 2026-08-21.** Before that the repository was not a git
working copy at all and the build box was the only copy of the codebase.

| | |
|---|---|
| Remote | `github.com/ghuffy11-lgtm/ctmp-platform` |
| Branch | `main` — the only branch. `master` (stale since 2026-05-17) and `develop` were deleted on 2026-08-21; both were fully contained in `main`, so no commit was lost |
| Sync commit | `d9c647b` — 173 files, +16,060 / −20,289, covering 2026-06-22 → 2026-08-21 |

The sync deleted 39 files that existed only in git — including migration
`008_audit_chain_rebake_2026-05-23.sql`, its repair script, an audit-chain RCA and three Playwright
specs — on the owner's instruction, taking the build box as source of truth. All remain recoverable
at commit `b37170f`.

---

## Deployment state

| Environment | URL | Schema | Images |
|---|---|---|---|
| Production admin | `https://ctmp.hadiclinic.com.kw:4202` (`10.1.27.99`) | through `056` | `ctmp-api:prod-20260822`, `ctmp-web-admin:prod-20260822` |
| Production vendor | `https://vn.hadiclinic.com.kw:4201` (`172.16.4.11`) | (uses admin DB) | `ctmp-web-vendor:prod-20260822` |
| Dev / build box | admin `:4202` / vendor `:4201` on `10.1.13.98` | through `056` | all three rebuilt 2026-08-22 |

Running image IDs confirmed equal to their `prod-20260822` tags on both hosts after cutover:
api `d4da4f1`, web-admin `4ef283b`, web-vendor `7b6e6f2`.

**Schema drift, dev vs prod: none.** Both at migration `056`. Note that `056` is data-only — three
`UPDATE`s and a `COMMENT`, no DDL — so the column-by-column comparison below reports zero difference
whether or not it has been applied and **cannot be used to detect it**. Check `tender_type` values
and the column comment directly instead.

**Rollback tags on the hosts:** `ctmp-api:rollback-20260822` (`0c01cc9`),
`ctmp-web-admin:rollback-20260822` (`51eaa66`) on admin; `ctmp-web-vendor:rollback-20260822`
(`3a66ef3`) on vendor — all cut immediately before the 2026-08-22 deploy, and all equal to the
`prod-20260821*` images they replaced. Older points remain: `ctmp-api:rollback-20260821`,
`ctmp-api:rollback-20260813`, `ctmp-api:rollback-20260807b`, `ctmp-web-admin:rollback-20260821`,
`ctmp-web-admin:rollback-20260806`, `ctmp-web-vendor:rollback-20260821`,
`ctmp-web-vendor:rollback-20260807`.
Pre-deploy DB backups on the admin host: `/var/lib/docker/ctmp-platform/backups/ctmp_pre056_20260822.dump`
(226 KB, 2026-08-22) and `ctmp_pre055_20260821.dump`.
Roll back by retagging to `:latest` and recreating with `--no-build`. Migration `056` needs no
revert — it changes no structure and matched no production row.

---

## Completed features

### Core tender lifecycle — production

| Capability | Notes |
|---|---|
| Tender creation, internal review, approval, publication | 18 tender statuses; approvals run through the workflow engine |
| Tender versioning + amendment history | `tender_versions` |
| Bill of Quantities on the tender, priced per bid | `tender_boq_items` / `bid_boq_items` |
| Two-way clarifications | Vendor-scoped vs public reply visibility, per reply |
| Vendor self-registration | hCaptcha + email verification + admin approval |
| Sealed bid submission | Technical + commercial envelopes, SHA-256 checksummed, submission receipts |
| Late-submission exceptions | Blocked by default; needs a per-(tender,vendor) audited exception with reason + expiry |
| Technical evaluation | Per-evaluator scoring, weighted criteria, pass threshold, majority-vote finalisation |
| Committee commercial opening | Attendance + quorum enforced; opens only technically-passed envelopes |
| Commercial comparison | Ranked, permission-gated, itemised BoQ view |
| Negotiation rounds | Invitations, revised submissions, savings tracking |
| Award recommendation → approval → issue | Award minutes PDF generated |
| Report exports | XLSX + PDF via an async BullMQ worker |
| Notifications | 11 branded HTML email templates, inline CID logos, internal Exchange in prod |
| Executive dashboard + drill-downs | Department overview, vendor directory, per-entity profiles |
| Audit trail | Hash-chained, append-only, verified on boot, `CRITICAL` alert on break |
| RBAC | 16 roles, 77 permissions, 224 grants |
| Auth | AD/LDAP **and** local bcrypt; TOTP MFA; brute-force lockout (5 attempts → 15 min) |

### Shipped August 2026 — production

| Feature | Shipped | Lives in |
|---|---|---|
| **Bid Commercial Terms** — 5 bid-level fields (brand/manufacturer, country of origin, warranty, delivery period, payment terms); compared in Commercial Comparison, revisable per negotiation round, printed in Award Minutes | 2026-08-07 | migration `052`, `bids`/`comparison`/`negotiation`/`award`, `packages/shared-types/src/commercial-terms.ts` |
| **Vendor landing page** — About / How it works / Requirements / FAQ around the tender grid | 2026-08-07 | `apps/web-vendor/src/components/landing/` |
| **Closed tenders no longer advertised** — public and vendor lists filter on the submission deadline rather than waiting for a manual close; `NEGOTIATION` deliberately exempt | 2026-08-07 | `apps/api/src/modules/tenders/tenders.service.ts` |
| **Audit-log FKs dropped** so a tender can be purged while the chain stays verifiable | 2026-08-07 | migration `053` |
| **Vendor-facing error messages** — every refusal names the real reason across all 18 statuses plus invitation-only and deadline cases, replacing "Tender not accessible to vendor" | 2026-08-13 | `apps/api/src/modules/tenders/vendor-access.ts` |

### Shipped 2026-08-21 — production

Deployed together: migrations `054` + `055` and all three images.

| Feature | Lives in |
|---|---|
| **Arabic Management Dashboard** `/executive-ar` — RTL mirror of `/executive`, own bookmarkable URL, gated on `executive:dashboard`; management lands there at login | `components/executive/` |
| **Arabic department overview + vendor directory** `/executive-ar/departments`, `/executive-ar/vendors` | `components/executive/` |
| **Arabic detail pages** `/executive-ar/departments/[id]`, `/executive-ar/vendors/[id]` | `components/executive/` |
| **Arabic data names** — `departments.name_ar`, `vendors.company_name_ar` (optional), `tender_categories` lookup; per-row fallback to the Latin name | migration `054` |
| **Tender categories become managed data** — replaces a hardcoded array duplicated across both tender forms; renaming a category updates the tenders carrying it in one transaction; categories are deactivated, never deleted | migration `054` |
| **`VendorsService.update()`** — previously a stub that threw `Not implemented` | `vendors.service.ts` |
| **Money precision** — `tenders.awarded_amount`, `tenders.budget_estimate`, `commercial_evaluations.total_price` widened `numeric(15,2)` → `numeric(16,3)` so contract values hold fils. Applied to production while it still had **zero tenders**, so no value was ever rounded in production | migration `055` |
| **Arabic KPI tiles no longer link into English** — `interactive` was accepted but never read by three components, so `interactive={false}` had been silently ignored since 2026-08-13. Gated every outbound link; verified by counting anchors per page **and per tab** | `ctmp-web-admin:prod-20260821b` |
| **Arabic month names + a missed `Status` header** — Arabic dates read `21 May 2026`; now `21 مايو 2026` using the Gulf month set the dashboard already used. English still formats via `toLocaleDateString` so it cannot drift | `ctmp-web-admin:prod-20260821c` |
| **Vendor portal no longer uses browser-native dialogs** — `DialogProvider` ported from admin, so both apps share one confirm/notify contract. 2 `confirm()` and 5 `alert()` replaced, including the irreversible bid submission. Closes a gap left by BUG-078, which applied the rule to admin only. **Production 2026-08-22** | `web-vendor/components/dialog/`, 3 call-site files |
| **`procurementType` validation closed** — the DTO advertised three values to Swagger but validated only `@IsString()`, so the API accepted anything. Now `@IsIn(PROCUREMENT_TYPES)`, covering create and update (the update DTO extends create). Migration `056` normalises the two stray `OPEN` rows. **Production 2026-08-22** | `create-tender.dto.ts`, migration `056` |
| **APPROVED dead-end fixed** — `submitForApproval` now rejects a tender missing procurement type or estimated budget (the two fields the edit form locks after approval), and `revert` works from **Approved** as well as Published, with the target required to be an earlier status. Found by the end-to-end test; **Production 2026-08-22** | `tenders.service.ts`, `RevertTenderDialog.tsx` |
| **`VendorDirectory`'s dead `interactive` prop removed** — it was accepted and never read. Removing it rather than wiring it: all three links there are label-driven and every target has an Arabic version, so gating them would have *removed* working navigation. The compiler then caught the English route still passing the prop — which an inert prop would have hidden | `ctmp-web-admin:prod-20260821d` |

**Owner's position on the two Arabic follow-ups (2026-08-21):** the wording is accepted as-is and
changes will be raised as needed; the Arabic names will be entered by the owner directly and are not
tracked here. Neither blocks anything.

## Active / awaiting the owner

The three 2026-08-22 fixes shipped to production the same day. The owner chose to skip a separate
dev walkthrough and fold their verification into the production test tender below, so **they are
live but not yet exercised through the UI** — that is what the test tender covers.

Two items sit with the owner by their own choice:

1. **Enter the real Arabic names in production** — **11 departments, 8 categories, 2 vendors**, via
   Settings. Blank names fall back to the Latin value per row, so nothing renders empty. The owner
   has said they will manage this. (An earlier revision said "12 departments … 17 vendors"; those
   are the **dev** counts. Production is 11/8/2, counted on the host 2026-08-22.)
2. **Arabic wording** — accepted as-is; the owner will raise changes if any are wanted.
   `docs/i18n/executive-dashboard-ar.md` lists every term, including the month names and two open
   style questions (plural forms for "3 awards"; `نشط` vs `سارية` for an award's Active state).

Still outstanding from before, unrelated to the Arabic work:

3. **Run the production test tender** — full runbook now written at
   `docs/qa/PRODUCTION_LIFECYCLE_TEST.md`, including the server-side checks and the teardown.
   Production has **zero tenders**, so no part of the live money path has been exercised with real
   data. Runnable with the four existing production users — see the role-coverage section below.
4. **Purge that test tender afterwards** — `SSH_ALIAS=cts-prod bash scripts/purge_tender.sh <REF>`
   dry run, then again with `--confirm`. The script has still **never been run anywhere**, so prove
   it on dev against `TDR-2026-0028` before pointing it at production.

## Production role coverage — functional, but nobody is separated from anybody

Production has **four internal users**: `admin@hadiclinic.com.kw` (`SYSTEM_ADMIN`) and three
`PROCUREMENT_ADMIN`s (`ghuffran@`, `EZAZM@`, `walidb@`). Nobody holds `APPROVER`,
`TECHNICAL_EVALUATOR` or `COMMERCIAL_COMMITTEE_MEMBER`.

**That does not block the lifecycle.** Checked grant-by-grant on the production database
2026-08-22 — permissions here do not follow role names, and `PROCUREMENT_ADMIN` is far broader than
its name suggests:

| Stage | Permission | Held by (production has it?) |
|---|---|---|
| Approve tender | `tender:approve` | `PROCUREMENT_ADMIN`, `SYSTEM_ADMIN` — ✅ |
| Open technical envelopes | `technical:open` | `PROCUREMENT_ADMIN`, `SYSTEM_ADMIN`, `TECHNICAL_EVALUATOR` — ✅ |
| Technical evaluation | `technical:evaluate` | `PROCUREMENT_ADMIN`, `SYSTEM_ADMIN`, `TECHNICAL_EVALUATOR` — ✅ |
| Create committee session | `committee:create_session` | `PROCUREMENT_ADMIN`, `SYSTEM_ADMIN` — ✅ |
| Record attendance | `committee:record_attendance` | `PROCUREMENT_ADMIN`, +2 — ✅ |
| Open commercial envelopes | `committee:open_commercial` | `PROCUREMENT_ADMIN`, +2 — ✅ |
| See commercial detail | `commercial:view` | `PROCUREMENT_ADMIN`, +2 — ✅ (**not** `SYSTEM_ADMIN`, by design) |
| Recommend / finalise award | `award:recommend`, `award:finalize` | `SYSTEM_ADMIN` only — ✅ |

**Committee membership is not role-gated.** `committee_members.user_id` references `users(id)` with
no role check; `is_chair` is a per-session boolean with a one-chair-per-session unique index. Any
four users can therefore form a quorate session.

**The real concern is separation of duties, not capability.** With only these four accounts, the
same procurement admin can create a tender, approve it, open the technical envelopes, evaluate the
bids, sit on the committee that opens the commercial envelopes, and read the prices. The controls
the system enforces between *roles* are not enforced between *people* here, because one person
holds all the roles. The spec's separation of duties is intact in code and absent in configuration.

`SYSTEM_ADMIN` is the one genuine split that survives: it can recommend and finalise an award but
deliberately **cannot** see commercial detail (`commercial:view` withheld). Worth confirming during
the lifecycle test that the award flow is actually usable under that restriction.

Assigning distinct real staff to `APPROVER`, `TECHNICAL_EVALUATOR` and
`COMMERCIAL_COMMITTEE_MEMBER` is a governance decision for the owner, not a prerequisite to
operate.

> **Corrected 2026-08-22.** An earlier revision of this section called production "🔴 Blocking —
> cannot complete a tender". That was wrong: it inferred capability from role names without reading
> the grants. Recorded rather than quietly deleted, because inferring permissions from role names
> is exactly the mistake this table exists to prevent.

## 🔴 Open defects found by the 2026-08-22 dev lifecycle run

Both are server-side validation gaps on regulated actions. Both are a one-line DTO fix. Neither is
a permission or state-machine hole — those all held.

| # | Defect | Detail |
|---|---|---|
| 1 | **Tender approval accepts no comments** | `POST /tenders/:id/approve` uses `@Body('comments')` with no DTO; `approve()` never validates it. Approving with an empty body returns `201` and the audit row records only `{"status":"APPROVED"}` — no rationale captured. |
| 2 | **Commercial envelope opening accepts no remarks** | `openEnvelopes` takes `@Body() body: { remarks?: string } = {}` — no DTO, no validation, no request-body schema in the OpenAPI doc. Opening with an empty body returns `201`. This is the most regulated action in the system; quorum/chair/permission all hold, only the *why* goes unrecorded. |

**The 2026-08-21 handover lists both under "Controls verified working".** They are not implemented.
The earlier check was almost certainly run against an already-approved tender, where the status
guard returns `400` for an unrelated reason — a verification that could not have detected the
failure it was testing for. Worth remembering the next time a control is marked verified.

**Dev audit chain broken since 2026-05-28** (`AUDIT CHAIN BREAK at row id=218`, a `TENDER_UPDATED`).
Detection and alerting work — **102** `CRITICAL` `AUDIT_CHAIN_BREAK` rows in `security_alerts`, one
per boot, none actioned. The repair tooling (`008_audit_chain_rebake_2026-05-23.sql`,
`rebake-audit-chain.js`, the RCA) was deleted in the 2026-08-21 sync; recoverable at `b37170f`.
**Production is unaffected** — `Audit chain verified — 41 rows OK`.

## Pending backlog

### Documentation
- `docs/user-guides/VENDOR_GUIDE.md` step 6 predates Commercial Terms — refresh it, then re-run
  `scripts/seed_role_guides.sh` so the generated role-guide PDFs match.
- Backup/restore runbook and an on-prem deployment runbook are both still unwritten
  (`scripts/backup_ctmp_db.sh` exists; the procedure around it does not).

### Testing
- `qa/playwright/tests/commercial-terms.spec.ts` was written but **has never executed** — this box
  has no `node_modules` for Playwright and no registry access. It runs in CI.
- Last full CI result: **27/27 passing** (run 26126511123, 2026-05-20). The Commercial Terms spec
  postdates it, so the suite has not been green *with that spec included*.
- **No automated test covers the Arabic screens at all.** Every Arabic verification so far has been
  a scripted browser check run by hand (screenshots, anchor counting per page and per tab). Those
  scripts live in the session scratchpad, not in the repo — so the checks that caught the KPI-link
  and month-name bugs are not repeatable by anyone else. Worth promoting into `qa/playwright`.
- No manual UAT suite; no API test plan.

### Known gaps and deliberate non-features

- **There is no scheduler.** Nothing auto-transitions a tender when its deadline passes. The
  deadline filter hides expired tenders from vendors, but an admin still closes tenders by hand.
  This is the single biggest "looks broken but isn't" item for a newcomer.
- **Arabic screens are read-only by design.** `/executive/tenders` and the tender/bid detail screens
  have no Arabic version, so as of 2026-08-21 every drill-down on the Arabic pages is disabled
  rather than pointed at an English screen. Arabic rows still navigate to Arabic profiles. Making
  the tiles clickable again means translating `/executive/tenders` first.
- Vendor audit-log entries show the vn-nginx IP, not the real client IP (two proxy hops; the API
  runs `trust proxy 1`). Bump to `2` if real client IPs are needed.
- Vendor/report branding logos are SVG; emails use a rasterised PNG of the vendor logo.

### Open product/legal questions (unanswered since May 2026)
1. Which vendor events should trigger notifications (publication, clarification, bid receipt, award)?
2. Audit-log retention — keep forever, or archive/purge after N years?
3. Commercial file storage — permanent bucket, or temporary with cleanup?
4. Is MFA optional or mandatory for vendor self-registration?
5. Is there an appeals process for a rejected late submission?

---

## Phase history

| Phase | Status | Deliverable |
|---|---|---|
| 0 — Foundation | complete | Repo structure, agent guides, decision log |
| 1 — Database | complete | PostgreSQL schema, seed data |
| 2 — API contract | complete | OpenAPI 3.1, Spectral-linted |
| 3 — Backend | complete | NestJS API, 25 modules, AD + local auth, hash-chained audit |
| 4 — Admin portal | complete | Next.js 15, full lifecycle UI |
| 5 — Vendor portal | complete | Registration, bid wizard, clarifications |
| 6 — Infrastructure | complete | Docker Compose, deployment scripts |
| 7 — QA & security | complete | Playwright e2e + CI (27/27 at last full run) |
| 8 — Documentation | ongoing | This consolidation, 2026-08-21 |
| 9 — Production deployment | complete | Both servers live since June 2026 |
| 10 — Arabic management area | complete, in production | `/executive-ar/**` + migrations `054`/`055`, plus two same-day fixes |

### Not yet started
Penetration testing · performance/load testing · legal & compliance review of spec conformance ·
formal backup/restore drill.
