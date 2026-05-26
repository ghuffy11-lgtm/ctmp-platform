# CTMP — UI Generation Prompts (per page)

**Purpose:** Each section below is a self-contained prompt to paste into an AI UI generator (Google Stitch or similar). Each prompt describes only what the page must **do and show** — design, colors, and visual style are intentionally left to the AI tool.

**Workflow:**
1. Copy the prompt for the page you want to build.
2. Generate the UI in your AI tool.
3. Save the produced HTML to `apps/web-admin/stitch-designs/<page-folder>/code.html` (admin) or `apps/web-vendor/stitch-designs/<page-folder>/code.html` (vendor).
4. Tell me "ADMIN-N is ready" (or "VENDOR-N is ready") and I'll integrate it into the React app and re-run the Playwright tour to verify.
5. If something needs changes after integration, tell me the page ID and what to change.

**Tasks for tracking:**
- `[ADMIN-01 Login]` … `[ADMIN-15 Settings]` — 15 admin pages
- `[VENDOR-01 Login]` … `[VENDOR-11 Profile]` — 11 vendor pages
- Total: **26 pages**

---

## PLATFORM CONTEXT (include in every prompt)

```
This is CTMP — a Corporate Tender Management Platform for enterprise procurement.
Internal admin staff manage tenders, vendors, approvals, evaluations, and compliance.
External vendors register, browse tenders, and submit sealed bids.
The platform is on-premises, used daily by procurement departments and external companies.
Design for professional enterprise use: clarity, trust, efficiency. No decorations or marketing tone.
```

---

# ADMIN PORTAL — 15 PAGES

---

## ADMIN-01 — Login (`/login`)

```
[PLATFORM CONTEXT]

Build the admin login page. This is the unauthenticated entry point — no navigation sidebar or top bar.

What the page does:
- Lets internal admin staff sign in with their Active Directory username and password.
- On success, redirects to the dashboard.

Fields and actions:
- Username field (Active Directory format, e.g. jsmith@company.local)
- Password field with show/hide toggle
- Sign In button

States to design:
1. Default (empty form)
2. Error state — show a clear error message ("Invalid credentials" or similar)
3. MFA prompt — after valid credentials, if MFA is required, replace the login form with a 6-digit verification code input and a Verify button, plus a back-to-login option

Important context note to display somewhere on the page: users should contact the IT Service Desk if they have authentication issues.
```

---

## ADMIN-02 — Dashboard (`/dashboard`)

```
[PLATFORM CONTEXT]

Build the main admin dashboard. This page is inside the admin portal, which has a persistent left sidebar navigation and a top bar. The sidebar nav items are: Dashboard, Tenders, Approvals, Clarifications, Technical Evaluation, Committee & Commercial, Vendor Management, Reports, Audit Log, System Configuration. The current active item is "Dashboard".

What the page shows:
- Summary counts of: active tenders, pending approvals requiring action, registered vendors, and open clarifications awaiting vendor response
- A visual overview of tenders distributed across lifecycle stages (Draft → Review → Approved → Published → Evaluation → Award), showing how many tenders are at each stage
- A list of recent tender activity (tender ID, current stage, last update time, status) with a link to see all
- Quick action shortcuts: Create New Tender, Review Pending Approvals, Manage Vendor Database
- A platform health/security status indicator

The page should give a procurement manager an at-a-glance view of the platform's current state.
```

---

## ADMIN-03 — Tenders List (`/tenders`)

```
[PLATFORM CONTEXT]

Build the admin tenders list page. Inside admin portal (sidebar active: Tenders).

What the page does:
- Lists all tenders in the system with filtering and search
- Lets the admin navigate to any tender's detail page
- Entry point for creating a new tender

Filters the user can apply:
- Search by tender ID, name, or category
- Filter by status (all lifecycle stages: Draft, Internal Review, Approved, Published, Clarification Period, Submission Closed, Technical Opening, Technical Evaluation, Commercial Sealed, Committee Commercial Opening, Commercial Evaluation / Comparison, Award Recommendation, Awarded, Tender Closed, Cancelled, Suspended, Archived)
- Optional: date range filter

Table columns per tender:
- Tender ID
- Tender Name and Department
- Category
- Current Stage / Status
- Submission Closing Date
- Actions: view detail, edit

States:
- Populated list with pagination
- Empty state when no tenders match the applied filters
- A "Create New Tender" action accessible from this page
```

