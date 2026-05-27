# In-App Comparison — Flowchart Reference

**Document type:** Visual locked reference
**Created:** 2026-05-27
**Companion to:** `IN_APP_COMPARISON_MASTER_PLAN_2026-05-27.md`

This document holds the **agreed visual model** for the in-app comparison redesign. Each diagram is a Mermaid flowchart that renders on GitHub, in VS Code with the Mermaid extension, and in Markdown previewers.

**Rule:** if a future implementation contradicts a diagram below, the diagram wins until the master plan is formally amended.

---

## Diagram 1 — Tender lifecycle showing the new pages

```mermaid
flowchart TD
    Draft[Draft]
    IR[Internal Review]
    Approved[Approved]
    Published[Published]
    Clar[Clarification Period]
    SubClosed[Submission Closed]
    TechOpen[Technical Opening]
    TechEval[Technical Evaluation]
    CommSealed[Commercial Sealed]
    CommOpen[Committee Commercial Opening]
    CommComp[Commercial Evaluation / Comparison]
    AwardRec[Award Recommendation]
    Awarded[Awarded]
    Closed[Tender Closed]

    Draft --> IR --> Approved --> Published --> Clar --> SubClosed --> TechOpen --> TechEval --> CommSealed --> CommOpen --> CommComp --> AwardRec --> Awarded --> Closed

    %% New page surfaces
    TechCompPage{{NEW: Technical Comparison page<br/>read-only, all evaluators consensus}}
    CommittPage[Committee Opening page<br/>existing — schedule + attendance + open envelopes]
    CommCompPage{{NEW: Commercial Comparison page<br/>hybrid view, replaces existing route}}

    TechEval -. read-only view available from here onward .-> TechCompPage
    TechCompPage -. read-only view stays available .-> AwardRec

    CommOpen --> CommittPage
    CommittPage -- Proceed to Comparison button<br/>attendance carried over --> CommCompPage
    CommCompPage --> CommComp

    classDef new fill:#dcfce7,stroke:#16a34a,color:#14532d,stroke-width:2px
    classDef existing fill:#dbeafe,stroke:#2563eb,color:#1e3a8a
    classDef state fill:#f1f5f9,stroke:#475569,color:#0f172a

    class TechCompPage,CommCompPage new
    class CommittPage existing
    class Draft,IR,Approved,Published,Clar,SubClosed,TechOpen,TechEval,CommSealed,CommOpen,CommComp,AwardRec,Awarded,Closed state
```

**No new lifecycle states.** The new pages slot into existing states — they are richer renderings, not state additions.

---

## Diagram 2 — Commercial Comparison page layout

```mermaid
flowchart TB
    subgraph Page[Commercial Comparison Page]
        Header["Header bar<br/>Tender ID · Status · Quorum chip · Audit badge"]

        subgraph Matrix["TOP SECTION — Matrix (toggle)"]
            ToggleA[Summary view<br/>vendor-per-row]
            ToggleB[Itemized view<br/>line-item-per-row]
        end

        subgraph CardArea["BOTTOM SECTION — Expandable vendor cards (one per vendor)"]
            Card1["Vendor A — PASS<br/>i. Line items breakdown<br/>ii. Technical score detail (read-only)<br/>iii. Commercial documents [open viewer]<br/>iv. Vendor profile snapshot<br/>v. Recommend button"]
            Card2["Vendor B — PASS<br/>same five blocks"]
            Card3["Vendor C — FAIL (grayed out)<br/>FAIL badge, gates that failed<br/>cards still expandable for audit"]
        end

        Footer["Footer<br/>Recommend dialog — opens AwardConfirmDialog"]
    end

    Header --> Matrix
    Matrix --> CardArea
    CardArea --> Footer
    ToggleA <--> ToggleB

    classDef pass fill:#dcfce7,stroke:#16a34a,color:#14532d
    classDef fail fill:#fee2e2,stroke:#dc2626,color:#7f1d1d
    class Card1,Card2 pass
    class Card3 fail
```

**Pre-selection:** when the page loads, the **lowest commercial price among PASS vendors** is auto-highlighted in the matrix and pre-selected in the AwardConfirmDialog. Committee can override.

---

## Diagram 3 — Technical Comparison page layout

