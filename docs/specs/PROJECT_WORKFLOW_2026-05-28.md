# CTMP — Complete Project Workflow

**Document type:** Reference workflow diagram pack
**Created:** 2026-05-28 (extends `IN_APP_COMPARISON_FLOWCHART_2026-05-27.md`)
**Audience:** Anyone onboarding to the project, owner sanity checks, security/compliance reviews

This document covers the **full project workflow end-to-end**, not just the in-app comparison redesign. For the redesign-specific diagrams (PDF viewer flow, Commercial Comparison page layout, etc.), see the 2026-05-27 flowchart — it remains the authoritative source for those slices.

The 10 diagrams below trace a tender from creation through closure, the actors who touch it, the permission gates that guard each surface, and the audit + notification side-effects of every state change.

---

## 1. Master swim-lane — the whole tender lifecycle in one picture

```mermaid
flowchart TD
    subgraph Owner["Procurement Admin / Officer"]
        O1[Create tender draft] --> O2[Add criteria + RFQ docs + visibility + invitees]
        O2 --> O3[Submit for approval]
        O5[Publish] --> O6[Close submissions]
        O6 --> O7[Open technical envelopes]
        O9[Finalize technical results] --> O10[Schedule committee session]
        O10 --> O11[Open commercial envelopes in session]
        O11 --> O12[Compare + Recommend on Commercial Comparison page]
        O12 --> O13[Confirm award — single click]
        O13 --> O14[Generate Award Minutes PDF on demand]
        O14 --> O15{Need to amend?}
        O15 -- yes --> O16[Amend award — new row supersedes]
        O15 -- no --> O17[Issue formal award → Tender Closed]
    end
    subgraph Approver["Approver / Finance / Legal"]
        A1[Review in Approvals queue] --> A2{Approve?}
        A2 -- yes --> A3[Approved]
        A2 -- no --> A4[Reject → back to Draft]
    end
    subgraph Vendor["Vendor"]
        V1[Self-register with CAPTCHA] --> V2[Email verify]
        V3[Browse PUBLIC + invited tenders] --> V4[Start bid wizard]
        V4 --> V5[Upload technical PDFs]
        V5 --> V6[Upload commercial PDFs]
        V6 --> V7[Submit bid — immutable]
        V7 --> V8[Receive submission receipt + SHA-256]
        V13[Receive award outcome — banner / email if opted in]
    end
    subgraph Evaluator["Technical Evaluator"]
        E1[Open Technical Evaluation page] --> E2[View Full Proposal via PDF viewer]
        E2 --> E3[Score per criterion]
        E3 --> E4[Mark PASS / FAIL]
    end
    subgraph Committee["Commercial Committee"]
        C1[Attend scheduled session] --> C2[Mark attendance]
        C2 --> C3[Quorum + Chair check]
        C3 --> C4[Witness envelope opening]
    end
    subgraph System["CTMP System"]
        S1[Audit-log every state change + view + download]
        S2[Hash-chain audit_logs row]
        S3[Send email notifications]
        S4[Generate Award Minutes PDF via puppeteer]
    end

    O3 --> A1
    A3 -.-> O5
    A4 -.-> O1
    O5 --> V3
    O7 --> E1
    E4 --> O9
    O11 --> C2
    O17 --> V13

    O5 --> S3
    O11 --> S1
    O13 --> S1
    O13 --> S3
    O14 --> S4
    O17 --> S3
    S1 --> S2
```

---

## 2. Tender state machine — all transitions

```mermaid
stateDiagram-v2
    [*] --> Draft : tender:create
    Draft --> InternalReview : submit-for-approval
    InternalReview --> Draft : reject (with reason)
    InternalReview --> Approved : approve
    Approved --> Published : publish<br/>(requires procurementType +<br/>estimatedBudget + ≥1 RFQ doc +<br/>≥3 invitees if INVITATION_ONLY)
    Published --> ClarificationPeriod : clarifications opened
    Published --> SubmissionClosed : close-submissions
    ClarificationPeriod --> SubmissionClosed : close-submissions
    SubmissionClosed --> TechnicalOpening : open technical envelopes
    TechnicalOpening --> TechnicalEvaluation : evaluators begin scoring
    TechnicalEvaluation --> CommercialSealed : finalize technical results<br/>(only PASS vendors proceed)
    CommercialSealed --> CommitteeCommercialOpening : committee session opens envelopes
    CommitteeCommercialOpening --> CommercialEvaluation : envelopes OPENED
    CommercialEvaluation --> AwardRecommendation : recommend (legacy 2-step)
    CommercialEvaluation --> Awarded : Confirm (Phase D single-step)
    AwardRecommendation --> Awarded : approve
    AwardRecommendation --> CommercialEvaluation : reject
    Awarded --> Awarded : Amend Award<br/>(creates new row, supersedes prior)
    Awarded --> TenderClosed : Issue formal award

    Draft --> Cancelled : cancel (with reason)
    InternalReview --> Cancelled : cancel
    Approved --> Cancelled : cancel
    Published --> Cancelled : cancel
    ClarificationPeriod --> Cancelled : cancel

    TenderClosed --> Archived : manual archive
    Cancelled --> Archived : manual archive
```

