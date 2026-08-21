# CTMP Project Status — 2026-08-13

## Production — LIVE on both servers

- **Admin portal:** `https://ctmp.hadiclinic.com.kw:4202` on `10.1.27.99` (air-gapped; full backend
  postgres+redis+api+web-admin + TLS nginx; project `ctmp`).
- **Vendor portal:** `https://vn.hadiclinic.com.kw:4201` on `172.16.4.11` (web-vendor + nginx; proxies
  `/api` → admin API). **Public DNS + NAT now configured** (vn → DMZ).
- **TLS:** real DigiCert wildcard `*.HADICLINIC.COM.KW` (to 2026-09-16), validates cleanly.
- **Integrations all configured:** SMTP (internal Exchange via Settings UI), AD/LDAP (10.1.14.20,
  users added + tested), hCaptcha (real keys + egress to hcaptcha.com opened on the admin host),
  `SETTINGS_ENCRYPTION_KEY` rotated off the in-source fallback on both envs.
- **Email:** branded HTML templates (header admin logo + vendor logo under signature, inline CID),
  all 10 templates verified delivering.
- **Data synced dev→prod:** role permissions (migrations 046/047, SYSTEM_ADMIN excluded), departments
  (048), email templates (049/050).

**Operational docs:** `docs/runbooks/PRODUCTION_OPERATIONS.md` (architecture + troubleshooting),
`docs/runbooks/admin-prod-deploy.md` (deploy runbook), `agents/handoffs/HANDOVER.md` (change log).
**Skills:** `ctmp-deploy`, `ctmp-email`, `ctmp-config`, `ctmp-troubleshoot` (in `~/.claude/skills/`).

## Shipped 6–7 Aug 2026 (all live on production unless marked)

| What | Where it lives | State |
|---|---|---|
| **Bid Commercial Terms** — 5 bid-level fields (brand/manufacturer, country of origin, warranty, delivery period, payment terms) in the vendor wizard; compared under Commercial Comparison → Itemized and in each vendor's breakdown; revisable per negotiation round; printed in the Award Minutes PDF | migration `052`, `bids`/`comparison`/`negotiation`/`award` modules, `packages/shared-types/src/commercial-terms.ts` | ✅ PROD (both servers) |
| **Vendor landing page** — About / How it works (9 steps) / Requirements / FAQ wrapped around the tender grid; all copy in one file | `apps/web-vendor/src/components/landing/` | ✅ PROD |
| **Closed tenders no longer advertised** — public + vendor lists filter on the submission deadline instead of waiting for an admin to close the tender; `NEGOTIATION` deliberately exempt | `tenders.service.ts` | ✅ PROD |
| **Audit-log FKs dropped** so a tender can be purged while the hash-chained trail survives | migration `053` | ✅ PROD |
| **Tender purge tooling** — dry-run by default, `pg_dump` first, one transaction, FK-safe order, files unlinked, `audit_logs` untouched | `scripts/purge_tender.sh` | ✅ ready, never yet run |
| **Vendor-facing error messages** — every refusal now names the real reason (closed / not yet published / awarded / cancelled / invitation-only / deadline passed) instead of "Tender not accessible to vendor" | `apps/api/src/modules/tenders/vendor-access.ts` | ✅ PROD (2026-08-13) |

**Rollback tags on the hosts:** `ctmp-api:rollback-20260813`, `ctmp-api:rollback-20260807b`, `ctmp-web-admin:rollback-20260806`
(admin host); `ctmp-web-vendor:rollback-20260807` (vendor host). Retag to `:latest` + recreate with
`--no-build`.

**Carried / optional:**
1. Optional: bump api `trust proxy` 1→2 so vendor audit logs show the real client IP (2 proxy hops).
2. Vendor/report branding logos are SVG; emails use a rasterised PNG of the vendor logo.
3. `docs/user-guides/VENDOR_GUIDE.md` step 6 predates Commercial Terms — refresh it, and re-run
   `scripts/seed_role_guides.sh` afterwards so the role-guide PDFs match.