```mermaid
flowchart TB
    subgraph Page[Technical Comparison Page]
        Header["Header bar<br/>Tender ID · Status · 'Read-only' badge"]

        subgraph Toggle["Matrix toggle"]
            Layout1[Vendors-as-rows<br/>columns: criteria]
            Layout2[Criteria-as-rows<br/>columns: vendors]
        end

        subgraph Cells["Cell content"]
            Default["Default: consensus average score<br/>color-coded by weighted contribution"]
            Expanded["Expanded: each evaluator's individual score<br/>+ comments per evaluator"]
            Gate["Gate-marked criteria: PASS/FAIL badge<br/>FAIL highlights the row red"]
        end

        Aggregate["Aggregate row/column<br/>Total weighted score · Overall PASS/FAIL (gate-only)"]
    end

    Header --> Toggle
    Toggle --> Cells
    Cells --> Aggregate
    Layout1 <--> Layout2
    Default <--> Expanded
```

**Key reminder from C4:** Total weighted score is for **ranking** PASS vendors only — it never determines PASS/FAIL. PASS/FAIL is gate-only.

---

## Diagram 4 — Award decision flow (the Confirm sequence)

```mermaid
flowchart TD
    Start([Procurement Manager opens<br/>Commercial Comparison page<br/>during committee meeting])

    Quorum{Quorum + Chair<br/>present?}
    Recommend["Click Recommend on vendor card<br/>(default = pre-selected lowest PASS)"]
    PickType{Is recommended vendor<br/>the lowest PASS?}

    Default["DEFAULT PATH<br/>Click Confirm — zero friction<br/>(no text, no PDF required)"]
    Override["OVERRIDE PATH<br/>Justification text required<br/>+ Justification PDF required"]

    NotifyToggle{"Tick 'Notify winning vendor'?<br/>(default OFF)<br/>Tick 'Notify losing vendors'?<br/>(default OFF)"}

    ConfirmBtn[Click Confirm]
    Audit[Audit log entry written:<br/>recommender, vendor, justification, attendees]
    State[Tender state → Awarded]
    NotifyFire{Notifications opted-in?}
    SendNotif[Send portal + email notifications]
    DoNothing[No notifications sent]
    End([Tender complete<br/>Award Minutes PDF available on-demand])

    Start --> Quorum
    Quorum -- No --> DisabledMsg["Confirm button disabled<br/>chip shows missing members + chair"]
    DisabledMsg --> Quorum
    Quorum -- Yes --> Recommend
    Recommend --> PickType
    PickType -- Yes (lowest PASS) --> Default
    PickType -- No (override) --> Override
    Default --> NotifyToggle
    Override --> NotifyToggle
    NotifyToggle --> ConfirmBtn
    ConfirmBtn --> Audit
    Audit --> State
    State --> NotifyFire
    NotifyFire -- Winner toggled on --> SendNotif
    NotifyFire -- Loser toggled on --> SendNotif
    NotifyFire -- None toggled --> DoNothing
    SendNotif --> End
    DoNothing --> End

    classDef good fill:#dcfce7,stroke:#16a34a,color:#14532d
    classDef warn fill:#fef3c7,stroke:#d97706,color:#78350f
    classDef bad fill:#fee2e2,stroke:#dc2626,color:#7f1d1d
    classDef neutral fill:#f1f5f9,stroke:#475569,color:#0f172a

    class Default good
    class Override warn
    class DisabledMsg bad
    class Start,End,Audit,State,SendNotif,DoNothing neutral
```

---

## Diagram 5 — PDF viewer flow (shared component)

```mermaid
flowchart LR
    Click[User clicks a document<br/>on Commercial Comparison<br/>or Technical Comparison<br/>or Technical Evaluation]

    Perm{Has<br/>'viewer:pdf:open'<br/>permission?}
    Auth{Authenticated<br/>session valid?}
    Fetch["GET /api/v1/bids/:id/envelopes/:type/documents/:docId/view<br/>(streams PDF inline)"]
    Audit[Backend writes<br/>document_view_log row]
    Modal[Open full-screen<br/>modal PDF viewer]
    Close[ESC key or Close button]
    DownloadCheck{Click Download?<br/>(if permission granted)}
    Download[Stream PDF as attachment<br/>+ audit log download event]

    Click --> Perm
    Perm -- No --> Deny[Show toast: insufficient permission]
    Perm -- Yes --> Auth
    Auth -- No --> Redirect[Redirect to login]
    Auth -- Yes --> Fetch
    Fetch --> Audit
    Audit --> Modal
    Modal --> DownloadCheck
    DownloadCheck -- No --> Close
    DownloadCheck -- Yes --> Download
    Download --> Modal

    classDef good fill:#dcfce7,stroke:#16a34a
    classDef bad fill:#fee2e2,stroke:#dc2626
    classDef neutral fill:#f1f5f9,stroke:#475569

    class Modal,Audit good
    class Deny,Redirect bad
    class Click,Fetch,DownloadCheck,Download,Close neutral
```