---

## 3. Vendor onboarding — registration → first bid

```mermaid
flowchart TD
    V0[Vendor visits /register on vn.hadiclinic.com.kw:4201] --> V1[Fill form: company + email + password + contact]
    V1 --> V2[Solve hCaptcha challenge — server-side validated]
    V2 --> V3{CAPTCHA passes?}
    V3 -- no --> V0
    V3 -- yes --> V4[Vendor row created status=PENDING<br/>VendorUser created status=ACTIVE]
    V4 --> V5[Verification email sent — token valid 24h]
    V5 --> V6[Vendor clicks link → POST /vendor-auth/verify-email]
    V6 --> V7[Email marked verified]
    V7 --> V8[Procurement Admin reviews in Vendor Management]
    V8 --> V9{Approve?}
    V9 -- yes --> V10[Vendor status = APPROVED]
    V9 -- no --> V11[Vendor status = REJECTED]
    V10 --> V12[Vendor can now log in + browse + bid]
    V12 --> V13[Browse /tenders — sees PUBLIC<br/>+ INVITATION_ONLY where invited]
    V11 -.-> V99[End]

    classDef gate fill:#fff3e0,stroke:#ff9800,stroke-width:2px
    class V3,V8,V9 gate
```

---

## 4. Tender creation → publication

```mermaid
flowchart TD
    T0[Admin clicks New Tender] --> T1[Fill basics:<br/>title + dept + submission deadline]
    T1 --> T2[Add optional:<br/>category + procurementType + KWD budget + visibility]
    T2 --> T3[Save as Draft]
    T3 --> T4[Tender detail page]
    T4 --> T5[Upload RFQ documents — PDF/Office, ≤50MB, server SHA-256]
    T5 --> T6{Visibility?}
    T6 -- PUBLIC --> T8[Configure technical criteria<br/>(library or custom, weights = 100%)]
    T6 -- INVITATION_ONLY --> T7[Manage Invited Vendors panel<br/>add ≥3 vendors]
    T7 --> T8
    T8 --> T9[Submit for Approval]
    T9 --> T10[Status: Internal Review]
    T10 --> T11[Approval workflow — Approver acts in Approvals queue]
    T11 --> T12{Approved?}
    T12 -- yes --> T13[Status: Approved]
    T12 -- no --> T14[Status: Draft with rejection reason]
    T13 --> T15[Admin clicks Publish]
    T15 --> T16{Pre-publish gates pass?<br/>• procurementType set<br/>• estimatedBudget set<br/>• ≥1 RFQ document<br/>• INVITATION_ONLY: ≥3 invitees}
    T16 -- no --> T17[400: missing fields enumerated]
    T17 -.-> T4
    T16 -- yes --> T18[Status: Published<br/>+ email vendors (deferred — BUG-016)]

    classDef gate fill:#fff3e0,stroke:#ff9800,stroke-width:2px
    class T6,T12,T16 gate
```

---

## 5. Bid submission — vendor side

```mermaid
flowchart TD
    B0[Vendor opens published tender] --> B1{Bidding allowed?}
    B1 -- "tender not Published/Clarification" --> B2[Banner: Tender submission has closed / cancelled / awarded]
    B1 -- "tender is INVITATION_ONLY + not invited" --> B3[Banner: Invitation only]
    B1 -- yes --> B4[Click START BID]
    B4 --> B5[POST /tenders/:id/bids/draft → Bid + 2 envelopes DRAFT]
    B5 --> B6[Bid wizard: technical envelope]
    B6 --> B7[Upload technical PDFs<br/>client: mime+name check<br/>server: mime+magic bytes+SHA-256]
    B7 --> B8[Bid wizard: commercial envelope]
    B8 --> B9[Upload commercial PDFs<br/>same gates]
    B9 --> B10[Review summary]
    B10 --> B11[Click Submit]
    B11 --> B12{Submit gates pass?<br/>• both envelopes non-empty<br/>• deadline not passed<br/>• vendor APPROVED}
    B12 -- no --> B13[Error: which gate failed]
    B12 -- yes --> B14[Atomic transaction:<br/>• Bid → SUBMITTED<br/>• Both envelopes → SUBMITTED + LOCKED<br/>• Documents lockedAt set<br/>• Receipt with SHA-256 created]
    B14 --> B15[Vendor sees submission receipt<br/>receiptNumber + receiptHash + per-doc SHA-256]
    B15 --> B16[Bids are IMMUTABLE — no revision after submit]

    classDef gate fill:#fff3e0,stroke:#ff9800,stroke-width:2px
    class B1,B12 gate
```

