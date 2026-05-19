# CTMP Playwright Suite

End-to-end browser + API tests against a live Docker stack.

## Coverage

| Spec | Focus |
|------|-------|
| `tests/golden-path.spec.ts` | Full lifecycle register → award (admin token forge-signed; email force-verified via DB). |
| `tests/late-submission.spec.ts` | Past-deadline tender + admin grants exception + vendor bid lands as `LATE_SUBMITTED`. |
| `tests/email-verification.spec.ts` | MailHog round-trip: register → poll inbox → extract 64-char token → `/vendor-auth/verify-email` → `email_verified_at` populated. |
| `tests/multi-vendor.spec.ts` | 3 vendors with different scores + prices; below-threshold bid filtered out of commercial comparison; ranks by price. |
| `tests/commercial-visibility.spec.ts` | Per-permission token shapes verify `commercial:view` gate and `commercial:export` flag on the comparison response. |

All specs are `test.describe.serial` and use disjoint `TDR-QA-*` references + vendor emails so they don't trample each other when the runner re-orders.

### Golden-path coverage

`tests/golden-path.spec.ts` — single serial spec walking the full procurement lifecycle:

1. Vendor self-registers via the vendor portal UI (CAPTCHA token fixture-stubbed).
2. Email is force-verified directly in PostgreSQL (real flow exercised by a separate test; here we skip the mail round-trip).
3. Admin logs into the admin portal and approves the vendor.
4. Vendor logs in, opens the tender, runs the 4-step bid wizard (upload technical + commercial fixtures), submits, sees the receipt.
5. Admin closes submissions, opens technical envelopes, records a passing technical evaluation, finalizes results.
6. Admin creates a committee session, records attendance (quorum met), opens commercial envelopes, records a commercial evaluation.
7. Admin recommends + approves + issues the award. Tender transitions to `TENDER_CLOSED`.
8. Audit-log spot check: every CRITICAL/HIGH state-changer is present.

## Running

Prereqs:
- Docker stack up from `infrastructure/docker/` (see its README).
- Database reachable on `localhost:5432` with credentials matching `QA_DATABASE_URL` env var (default `postgresql://ctmp:ctmp_dev@localhost:5432/ctmp`).
- API on `localhost:3000`, admin portal on `localhost:4200`, vendor portal on `localhost:4300`.

```bash
cd qa/playwright
pnpm exec playwright install --with-deps chromium    # one-time
pnpm test                                             # runs once
pnpm test:headed                                      # watch the browser
pnpm test:report                                      # open HTML report
```

## Environment

Override defaults via env vars:

| Var | Default | Notes |
|-----|---------|-------|
| `QA_API_URL` | `http://localhost:3000` | NestJS API |
| `QA_ADMIN_URL` | `http://localhost:4200` | Admin portal |
| `QA_VENDOR_URL` | `http://localhost:4300` | Vendor portal |
| `QA_DATABASE_URL` | `postgresql://ctmp:ctmp_dev@localhost:5432/ctmp` | Direct DB access for seed + reset |
| `QA_MAILHOG_URL` | `http://localhost:8025` | MailHog API base (email-verification spec only) |
| `QA_JWT_SECRET` | `JWT_SECRET` env or `qa-jwt-secret` | Used by `signAdminToken*` helpers. **Must match the api's `JWT_SECRET`** or 401s. |
| `QA_VENDOR_JWT_SECRET` | `VENDOR_JWT_SECRET` env or `qa-vendor-jwt-secret` | Same caveat as above. |

## Notes

- Suite runs `workers: 1` and `fullyParallel: false` because it mutates shared global state (admin user, tender, vendor).
- `beforeAll` resets the QA vendor + tender each run so reruns are idempotent.
- The audit-log assertion guards the most important hash-chained events. The full chain integrity is verified by the api unit tests, not here.
- Document fixtures are tiny text buffers (`helpers/fixtures.ts`); the upload endpoint stores raw bytes + computes SHA-256 so the buffer content doesn't matter.
- Mail-based flows (vendor email verification, password reset) skip the inbox round-trip and use DB short-circuits to keep the suite fast. A separate `email-verification.spec.ts` should drive the full MailHog round-trip (out of scope here).
