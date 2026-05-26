# CTMP End-to-End Manual Test Plan

A full procurement walkthrough — vendor registration through tender award and closure. Designed to be done by one tester (you), in one sitting (~90 minutes), against the deployed staging environment.

This document is split into **18 sections** following the real procurement lifecycle. Each section explains *why* the step exists (the business rule it enforces) before telling you what to click, so you understand what you're verifying — not just whether a button works, but whether it enforces the right rule.

If a step fails, write the failure mode in the **Notes** column and move on. Don't stop on the first failure — most steps are independent enough that later sections still tell you useful things.

---

## Table of Contents

1. [Environment, accounts, test data](#section-0--environment-accounts-test-data)
2. [Vendor self-registration](#section-1--vendor-self-registration)
3. [Email verification](#section-2--email-verification)
4. [Admin approves the vendor](#section-3--admin-approves-the-vendor)
5. [First vendor login + profile](#section-4--first-vendor-login--profile-completion)
6. [Admin creates a tender (Draft)](#section-5--admin-creates-a-tender-draft)
7. [Internal review and approval](#section-6--internal-review--approval)
8. [Publishing the tender](#section-7--publishing-the-tender)
9. [Vendor discovers the tender](#section-8--vendor-discovers-the-tender)
10. [Clarifications](#section-9--clarifications-vendor-asks-procurement-answers)
11. [Vendor prepares the bid (technical + commercial envelopes)](#section-10--vendor-prepares-the-bid)
12. [Vendor submits the bid](#section-11--vendor-submits-the-bid)
13. [Submission closure + late-bid gate](#section-12--submission-closure--late-bid-gate)
14. [Technical envelope opening + evaluation](#section-13--technical-envelope-opening--evaluation)
15. [Committee commercial opening](#section-14--committee-commercial-opening)
16. [Commercial comparison + award recommendation](#section-15--commercial-comparison--award-recommendation)
17. [Award approval + issuance](#section-16--award-approval--issuance)
18. [Audit log + reports](#section-17--audit-log--reports)
19. [Edge cases](#section-18--edge-cases-optional)

---

## Section 0 — Environment, accounts, test data

### Why this section exists

Procurement systems have multiple roles with intentionally segregated permissions. **System Admin does NOT automatically receive commercial bid visibility** — that's a deliberate separation of duties to enforce procurement compliance. You'll need at least one admin account plus a vendor account; some sections also need a committee member.

If you start with a clean database, you may need an admin account seeded for you. If you're testing the staging server (`10.1.13.98`), the accounts below already exist from prior test runs.

### URLs

| URL | Purpose |
|-----|---------|
| https://vn.hadiclinic.com.kw:4201 | Vendor portal (redesigned, dark theme) |
| https://ctmp-admin.hadiclinic.com.kw:4202 | Admin portal (still light theme) |
| http://10.1.13.98:8025 | MailHog — read every outbound email here (verification, password resets, notifications) |
| http://10.1.13.98:4200 | Admin portal over plain HTTP (same content, no TLS) — use only if HTTPS hostname doesn't resolve from your network |
| http://10.1.13.98:4300 | Vendor portal over plain HTTP (same content, no TLS) — same caveat |

### Accounts you'll need

| Role | Email | Password | What they do here |
|------|-------|----------|-------------------|
| **System Admin** | `admin@ctmp.local` | `Admin@12345!` | Creates tenders, approves vendors, publishes, runs evaluations, issues awards |
| **Committee Member** | `committee@ctmp.local` | `Admin@12345!` | Sits on the commercial-opening session. Needed for quorum (≥2 present) |
| **Vendor** (you'll create this fresh) | `e2e-vendor-<your-initials>@example.com` | Pick a strong one | Registers, submits bid, waits for award |

> Use a fresh vendor email per test run so you can re-verify the full registration flow. If you're re-testing, append a timestamp: `e2e-vendor-jd-2026-05-24@example.com`.

### Test data you'll create

| Item | Suggested value | Where it's used |
|------|-----------------|-----------------|
| Vendor company name | `E2E Test Vendor LLC` | Registration |
| Primary tender | `E2E Pilot Renovation 2026` | Sections 5–17 |
| Tender department | `Facilities Management` | Section 5 |
| Submission deadline | **Today + 7 days at 16:00** | Section 5 — gives you time to bid, room to test late submissions |
| Estimated budget | `100000` (KWD) | Section 5 |
| Bid price (technical) | A 1-line text file `technical.txt` | Section 10 |
| Bid price (commercial) | A 1-line text file `commercial.txt` | Section 10 |
| Commercial offer amount | `87500` | Section 15 |

### Domain vocabulary cheat-sheet

The tender moves through 13 states, in this exact order (one-way, except for `Cancelled`/`Suspended`/`Archived` exits):

```
Draft → Internal Review → Approved → Published → Clarification Period
   → Submission Closed → Technical Opening → Technical Evaluation
   → Commercial Sealed → Committee Commercial Opening
   → Commercial Evaluation / Comparison → Award Recommendation
   → Awarded → Tender Closed
```

Two state pairs catch testers out:
- **`Submission Closed` ≠ `Tender Closed`.** Submission Closed just means vendors can't submit any more bids — the procurement work has just started. `Tender Closed` is the very last state.
- **`Commercial Sealed` is an envelope state, NOT a tender state.** It runs *alongside* the tender lifecycle. After the technical pass, every commercial envelope sits in `SEALED` until a committee opens them via formal session.

Bid envelope statuses: `DRAFT | SUBMITTED | SEALED | OPENED | LOCKED`.

---

## Section 1 — Vendor self-registration

### Why this section exists

Vendors must self-register so procurement teams don't manually create vendor accounts (that wouldn't scale and would leave procurement on the hook for credentials). Self-registration is **gated** by:
1. **CAPTCHA** server-side — required by procurement compliance to block bots from spamming the system.
2. **Email verification** — proves the registrant controls the email address.
3. **Admin approval** — a human at the procurement desk decides whether this vendor should be in the system at all.

Skipping any of these would let anyone submit bids on real procurement, which is a compliance failure.

### Preconditions

- You're not logged in anywhere.
- You have access to MailHog at http://10.1.13.98:8025 in another tab.
- Pick a fresh vendor email (see Section 0).

### Steps

| # | Action | Expected Result | Why this matters | Result | Notes |
|---|--------|-----------------|------------------|--------|-------|
| 1.1 | Open https://vn.hadiclinic.com.kw:4201 in an incognito window | Browser lands on `/login`. Dark navy background, `VENDOR • CONNECT` wordmark, glass-effect card | If you see a light theme or a `Lock` icon header, the redesigned bundle isn't loaded — page is stale | | |
| 1.2 | Click **Register as vendor** at the bottom of the login card | Redirects to `/register`. Form has two sections: **Company Information** + **Primary Contact** | Splitting these two sections enforces that a vendor is a company entity that has *contact people* — not a person. Reflects how procurement records actually need to bind to legal entities. | | |
| 1.3 | Fill **Company Name** = `E2E Test Vendor LLC`. Leave Registration Number / Tax Number / Country / Phone / Address blank. | All required fields show an electric-blue asterisk; optional ones don't | Required field marking should be visually obvious so the vendor knows what's blocking submission | | |
| 1.4 | In **Primary Contact**, fill `Contact Full Name`, `Contact Email` (your fresh email), `Password` (12+ chars, mixed case + digit + symbol) | Hints under password field tell you the requirement | Weak passwords on vendor accounts are a common breach vector — password policy must be visible and enforced | | |
| 1.5 | Solve the **hCaptcha** widget at the bottom | "Verify you are human" → checkmark appears | hCaptcha is hostname-bound to `vn.hadiclinic.com.kw` — if you're on the IP-address URL it will fail to load. Switch to the HTTPS hostname. | | |
| 1.6 | Click **Submit Registration** | Page transitions to a success state: "Registration Submitted — Verification email sent to ..." with a green check icon | Vendor must be told that *more is required* — they shouldn't think they can immediately log in. | | |

### What this proves

- `/register` reaches the dark-theme form and lets you fill it.
- hCaptcha widget loads against the correct hostname.
- Server-side captcha verification passes (the API logs a SUCCESS row in `captcha_verification_logs`).
- A vendor row is created in the DB with status `PENDING`, plus a `vendor_users` row with `email_verified_at = NULL`.
- A verification email is enqueued and dispatched to MailHog.

### Failure modes to look for

- **No CAPTCHA visible** → bundled hCaptcha site key may be wrong, or the script is blocked by a Content-Security-Policy header. Page is unbiddable.
- **"CAPTCHA failed to load"** error after success → hostname mismatch, see step 1.5.
- **400 "company name already taken"** → a prior test left a vendor with the same name. Either change the name or have an admin delete the old row first.

---

## Section 2 — Email verification

### Why this section exists

The verification email is the **proof-of-control** step — without it, anyone could register with anyone else's email. The verification token is single-use (`vendor_email_verification_tokens.used_at` is set on consumption) so a leaked or replayed link is useless. The token is 32 random bytes (64 hex chars) so it's unguessable.

### Steps

| # | Action | Expected Result | Why this matters | Result | Notes |
|---|--------|-----------------|------------------|--------|-------|
| 2.1 | Open http://10.1.13.98:8025 in another tab. Click into the most recent message addressed to your vendor email. | Subject line is something like "Verify your CTMP vendor account". Body contains a verification link. | All outbound mail goes to MailHog in this environment — no real SMTP. If MailHog is empty, the API's SMTP config is wrong. | | |
| 2.2 | Copy the verification URL from the email body. It looks like `https://vn.hadiclinic.com.kw:4201/verify-email?token=<64-hex-chars>` | URL has the form above | If the URL points to `localhost:4300` instead, the API's `VENDOR_PORTAL_URL` env var wasn't set correctly when the email was sent. Vendors in the real world would get an unusable link. | | |
| 2.3 | Open the URL in the same incognito window | Page transitions through three states: loading → success ("Email verified") OR error | The page should never get stuck on "loading" — that means the API call is hanging | | |
| 2.4 | **Replay attack:** open the same URL again in a new tab | Page shows an error state: "Token already used" or "Verification failed" | Tokens MUST be single-use. If the second click also says success, the token isn't being marked consumed → critical security flaw | | |

### What this proves

- Email infrastructure works (API → MailHog → you can read it).
- `verifyUrl` is correctly built using `VENDOR_PORTAL_URL`.
- Verification flips `vendor_users.email_verified_at` from NULL → now().
- Tokens are single-use (the second click doesn't re-verify).

### Verify via DB (optional)

Ask an admin or your own SQL access:
```sql
SELECT email, email_verified_at FROM vendor_users WHERE email = '<your-test-email>';
-- Should show a non-NULL timestamp
SELECT used_at FROM vendor_email_verification_tokens vt
  JOIN vendor_users vu ON vu.id = vt.vendor_user_id
  WHERE vu.email = '<your-test-email>' ORDER BY vt.created_at DESC LIMIT 1;
-- Should show used_at populated after step 2.3
```

---

## Section 3 — Admin approves the vendor

### Why this section exists

Email verification proves the vendor controls their inbox, but it doesn't prove they're a *legitimate procurement participant*. A human admin must approve them. This is the procurement team's last gate before the vendor can see live tenders. Approval is **audited** — there's a row in `audit_logs` showing which admin approved which vendor at which time.

### Steps

| # | Action | Expected Result | Why this matters | Result | Notes |
|---|--------|-----------------|------------------|--------|-------|
| 3.1 | In a new tab, open https://ctmp-admin.hadiclinic.com.kw:4202 and log in as `admin@ctmp.local` / `Admin@12345!` | Admin dashboard loads | If admin login fails, check whether AD bind is up — internal users authenticate against AD, not the local DB. For staging where AD isn't reachable, `admin@ctmp.local` is set up as a LOCAL-auth user as a workaround. | | |
| 3.2 | Open **Vendors** in the sidebar | List of vendors, filterable by status | All-vendor visibility is important so admins can audit *anyone* in the directory, not just pending ones | | |
| 3.3 | Filter by status = `PENDING` (or scroll to find your vendor) | Your `E2E Test Vendor LLC` row appears with status `PENDING` | If status is `PENDING` but email_verified_at is still NULL, approval should be **blocked** — verify the next step | | |
| 3.4 | Click your vendor row to open the detail panel | Detail shows company name, primary contact, registration timestamp, **email verified: Yes/No** | Admin should see that the vendor verified their email before approving — otherwise they're approving someone who hasn't proven control of the inbox | | |
| 3.5 | Click **Approve** | Status flips to `APPROVED`. A toast/notification confirms approval. | The button should require explicit confirmation in production to prevent fat-fingering — verify if there's a confirm dialog | | |

### Verify the audit log captured this

Open **Audit Log** in the sidebar, filter by Event Type `VENDOR_APPROVED` (or similar). The most recent row should show:
- Actor name: `CTMP Admin` (not a UUID prefix)
- Entity: your vendor's UUID
- IP Address: your real client IP (not `127.0.0.1`)
- Timestamp: just now

If actor name shows as `e7f2677b…` (a UUID prefix) or IP shows `—`, two recent fixes haven't been deployed: see HANDOVER 2026-05-24 audit log fixes.

### Failure modes

- **Vendor not in PENDING list** → email isn't verified yet, or the DB insert failed
- **"Approval not allowed" error** → vendor's email isn't verified (the API blocks approval until `email_verified_at IS NOT NULL`)
- **No audit row written** → audit service connection issue; check `audit_logs` table directly

---

## Section 4 — First vendor login + profile completion

### Why this section exists

The vendor needs to verify they can actually log in *after* approval, and that the portal shows them the right state (chip says "Verified", not "Pending"). Profile fields like company address, phone, etc. are blank from registration — vendors should be able to fill them in before bidding.

### Steps

| # | Action | Expected Result | Why this matters | Result | Notes |
|---|--------|-----------------|------------------|--------|-------|
| 4.1 | Switch back to the vendor portal tab (https://vn.hadiclinic.com.kw:4201). If you're still on `/verify-email`, click **Back to Sign In**. Otherwise navigate to `/login`. | Login form visible | | | |
| 4.2 | Fill email + password (the ones from registration), click **Sign In** | Page transitions to `/dashboard`. The greeting reads "Good morning/afternoon/evening, E2E Test Vendor LLC" | The greeting confirms the JWT was issued and `/vendor-auth/me` resolved the company name | | |
| 4.3 | Look at the top-right of the nav bar | Vendor chip shows company initials + name + **green "Verified"** badge | Status badge tone tells the vendor they're cleared to bid. If badge is amber (Pending) here, something went wrong in admin approval. | | |
| 4.4 | Click **Profile** in the top nav | Profile page opens. Email is **read-only** (says "(read-only)"). MFA, status, registration date are also read-only. Company Name, Address, Phone, etc. are editable. | Vendor can change company details but cannot rewrite the email that was verified — that would defeat the verification step | | |
| 4.5 | Fill some optional fields: Company address `"123 Test St, Kuwait"`, Phone `"+965 1234 5678"`. Click **Save Changes**. | Success banner appears. Refresh the page — values persist. | Persistence to DB through `PATCH /vendor-auth/me` | | |
| 4.6 | Click **My Bids** in nav | Page loads. Stats show `Drafts: 0, Submitted: 0, Evaluated: 0, Awarded: 0`. Empty state for the table. | New vendor with no bid history = correct | | |
| 4.7 | Click **Tenders** in nav | Page lists tenders that are currently `Published` (or in `Clarification Period`). If no tenders exist yet, empty state shows. | Critical — vendor can only see tenders that procurement has published. If the vendor sees `Draft` or `Internal Review` tenders, that's a confidentiality breach. | | |

### Failure modes

- **Login redirects right back to `/login`** → the JWT cookie may have been set with `secure: true` over HTTP (browser drops it). Check the cookie domain attribute matches the URL.
- **Greeting shows "Good afternoon, there"** instead of the company name → `/vendor-auth/me` returned 401 or empty payload. Check JWT validity.
- **Profile fields blank instead of "(read-only)"** → vendor isn't authenticated; the page should redirect to `/login` instead.

---

## Section 5 — Admin creates a tender (Draft)

### Why this section exists

Tenders start in **Draft** because procurement officers shouldn't be able to publish a half-written tender to vendors. Draft is editable, can be deleted, can be sent for internal review. Once it leaves Draft, edits are restricted — for example, in `Published` you can extend the deadline but not change the budget.

### Preconditions

- Admin portal logged in as `admin@ctmp.local`.

### Steps

| # | Action | Expected Result | Why this matters | Result | Notes |
|---|--------|-----------------|------------------|--------|-------|
| 5.1 | Click **Tenders** in the admin sidebar | Tender list page opens. Top-right has **+ New Tender** button. | | | |
| 5.2 | Click **+ New Tender** | New tender form opens with empty fields | | | |
| 5.3 | Fill Title = `E2E Pilot Renovation 2026`. Pick Department = `Facilities Management` (or any). Description = `End-to-end test tender for office renovation`. Submission Deadline = **today + 7 days at 16:00**. Estimated Budget = `100000`. | All fields accept values. Deadline must be in the future. | A past deadline must be **rejected** at the form layer — otherwise the tender is born already closed. | | |
| 5.4 | Click **Save as Draft** | Saved. Status badge reads `Draft`. You're redirected to the tender detail page. Reference number `TDR-2026-XXXX` is auto-generated. | Auto-generated reference must be unique per year; check that the next tender has the next number | | |
| 5.5 | On the detail page, verify you see: status `Draft`, **Edit** and **Delete** buttons visible, **Submit for Approval** button visible | Draft has the widest action set | Draft is the only state where Delete is allowed in most procurement systems | | |

### Verify it's NOT visible to vendors

| # | Action | Expected Result | Why this matters | Result | Notes |
|---|--------|-----------------|------------------|--------|-------|
| 5.6 | Switch to the vendor tab. Click **Tenders**. Refresh. | The new tender does **NOT** appear in the list. | Drafts are confidential. A vendor seeing draft tenders would know procurement's plans before they're official. | | |

---

## Section 6 — Internal review and approval

### Why this section exists

A procurement officer can write a Draft, but they can't approve their own work — that's a separation-of-duties control. A second approver (typically a manager) must accept the tender into `Approved` before it can be published.

### Steps

| # | Action | Expected Result | Why this matters | Result | Notes |
|---|--------|-----------------|------------------|--------|-------|
| 6.1 | Back in the admin portal, on the tender detail page, click **Submit for Approval** | Status changes from `Draft` to `Internal Review`. An approval task is added to the queue. | The tender is now read-only to the creator and waiting on someone else | | |
| 6.2 | Click **Approvals** in the sidebar | List of pending approval tasks. Your tender is there, type `Tender Approval`. | All pending approvals across the system should be findable from one place | | |
| 6.3 | Click the row to expand. Enter comment `Approved for E2E test`. Click **Approve**. | Status changes to `Approved`. Task disappears from the queue. | If a separate approver role existed, this should be done by *that* user, not by the same admin — note this as a real-world consideration | | |
| 6.4 | Navigate back to **Tenders** → click the tender → verify status = `Approved` | Detail page shows `Approved`. **Publish** button is now visible. **Edit** button likely hidden or limited. | The tender is locked from major edits at this point | | |

### Rejection path (negative test, optional)

If you want to verify the reject path: create a 2nd quick tender, submit for approval, then in Approvals click **Reject** with a comment. Status should revert to `Draft` and the creator should see the rejection reason.

---

## Section 7 — Publishing the tender

### Why this section exists

`Approved → Published` is the moment the tender becomes visible to vendors. After publishing, the system also enters the **Clarification Period** where vendors can ask questions. Some implementations auto-transition through Clarification Period; others require an explicit move.

### Steps

| # | Action | Expected Result | Why this matters | Result | Notes |
|---|--------|-----------------|------------------|--------|-------|
| 7.1 | On the `Approved` tender detail page, click **Publish** | Status changes to `Published`. Notifications may be queued for all registered vendors. | This is a one-way action — there should ideally be a confirm dialog | | |
| 7.2 | Optional: check MailHog (http://10.1.13.98:8025) | A "New tender published" notification may or may not be sent — check whether your implementation does this | If notifications go out, look for them; vendor portals typically also surface a notification badge | | |

### Verify it IS now visible to vendors

| # | Action | Expected Result | Why this matters | Result | Notes |
|---|--------|-----------------|------------------|--------|-------|
| 7.3 | Switch to vendor portal → **Tenders** → refresh | The tender card appears in the grid. Status badge = `Published`. Countdown badge shows days until deadline. | Confidentiality boundary respected — vendor can now see what was hidden in Draft | | |
| 7.4 | Click the tender card | Detail page opens with: title, reference number, budget (KWD 100,000.00), description, deadline date, requirements list (if any), documents section (likely empty). **Start Bid** button is the prominent electric-blue CTA. | Budget and requirements drive the bid preparation | | |

### Failure modes

- **Tender stays at `Approved` after clicking Publish** → publish endpoint failed; check API logs and audit table
- **Vendor still doesn't see the tender** → vendor portal may be caching; do a hard refresh. If still missing, the `GET /tenders` endpoint may be filtering by something else (department restriction, visibility scope)

---

## Section 8 — Vendor discovers the tender

This is the smoke test of the vendor's main browsing flow. Already partially done in 7.3/7.4; this section drills in.

| # | Action | Expected Result | Why this matters | Result | Notes |
|---|--------|-----------------|------------------|--------|-------|
| 8.1 | On vendor portal **Dashboard**, look at the stat cards | `Open Tenders` shows ≥ 1. `Active Bids` shows 0. | Dashboard is a quick at-a-glance — should reflect real numbers from the API, not be hardcoded | | |
| 8.2 | Look at the "Recent Tenders" section on the dashboard | Your tender appears (up to 4 are shown). Click it. | Provides a fast path from landing page to bidding | | |
| 8.3 | On the tender detail page, click **← Back to Tenders** | Returns to `/tenders` list, scroll preserved | Browser back should also work — verify both | | |
| 8.4 | On the tenders list, type part of your tender's title in the search box | Search filters the list as you type | Helps when there are 20+ tenders | | |

---

## Section 9 — Clarifications (vendor asks, procurement answers)

### Why this section exists

Before the deadline, vendors often need clarifications: "Does the renovation include electrical work?" Procurement publishes the answer, sometimes only to the asking vendor (private), sometimes to all vendors (public, for fairness — so one vendor's clarification doesn't give them an information advantage).

Per the implementation, clarifications work when the tender is in **`Published`** OR **`Clarification Period`** state. (A prior bug filtered out `Published` — that was fixed in a 2026-05-21 batch and is now correct.)

### Steps

| # | Action | Expected Result | Why this matters | Result | Notes |
|---|--------|-----------------|------------------|--------|-------|
| 9.1 | In vendor portal, click **Clarifications** in the top nav | Page opens with a 2-column layout: tender selector on left (1/4), thread area on right (3/4) | Layout supports asking multiple questions on multiple tenders | | |
| 9.2 | Select your `E2E Pilot Renovation 2026` tender from the left column | Right column shows an empty thread + "Ask a question" form | First clarification on this tender — thread is empty | | |
| 9.3 | Type a question: `Is the scope limited to the ground floor, or does it include all floors?`. Submit. | Question appears in the thread with `OPEN` status chip + timestamp | Vendor knows their question was recorded | | |
| 9.4 | Switch to admin portal → **Clarifications** in sidebar | Your tender appears in the list with the question count shown | If you can't see the tender, check whether the admin filter includes `Published` status (the prior bug) | | |
| 9.5 | Click the tender, expand the thread, type reply `All floors, ground through 4th. Excludes basement.`. Set visibility to **Public**. Click **Reply**. | Reply posted, visible in the thread. Public visibility means all vendors who view this tender can see the Q+A. | Public visibility is the fairness control — see "why" above | | |
| 9.6 | Switch back to vendor portal, refresh the Clarifications page | Admin's reply is visible under the question, marked `PUBLIC` | The answer was a public clarification — anyone bidding on this tender should see it | | |
| 9.7 | (Optional) Ask another question and have the admin reply **Private**. Verify a second vendor (if you have one) does NOT see private replies. | Private reply is only visible to the asking vendor | Private is for vendor-specific compliance details that aren't relevant to others | | |

### Failure modes

- **Admin Clarifications page shows "no tenders"** → admin clarifications page is filtering by wrong status. Older code only included `Clarification Period`; should include `Published` too.
- **Reply fails with 400** → the frontend may be sending `visibility: 'PUBLIC'` while the backend DTO expects `isPublic: true` (this was a 2026-05-21 fix). If you see it again, the deploy regressed.

---

## Section 10 — Vendor prepares the bid

### Why this section exists

Bids are split into two envelopes for a reason:
- **Technical envelope** — describes WHAT you'll deliver (proposal documents, methodology). Opened first, evaluated on merit.
- **Commercial envelope** — describes the PRICE. Kept sealed until technical evaluation is done, so evaluators score the proposal without being biased by price.

This is the foundation of procurement integrity. If a single envelope held both, an evaluator who saw the price would unconsciously favor the cheap bidder regardless of quality.

The system enforces immutability and integrity:
- Each uploaded file gets a **SHA-256 checksum**.
- After submission, **no edits** allowed. Documents are locked.

### Prepare test files (on your computer)

Before clicking, create two small files:

```
technical.txt:
E2E test — technical proposal for office renovation.
```

```
commercial.txt:
E2E test — commercial pricing schedule. Total: 87,500 KWD.
```

### Steps

| # | Action | Expected Result | Why this matters | Result | Notes |
|---|--------|-----------------|------------------|--------|-------|
| 10.1 | On the tender detail page, click **Start Bid** | Bid wizard opens at Step 1: "Confirm tender details" | Wizard guards against half-built bids — vendor walks the whole process | | |
| 10.2 | Click **Continue** | Step 2 opens: "Technical Envelope" with a file drop zone | | | |
| 10.3 | Drop `technical.txt` onto the zone (or click to browse) | File uploads. Progress indicator → success. SHA-256 checksum displayed under the filename (`89d566965d7ac629…`). | Checksum is server-computed and stored. Vendor can verify integrity later — if their checksum on disk doesn't match the server's, they know it was tampered with in transit. | | |
| 10.4 | Optional: add a 2nd technical file. Confirm both checksums shown. | Multiple files supported per envelope | Real bids have multiple PDFs (proposal, CV, references, etc.) | | |
| 10.5 | Click **Continue** | Step 3 opens: "Commercial Envelope" | | | |
| 10.6 | Upload `commercial.txt`. Verify checksum displays. | Success, checksum shown | Identical handling to technical envelope | | |
| 10.7 | Click **Continue** | Step 4 opens: "Review and Submit". Summary shows both envelopes with all filenames + checksums. **Submit Bid** button active. | Review step is the last chance to catch a wrong upload — submit is irreversible | | |

### What the system has done so far

A `bids` row was created with status `DRAFT`. `bid_documents` rows exist for each file with `sha256`, `size_bytes`, `original_filename`, `envelope_type` (TECHNICAL/COMMERCIAL). The bid is **NOT** submitted yet — it's editable and can be deleted.

---

## Section 11 — Vendor submits the bid

### Why this section exists

Submission is the moment the bid becomes **immutable**. The system locks the documents and issues a receipt. After this, the vendor cannot edit, replace, or delete files — they can only withdraw the entire bid (if your implementation allows) or wait for evaluation.

The receipt is the vendor's proof they submitted on time. It contains a reference number and timestamp. If a dispute arises ("we submitted but you say you never received it"), the receipt is the evidence.

### Steps

| # | Action | Expected Result | Why this matters | Result | Notes |
|---|--------|-----------------|------------------|--------|-------|
| 11.1 | At Step 4, click **Submit Bid** | Confirmation page shows: **Reference number** (e.g. `RCPT-1779380984150-4FBCD9`) + submission timestamp + envelope status `SUBMITTED` (technical) / `SEALED` (commercial) | Receipt is generated server-side, NOT client-side, so it's authoritative | | |
| 11.2 | Record the receipt reference: `_________________` | (write it down here for later sections) | You'll need this for disputes and to compare against the audit log later | | |
| 11.3 | Try to navigate back to "Edit Bid" | Either: the option is hidden, OR it's grayed out, OR clicking it shows "Bid already submitted" error | Immutability enforcement — verify it's a UI guard, not just an API guard. If you can re-upload, the system has a confidentiality hole. | | |
| 11.4 | Click **My Bids** in nav | Your bid appears in the list with status `SUBMITTED`. Stats card shows `Submitted: 1`. | Vendor's main view of their own bid portfolio | | |

### Verify via admin

| # | Action | Expected Result | Why this matters | Result | Notes |
|---|--------|-----------------|------------------|--------|-------|
| 11.5 | Admin portal → **Tenders** → click your tender → look at **Bids** section or count | At least 1 bid shown. Vendor name = `E2E Test Vendor LLC`. Envelope status displays correctly. | Admin should see *that* there's a bid, but **NOT see commercial details** yet — those stay sealed | | |
| 11.6 | Try to find a way to download the commercial envelope as admin | You should NOT find one. There's no "Download commercial" button at this state. | Critical separation-of-duties check. If you can download the commercial envelope without a committee session, the system has a major compliance hole. | | |

---

## Section 12 — Submission closure + late-bid gate

### Why this section exists

The submission deadline is the cutoff. After it passes, no new bids should be accepted. Late submissions are **blocked by default**; an explicit, audited exception is required to accept one (and only in specific scenarios like "vendor proved force majeure"). Without this, the deadline is meaningless and vendors who submitted late could get an unfair advantage.

You can close submissions either:
- **Automatically:** wait for the deadline (you set today+7 days, so this is impractical for a real test)
- **Manually:** admin can click "Close Submissions" once they decide enough bids are in

For testing, use manual closure.

### Steps

| # | Action | Expected Result | Why this matters | Result | Notes |
|---|--------|-----------------|------------------|--------|-------|
| 12.1 | Admin portal → tender detail page → click **Close Submissions** | Status changes from `Published`/`Clarification Period` to `Submission Closed`. The `Open Technical Envelopes` button appears. | This is one-way — there's no "reopen submissions" from the UI typically | | |
| 12.2 | Switch to vendor portal. Try clicking **Start Bid** on the same tender. | Action is blocked. Either the button is hidden, OR clicking returns an error like "Submission period has ended". | If a second vendor could still bid, the deadline isn't enforced | | |
| 12.3 | (Negative test) Optional: in DB, set a tender's `submission_close_at` to 1 day in the past and re-publish. Then as a vendor try to submit. | API rejects with "Late submission not allowed" or similar | The late-submission gate isn't only frontend — it must be enforced server-side | | |

---

## Section 13 — Technical envelope opening + evaluation

### Why this section exists

Technical evaluation happens BEFORE commercial. The committee/evaluator looks at the proposal merits without seeing the price. This is the integrity-of-judgment phase: a bid that scores below the technical threshold is eliminated and its commercial envelope is never opened.

### Steps

| # | Action | Expected Result | Why this matters | Result | Notes |
|---|--------|-----------------|------------------|--------|-------|
| 13.1 | On admin tender detail page (status = `Submission Closed`), click **Open Technical Envelopes** | Status changes to `Technical Opening`. Technical documents become accessible. Commercial envelopes remain SEALED. | Two-stage opening — only technical at this point | | |
| 13.2 | Click **Technical Evaluation** in sidebar | Evaluation workspace opens with 3 columns: tenders, bids, scorecard | | | |
| 13.3 | Select your tender in the left column | Bid list appears in center. Your vendor's bid is shown with envelope status `OPENED` (for technical). | Vendor's identity is visible — some procurement systems anonymize this; some don't. Check what yours does. | | |
| 13.4 | Click the bid | Scorecard appears on the right. 4 criteria: Compliance / Experience / Methodology / Support. Each accepts a 0-25 score (or whatever your max is). | Criteria should map to the spec's defined criteria; don't enter arbitrary criteria | | |
| 13.5 | Enter scores: Compliance=24, Experience=20, Methodology=20, Support=16. Total auto-computes to **80/100**. | Total shows correctly. Pass threshold typically 70/100 → status `PASS`. | If total math is wrong, the evaluation can't be trusted | | |
| 13.6 | Click **Save Evaluation** | Save succeeds. Bid is marked `PASS 80/100`. | | | |
| 13.7 | Click **Finalize Technical Results** (confirm in dialog) | Tender status changes to `Commercial Sealed`. Scorecard locks (can't edit scores). | This step is the boundary — after finalization, no one can game scores after seeing the prices | | |

### Verify a failing bid would be eliminated (negative)

If you have time, create a 2nd vendor + 2nd bid, score them below threshold (e.g. 40/100), finalize. The failing bid should show `FAIL`, and their commercial envelope should NOT proceed to opening. If a `FAIL` bid still gets its commercial opened, the gate is missing.

---

## Section 14 — Committee commercial opening

### Why this section exists

Commercial envelopes opening is the highest-trust action in the system. To prevent any single person from peeking, it requires a **formal committee session** with:
- A scheduled date/time
- ≥2 members present (**quorum**)
- Recorded attendance
- Opening remarks logged

This is the procurement equivalent of "two-person rule" controls in finance. The audit log records every member who was present, the remarks made, and which envelopes were opened.

Even with `commercial:view` permission, an admin **cannot** open a commercial envelope outside this session.

### Steps

| # | Action | Expected Result | Why this matters | Result | Notes |
|---|--------|-----------------|------------------|--------|-------|
| 14.1 | Admin portal → **Committee & Commercial** in sidebar | Workspace opens. Your tender appears in the left list with status `Commercial Sealed`. | | | |
| 14.2 | Select the tender | Center panel: "No committee session scheduled" with a **Schedule Committee Session** button | If a session was already scheduled, panel shows the session details instead | | |
| 14.3 | Click **Schedule Committee Session** | Inline form: date, time, member checkboxes | | | |
| 14.4 | Pick today's date, time = 10:00, tick **both** `admin@ctmp.local` and `committee@ctmp.local`, click **Create Session** | Session created. Status = `SCHEDULED`. Members panel populated. | At least 2 members must be selected — selecting only 1 should be rejected | | |
| 14.5 | Click **PRESENT** on each member (or however the UI marks attendance) | Both members marked PRESENT. **Quorum met (2/2)** green indicator appears. | If quorum isn't met, the "Open Commercial Envelopes" button must stay disabled | | |
| 14.6 | Type opening remarks: `Committee session — both members present, no conflicts of interest declared. Proceeding to open commercial envelopes for E2E Pilot Renovation 2026.` | Textarea accepts | These remarks are stored in the audit trail and shown on future dispute reviews | | |
| 14.7 | Click **Open Commercial Envelopes** (confirm in dialog) | Envelopes open. Tender transitions through `Committee Commercial Opening` to `Commercial Evaluation / Comparison`. Opening records appear on the right (each envelope shows opener, time). | This is the audited unsealing — verify a new row appears in the audit log of type `COMMERCIAL_ENVELOPES_OPENED` | | |

### Negative test (optional but high-value)

Before step 14.5, while only 1 member is PRESENT (quorum NOT met), try clicking Open Commercial Envelopes. Should be **blocked**. If it works with 1 member present, the quorum gate is missing — that's a critical compliance bug.

---

## Section 15 — Commercial comparison + award recommendation

### Why this section exists

After opening, the committee compares prices across bids that **passed** technical. The lowest priced compliant bid is the typical award candidate (in a "lowest priced compliant" tender — there are other models). The committee enters each bid's price (parsed from the commercial envelope), ranks them, and recommends an award.

Award recommendation is a *recommendation*, not the final award. A separate approval step (Section 16) confirms it. Two-step process prevents accidental awards.

### Preconditions

You must have logged out and back in *after* getting `commercial:view` permission added to your role. If you see "no access" on Commercial Comparison, do this now.

### Steps

| # | Action | Expected Result | Why this matters | Result | Notes |
|---|--------|-----------------|------------------|--------|-------|
| 15.1 | Admin portal → **Commercial Comparison** in sidebar | Page opens (requires `commercial:view`). | If you see "no access", log out + back in. If still no access, the role doesn't have the permission. | | |
| 15.2 | Select your tender | Bid row appears (technical PASS). Total Bid column is an input — envelope is OPENED but the price hasn't been entered yet. | | | |
| 15.3 | Type `87500` (the price from your `commercial.txt`) in the input, click **Save** | Row refreshes. Input is replaced by formatted currency (`KWD 87,500.00`). Rank `1` displayed (only one bid). | If you have multiple bids, ranks should sort by price ascending | | |
| 15.4 | Click **Recommend Award** on the rank-1 row. Enter justification: `Lowest priced compliant bid, technical score 80/100.` | Alert: "Award recommendation submitted. Approval task added to Approvals queue." Tender status → `Award Recommendation`. | Justification is required and audit-logged — a future review can see *why* this bid was recommended | | |

### Failure modes

- **Recommend Award button requires multiple clicks** → known issue from prior testing, React state-render lag. Not blocking but file as a Low.
- **Commercial Comparison shows no bids** → either the tender hasn't reached `Commercial Evaluation / Comparison`, or the envelope wasn't opened. Re-check Section 14.

---

## Section 16 — Award approval + issuance

### Why this section exists

A second pair of eyes confirms the award. The recommender and the approver should ideally be different roles (in your test env they're the same admin, but in production this is enforced).

After approval, the award is **issued** — the vendor is officially notified and the tender enters its final state. This is the moment money flows in the real world: contracts get signed, POs get raised, the legal record of the award exists.

### Steps

| # | Action | Expected Result | Why this matters | Result | Notes |
|---|--------|-----------------|------------------|--------|-------|
| 16.1 | Admin portal → **Approvals** in sidebar | Award approval task appears in the queue. Type `Award Approval`. | | | |
| 16.2 | Click the task. Enter comment `Award approved per technical + commercial evaluation`. Click **Approve**. | Status changes to `Awarded`. Task removed from queue. | | | |
| 16.3 | Navigate back to the tender detail page | Status shows `Awarded`. **Issue Award** button visible at top. | One more confirmation step before final issuance | | |
| 16.4 | Click **Issue Award** (confirm in dialog) | Status changes to `Tender Closed`. Workflow complete. | Final state — no further actions on this tender | | |

### Verify the vendor sees it

| # | Action | Expected Result | Why this matters | Result | Notes |
|---|--------|-----------------|------------------|--------|-------|
| 16.5 | Switch to vendor portal → **My Bids** | Your bid status is `AWARDED`. Stats card `Awarded: 1`. | | | |
| 16.6 | Optional: check MailHog for an "Award notification" email | Email may be sent to the vendor depending on notification config | If yes, verify content matches the award (tender title + reference) | | |
| 16.7 | Click the bid row → bid detail | Shows the award status, the tender reference, and a celebration UI ("Congratulations" banner or similar) | UX: vendor gets explicit positive feedback on a win | | |

---

## Section 17 — Audit log + reports

### Why this section exists

Every regulated action has been logged. The audit log is **append-only** — admins cannot edit or delete rows through the UI (and ideally not through the DB either, though that's an OS-level guarantee, not a code one). The audit chain has a **hash-chain integrity check** that runs on every API boot — if a row gets tampered with, an `AUDIT_CHAIN_BREAK` security alert fires.

Reports are exports of audit + business data for compliance review.

### Steps — audit log

| # | Action | Expected Result | Why this matters | Result | Notes |
|---|--------|-----------------|------------------|--------|-------|
| 17.1 | Admin portal → **Audit Log** in sidebar | Page opens with a list of events. Filters: search, event type, entity type, risk level. | | | |
| 17.2 | Filter by your tender's reference number or entity ID. Verify these events are present (you may need to widen the date range): `TENDER_CREATED`, `TENDER_APPROVED`, `TENDER_PUBLISHED`, `BID_DOCUMENT_UPLOADED` (note: not `BID_SUBMITTED` — the event name is the document upload), `TECHNICAL_ENVELOPES_OPENED`, `COMMERCIAL_ENVELOPES_OPENED`, `AWARD_RECOMMENDED`, `AWARD_APPROVED`, `AWARD_ISSUED` | All 9 events visible with timestamps, actor names (not UUID prefixes!), IP addresses, and risk levels | If actor shows as `e7f2677b…` (UUID prefix), the 2026-05-24 actor-name fix isn't deployed | | |
| 17.3 | Click any high-risk event (e.g. `COMMERCIAL_ENVELOPES_OPENED`) | Detail view shows the full event payload, before/after snapshots if applicable | High-risk events should always have rich context | | |

### Steps — reports

| # | Action | Expected Result | Why this matters | Result | Notes |
|---|--------|-----------------|------------------|--------|-------|
| 17.4 | Admin portal → **Reports** in sidebar | Report catalog opens, grouped by category: `TENDER`, `VENDOR`, `OPERATIONS`, `FINANCIAL`, `AUDIT` | | | |
| 17.5 | Find **Tender Summary**, select format **XLSX**, click **Export** | Job appears in history with status `QUEUED` → `RUNNING` → `COMPLETED` (may take a few seconds) | Exports are async (BullMQ jobs) — UI should reflect job state without blocking | | |
| 17.6 | Once `COMPLETED`, click **Download** | XLSX file downloads. Open it and confirm: your tender row appears, status = `Tender Closed`, vendor and award price visible. | The data export must reflect the same state as the UI | | |
| 17.7 | (Optional) Export an **Audit Trail** report for the same tender as PDF | PDF downloads. Contents include the audit events with timestamps. | Auditors typically want PDF for archival; PDF should be self-contained | | |

### Verify the audit chain is intact

| # | Action | Expected Result | Why this matters | Result | Notes |
|---|--------|-----------------|------------------|--------|-------|
| 17.8 | Admin portal → **Security Alerts** in sidebar | Page loads. Look for any `AUDIT_CHAIN_BREAK` alerts. | | | |
| 17.9 | If old `AUDIT_CHAIN_BREAK` alerts exist (CRITICAL severity), they're typically from prior container restarts during development. **No new ones** should appear from this E2E run. | No fresh alerts created today | A fresh `AUDIT_CHAIN_BREAK` alert during normal operation = the audit log was tampered with or the canonicalization logic broke. That's a stop-the-world issue. | | |

---

## Section 18 — Edge cases (optional)

These are negative tests. Each one is short but reveals real risk if missed.

### 18.1 — Withdraw a bid before submission

After Section 10 but before Section 11 (vendor has a DRAFT bid but hasn't submitted), navigate to **My Bids**, find the DRAFT, click **Delete** or **Withdraw**. Verify it's gone and you can re-start the bid wizard.

### 18.2 — Try to bid twice on the same tender

Submit a bid (Section 11), then try **Start Bid** on the same tender again. Should be blocked: "You have already submitted a bid for this tender". Or the button is hidden.

### 18.3 — Cancel a published tender

Admin creates a 2nd tender, publishes it, then immediately cancels (most implementations have a Cancel button on Published tenders). Status → `Cancelled`. Vendors should no longer see it.

### 18.4 — Suspend mid-cycle

Take a tender in `Submission Closed` or later, click Suspend (if available). It pauses the workflow. Should be resumable. Audit log records both suspend and resume.

### 18.5 — Password reset

From vendor portal `/login`, click **Forgot password?**, enter your email. Check MailHog for the reset email. Follow the link, set a new password. Log in with the new password. Audit log records the reset.

### 18.6 — Logout from every page

Walk every page in the vendor portal (Dashboard, Tenders, Tender Detail, My Bids, Clarifications, Profile) and click **Sign out**. Should always return to `/login` and clear cookies. No stale session bugs.

### 18.7 — Browser DevTools console

While doing any of the above, keep DevTools console open. **There should be no red errors.** Warnings are OK if they're well-known (e.g. React dev warnings). Real errors mean something is broken silently.

---

## Final tally

Once you've run the sections you have time for, fill this in:

| Section | Passed | Failed | Partial | Skipped | Notes |
|---------|--------|--------|---------|---------|-------|
| 0 — Environment | / | | | | |
| 1 — Vendor registration | / 6 | | | | |
| 2 — Email verification | / 4 | | | | |
| 3 — Admin approval | / 5 | | | | |
| 4 — First login | / 7 | | | | |
| 5 — Draft tender | / 6 | | | | |
| 6 — Internal review | / 4 | | | | |
| 7 — Publishing | / 4 | | | | |
| 8 — Vendor discovers | / 4 | | | | |
| 9 — Clarifications | / 7 | | | | |
| 10 — Bid prep | / 7 | | | | |
| 11 — Bid submission | / 6 | | | | |
| 12 — Submission closure | / 3 | | | | |
| 13 — Technical eval | / 7 | | | | |
| 14 — Committee opening | / 7 | | | | |
| 15 — Commercial comparison | / 4 | | | | |
| 16 — Award + issue | / 7 | | | | |
| 17 — Audit + reports | / 9 | | | | |
| 18 — Edge cases | / 7 | | | | |

**Total expected:** ~104 individual checks across the lifecycle.

---

## Issue summary template

If anything failed, capture it here for triage. Don't try to fix during the test — just record.

| # | Section | Step | Severity | Description | Repro steps |
|---|---------|------|----------|-------------|-------------|
| 1 | | | | | |
| 2 | | | | | |
| 3 | | | | | |

**Severity guide:**
- **Critical** — blocks the procurement workflow OR violates a compliance rule (immutability, sealing, audit). Cannot ship.
- **High** — blocks a user flow but a workaround exists. Must fix soon.
- **Medium** — incorrect behavior with low impact, or significant UX issue.
- **Low** — cosmetic / minor UX.

---

## When you're done

1. Save this file with your results in `docs/qa/E2E_RUN_<date>.md` (don't overwrite this template).
2. Open an issue per Critical/High finding.
3. Update `agents/handoffs/HANDOVER.md` with a new entry summarizing the run.
4. Update `agents/backlog/MASTER_TASK_TRACKER.md` Phase 5 row if it was still showing manual testing as not done.
