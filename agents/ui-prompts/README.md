# CTMP UI Prompts — Workflow

This folder holds the AI prompts for generating each page of the CTMP UI. **Direction:** user generates UI in Stitch (or other AI tools), I integrate it into the codebase.

## Files in this folder

- `UI_PROMPTS.md` — the master prompts document. One self-contained prompt per page (26 total).
- `README.md` — this file.

## Pages tracked

| ID | Page | Route | Status |
|---|---|---|---|
| ADMIN-01 | Login | `/login` | Awaiting user UI |
| ADMIN-02 | Dashboard | `/dashboard` | Awaiting user UI |
| ADMIN-03 | Tenders List | `/tenders` | Awaiting user UI |
| ADMIN-04 | Create Tender | `/tenders/new` | Awaiting user UI |
| ADMIN-05 | Tender Detail | `/tenders/[id]` | Awaiting user UI |
| ADMIN-06 | Approval Queue | `/approvals` | Awaiting user UI |
| ADMIN-07 | Clarifications | `/clarifications` | Awaiting user UI |
| ADMIN-08 | Technical Evaluation | `/technical-evaluation` | Awaiting user UI |
| ADMIN-09 | Committee Opening | `/committee-opening` | Awaiting user UI |
| ADMIN-10 | Commercial Comparison | `/commercial-comparison` | Awaiting user UI |
| ADMIN-11 | Vendor Management | `/vendors` | Awaiting user UI |
| ADMIN-12 | Audit Log | `/audit-log` | Awaiting user UI |
| ADMIN-13 | Security Alerts | `/security-alerts` | Awaiting user UI |
| ADMIN-14 | Reports | `/reports` | Awaiting user UI |
| ADMIN-15 | Settings | `/settings` | Awaiting user UI |
| VENDOR-01 | Login | `/login` | Awaiting user UI |
| VENDOR-02 | Register | `/register` | Awaiting user UI |
| VENDOR-03 | Forgot Password | `/forgot-password` | Awaiting user UI |
| VENDOR-04 | Dashboard | `/dashboard` | Awaiting user UI |
| VENDOR-05 | Browse Tenders | `/tenders` | Awaiting user UI |
| VENDOR-06 | Tender Detail | `/tenders/[id]` | Awaiting user UI |
| VENDOR-07 | Bid Wizard | `/bids/wizard/[tenderId]` | Awaiting user UI |
| VENDOR-08 | My Bids | `/bids` | Awaiting user UI |
| VENDOR-09 | Bid Detail | `/bids/[bidId]` | Awaiting user UI |
| VENDOR-10 | Clarifications | `/clarifications` | Awaiting user UI |
| VENDOR-11 | Profile | `/profile` | Awaiting user UI |

Total: **26 pages**.

## Workflow

1. Open `UI_PROMPTS.md`
2. Copy the prompt for the page you want to build (e.g., `ADMIN-02 Dashboard`)
3. Paste it into Google Stitch (or your AI tool)
4. Save the generated HTML to the suggested folder under `apps/web-admin/stitch-designs/` or `apps/web-vendor/stitch-designs/`
5. Tell Claude "ADMIN-02 ready" — Claude will integrate, deploy, and verify.

## Change tracking

Each page has a task entry in the Claude Code task list (numbered `[ADMIN-XX]` or `[VENDOR-XX]`). When you request changes after a page is integrated, the change request is appended to that task's description so we have an audit trail.

## Useful conventions

- Use the shared design system in `UI_PROMPTS.md` (it's at the top of the file). Every prompt assumes it.
- Don't ask Stitch for marketing copy or filler text — the prompts already say so. If filler shows up, ask Stitch to use realistic CTMP example data.
- Keep page titles short (1–4 words) — they appear in the top bar of the shared chrome.
- Captions: only include subtitles that are needed. Don't add descriptive paragraphs the user hasn't asked for.

## Already-integrated pages (work-in-progress baseline)

These are deployed today and serve as a baseline only — if you generate new UI for these, the integration replaces the current code:

- ADMIN-01 Login — current integration uses old Stitch HTML
- ADMIN-02 Dashboard — current integration uses old Stitch HTML
- ADMIN-03 Tenders — current integration uses old Stitch HTML
- ADMIN-04 Create Tender — current integration uses old Stitch HTML

The other 22 pages are still on the legacy React code (functional but not Stitch-aligned). All 26 are awaiting fresh user-generated UIs.