---

## ADMIN-04 — Create Tender (`/tenders/new`)

```
[PLATFORM CONTEXT]

Build a multi-step tender creation form. Inside admin portal (sidebar active: Tenders).

The form has 4 steps shown in a visible progress indicator:
1. Basic Information
2. Technical Requirements
3. Evaluation Criteria
4. Documents & Attachments

Step 1 — Basic Information fields:
- Tender Title (required)
- Reference Number (auto-generated, read-only)
- Category (select: Construction, IT Services, Healthcare, Engineering, Services, Insurance, Consulting, Supply)
- Estimated Budget
- Procurement Type (radio: Open Tender / Restricted / Single Source)
- Submission Deadline (date + time)
- Tender Description (rich text or textarea)

Step 1 actions:
- Cancel (goes back to tenders list)
- Save as Draft
- Next: Technical Requirements

The remaining steps (2–4) should show their section headers and placeholder/empty content — full detail is not required for this prompt, but the stepper and navigation must work.

Note: drafts are auto-saved.
```

---

## ADMIN-05 — Tender Detail (`/tenders/[id]`)

```
[PLATFORM CONTEXT]

Build the tender detail page for a single tender. Inside admin portal (sidebar active: Tenders).

What the page shows:
- Tender title, reference number, current status
- A visual lifecycle timeline showing all stages from Draft to Tender Closed, with the current stage highlighted and completed stages marked
- Tender overview: description, category, procurement type, estimated budget, department, submission deadline
- Attached documents list (file name, size, uploaded by, download action)
- Submitted bids table (vendor, submitted date, technical score if evaluated, commercial envelope status, view action)
- Audit trail: chronological log of all state changes (who did what, when)
- Key dates panel: created, published, clarification deadline, submission deadline, technical opening, award
- Stakeholders: created by, approved by, awarded to (if set)

Actions available (only relevant ones based on current status):
- Edit tender
- Submit for Internal Review
- Approve
- Publish
- Close Submissions
- Open Technical Envelopes
- Cancel Tender
- Archive Tender

The Cancel and Archive actions must require a reason and show a confirmation before proceeding.
```

---

## ADMIN-06 — Approval Queue (`/approvals`)

```
[PLATFORM CONTEXT]

Build the approval queue page. Inside admin portal (sidebar active: Approvals).

This page is used by approvers to review and act on pending tasks.

Layout: two-pane split — a list of tasks on the left, detail panel on the right.

Left pane — task list:
- Shows count of pending tasks in the header
- Filter by: search, task type (Tender Approval / Award Approval / Late Submission Exception), date range
- Each task row shows: task type, subject (tender reference + short description), requester, priority (High / Medium / Low)
- Clicking a row loads it in the right panel
- Row hover reveals quick Approve and Reject icon buttons

Right pane — task detail:
- Task ID, priority, full title and description
- Justification text from the requester
- Comment box for the approver (optional comment saved to audit trail)
- List of attached supporting documents with download option
- Action buttons: Confirm Approval, Reject Request
- Rejecting requires entering a reason

Empty state when no task is selected on the right: prompt the user to select a task.
```

---

## ADMIN-07 — Clarifications (`/clarifications`)

```
[PLATFORM CONTEXT]

Build the admin clarifications workspace. Inside admin portal (sidebar active: Clarifications).

This page lets admin staff read and respond to vendor questions about specific tenders.

Layout: three sections — tender selector, thread list, toolbelt.

Tender selector (left panel):
- Tabs: Open / Recent / All
- Search input
- List of tenders with pending clarification counts and last-update time
- Selecting a tender loads its threads in the center

Thread list (center):
- Shows all clarification threads for the selected tender
- Tabs: All Threads / Pending / Answered
- Each thread shows: vendor name, thread subject, status (Pending / Answered / Closed), whether it's public or private, message count
- Expanding a thread shows the full message history (vendor question + admin replies)
- Internal admin notes are visually distinguished from public replies
- Reply form at the bottom: text area, visibility toggle (Public or Private), option to mark as critical, Save Draft and Submit Reply buttons

Toolbelt (right edge):
- Icon-only shortcut buttons for: view tender, key dates, vendor list, audit history

Empty state when no tender is selected: prompt to pick a tender.
```