---

## 6. Technical evaluation

```mermaid
flowchart TD
    TE0[Submission deadline passed] --> TE1[Admin: Open Technical Envelopes]
    TE1 --> TE2[Tender → Technical Opening<br/>technical envelopes → OPENED]
    TE2 --> TE3[Evaluator opens Technical Evaluation page]
    TE3 --> TE4[Pick tender + bid]
    TE4 --> TE5[Scorecard loads per-tender criteria<br/>via GET /tenders/:id/criteria]
    TE5 --> TE6[Click View Full Proposal]
    TE6 --> TE7[GET /bids/:id/envelopes/TECHNICAL/documents/:docId/view]
    TE7 --> TE8[Audit row written BEFORE stream — no failing-open]
    TE8 --> TE9[PDF streams into modal viewer]
    TE9 --> TE10[Evaluator scores per criterion<br/>+ toggles gate met / not met]
    TE10 --> TE11[Click Save Evaluation]
    TE11 --> TE12[TechnicalEvaluation row + per-criterion scores written]
    TE12 --> TE13[Repeat for every bid + every evaluator assigned]
    TE13 --> TE14[Admin: Finalize Technical Results]
    TE14 --> TE15[Server aggregates:<br/>• if ALL mandatory gates passed → PASS<br/>• else → FAIL<br/>(score is for ranking only — master plan §C4)]
    TE15 --> TE16[Tender → Commercial Sealed<br/>bid.technicalResult locked]

    classDef gate fill:#fff3e0,stroke:#ff9800,stroke-width:2px
    class TE15 gate

    classDef audit fill:#e3f2fd,stroke:#1976d2,stroke-width:2px
    class TE8 audit
```

---

## 7. Committee commercial opening + comparison + Confirm

```mermaid
flowchart TD
    CO0[Procurement Admin schedules committee session] --> CO1[Adds members + marks Chair]
    CO1 --> CO2[Session date arrives — physical meeting room]
    CO2 --> CO3[Procurement Admin opens Committee & Commercial page]
    CO3 --> CO4[Mark attendance per member: Present / Absent]
    CO4 --> CO5{Quorum + Chair present?<br/>• ≥ required_quorum_count members PRESENT<br/>• required_role_code member PRESENT}
    CO5 -- no --> CO6[QuorumStatus chip shows reason:<br/>'Need 2 more + Chair must be present'<br/>Confirm DISABLED downstream]
    CO5 -- yes --> CO7[Click Open Commercial Envelopes]
    CO7 --> CO8[Commercial envelopes → OPENED<br/>tender → Commercial Evaluation/Comparison]
    CO8 --> CO9[Navigate to /commercial-comparison]
    CO9 --> CO10[Matrix renders:<br/>• Lowest-PASS highlighted with Award icon<br/>• FAIL grayed but still expandable<br/>• Summary ↔ Itemized toggle]
    CO10 --> CO11[Expand vendor card — 5 blocks:<br/>1 line items 2 tech detail<br/>3 commercial docs 4 vendor profile<br/>5 Recommend button]
    CO11 --> CO12[Click Recommend on a vendor]
    CO12 --> CO13[AwardConfirmDialog opens]
    CO13 --> CO14{Lowest-PASS or override?}
    CO14 -- lowest-PASS --> CO15[Zero-friction Confirm<br/>no text no PDF required]
    CO14 -- override --> CO16[Required: ≥100 chars text<br/>+ PDF upload first<br/>POST /award/justification-document]
    CO16 --> CO17[Returns documentId valid 15 min]
    CO17 --> CO15
    CO15 --> CO18[Toggle vendor notification opt-ins<br/>(default OFF for both winner + losers)]
    CO18 --> CO19[Click Confirm]
    CO19 --> CO20{POST /award/confirm validates:<br/>• quorum still met<br/>• server recomputes lowestPassBidId<br/>• schema CHECK: override → text+PDF<br/>• bid technicalResult = PASS}
    CO20 -- fail --> CO21[400 with specific reason]
    CO21 -.-> CO13
    CO20 -- pass --> CO22[Atomic transaction:<br/>• Award row created<br/>• tender → Awarded<br/>• winning bid → AWARDED]
    CO22 --> CO23[Audit log AWARD_CONFIRMED at CRITICAL]
    CO22 --> CO24[Best-effort notification dispatch<br/>if opt-ins TRUE]

    classDef gate fill:#fff3e0,stroke:#ff9800,stroke-width:2px
    class CO5,CO14,CO20 gate

    classDef audit fill:#e3f2fd,stroke:#1976d2,stroke-width:2px
    class CO23 audit
```

