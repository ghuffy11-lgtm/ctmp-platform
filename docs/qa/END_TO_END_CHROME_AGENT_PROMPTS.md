# CTMP E2E Test — Claude for Chrome Agent Prompts

A paste-ready prompt pack for the Claude for Chrome browser extension. Each prompt drives ONE section of the manual test plan (`END_TO_END_MANUAL_TEST.md`). Sections are dependent — run them in order, top to bottom.

The Chrome agent can navigate, click, type, read DOM, and observe screenshots. It **cannot**:
- Solve hCaptcha (you'll do that by hand when the prompt says "USER STEP")
- Use OS file pickers reliably (you'll attach files via the file input when prompted)
- Query the database (DB checks are skipped — verify via UI instead)

---

## Before you start — fill in these values once

Copy this block to a scratch note and substitute it into every prompt below.

| Token | Use this value |
|---|---|
| `{{ADMIN_URL}}` | `https://ctmp-admin.hadiclinic.com.kw:4202` (or `http://10.1.13.98:4200` if HTTPS hostname doesn't resolve) |
| `{{VENDOR_URL}}` | `https://vn.hadiclinic.com.kw:4201` |
| `{{MAILHOG_URL}}` | `http://10.1.13.98:8025` |
| `{{ADMIN_EMAIL}}` | `admin@ctmp.local` |
| `{{ADMIN_PASSWORD}}` | `Admin@12345!` |
| `{{COMMITTEE_EMAIL}}` | `committee@ctmp.local` |
| `{{VENDOR_EMAIL}}` | `e2e-vendor-XX-2026-05-25@example.com` (use your initials + today's date — must be fresh) |
| `{{VENDOR_PASSWORD}}` | `E2eRunner!2026Strong` (or another 12+ char password with case + digit + symbol) |
| `{{VENDOR_COMPANY}}` | `E2E Test Vendor LLC` |
| `{{VENDOR_CONTACT_NAME}}` | `E2E Test Contact` |
| `{{TENDER_TITLE}}` | `E2E Pilot Renovation 2026` |
| `{{TENDER_DEPT}}` | `Facilities Management` |
| `{{TENDER_DEADLINE_DATE}}` | The date 7 days from today (e.g. `2026-06-01`) |
| `{{TENDER_DEADLINE_TIME}}` | `16:00` |
| `{{TENDER_BUDGET}}` | `100000` |
| `{{BID_PRICE}}` | `87500` |

### Files to prepare on disk before starting

Create two tiny text files in a folder you can reach quickly:
- `technical.txt` — content: `E2E test — technical proposal for office renovation.`
- `commercial.txt` — content: `E2E test — commercial pricing schedule. Total: 87,500 KWD.`

### Browser tabs to have open

1. **Vendor tab** — `{{VENDOR_URL}}` (incognito recommended)
2. **Admin tab** — `{{ADMIN_URL}}`
3. **MailHog tab** — `{{MAILHOG_URL}}`

### How to use the prompts

- Open the Claude for Chrome extension side panel.
- Copy ONE prompt at a time into the chat.
- Wait for the agent to confirm completion + report PASS/FAIL per step.
- If a step fails, decide: retry the same prompt, skip ahead, or stop and debug.
- When asked to switch tabs, the agent will navigate by URL — use a single browser window with multiple tabs so the agent stays in scope.

---

## Prompt 1 — Vendor self-registration

```
You are running an E2E test on the CTMP vendor portal. Operate in the active tab.

Goal: Register a new vendor account.

Steps:
1. Navigate to {{VENDOR_URL}}/register
2. Verify the page title contains "VENDOR" and "CONNECT". Page should have a light background (white/very-light blue gradient). The page has two sections: "Company Information" and "Primary Contact".
3. In Company Name, type: {{VENDOR_COMPANY}}
4. Leave Registration Number, Tax Number, Country, Phone, Address blank.
5. In Contact Full Name, type: {{VENDOR_CONTACT_NAME}}
6. In Contact Email, type: {{VENDOR_EMAIL}}
7. In Password, type: {{VENDOR_PASSWORD}}
8. STOP and tell me when you reach the hCaptcha widget — I will solve it manually (the agent cannot solve CAPTCHAs).
9. After I confirm CAPTCHA is solved, click "Submit Registration".
10. Verify the success state appears: "Registration Submitted" with a green checkmark and a message about the verification email being sent to {{VENDOR_EMAIL}}.

Report PASS/FAIL for each numbered step. Capture a screenshot of the final success state.
```

---

## Prompt 2 — Email verification

```
Goal: Open the verification email in MailHog and click the link to verify the vendor email.

Steps:
1. Navigate to {{MAILHOG_URL}}
2. Find the most recent email addressed to {{VENDOR_EMAIL}}. The subject should reference "Verify" or "CTMP vendor account".
3. Open that email. In the body, find the verification link — it will look like {{VENDOR_URL}}/verify-email?token=<64-hex-chars>
4. Copy the verification URL.
5. Navigate to that URL in the current tab.
6. Verify the page eventually shows "Email Verified" with a green checkmark.
7. Now test the replay-protection: navigate to the same URL again (you can use the browser back button or paste the URL again).
8. Verify the page now shows an error state — "Token already used", "Verification failed", or similar. It must NOT show success twice.

Report PASS/FAIL for steps 1-8. Note any unexpected behavior (e.g. stuck on "Loading…", wrong link host).
```

---

## Prompt 3 — Admin approves the vendor

```
Goal: Log into the admin portal and approve the pending vendor.

Steps:
1. Navigate to {{ADMIN_URL}}/login
2. Sign in with email {{ADMIN_EMAIL}} and password {{ADMIN_PASSWORD}}
3. Verify the admin dashboard loads (you should see sidebar nav with "Dashboard", "Tenders", "Vendors", "Approvals", "Audit Log", etc.)
4. Click "Vendors" in the sidebar.
5. Filter by status = PENDING (use the status filter dropdown or chip).
6. Find the row for {{VENDOR_COMPANY}} (email {{VENDOR_EMAIL}}). Click it to open the detail panel.
7. Verify the detail panel shows: company name, primary contact email, "Email Verified: Yes" (or a green icon).
8. Click the "Approve" button. If a confirmation dialog appears, confirm.
9. Verify the vendor status changes to APPROVED and a success notification appears.

Then verify the audit trail:
10. Click "Audit Log" in the sidebar.
11. Find the most recent VENDOR_APPROVED event (filter by event type if available).
12. Verify the Actor Name column shows "CTMP Admin" (NOT a UUID prefix like "e7f2677b…"). The IP Address column should show a real IP, not "—".

Report PASS/FAIL per step. Flag any UUID-prefix actor name or missing IP as a Medium severity finding.
```

---

## Prompt 4 — First vendor login + profile completion

```
Goal: Log into the vendor portal as the newly-approved vendor and confirm the post-approval state.

Steps:
1. Navigate to {{VENDOR_URL}}/login
2. Sign in with email {{VENDOR_EMAIL}} and password {{VENDOR_PASSWORD}}
3. Verify the page redirects to /dashboard.
4. Verify the greeting in the page header reads "Good morning/afternoon/evening, {{VENDOR_COMPANY}}" (the actual time-of-day word depends on when you run this).
5. Look at the top-right of the nav bar. Verify the vendor chip shows the company initials/name AND a green "Verified" badge (NOT amber "Pending").
6. Click "Profile" in the top nav.
7. Verify these fields are marked as read-only: Email, MFA, Registration Status, Registered date. Editable fields: Company Name, Address, Phone, Website, Tax Number, Country, Contact Full Name, Contact Phone.
8. In Address, type: 123 Test St, Kuwait
9. In Phone (Company), type: +965 1234 5678
10. Click "Save Changes".
11. Verify a success banner appears ("Profile saved").
12. Refresh the page. Verify the typed values persist.
13. Click "My Bids" in the top nav.
14. Verify the page shows 4 stat cards: Drafts=0, Submitted=0, Evaluated=0, Awarded=0, with an empty state for the table.
15. Click "Tenders" in the top nav.
16. Note what tenders appear (likely none of the test tenders yet — those come later).

Report PASS/FAIL per step. Capture the final dashboard screenshot.
```

---

## Prompt 5 — Admin creates a tender (Draft)

```
Goal: Create a new tender in Draft status as admin.

You should still be logged into the admin portal in another tab. If not, log in first at {{ADMIN_URL}}/login with {{ADMIN_EMAIL}} / {{ADMIN_PASSWORD}}.

Steps:
1. Navigate to {{ADMIN_URL}} and click "Tenders" in the sidebar.
2. Click the "+ New Tender" button (top right).
3. Fill the form:
   - Title: {{TENDER_TITLE}}
   - Department: {{TENDER_DEPT}} (pick from dropdown)
   - Description: End-to-end test tender for office renovation
   - Submission Deadline: date={{TENDER_DEADLINE_DATE}}, time={{TENDER_DEADLINE_TIME}}
   - Estimated Budget: {{TENDER_BUDGET}}
4. Click "Save as Draft".
5. Verify the tender detail page opens with:
   - Status badge: "Draft"
   - A reference number like TDR-2026-XXXX displayed at the top
   - Visible buttons: Edit, Delete, Submit for Approval
6. Record the reference number you see (you'll need it later).

Now verify the tender is NOT visible to vendors:
7. Switch to the vendor portal tab. Click "Tenders". Refresh.
8. Confirm the new tender does NOT appear (Drafts are confidential).

Report PASS/FAIL and the auto-generated reference number from step 6.
```

---

## Prompt 6 — Internal review and approval

```
Goal: Move the tender from Draft → Internal Review → Approved.

Steps:
1. In the admin portal, navigate to the tender detail page for {{TENDER_TITLE}} (from Tenders list, click the row).
2. Click "Submit for Approval".
3. Verify the status changes to "Internal Review".
4. Click "Approvals" in the sidebar.
5. Find the row for {{TENDER_TITLE}} (type = "Tender Approval"). Click to expand.
6. Enter the comment: Approved for E2E test
7. Click "Approve".
8. Verify the status changes to "Approved" and the task disappears from the queue.
9. Navigate back to the tender detail page and confirm: status = Approved, the "Publish" button is now visible.

Report PASS/FAIL per step.
```

---

## Prompt 7 — Publishing the tender

```
Goal: Publish the tender so vendors can see it.

Steps:
1. On the admin tender detail page (status = Approved), click "Publish".
2. If a confirmation dialog appears, confirm.
3. Verify the status changes to "Published" (or "Clarification Period").
4. Switch to the vendor portal tab. Click "Tenders". Refresh.
5. Verify {{TENDER_TITLE}} now appears as a card in the grid, with:
   - Status badge: "Published" (or "Clarification Period")
   - A countdown badge showing days until deadline
6. Click the tender card.
7. Verify the detail page shows: title, reference number, budget formatted as "KWD 100,000.00" (or similar), description, deadline, and a prominent "START BID" button (electric-blue CTA).

Report PASS/FAIL per step.
```

---

## Prompt 8 — Vendor discovers the tender (extra smoke)

```
Goal: Verify the vendor's main browsing flow works.

Steps:
1. In the vendor portal, click "Dashboard" in the nav.
2. Verify the stat cards: "Open Tenders" shows ≥ 1, "Active Bids" shows 0.
3. Scroll to the "Recent Tenders" section. Verify {{TENDER_TITLE}} appears.
4. Click that tender card. Verify it navigates to the tender detail page.
5. Click "← Back to Tenders". Verify it returns to /tenders.
6. In the search input at the top of /tenders, type "Pilot" (part of {{TENDER_TITLE}}).
7. Verify the list filters to show only matching tenders.
8. Clear the search.

Report PASS/FAIL per step.
```

---

## Prompt 9 — Clarifications

```
Goal: Vendor asks a clarification question; admin replies publicly; vendor sees the reply.

Vendor side (current tab):
1. In the vendor portal, click "Clarifications" in the top nav.
2. From the left column tender selector, click {{TENDER_TITLE}}.
3. Verify the right side shows an "Ask a question" form.
4. In the textarea, type: Is the scope limited to the ground floor, or does it include all floors?
5. Click "Submit Question".
6. Verify the question appears in the thread below with status "OPEN" and a timestamp.

Admin side:
7. Switch to the admin portal tab. Click "Clarifications" in the sidebar.
8. Find {{TENDER_TITLE}} in the list and select it.
9. Find the question and click to expand the reply form.
10. Type reply: All floors, ground through 4th. Excludes basement.
11. Set visibility to "Public".
12. Click "Reply".
13. Verify the reply is posted and the thread now shows ANSWERED.

Vendor side:
14. Switch back to the vendor portal. Refresh the Clarifications page.
15. Verify the admin's reply is visible under the question, tagged "PUBLIC".

Report PASS/FAIL per step.
```

---

## Prompt 10 — Vendor prepares the bid

```
Goal: Walk the bid wizard and upload technical + commercial envelopes.

PRECONDITION: You must have created the two files on disk:
- technical.txt
- commercial.txt
Tell me you have these ready before proceeding.

Steps:
1. In the vendor portal, navigate to the tender detail page for {{TENDER_TITLE}}.
2. Click "Start Bid".
3. Verify the bid wizard opens at Step 1 ("Confirm tender details" or similar).
4. Click "Continue" / "Next".
5. Verify Step 2 (Technical Envelope) opens with a file drop zone.
6. STOP — I will use the file input to attach technical.txt. Tell me when you're at the drop zone and I'll click it manually if the drag-drop doesn't work for you.
7. After file is uploaded, verify a SHA-256 checksum is displayed under the filename (a long hex string).
8. Click "Continue".
9. Verify Step 3 (Commercial Envelope) opens.
10. STOP again — I will attach commercial.txt.
11. After upload, verify checksum is displayed.
12. Click "Continue".
13. Verify Step 4 (Review and Submit) opens, showing both envelopes with filenames and checksums.

Do NOT click "Submit Bid" — that's the next prompt.

Report PASS/FAIL per step. Note both SHA-256 checksums.
```

---

## Prompt 11 — Vendor submits the bid

```
Goal: Submit the bid and verify the receipt and immutability.

Steps:
1. On the Review and Submit step of the bid wizard (Step 4), click "Submit Bid".
2. If a confirmation dialog appears, confirm.
3. Verify the confirmation page shows:
   - A reference number like RCPT-XXXXXXXXXXXX-XXXXXX
   - A submission timestamp
   - Technical envelope status: SUBMITTED
   - Commercial envelope status: SEALED
4. Record the receipt reference number.
5. Try to navigate back / find an "Edit Bid" option. Verify edits are blocked (button hidden, grayed out, or returns an error).
6. Click "My Bids" in the top nav.
7. Verify your bid appears in the list with status SUBMITTED. The "Submitted" stat card should show 1.

Then verify the admin sees the bid:
8. Switch to admin portal tab. Navigate to the tender detail page for {{TENDER_TITLE}}.
9. Look for a "Bids" section or count. Verify at least 1 bid is shown with vendor name {{VENDOR_COMPANY}}.
10. Look for any way to download or view the commercial envelope. Verify it is NOT available at this stage (separation of duties — commercial stays sealed until committee opening).

Report PASS/FAIL per step and the recorded receipt reference number from step 4.
```

---

## Prompt 12 — Submission closure + late-bid gate

```
Goal: Manually close submissions and verify late bids are blocked.

Admin side:
1. In admin portal, on the tender detail page for {{TENDER_TITLE}}, click "Close Submissions".
2. If a confirmation appears, confirm.
3. Verify status changes from "Published" / "Clarification Period" to "Submission Closed".
4. Verify a new button "Open Technical Envelopes" is now visible.

Vendor side:
5. Switch to vendor portal tab. Navigate to the tender detail page for {{TENDER_TITLE}}.
6. Try to click "Start Bid" again. Verify the action is blocked — either the button is hidden, disabled, or returns an error like "Submission period has ended" / "Already submitted".

Report PASS/FAIL per step.
```

---

## Prompt 13 — Technical envelope opening + evaluation

```
Goal: Open technical envelopes, score the bid, and finalize technical results.

Steps:
1. In admin portal, on the tender detail page for {{TENDER_TITLE}}, click "Open Technical Envelopes".
2. If a confirmation appears, confirm.
3. Verify status changes to "Technical Opening" (and the technical envelope becomes accessible; commercial stays SEALED).
4. Click "Technical Evaluation" in the sidebar.
5. In the 3-column workspace, select {{TENDER_TITLE}} in the left column.
6. The center column should list bids. Click the bid from {{VENDOR_COMPANY}}.
7. The right column should show a scorecard with 4 criteria (Compliance / Experience / Methodology / Support), each scored 0-25.
8. Enter scores: Compliance=24, Experience=20, Methodology=20, Support=16.
9. Verify the total auto-computes to 80/100 and the result is PASS (threshold is typically 70).
10. Click "Save Evaluation".
11. Verify save succeeds and the bid shows PASS 80/100.
12. Click "Finalize Technical Results" (top of the page or per-tender action).
13. If a confirmation dialog appears, confirm.
14. Navigate back to the tender detail page. Verify the tender status is now "Commercial Sealed".

Report PASS/FAIL per step.
```

---

## Prompt 14 — Committee commercial opening

```
Goal: Schedule a committee session, record attendance, and open commercial envelopes.

Steps:
1. In admin portal, click "Committee & Commercial" (or similar) in the sidebar.
2. Select {{TENDER_TITLE}} from the left list. Status should show "Commercial Sealed".
3. If no session is scheduled, the center panel shows "Schedule Committee Session" button. Click it.
4. In the inline form:
   - Date: today
   - Time: 10:00
   - Members: tick BOTH {{ADMIN_EMAIL}} AND {{COMMITTEE_EMAIL}}
5. Click "Create Session".
6. Verify the session is created with status SCHEDULED and shows both members.
7. Mark each member as PRESENT (click PRESENT button or attendance checkbox).
8. Verify a "Quorum met (2/2)" indicator (or similar) appears in green.
9. In the opening remarks textarea, type: Committee session — both members present, no conflicts of interest declared. Proceeding to open commercial envelopes.
10. Click "Open Commercial Envelopes".
11. If a confirmation dialog appears, confirm.
12. Verify envelopes open: tender status transitions through "Committee Commercial Opening" to "Commercial Evaluation / Comparison".
13. Verify the page now shows opening records (which member opened, timestamp).

Report PASS/FAIL per step.

NEGATIVE-TEST CHECK (don't run unless explicitly asked): Before marking attendance, try clicking "Open Commercial Envelopes" — it should be blocked because quorum is not met. If it succeeds with 0 or 1 member present, that's a CRITICAL compliance bug.
```

---

## Prompt 15 — Commercial comparison + award recommendation

```
Goal: Enter the bid price, rank, and recommend the award.

PRECONDITION: The current admin user must have commercial:view permission. If you see "no access" on the Commercial Comparison page, stop and tell me — we need to re-login or fix the role.

Steps:
1. In admin portal, click "Commercial Comparison" in the sidebar.
2. Select {{TENDER_TITLE}} from the left list.
3. The bid row from {{VENDOR_COMPANY}} should appear with technical result PASS.
4. In the "Total Bid" column, find the input field. Type: {{BID_PRICE}}
5. Click "Save" (or hit Enter).
6. Verify the input is replaced with formatted currency (KWD 87,500.00) and rank 1 is displayed.
7. Click "Recommend Award" on the rank-1 row.
8. In the justification field, type: Lowest priced compliant bid, technical score 80/100.
9. Click submit / confirm.
10. Verify a confirmation appears ("Award recommendation submitted" or similar) and the tender status changes to "Award Recommendation".

Report PASS/FAIL per step.
```

---

## Prompt 16 — Award approval + issuance

```
Goal: Approve the award and issue it.

Steps:
1. In admin portal, click "Approvals" in the sidebar.
2. Find the row for {{TENDER_TITLE}} with type "Award Approval". Click to expand.
3. Enter the comment: Award approved per technical + commercial evaluation
4. Click "Approve".
5. Verify the status changes to "Awarded" and the task disappears from the queue.
6. Navigate back to the tender detail page for {{TENDER_TITLE}}.
7. Verify status = "Awarded" and an "Issue Award" button is visible.
8. Click "Issue Award". Confirm if prompted.
9. Verify the status changes to "Tender Closed" (final state).

Then verify the vendor sees it:
10. Switch to vendor portal tab. Click "My Bids".
11. Verify the bid status is now AWARDED. The "Awarded" stat card should show 1.
12. Click the bid row to see the detail. Verify award status is shown.

Report PASS/FAIL per step.
```

---

## Prompt 17 — Audit log + reports

```
Goal: Verify the audit trail captured the lifecycle, then export a report.

Steps:
1. In admin portal, click "Audit Log" in the sidebar.
2. Filter by the tender reference number (from Prompt 5) if a search/filter is available — otherwise scroll to today's date.
3. Verify these event types are present in the log (you may need to scroll/page through):
   - TENDER_CREATED
   - TENDER_APPROVED
   - TENDER_PUBLISHED
   - BID_DOCUMENT_UPLOADED (note: not BID_SUBMITTED — the upload is the named event)
   - TECHNICAL_ENVELOPES_OPENED
   - COMMERCIAL_ENVELOPES_OPENED
   - AWARD_RECOMMENDED
   - AWARD_APPROVED
   - AWARD_ISSUED
4. For each event, verify:
   - Actor Name shows "CTMP Admin" (NOT a UUID prefix like "e7f2677b…")
   - IP Address shows a real IP (NOT "—")
   - Timestamp is from today
5. Click any high-risk event (e.g. COMMERCIAL_ENVELOPES_OPENED) to expand the detail. Verify rich payload (before/after, metadata).

Then test report export:
6. Click "Reports" in the sidebar.
7. Find "Tender Summary" in the catalog. Select format XLSX. Click "Export".
8. Verify a job appears in the history with status QUEUED → RUNNING → COMPLETED.
9. When COMPLETED, click "Download". The file should download.
10. Open the XLSX (if you can do this in-browser via a preview; otherwise just confirm the file downloaded with the expected name).

Verify the audit chain is intact:
11. Click "Security Alerts" in the sidebar.
12. Verify no NEW AUDIT_CHAIN_BREAK alerts have been created today. (Old alerts from prior dev runs may exist; they're fine. New ones during this test would mean tampering or a regression.)

Report PASS/FAIL per step. Flag any UUID-prefix actor names or "—" IPs as findings.
```

---

## Prompt 18 — Edge cases (optional, pick any subset)

Each sub-prompt below is independent. Run only the ones you want to verify.

### 18.1 — Try to bid twice on the same tender

```
Goal: Verify that a vendor cannot submit a second bid on a tender they've already bid on.

Steps:
1. In vendor portal, navigate to the tender detail page for {{TENDER_TITLE}}.
2. Try to click "Start Bid" again.
3. Verify the action is blocked: button hidden, grayed out, OR an error "You have already submitted a bid for this tender".

Report PASS/FAIL.
```

### 18.2 — Cancel a published tender

```
Goal: Verify Cancel works on a Published tender.

Steps:
1. In admin portal, create a NEW second tender (run Prompts 5, 6, 7 again with a different title like "E2E Throwaway 2026").
2. On the Published tender, click "Cancel". If a confirmation appears, confirm.
3. Verify status changes to "Cancelled".
4. Switch to vendor portal, click Tenders, refresh.
5. Verify the cancelled tender no longer appears.

Report PASS/FAIL.
```

### 18.3 — Password reset

```
Goal: Vendor password reset flow.

Steps:
1. From vendor portal /login, click "Forgot password?".
2. Enter {{VENDOR_EMAIL}}. Click "Send Reset Email".
3. Verify the success state appears.
4. Switch to MailHog. Find the most recent password-reset email for {{VENDOR_EMAIL}}.
5. Click the reset link.
6. Set a new password (write it down).
7. Verify success state.
8. Navigate to vendor /login. Sign in with the new password.
9. Verify you reach /dashboard.

Report PASS/FAIL.
```

### 18.4 — Logout sweep

```
Goal: Verify logout works from every page in the vendor portal.

Steps:
For EACH of these pages: /dashboard, /tenders, /bids, /clarifications, /profile
  1. Navigate to the page (you'll need to re-login between iterations).
  2. Click "Sign out" (logout button in nav).
  3. Verify you're redirected to /login.
  4. Verify cookies for ctmp_vendor_access_token and ctmp_vendor_refresh_token are cleared (check DevTools → Application → Cookies).

Report PASS/FAIL for each page.
```

### 18.5 — DevTools console clean

```
Goal: Verify no JS errors during normal flows.

Steps:
1. Open browser DevTools (F12) → Console tab.
2. Clear the console.
3. In vendor portal, log in and visit each page once: /dashboard, /tenders, click a tender card, /bids, /clarifications, /profile.
4. Report any RED errors. Yellow warnings can be ignored.

Report any RED errors with the exact message and the page where it occurred.
```

---

## After every section — quick log

Keep a running log in a scratch file as you go. Suggested format:

```
SECTION 1 (Vendor registration): PASS  — fresh email worked, captcha solved manually, success state shown
SECTION 2 (Email verification): PASS — replay blocked correctly
SECTION 3 (Admin approval):     PARTIAL — actor name showed UUID prefix on audit log row (Medium finding)
...
```

When done, paste this log into `docs/qa/E2E_RUN_2026-05-25.md` and update `agents/handoffs/HANDOVER.md`.