---

## ADMIN-08 — Technical Evaluation (`/technical-evaluation`)

```
[PLATFORM CONTEXT]

Build the technical evaluation workspace. Inside admin portal (sidebar active: Technical Evaluation).

This page is used by evaluators to score each vendor's technical bid against defined criteria.

Layout: two panes — tender/bid selector on the left, scorecard editor on the right.

Left pane:
- Tabs: Open Evaluations / Completed
- List of tenders eligible for evaluation; each tender expands to show its submitted bids
- Each bid row shows: vendor name, score if already evaluated (or "Not scored"), Pass/Fail status

Right pane — scorecard:
- Header: vendor company name, tender reference
- Status: Draft or Final; Save Draft and Finalize Score buttons
- Scorecard table:
  - Columns: Criterion, Description, Maximum Weight, Score (0–100 numeric input), Evaluator Notes
  - Footer row: computed total weighted score
- Verdict section: Pass / Fail selection
- Overall justification textarea (required to finalize)
- Finalize button locks the scorecard — triggers a confirmation: "Locking these scores is irreversible. Only vendors who PASS proceed to commercial evaluation."
- Shows who last edited the scorecard and when (audit trail footer)
```

---

## ADMIN-09 — Committee & Commercial Opening (`/committee-opening`)

```
[PLATFORM CONTEXT]

Build the committee session management screen for opening commercial envelopes. Inside admin portal (sidebar active: Committee & Commercial).

Business rule (must be communicated clearly on the page): Commercial envelopes can ONLY be opened through an official committee session with a confirmed quorum. This action is permanently audit-logged and irreversible.

Layout: two panes — tender selector on the left, session management on the right.

Left pane:
- List of tenders in "Commercial Sealed" state
- Each entry shows: tender reference, title, number of bids ready

Right pane — session management:
- If no session exists: show a form to schedule a session — date/time picker, member selector (multi-select from internal users), Schedule Session button
- If a session is scheduled:
  - Session details: date, time, status (Scheduled / In Progress / Completed)
  - Committee members list with attendance checkbox per member
  - Quorum indicator: how many members are present vs. required (visual pass/fail)
  - Mark Attendance button (only when session is Scheduled)
  - Past opening records: list of commercial envelope opening events with timestamps
  - Primary action — "Open Commercial Envelopes" button:
    - Only enabled when quorum is met AND session status is Scheduled
    - Requires a confirmation with a remarks field
    - Warning: this action is irreversible and audit-logged
    - On success, session transitions to Completed
```

---

## ADMIN-10 — Commercial Comparison (`/commercial-comparison`)

```
[PLATFORM CONTEXT]

Build the commercial bid comparison screen. Inside admin portal (sidebar active: Committee & Commercial).

This page is permission-gated: users without the commercial:view permission see a locked/access-denied state instead of bid data.

Layout: two panes — tender selector on the left, comparison matrix on the right.

Left pane:
- List of tenders in Commercial Evaluation status
- Each entry shows: reference, title, link to compare bids

Right pane — comparison matrix:
- Header: tender title and reference
- Actions: Export Comparison (download), Submit Award Recommendation (only enabled when all bids have prices entered)
- Comparison table, one row per vendor:
  - Vendor name and technical score
  - Total bid price
  - Price/item breakdown (expandable)
  - Discount percentage
  - Net price
  - Recommended? (select one vendor via radio button)
- Award Recommendation form (visible only to users with commercial:evaluate permission):
  - Recommended vendor (populated from selected row)
  - Justification textarea (required, saved to audit log)
  - Submit Recommendation button

Empty state: message explaining that bids must be commercially opened in a committee session first, with a link to the committee opening page.

Access-denied state (no commercial:view permission): locked view with explanation and contact admin prompt.
```

---

## ADMIN-11 — Vendor Management (`/vendors`)