---

## 8. Post-Confirm — notifications + Minutes + amendment

```mermaid
flowchart TD
    PA0[Tender → Awarded] --> PA1{notify_winner flag?}
    PA1 -- TRUE --> PA2[Resolve winning vendor primary contact email<br/>fall back to all active vendor users]
    PA2 --> PA3[Send TENDER_AWARDED_WINNER template<br/>via NotificationsService.sendEmail]
    PA3 --> PA4[NotificationLog row written<br/>status=SENT or FAILED]
    PA1 -- FALSE --> PA5
    PA4 --> PA5{notify_losers flag?}
    PA5 -- TRUE --> PA6[For each losing bid:<br/>send TENDER_AWARDED_LOSER]
    PA5 -- FALSE --> PA7
    PA6 --> PA7[Audit AWARD_NOTIFICATIONS_DISPATCHED<br/>outcomes list preserved in metadata]
    PA7 --> PA8[Forgot opt-in?<br/>POST /award/notify with flags]
    PA8 --> PA1

    PA0 --> PB1[Admin clicks Generate Award Minutes]
    PB1 --> PB2[GET /award/minutes.pdf]
    PB2 --> PB3[AwardMinutesService.generate:<br/>• Aggregate tender + award + bids + attendance<br/>• Render HTML template<br/>• puppeteer-core + system chromium → PDF<br/>• SHA-256 hash + MinIO storage<br/>• award_minutes row inserted]
    PB3 --> PB4[Audit AWARD_MINUTES_GENERATED]
    PB4 --> PB5[Stream application/pdf inline<br/>+ X-Award-Minutes-Sha256 header]
    PB5 --> PB6[Admin downloads<br/>award-minutes-<reference>.pdf]
    PB6 --> PB7[Re-clicking always generates a NEW row + file<br/>per master plan H2]

    PA0 --> PC1{Need to amend?}
    PC1 -- yes --> PC2[Admin clicks Amend Award on tender detail]
    PC2 --> PC3[AmendAwardDialog opens]
    PC3 --> PC4[Required: pick new PASS bid<br/>+ ≥100 char reason<br/>+ PDF upload]
    PC4 --> PC5[POST /award/amend]
    PC5 --> PC6[Atomic transaction:<br/>• new Award row<br/>• prior row superseded_by_award_id set<br/>• awardedVendorId updated<br/>• prior winning bid → SUBMITTED<br/>• new winning bid → AWARDED]
    PC6 --> PC7[Audit AWARD_AMENDED at CRITICAL]
    PC7 --> PC8[Both original + amendment remain visible forever<br/>per master plan F7]

    classDef audit fill:#e3f2fd,stroke:#1976d2,stroke-width:2px
    class PA4,PA7,PB4,PC7 audit
```

---

## 9. RBAC visibility — who can do what at each stage

