# Agent Reviews

This directory holds structured review documents produced by AI agents during phase transitions.
Human reviewers (Codex PM, tech leads) respond directly in the review file before the next phase begins.

---

## Review Entry Format

Each concern must follow this template exactly:

```
### [REVIEW-XXX] Short title

**Location:** file path and line range (or "global" / "schema" / "auth flow")
**Raised by:** agent name or initials, date
**Status:** <see labels below>

**Observation:**
What was found. Facts only — no editorial. Quote the relevant YAML/SQL/code inline.

**Risk if unresolved:**
What breaks, who is affected, when does it matter.

**Proposed resolution:**
Concrete fix or question that must be answered before the status can change.

**PM/Owner response:** _(leave blank — PM fills this in)_
```

---

## Status Labels

| Label | Meaning |
|-------|---------|
| `BLOCKING` | Must be resolved before backend scaffold begins. Proceeding without a decision will produce conflicting code. |
| `RECOMMENDED` | Should be resolved before backend scaffold. Can proceed with a documented assumption, but the assumption may cost rework. |
| `REFINE-IN-IMPL` | Contract intent is clear enough to start coding. Exact shape can be tightened during backend implementation without breaking other phases. |
| `NEEDS-PM-DECISION` | Cannot be resolved by inspection alone. Requires a business or architecture decision from the project owner. |
| `RESOLVED` | PM or owner has responded and a clear path is recorded. |

---

## Review Document Naming

`PHASE_<N>_<AREA>_REVIEW.md`

Example: `PHASE_2_API_CONTRACT_REVIEW.md`