```
[PLATFORM CONTEXT]

Build the vendor management page. Inside admin portal (sidebar active: Vendor Management).

What the page does:
- Lists all registered vendors with their status
- Lets admins review, approve, reject, suspend, or blacklist vendors
- Shows total count of registered vendors

Filter controls:
- Search by company name, email, or contact name
- Filter by status: All / Pending / Approved / Suspended / Blacklisted
- Country filter

Layout: two panes — vendor list on the left, vendor detail on the right.

Left pane — vendor table:
- Columns: Company (name + email), Registration Date, Status, Primary Contact, Country, action to open detail

Right pane — vendor detail:
- Company name, email, status badge
- Tabs: Overview / Documents / History / Bids
- Overview: registration number, tax ID, country, phone, registered date, approved date, last login
- Warning banner if vendor is Suspended or Blacklisted (shows reason)
- Status change timeline: history of status changes with timestamps
- Admin actions (shown based on current vendor status):
  - Approve / Reject (only if Pending) — both require optional reason
  - Suspend (only if Approved) — requires reason
  - Blacklist (only if Approved or Suspended) — requires reason

Empty state on right: prompt to select a vendor.
```

---

## ADMIN-12 — Audit Log (`/audit-log`)

```
[PLATFORM CONTEXT]

Build the audit log viewer. Inside admin portal (sidebar active: Audit Log).

This is a read-only page. No edit, delete, or modification actions exist anywhere on it — audit entries are immutable.

What the page shows:
- A filterable, paginated table of all audit log entries

Filter controls:
- Date range
- Actor search (person who performed the action)
- Action type dropdown (e.g., TENDER_PUBLISHED, VENDOR_APPROVED, BID_DOCUMENT_UPLOADED, COMMERCIAL_ENVELOPES_OPENED, AWARD_ISSUED, LATE_SUBMISSION_EXCEPTION_GRANTED, and many others)
- Subject ID (the tender, vendor, or bid the action was performed on)
- Apply Filters and Clear buttons

Table columns:
- Timestamp (date and time)
- Actor (name and role)
- Action type
- Subject ID (clickable to navigate to the subject)
- IP address
- Result (Success or Failure)
- Failed entries should be visually distinct

Additional information panels:
- Audit chain integrity status (are all records intact and verified?)
- Failure rate over the last 24 hours
- Storage usage for audit data

Export options: PDF and CSV.

Pagination: show count ("Showing 1–25 of 2,450 entries") and page navigation.
```

---

## ADMIN-13 — Security Alerts (`/security-alerts`)

```
[PLATFORM CONTEXT]

Build the security alerts dashboard. Inside admin portal (sidebar active: Security Alerts — or Audit Log, depending on nav grouping).

What the page shows:
- A list of security events flagged by the system, ordered by recency and severity
- Count of unacknowledged alerts in the header

Filter by severity: All / Critical / High / Medium / Low

Each alert card shows:
- Severity level (Critical, High, Medium, Low)
- Alert type (e.g., Audit chain break, Failed login burst, MFA bypass attempt, Permission escalation, Data export anomaly, Unauthorized service access)
- Timestamp (relative and absolute)
- Short description
- Related metadata: subject ID, source IP, affected user or role
- Actions: Acknowledge (removes from active count), View Details

Acknowledged alerts remain visible but are marked as acknowledged (who acknowledged, when), shown with reduced visual prominence.

Empty state: message that the system is operating normally, no alerts.
```

---

## ADMIN-14 — Reports (`/reports`)

```
[PLATFORM CONTEXT]

Build the reports and analytics catalog page. Inside admin portal (sidebar active: Reports).

This page is permission-gated: users with reports:view can see report definitions; users with reports:export can run exports. Show appropriate messaging if the user lacks a permission.

What the page shows:
- A catalog of available reports, organized by category tabs: All / Tender / Vendor / Financial / Audit / Operations
- Format toggle for choosing export format: XLSX or PDF

Each report card shows:
- Report name
- Report code (short identifier)
- Category
- Description (2 lines)
- Whether it requires special permissions (e.g., commercial export requires commercial:export)
- Run Export button (disabled with explanation if user lacks permission)

Below the catalog:
- Recent Exports section (only visible to users with reports:export):
  - Table showing: report name, format, status (Queued / Running / Completed / Failed), enqueued time, completed time, file size, download action for completed exports
  - Empty state if no exports yet

If user has reports:view but not reports:export: show an informational banner explaining what they can and cannot do.
```

---

## ADMIN-15 — System Configuration / Settings (`/settings`)