```mermaid
flowchart LR
    subgraph Roles
        R1[SYSTEM_ADMIN]
        R2[PROCUREMENT_ADMIN]
        R3[PROCUREMENT_OFFICER]
        R4[APPROVER]
        R5[TECHNICAL_EVALUATOR]
        R6[COMMERCIAL_EVALUATOR]
        R7[COMMERCIAL_COMMITTEE_MEMBER]
        R8[AUDITOR]
        R9[VENDOR_ADMIN / VENDOR_USER]
    end

    subgraph Surfaces
        SUR1[Tender CRUD + Publish + Edit criteria]
        SUR2[Approvals queue]
        SUR3[Technical Evaluation page]
        SUR4[Technical Comparison page]
        SUR5[Committee & Commercial page]
        SUR6[Commercial Comparison page<br/>+ Recommend + Confirm]
        SUR7[Amend Award]
        SUR8[Generate Award Minutes]
        SUR9[Audit Log + Security Alerts]
        SUR10[Evaluation Criteria Library]
        SUR11[System Configuration]
        SUR12[Vendor portal: own bids only]
        SUR13[Commercial bid visibility<br/>(commercial:view / download)]
    end

    R1 --> SUR9
    R1 --> SUR10
    R1 --> SUR11
    R2 --> SUR1
    R2 --> SUR5
    R2 --> SUR6
    R2 --> SUR7
    R2 --> SUR8
    R2 --> SUR10
    R2 --> SUR4
    R3 --> SUR1
    R3 --> SUR4
    R4 --> SUR2
    R5 --> SUR3
    R5 --> SUR4
    R6 --> SUR4
    R6 --> SUR6
    R6 --> SUR13
    R7 --> SUR5
    R7 --> SUR6
    R7 --> SUR8
    R7 --> SUR4
    R7 --> SUR13
    R8 --> SUR4
    R8 --> SUR8
    R8 --> SUR9
    R9 --> SUR12

    %% Critical exclusion
    R1 -.X.- SUR13
    R1 -.X.- SUR6

    classDef critical fill:#ffebee,stroke:#c62828,stroke-width:2px
    class SUR13 critical
```

> **Critical exclusion:** `SYSTEM_ADMIN` does NOT receive `commercial:view` / `commercial:download` / `comparison:commercial:view` by default. This is a deliberate separation-of-duties rule enforced from migration 007 + reinforced by every subsequent migration. Master plan §I reaffirms.

---

## 10. Document access + audit gate (read-path security model)

```mermaid
flowchart TD
    D0[Caller hits a document endpoint] --> D1{Endpoint type?}
    D1 -- "bid document VIEW" --> D2[GET /bids/:id/envelopes/:type/documents/:docId/view]
    D1 -- "bid document DOWNLOAD" --> D3[GET /bids/:id/documents/:docId]
    D1 -- "tender RFQ document" --> D4[GET /tenders/:id/documents/:docId]
    D1 -- "Award Minutes" --> D5[GET /tenders/:id/award/minutes.pdf]

    D2 --> D6[OptionalVendorOrUserGuard]
    D3 --> D6
    D4 --> D7[JwtAuthGuard + tender:view]
    D5 --> D8[JwtAuthGuard + award:minutes:generate]

    D6 --> D9{Caller type?}
    D9 -- vendor --> D10{Owns this bid?}
    D9 -- internal user --> D11{Envelope type?}
    D10 -- no --> D12[403 Not your bid]
    D10 -- yes --> D13[Allow]
    D11 -- TECHNICAL --> D14{Envelope status = OPENED?}
    D11 -- COMMERCIAL --> D15{Has commercial:view<br/>AND envelope OPENED?}
    D14 -- no --> D16[403 Not yet opened]
    D14 -- yes --> D13
    D15 -- no --> D17[403 commercial:view required<br/>OR not yet opened]
    D15 -- yes --> D13

    D7 --> D13
    D8 --> D13

    D13 --> D18[VIEW path only: write audit row]
    D18 --> D19[Insert document_view_log row<br/>AND audit_logs hash-chained row]
    D19 --> D20{Audit write succeeded?}
    D20 -- no --> D21[500 — fail closed — NO PDF streamed]
    D20 -- yes --> D22[Stream PDF inline<br/>Content-Disposition: inline<br/>X-Content-Type-Options: nosniff]

    D13 --> D23[DOWNLOAD path:<br/>Content-Disposition: attachment]

    classDef gate fill:#fff3e0,stroke:#ff9800,stroke-width:2px
    class D10,D14,D15,D20 gate

    classDef audit fill:#e3f2fd,stroke:#1976d2,stroke-width:2px
    class D18,D19 audit

    classDef deny fill:#ffebee,stroke:#c62828,stroke-width:2px
    class D12,D16,D17,D21 deny
```

---

## Cross-references

- **Locked design rules:** `IN_APP_COMPARISON_MASTER_PLAN_2026-05-27.md`
- **Redesign-specific diagrams:** `IN_APP_COMPARISON_FLOWCHART_2026-05-27.md`
- **Spec definitions:** `implementation-spec.md`
- **Lifecycle states (canonical):** CLAUDE.md "Domain Vocabulary"
- **Phase completion:** `IN_APP_COMPARISON_TRACKER_2026-05-27.md`
- **Recent code changes:** `agents/handoffs/HANDOVER.md`

End of project workflow pack.