**Key:** the viewer modal cannot open until the audit log row is written. Failing-open on audit logging is not allowed.

---

## Diagram 6 — Amendment workflow

```mermaid
flowchart TD
    Awarded[Tender is in Awarded state]
    Discover["Mistake discovered:<br/>wrong vendor, withdrawal,<br/>calculation error, legal objection"]

    Privilege{User has<br/>'award:amend'?<br/>(default: Proc Mgr + Sys Admin)}
    Open[Open Amend Award form]
    Form["Form fields:<br/>- New recommended vendor<br/>- Mandatory reason (text)<br/>- Mandatory superseding PDF<br/>- Confirmation toggle"]
    Submit[Submit amendment]
    DBRecord["Create new row in awards table<br/>with superseded_by_award_id<br/>linking back to original"]
    AuditA[Audit log: 'Award amended'<br/>references old + new award IDs]
    UI["UI shows BOTH records<br/>Original (struck-through)<br/>+ Amendment (current)"]
    Visible["Both records visible<br/>in tender history forever"]
    NotifyAmend{Notify vendors<br/>about amendment?}
    NotifyEnd[Optional notifications fire]
    End([Amendment complete])

    Awarded --> Discover
    Discover --> Privilege
    Privilege -- No --> Deny[Show: insufficient permission]
    Privilege -- Yes --> Open
    Open --> Form
    Form --> Submit
    Submit --> DBRecord
    DBRecord --> AuditA
    AuditA --> UI
    UI --> Visible
    Visible --> NotifyAmend
    NotifyAmend -- Yes --> NotifyEnd
    NotifyAmend -- No --> End
    NotifyEnd --> End

    classDef neutral fill:#f1f5f9,stroke:#475569
    classDef warn fill:#fef3c7,stroke:#d97706
    classDef good fill:#dcfce7,stroke:#16a34a
    classDef bad fill:#fee2e2,stroke:#dc2626

    class Awarded,Discover,Open,Form,Submit,UI,Visible,End neutral
    class DBRecord,AuditA good
    class Privilege warn
    class Deny bad
```

**The original award is never deleted.** Both records remain in the database and visible in the UI. The amendment supersedes the original via the `superseded_by_award_id` foreign key.

---

## Diagram 7 — Cross-page data dependencies

```mermaid
flowchart LR
    TechEval[Existing<br/>Technical Evaluation page<br/>per-vendor scorecard]
    TechCompPage[NEW<br/>Technical Comparison page<br/>consolidated read-only]
    CommittPage[Existing<br/>Committee Opening page<br/>schedule + attendance + open]
    CommCompPage[NEW<br/>Commercial Comparison page<br/>hybrid view + recommend + confirm]
    AwardMinutes[NEW<br/>Generate Award Minutes PDF<br/>on awarded tender page]
    AuditPage[Existing<br/>Audit log page<br/>full audit list]

    TechEval -- evaluation scores feed --> TechCompPage
    TechCompPage -- read-only reference --> CommCompPage
    CommittPage -- attendance + envelope state --> CommCompPage
    CommCompPage -- award decision + justification --> AwardMinutes
    CommCompPage -- view events --> AuditPage
    TechCompPage -- view events --> AuditPage
    AwardMinutes -- PDF generated --> AuditPage

    classDef new fill:#dcfce7,stroke:#16a34a,color:#14532d
    classDef existing fill:#dbeafe,stroke:#2563eb,color:#1e3a8a

    class TechCompPage,CommCompPage,AwardMinutes new
    class TechEval,CommittPage,AuditPage existing
```

---

## Reading order

Read these diagrams in this order to fully understand the system:

1. **Diagram 1** — where the new pages slot into the existing lifecycle (no new states).
2. **Diagram 7** — how the new pages and existing pages exchange data.
3. **Diagram 2** — what the Commercial Comparison page looks like.
4. **Diagram 3** — what the Technical Comparison page looks like.
5. **Diagram 4** — the actual decision flow when Procurement Manager + committee award a tender.
6. **Diagram 5** — how a single PDF gets viewed (used by both comparison pages + retest D2 fix).
7. **Diagram 6** — what happens when the committee makes a mistake.

---

## Change-control

This document is **locked** alongside the master plan. To amend:

1. Add a `## Amendment YYYY-MM-DD` heading at the bottom.
2. Describe what changed and why.
3. Update or replace the relevant diagram, keeping the old version above the new for traceability.
4. Update `MASTER_PLAN_2026-05-27.md` correspondingly.
5. Add a `DECISION_LOG.md` entry referencing both files.

No silent diagram edits.