```
[PLATFORM CONTEXT]

Build the system configuration hub. Inside admin portal (sidebar active: System Configuration).

The page is organized into tabs:

Tab 1 — Roles & Permissions:
- Left: table of all roles (name, description, permission count), with a Create Role button
- Right (detail panel, opens when a role is selected): permission editor
  - Permissions grouped into categories: Tender Management, Bid Operations, Commercial & Financial, Vendor Control, Reporting & Compliance, User Management
  - Each group is expandable with checkboxes per permission, and a "select all in group" option
  - Save and Discard Changes buttons (Save disabled until changes are made)
  - Permission list includes: tender:view/create/edit/approve/publish/close/cancel, bids:view/evaluate_technical/open_technical/lock, commercial:view/view_status/download/evaluate/export/open, vendor:view/approve/reject/suspend/blacklist, reports:view/export, audit:view, system:configure, roles:manage, permissions:manage, users:list/read/create/update/delete, notification_templates:manage

Tab 2 — Notification Templates:
- Table of notification templates (code, channel EMAIL/SMS, subject, last modified, edit/preview actions)
- Edit view: subject input, body textarea with variable hints (e.g., {{vendor.name}}, {{tender.ref}})

Tab 3 — Platform Settings:
- Key metrics row: total users, MFA compliance %, failed logins in 24h, system health
- List of configurable settings (string, number, toggle, or select per row), each with a key name, description, and editable value
- Save per row or bulk Save All

Tab 4 — Departments:
- Table of departments (name, code, member count, edit/delete actions)
- Create Department button → form/modal with name, code, and description fields
- Empty state if no departments configured yet
```

---

# VENDOR PORTAL — 11 PAGES

---

## VENDOR-01 — Vendor Login (`/login`)

```
[PLATFORM CONTEXT]

Build the external vendor login page. This is the unauthenticated entry point — no navigation sidebar or top bar.

What the page does:
- Lets registered vendors sign in with their email and password
- On success, redirects to the vendor dashboard

Fields and actions:
- Email address field
- Password field with show/hide toggle
- Remember me checkbox
- Forgot password link (goes to /forgot-password)
- Sign In button
- Link to vendor registration (/register) for new vendors

States to design:
1. Default (empty form)
2. Error state — clear error message for invalid credentials
3. MFA prompt — after valid credentials, if MFA is enabled for the account, replace the form with a 6-digit verification code input, Verify button, and back-to-login option

Footer links: Privacy Policy, Terms of Service, Contact Support.
```

---

## VENDOR-02 — Vendor Registration (`/register`)

```
[PLATFORM CONTEXT]

Build the vendor self-registration page. No navigation sidebar or top bar — unauthenticated page.

What the page does:
- Lets a new company register as a vendor on the platform
- Account is pending admin approval after registration
- Email verification is required before the account is active

Registration form fields:
- Company Name (required)
- Registration Number (optional)
- Tax Number (optional)
- Country (required, select from country list)
- Address (optional)
- Phone (optional)
- Primary Contact Email (required)
- Password (required) — show password requirements: minimum 12 characters, mix of letters, digits, and symbols recommended
- Confirm Password (required)
- CAPTCHA widget (required, bot protection)
- Terms checkbox: agreement to Terms of Service and Privacy Policy (links inline, required)
- Submit Registration button

Post-submit success state (replaces the form):
- Confirmation message: "Check your email"
- Explanation: verification link sent to the provided email, expires in 24 hours
- Resend verification email button

Link at bottom for users who already have an account: back to login.
```

---

## VENDOR-03 — Forgot Password (`/forgot-password`)

```
[PLATFORM CONTEXT]

Build the vendor forgot password page. No navigation sidebar or top bar — unauthenticated page.

Three sequential states:

State 1 — Request reset (default):
- Page title: "Reset your password"
- Short explanation
- Email input field
- Send Reset Link button
- Back to login link

State 2 — Confirmation after submitting email:
- "Check your email" heading
- Message: if an account exists for that email, reset instructions were sent; the link expires in 1 hour
- Back to Login button
- Note: message should not confirm or deny whether the email is registered (security)

State 3 — New password form (when user arrives with a valid reset token in the URL):
- "Choose a new password" heading
- New Password field with a strength indicator (shows how strong the password is as the user types)
- Confirm Password field
- Update Password button
- On success: confirmation message with a link to sign in
```

---

## VENDOR-04 — Vendor Dashboard (`/dashboard`)