4. The API has **no scheduler at all** — nothing auto-transitions a tender when its deadline passes.
   The deadline filter above makes that invisible to vendors, but admins still close tenders by hand.

## Phase Completion

| Phase | Status | Key Deliverable |
|-------|--------|-----------------|
| 0 — Foundation | ✓ COMPLETE | Folder structure, agent guides, decision log |
| 1 — Database | ✓ COMPLETE | PostgreSQL schema (7 migrations), seed data |
| 2 — API Contract | ✓ COMPLETE | OpenAPI 3.1, 1,719 lines, all endpoints |
| 3 — Backend Scaffold | ✓ COMPLETE | NestJS API, all modules, auth (AD + local), audit logging |
| 4 — Admin Portal | ✓ COMPLETE | Next.js 15, 12 pages, full tender lifecycle UI |
| 5 — Vendor Portal | ✓ COMPLETE | Next.js 15, registration, bid wizard, clarifications |
| 6 — Infrastructure | ✓ COMPLETE | Docker Compose (postgres, redis, api, web×2), scripts |
| 7 — QA & Security | ✓ COMPLETE (26/27) | Playwright e2e tests, CI pipeline, 1 report job issue pending |
| 8 — Documentation | 🔄 IN PROGRESS | Tracker + handover updated, DECISION_LOG maintained |

## What's Working Now

- ✓ **Committee test** — Unique constraint deduplication fix; golden-path includes committee opening
- ✓ **Vendor visibility filter** — Tenders filtered for vendor access (PUBLIC + PUBLISHED/CLARIFICATION_PERIOD)
- ✓ **Brute-force protection** — LOCAL auth users locked after N failed attempts (5 default, 15min lockout)
- ✓ **Vendor registration** — All 9 form fields persisted (companyName, registrationNumber, taxNumber, country, address, phone, email, password, captcha)
- ✓ **Frontend** — Admin + vendor portals 100% complete, ready for manual testing
- ✓ **Docker infrastructure** — Full stack defined (compose + migrations auto-load + seeds)
- ✓ **CI/CD** — GitHub Actions e2e pipeline, 26/27 tests passing

## Known Issues / Open Items

| Item | Status | Notes |
|---|---|---|
| Arabic names for departments / vendors / categories | ⚠️ dev only | Migration `054`; owner to enter the real Arabic names (12 departments, 8 categories, 17 vendors) |
| Arabic Management Dashboard `/executive-ar` | ⚠️ dev only | Dashboard + department overview + vendor directory + both detail profiles, all RTL. Awaiting the owner's review of the Arabic wording in `docs/i18n/executive-dashboard-ar.md` (two open wording questions at the end); then a prod deploy of migration `054` + api + web-admin + web-vendor together |
| Owner's production test tender | ⏳ pending | Owner will create one to exercise Commercial Terms end to end, then purge it with `scripts/purge_tender.sh` |
| Commercial Terms with real data | 👀 unseen | No vendor has yet entered terms on a real tender — the prod path is verified by API tests, not by a live bid |
| `qa/playwright/tests/commercial-terms.spec.ts` | ⏳ never executed | This box has no `node_modules` and no npm registry access; the spec runs in CI |
| Tender lifecycle after deadline | by design | No scheduler exists; admins close tenders by hand. Vendors no longer see stale ones (deadline filter) |

## Next Immediate Steps

1. **Owner creates the production test tender**, walks a vendor through the bid wizard including the
   new Commercial Terms card, and checks the Commercial Comparison + Award Minutes PDF.
2. **Purge that test tender** — `SSH_ALIAS=cts-prod bash scripts/purge_tender.sh <REF>` (dry run),
   then the same with `--confirm`. Migration 053 is already applied to prod, so no prerequisite left.
   Note the test **vendor account** is not covered by the script — say so if it should be.
