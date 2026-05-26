# Phase 9 Deployment Validation Report

**Date:** 2026-05-20
**Environment:** Remote Ubuntu Server (10.1.13.98)
**Test Tool:** Playwright (automated browser testing)
**Final Run:** 2026-05-20T09:48 UTC

---

## Executive Summary

**Final Test Results: ✅ 12/12 PASS**

All deployment validation tests pass against the live stack on 10.1.13.98. Three root-cause bugs were identified and fixed during this validation cycle.

---

## Bugs Found & Fixed

### Bug #1: Next.js bundles baked with `localhost:3000` (CRITICAL)

**Symptom:** Admin login form submitted but never navigated to dashboard. Vendor registration form appeared to succeed but emails were not delivered.

**Root Cause:**
`NEXT_PUBLIC_API_URL` is inlined at Next.js build time, not at container start. The Dockerfiles did not accept it as a build arg, so `pnpm exec next build` used the fallback `http://localhost:3000` from `apps/web-*/src/lib/api.ts`. When the user's browser loaded the portal from `http://10.1.13.98:4200`, the bundled JS called `fetch('http://localhost:3000/api/v1/...')` — hitting the user's own machine, not the server.

**Fix (3 files):**
- `infrastructure/docker/web-admin.Dockerfile` — added `ARG NEXT_PUBLIC_API_URL` + `ENV` in build stage
- `infrastructure/docker/web-vendor.Dockerfile` — same change
- `infrastructure/docker/docker-compose.yml` — added `build.args.NEXT_PUBLIC_API_URL` for both services
- `infrastructure/docker/.env` (server) — `PUBLIC_API_URL=http://10.1.13.98:3000`, `CORS_ORIGINS=http://10.1.13.98:4200,http://10.1.13.98:4300`

Rebuilt and redeployed both frontend containers. Verified bundle now contains `http://10.1.13.98:3000`.

---

### Bug #2: Tenders list API parameter mismatch (HIGH)

**Symptom:** `GET /api/v1/tenders?pageSize=10` returned `400 Bad Request: property pageSize should not exist`. Admin dashboard and tenders page silently failed to load data.

**Root Cause:**
The OpenAPI contract specifies `pageSize`. The admin frontend correctly sends `pageSize`. But `apps/api/src/modules/tenders/dto/list-tenders.dto.ts` declared the field as `limit`, and NestJS `forbidNonWhitelisted: true` rejected the unknown `pageSize` property.

**Fix (2 files):**
- `apps/api/src/modules/tenders/dto/list-tenders.dto.ts` — renamed `limit` → `pageSize`
- `apps/api/src/modules/tenders/tenders.service.ts` — updated `query.limit` → `query.pageSize`

Rebuilt and redeployed API container. Verified `GET /api/v1/tenders?pageSize=10` now returns 200.

---

### Bug #3: Playwright tests using wrong API conventions (TEST-ONLY)

**Symptom:** API tests in the original test suite reported 404 / 401 errors.

**Root Cause:**
- Tests sent `email` field; API expects `username`
- Tests read `access_token`; API returns `accessToken`
- Tests called `/v1/auth/login`; API exposes `/api/v1/auth/login`

**Fix (1 file):**
- `qa/playwright/tests/phase-9-deployment-validation.spec.ts` — updated all API paths, field names, and response keys; also switched MailHog email lookup to use MailHog's `/api/v2/search` endpoint (more reliable than UI text search).

---

## Working Components ✅

| Component | Status | Verified |
|-----------|--------|----------|
| API Health Endpoint | ✅ | `GET /api/v1/health` returns `{status: ok}` |
| Admin Portal | ✅ | Login → dashboard navigation works |
| Vendor Portal | ✅ | Registration form submits and triggers email |
| Email Service (MailHog) | ✅ | Verification email delivered, subject "Verify your CTMP vendor account" |
| Admin Authentication | ✅ | Returns valid JWT with 14 SYSTEM_ADMIN permissions |
| Tender Create Form | ✅ | Reachable at `/tenders/new`, fields render, save button present |
| Tenders List API | ✅ | `GET /api/v1/tenders?pageSize=10` returns 200 |
| Vendors List API | ✅ | Returns 3 registered vendors from test runs |
| Docker Stack | ✅ | All 7 containers healthy |
| Database | ✅ | Seeded with 14 roles, 56 permissions, admin user |

---

## Files Changed (this validation cycle)

```
infrastructure/docker/web-admin.Dockerfile         (+2 lines)
infrastructure/docker/web-vendor.Dockerfile        (+2 lines)
infrastructure/docker/docker-compose.yml           (+4 lines, -2 lines)
apps/api/src/modules/tenders/dto/list-tenders.dto.ts   (limit → pageSize)
apps/api/src/modules/tenders/tenders.service.ts        (query.limit → query.pageSize)
qa/playwright/tests/phase-9-deployment-validation.spec.ts  (new)
qa/PHASE_9_VALIDATION_REPORT.md                    (new)
```

Remote `.env` updated on server only (not committed to git — secrets file).

---

## Manual Testing Roadmap (still recommended)

The Playwright suite validates the **happy path** for portals and APIs. A human should still drive these flows in a browser:

**Admin Portal (http://10.1.13.98:4200)** — login `admin@ctmp.local / Admin@12345!`
- [ ] Create tender → fill all 4 wizard steps
- [ ] Move tender Draft → Internal Review → Approved → Published
- [ ] Approve a pending vendor
- [ ] Close submissions, open technical envelopes
- [ ] Schedule committee session, mark attendance
- [ ] Open commercial envelopes via committee
- [ ] Award recommendation → approval → award

**Vendor Portal (http://10.1.13.98:4300)**
- [ ] Register new vendor
- [ ] Click verification link from MailHog (http://10.1.13.98:8025)
- [ ] Login with vendor credentials
- [ ] Browse published tenders
- [ ] Submit a bid (technical + commercial documents)

**Pre-Production**
- [ ] Configure real hCaptcha provider + key
- [ ] Configure AD bind credentials (AD_URL, AD_BIND_DN, AD_BIND_PASSWORD)
- [ ] Rotate MinIO root password from dev defaults
- [ ] Set up production email service (replace MailHog)

---

## Open Observations

These are not test failures but were noted during validation:

1. **Empty verification URL in email body** — The verification email contains a verification token but the "Please confirm by visiting:" link is empty. Token works but UX is broken. Probably needs `VENDOR_PORTAL_URL` env var to assemble the link.

2. **Test fixture leakage** — Each test run creates a new vendor record. Database has 3 PENDING_VERIFICATION vendors from prior runs. A cleanup step in the test suite would be helpful for repeatable runs.

3. **CAPTCHA stub** — Still configured as `CAPTCHA_PROVIDER=stub`. Acceptable for dev/QA; must change before production.

4. **API doesn't run migrations on start** — Confirmed via existing seeds. If schema changes ship in future phases, the deploy must include a migration step.

---

**Test Framework:** Playwright v1.49.0
**Browser:** Chromium (headless)
**Report Updated:** 2026-05-20T12:48 GMT+3