```
[PLATFORM CONTEXT]

Build the vendor logged-in dashboard. The vendor portal has a top navigation bar (no sidebar). Nav links: Dashboard, Tenders, My Bids, Clarifications, Profile, Logout. Active item: Dashboard.

What the page shows:
- Greeting with the vendor's company name and last login time

Summary counts:
- Active bids (bids in submitted or under-evaluation state)
- Available tenders (currently open for bidding)
- Open clarifications (unread or awaiting admin reply)
- Awarded bids (total wins)

Available Tenders section:
- List of the 5 most recently published tenders available for this vendor to bid on
- Per tender: reference, title, department, category, closing date, "Start Bid" button (or "Submissions Closed" if past deadline)
- "View All Tenders" link
- Empty state if no open tenders

My Active Bids section:
- List of bids the vendor has submitted that are still being evaluated
- Per bid: tender reference, tender title, submitted date, current status (Submitted / Under Technical Review / Under Commercial Review / Awarded / Rejected)
- "View Bid" link per row
- Empty state if no active bids

Recent Clarifications section:
- Latest threads where the vendor has unread admin replies
- Per thread: tender reference, thread subject, time of last reply
- Click navigates to /clarifications
```

---

## VENDOR-05 — Browse Tenders (`/tenders`)

```
[PLATFORM CONTEXT]

Build the vendor tender browse page. Vendor portal top nav active: Tenders.

What the page does:
- Lists all publicly available tenders that vendors can bid on

Filter controls:
- Search by tender ID, title, or category
- Category filter (multi-select)
- "Closing within" time filter (24h / 7 days / 30 days / Any)
- Toggle: "Show only tenders I'm eligible for"
- Clear filters option

Tender cards (grid layout):
- Tender reference number
- Title
- Short description (truncated)
- Category and budget range
- Status (Published or Clarification Period)
- Countdown to closing: show urgency if fewer than 3 days remain, or critical if under 24 hours
- Actions: View Tender detail, Start Bid

Pagination at the bottom.

Empty state when no results match filters.
```

---

## VENDOR-06 — Vendor Tender Detail (`/tenders/[id]`)

```
[PLATFORM CONTEXT]

Build the vendor-facing tender detail page. Vendor portal top nav active: Tenders.

What the page shows:
- Tender title, reference number, current status
- Primary call-to-action based on state:
  - "Start Bid" (if submissions are open and vendor hasn't submitted yet)
  - "View My Bid" (if vendor has already submitted)
  - "Submissions Closed" disabled indicator (if past deadline)

Key dates: Published On, Clarification Deadline, Submission Deadline, Estimated Award Date.

Tabs:

Overview tab:
- Full tender description
- Key facts: Department, Category, Procurement Type, Estimated Budget
- Bid requirements: what vendors must include in their submission

Documents tab:
- List of official tender documents available for download
- Each entry: document name, size, uploading department, download button (download is audit-logged)
- Important documents (RFP, T&Cs, Specifications) shown first

Clarifications tab:
- "Ask a Question" button → opens a form to submit a new question (subject, question text, visibility: Public or Private)
- Public visibility note: public questions and admin answers may be shared with all bidders
- Tabs: All Public Q&A / My Questions
- List of threads with vendor question, admin reply (if any), status (Pending / Answered / Closed)

Eligibility tab:
- Checklist of registration criteria the vendor must meet (registration verified, tax ID present, country match, etc.)
- Check or warning indicator per item

Sticky quick-action bar (bottom of page): Save to Watchlist, Start Bid button.
```

---

## VENDOR-07 — Bid Submission Wizard (`/bids/wizard/[tenderId]`)