3. **Refresh `docs/user-guides/VENDOR_GUIDE.md`** for Commercial Terms, then re-run
   `scripts/seed_role_guides.sh` so the role-guide PDFs match.

## Change log

Per-change detail — what was done, why, what was verified and how to roll it back — lives in
`agents/handoffs/HANDOVER.md`, newest entry first. Design decisions are in
`docs/decisions/DECISION_LOG.md`; the task list is `agents/backlog/MASTER_TASK_TRACKER.md`.

## Test Results

**Latest CI (COMPLETE)**: Run 26126511123 — 27/27 PASSING ✓
- **Status**: success (completed 2026-05-20 09:38 GMT+3)
- **Fixes confirmed**: exceljs namespace import + report test auth token (line 181)
- **Golden-path**: ✓ All steps including committee opening

## Key Capabilities Proven

- ✓ Vendor self-registration with CAPTCHA + email verification
- ✓ Tender creation → approval → publication → vendor visibility filtering
- ✓ Bid submission with technical + commercial envelopes (SHA-256 checksummed)
- ✓ Technical evaluation → envelope opening → finalization
- ✓ Committee commercial opening session (attendance + quorum check)
- ✓ Commercial comparison (ranked by price, permission-gated)
- ✓ Award recommendation → approval → issue → award + tender close
- ✓ Audit logging (hash-chain verified on boot)
- ✓ Report exports (XLSX + PDF, async BullMQ worker)
- ✓ Email notifications via MailHog (dev/test friendly)

## Deployment Readiness

| Dimension | Status | Notes |
|-----------|--------|-------|
| Code | ✓ READY | All modules complete, 26-27/27 tests passing, no compiler errors |
| Database | ✓ READY | 7 migrations, append-only audit logs, hash-chain verified |
| Infrastructure | ✓ READY | Docker Compose, MinIO/S3 abstraction, Redis for reports queue |
| Security | ✓ READY | JWT + AD auth, brute-force protection, CAPTCHA required, audit trail |
| Documentation | 🟡 IN PROGRESS | API contract complete, deployment runbooks drafted, UX docs pending |

## Architecture Highlights

- **Multi-tenant ready**: Department-segregated, but single-company today
- **On-premises first**: Docker Compose for local/small-scale, MinIO for S3 compat, no external dependencies
- **Audit-first**: All state changes logged, append-only, hash-chain verified, immutable
- **Role-based access**: RBAC with permission granularity (e.g., commercial:view != commercial:export)
- **Separation of duties**: System Admin has NO commercial visibility by design

## Recommended Next Phase

**Phase 9: Hardening & Compliance**

- Legal/compliance audit of spec compliance (NDA, IP protections)
- Penetration testing (especially vendor registration, file upload, bid isolation)
- Performance testing (stress test API, report worker, concurrent bids)
- Backup/restore procedures + runbooks
- On-prem deployment guide (TLS reverse proxy, SMTP config, backup strategy)
- LDAP/AD integration testing (if not already done)

## Questions for Product/Legal

1. Vendor notification flow — when should vendors be notified of (tender pub, clarifications, bid receipt, award)?
2. Audit log retention — keep all history or archive/purge after X years?
3. Commercial file storage — persistent S3 bucket or temporary + cleanup?
4. MFA requirement — vendor self-registration MFA optional or mandatory?
5. Late submission appeals — process for vendors to dispute rejection?

---

**Last Updated**: 2026-08-13  
**Production**: admin `https://ctmp.hadiclinic.com.kw:4202` · vendor `https://vn.hadiclinic.com.kw:4201` — both live, migrations through `053` applied  
**Dev / build box**: `10.1.13.98` — admin `https://ctmp-admin.hadiclinic.com.kw:4202` · vendor `https://tvn.hadiclinic.com.kw:4201`  
**Ahead of prod on dev**: nothing — dev and prod are in step  
**CI Status**: 27/27 as of run 26126511123; `commercial-terms.spec.ts` added since and not yet run