```
[PLATFORM CONTEXT]

Build the 4-step vendor bid submission wizard. Vendor portal top nav active: Tenders.

Show a breadcrumb (Tenders / {tender reference} / Submit Bid) and a step progress indicator on every step.

Steps:
1. Terms & Acknowledgement
2. Technical Envelope
3. Commercial Envelope
4. Review & Submit

--- Step 1 — Terms & Acknowledgement ---
- Display the tender's terms and conditions in a scrollable area
- Three required checkboxes (all must be checked to proceed):
  - Vendor has read and understood the tender requirements
  - Vendor confirms the bid will be immutable once submitted
  - Vendor confirms all submitted documents are accurate
- Actions: Cancel, Continue to Technical (disabled until all checked)

--- Step 2 — Technical Envelope ---
- Section heading and important notice: "Technical envelope must contain NO pricing information. Commercial details belong in Step 3."
- File upload area (drag-and-drop or click to browse)
- Uploaded files list: file name, size, SHA-256 hash (truncated preview), remove button
- Add Another File button
- Compliance confirmation checkbox: "I confirm this envelope contains no pricing data."
- Actions: Back, Continue to Commercial

--- Step 3 — Commercial Envelope ---
- Section heading and important notice: "These documents will be SEALED until the official committee opening session. They are not visible to any admin staff until that session."
- Same file upload UI as Step 2
- Optional structured pricing fields: Total Bid Price, Currency, Discount %, Price Validity (days)
- Compliance confirmation checkbox: "I confirm the pricing reflects all costs."
- Actions: Back, Continue to Review

--- Step 4 — Review & Submit ---
- Read-only summary of everything entered:
  - Terms: all 3 acknowledgements confirmed
  - Technical documents: list with hashes
  - Commercial documents: list with hashes, marked as Sealed
  - Pricing summary
- Critical warning: "Once submitted, this bid CANNOT be modified or withdrawn. Documents will be cryptographically sealed and timestamped."
- Actions: Back, Submit Bid (prominent)

Post-submission confirmation (replaces content after successful submit):
- Success message: "Bid Submitted Successfully"
- Submission receipt details: Receipt Number, Submitted At timestamp, Technical document hash, Commercial document hash
- Actions: Download Receipt PDF, Go to My Bids
```

---

## VENDOR-08 — My Bids (`/bids`)

```
[PLATFORM CONTEXT]

Build the vendor's submitted bids list page. Vendor portal top nav active: My Bids.

What the page shows:
- All bids submitted by this vendor

Filter by status: All / Draft / Submitted / Under Evaluation / Awarded / Rejected / Withdrawn

Table columns:
- Tender (reference + title)
- Submitted At (date and relative time)
- Status (Draft / Submitted / Under Technical Review / Under Commercial Review / Awarded / Rejected / Withdrawn)
- Receipt Number (click to copy)
- Number of attached documents
- Actions: View bid detail; Download Receipt (for submitted and later statuses)

Pagination and empty state ("No bids submitted yet. Browse open tenders to get started.").
```

---

## VENDOR-09 — Bid Detail (`/bids/[bidId]`)

```
[PLATFORM CONTEXT]

Build the vendor bid detail page (read-only). Vendor portal top nav active: My Bids.

Important business rule: submitted bids are immutable. There are NO edit, modify, or withdraw actions anywhere on this page.

What the page shows:
- Tender title, reference, and current bid status
- Breadcrumb: My Bids / Receipt #{number}

Submission receipt card:
- Receipt Number (with copy button)
- Submitted At (full timestamp)
- Cryptographic signature preview
- Download Receipt PDF button

Tabs:

Technical Envelope tab:
- List of submitted documents: name, size, full SHA-256 hash (with copy button)
- Verify Checksum button per file (checks that the stored file matches the hash)

Commercial Envelope tab:
- Same as Technical, but with a sealed state indicator
- Banner while sealed: "These documents are sealed. They were transmitted encrypted and have not been viewed by any admin staff."
- Banner after committee opening: "Commercial envelope opened in committee session on {date}. {N} authorized members were present."

Timeline tab:
- Vertical timeline of the bid lifecycle: Submitted → Technical Opening → Technical Evaluation → Commercial Opening → Decision (Awarded / Rejected)
- Each event shows: timestamp, actor (if disclosed to vendor)
```

---

## VENDOR-10 — Vendor Clarifications (`/clarifications`)

```
[PLATFORM CONTEXT]

Build the vendor clarifications page. Vendor portal top nav active: Clarifications.

What the page does:
- Lets vendors view their clarification threads and submit new questions about specific tenders

Header: "Clarifications" + "New Question" button

Tabs: All Threads / My Questions / Public Q&A

Tender filter strip: horizontal list of tenders the vendor has questions about; selecting one filters the thread list.

Thread list:
- Each thread shows: tender reference, thread subject, status (Pending / Answered / Closed), visibility (Public or Private), latest message preview, timestamp, reply count
- Clicking a thread expands it inline to show the full message history
- Admin replies are visually distinguished from the vendor's messages

Reply form (at the bottom of an expanded thread):
- Text area for the reply
- File attachment option
- Submit Reply button
- Note: "Your questions may be made public to all bidders by the administrator."

New question modal (opens from header button):
- Tender selector (autocomplete from tenders the vendor is tracking)
- Subject field
- Visibility: Public (default, with explanation) or Private (for vendor-specific sensitive questions)
- Question text area
- File attachment option
- Submit Question button

Empty state when no threads exist: prompt to pick a tender and ask a question.
```

---

## VENDOR-11 — Vendor Profile (`/profile`)

```
[PLATFORM CONTEXT]

Build the vendor profile and account settings page. Vendor portal top nav active: Profile.

Page heading: "Account Profile" with a save status indicator (All changes saved / Unsaved changes / Saving…).

The page is divided into sections, each independently saveable:

Section 1 — Company Information:
- Company Name (locked once approved — show explanation and "contact admin to change" message)
- Registration Number
- Tax Number
- Country
- Address
- Phone
- Website
- Save Company Info button (enabled only when changes exist)

Section 2 — Primary Contact:
- Contact Full Name
- Contact Email (read-only, shows "Verified" status; "Change email" link opens a re-verification modal)
- Phone

Section 3 — Security:
- Change Password: Current Password, New Password, Confirm New Password, Update Password button
- MFA toggle: enable or disable two-factor authentication; enabling opens a QR code setup modal with a manual entry code and TOTP verification step
- Active Sessions list: device, IP address, last active time, Revoke button per session

Section 4 — Notifications:
- Email preference checkboxes: Tender announcements, Clarification replies, Bid status updates, Award decisions, Platform announcements
- Save Preferences button

Section 5 — Danger Zone:
- Deactivate Account button — requires a reason and shows a confirmation modal
- Notice: "Active bids remain immutable and visible to CTMP admin per regulations even after deactivation."
```

---

# WORKFLOW REMINDER

1. **Pick a prompt** above and paste it into Google Stitch (or your AI UI generator).
2. **Save the generated HTML** to:
   - Admin pages → `apps/web-admin/stitch-designs/<page-folder>/code.html`
   - Vendor pages → `apps/web-vendor/stitch-designs/<page-folder>/code.html`

   Suggested folder names:
   - ADMIN-01 → `ctmp_admin_login_ad_auth`
   - ADMIN-02 → `ctmp_admin_dashboard`
   - ADMIN-03 → `all_tenders_list_view`
   - ADMIN-04 → `create_new_tender_form`
   - ADMIN-05 → `tender_detail_view`
   - ADMIN-06 → `approval_queue_screen`
   - ADMIN-07 → `clarification_center_workspace`
   - ADMIN-08 → `technical_evaluation_workspace`
   - ADMIN-09 → `committee_commercial_opening`
   - ADMIN-10 → `commercial_comparison_authorized_view`
   - ADMIN-11 → `vendor_management_dashboard`
   - ADMIN-12 → `system_audit_log_viewer`
   - ADMIN-13 → `security_alerts_dashboard`
   - ADMIN-14 → `reports_analytics_catalog`
   - ADMIN-15 → `system_configuration_hub`
   - VENDOR-01 → `vendor_login`
   - VENDOR-02 → `vendor_register`
   - VENDOR-03 → `vendor_forgot_password`
   - VENDOR-04 → `vendor_dashboard`
   - VENDOR-05 → `vendor_browse_tenders`
   - VENDOR-06 → `vendor_tender_detail`
   - VENDOR-07 → `vendor_bid_wizard`
   - VENDOR-08 → `vendor_my_bids`
   - VENDOR-09 → `vendor_bid_detail`
   - VENDOR-10 → `vendor_clarifications`
   - VENDOR-11 → `vendor_profile`

3. **Notify me**: "ADMIN-N ready" (or "VENDOR-N ready"). I will:
   - Read the new HTML
   - Update the corresponding React `page.tsx` to match
   - Sync to remote server, rebuild + redeploy
   - Run the Playwright admin/vendor tour to verify
   - Update the matching task to `completed` (or post issues to it if found)

4. If you want changes to a page that's already integrated: tell me "ADMIN-N change request: …" and I'll update the React page and re-deploy.
