# Project Skills And Reusable Patterns

This is not a replacement for the implementation spec. It is a concise memory of reusable CTMP-specific implementation patterns that future agents should apply.

Add a new skill/pattern when implementation reveals a repeatable rule, convention, or safe way to do something.

Entry format:

```text
Skill:
Use when:
Pattern:
Do not:
Related files:
```

## Skills

### Cross-Agent Review Process

Use when:

You have a concern about a completed-phase artifact (OpenAPI contract, database schema, seed data, security control, deployment approach). Do not silently edit the artifact — log the concern first.

Pattern:

1. Read `agents/reviews/README.md` for the entry format.
2. Read or create the relevant review file (naming: `PHASE_<N>_<AREA>_REVIEW.md`).
3. Add a new entry under `## Open Threads` using this structure:

```text
### YYYY-MM-DD HH:mm - Agent Name - Concern

Topic:
Files reviewed:
Concern or proposal:
Reasoning:
Recommended change:
Impact if accepted:
Impact if rejected:
Status: OPEN — <classification>
```

Classification must be one of:
- `blocking backend scaffold` — must resolve before next phase starts
- `recommended before backend scaffold` — address but not hard-blocking
- `can be refined during backend implementation` — low risk, defer to impl
- `needs project owner decision` — compliance/scope ambiguity; do not proceed without PM

4. Commit the review file. Do not change the artifact.
5. Wait for PM response in the review file before editing the artifact.

Do not:

- Edit a completed-phase file to fix a concern before logging it here.
- Mark an item as ACCEPTED or IMPLEMENTED without a PM or tech-lead response in the review file.
- Start the next phase if any item is classified `blocking`.

Related files:

`agents/reviews/README.md`, `agents/reviews/PHASE_2_API_CONTRACT_REVIEW.md`

---

### One-Time Token Storage (email verify / password reset)

Use when:

Generating any short-lived one-time token sent to a user via email (email verification, password reset, magic link).

Pattern:

```typescript
import { randomBytes, createHash } from 'crypto';

function newToken() {
  const rawToken = randomBytes(32).toString('hex');  // 64 hex chars, 256 bits
  const tokenHash = createHash('sha256').update(rawToken).digest('hex');
  return { rawToken, tokenHash };
}
```

Store `tokenHash` in the DB (`CHAR(64)` column). Send `rawToken` in the email only. Lookup by `tokenHash`. On use, check `usedAt IS NULL` and `expiresAt > NOW()` before accepting.

When a password reset succeeds, increment `tokenVersion` on the user row so existing refresh tokens are also revoked.

Do not:

- Do not store the raw token.
- Do not use bcrypt for tokens — tokens are already max entropy, bcrypt is overkill and slow.
- Do not reuse the SHA-256 Checksum Columns pattern (that is for document integrity, uses `CHAR(64) NOT NULL` with a hex CHECK). Tokens should have a nullable `usedAt` and an `expiresAt`.

Related files:

`apps/api/src/modules/vendor-auth/vendor-auth.service.ts` (`newToken()`/`hashToken()` helpers), `database/migrations/001_initial_schema.sql` (token tables)

---

### Vendor Account Login Gate

Use when:

Implementing any login or authenticated action for vendor users.

Pattern:

Check all four gates in order before issuing tokens:

```typescript
if (user.lockedUntil && user.lockedUntil > new Date()) throw lockout error
if (!passwordMatch) { increment failedLoginCount, set lockedUntil at threshold; throw }
if (!user.emailVerifiedAt) throw forbidden
if (vendor.status !== 'APPROVED') throw forbidden
if (user.status !== 'ACTIVE') throw unauthorized
```

On success: reset `failedLoginCount = 0`, `lockedUntil = null`, set `lastLoginAt`.

Lockout config: `auth.maxFailedLogins` (default 5), `auth.lockoutMinutes` (default 15).

Do not:

- Do not check the password before checking lockout — avoids bcrypt timing attack on locked accounts.
- Do not reveal whether the email exists via different error messages.
- Do not issue tokens to vendors with `vendor.status = PENDING` even after email verification — admin approval is required.

Related files:

`apps/api/src/modules/vendor-auth/vendor-auth.service.ts`

---

### SHA-256 Checksum Columns

Use when:

Adding any column that stores a SHA-256 digest (document checksums, hash-chain values, receipt hashes).

Pattern:

```sql
checksum_sha256  CHAR(64) NOT NULL,
    CONSTRAINT <table>_checksum_sha256_hex CHECK (checksum_sha256 ~ '^[a-f0-9]{64}$')
```

For nullable hash-chain predecessors:

```sql
prev_hash  CHAR(64),
    CONSTRAINT <table>_prev_hash_hex CHECK (prev_hash IS NULL OR prev_hash ~ '^[a-f0-9]{64}$')
```

Application code must produce lowercase hex (e.g. Node `digest('hex')`, Python `.hexdigest()`).

Do not:

- Store uppercase hex — DB will reject it.
- Use VARCHAR(64) without the regex check — length alone does not enforce format.
- Accept the hash from client input; always compute server-side.

Related files:

`database/migrations/002_schema_hardening.sql`

---

### Append-Only Audit Table

Use when:

Adding any table that must be tamper-resistant (audit logs, immutable receipts, append-only chains).

Pattern:

Block mutation at the database with a trigger plus a hash-chain pair of columns:

```sql
CREATE OR REPLACE FUNCTION <table>_block_modifications()
RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION '<table> is append-only: % is not permitted', TG_OP
        USING ERRCODE = 'insufficient_privilege';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER <table>_no_update   BEFORE UPDATE ON <table>   FOR EACH ROW   EXECUTE FUNCTION <table>_block_modifications();
CREATE TRIGGER <table>_no_delete   BEFORE DELETE ON <table>   FOR EACH ROW   EXECUTE FUNCTION <table>_block_modifications();
CREATE TRIGGER <table>_no_truncate BEFORE TRUNCATE ON <table>                EXECUTE FUNCTION <table>_block_modifications();
```

Add `prev_hash_chain_value CHAR(64)` and `hash_chain_value CHAR(64) NOT NULL` columns. The application computes the new hash as `SHA-256(prev_hash || canonical_json(row))`. A separate verifier job re-walks the chain to detect tampering.

Do not:

- Do not rely on application-level enforcement alone.
- Do not allow application-issued TRUNCATE or DROP without explicit governance review.
- Do not store mutable secondary state (status, processed flags) on the same row — append a new row instead.

Related files:

```text
database/migrations/001_initial_schema.sql
docs/specs/implementation-spec.md
```

### Database-Level Workflow Gates

Use when:

A multi-step workflow has a "this state requires that input" rule that absolutely must hold even if application code is wrong.

Pattern:

Add a CHECK constraint that ties dependent columns together. Example from `bid_envelopes`:

```sql
CONSTRAINT commercial_open_requires_session CHECK (
    envelope_type <> 'COMMERCIAL'
 OR status <> 'OPENED'
 OR committee_session_id IS NOT NULL
)
```

For "only one active record per group" rules, use a partial unique index instead of a NULL trick. Example from `late_submission_exceptions`:

```sql
CREATE UNIQUE INDEX late_exception_one_active_per_vendor_tender
    ON late_submission_exceptions (tender_id, vendor_id)
    WHERE status IN ('PENDING_APPROVAL', 'GRANTED');
```

Do not:

- Do not rely on the API to be the only writer; assume a future migration script or DBA query may bypass it.
- Do not use these for soft validation (e.g. format checks) — keep them reserved for invariants where violation would be a compliance breach.

Related files:

```text
database/migrations/001_initial_schema.sql
docs/decisions/DECISION_LOG.md
```

### Seed Idempotency

Use when:

Writing any database seed file that may be re-run on existing environments (baseline roles, default templates, system settings).

Pattern:

- Use natural keys (codes) as the conflict target.
- `INSERT ... ON CONFLICT (code) DO NOTHING` for parent rows.
- For role/permission grants, resolve UUIDs via a CTE that joins on natural keys:

```sql
WITH grants(role_code, permission_code) AS ( VALUES ... )
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM grants g
JOIN roles       r ON r.code = g.role_code
JOIN permissions p ON p.code = g.permission_code
ON CONFLICT DO NOTHING;
```

Do not:

- Do not embed hard-coded UUIDs in seeds (breaks on re-seeding across environments).
- Do not seed sensitive defaults (commercial:view on SYSTEM_ADMIN, default admin passwords) — separation-of-duties rules must survive seeding.

Related files:

```text
database/seeds/001_baseline_roles_permissions.sql
```

### Commercial Envelope Access

Use when:

Implementing API, UI, reports, exports, or tests involving commercial bid data.

Pattern:

Check both:

```text
envelope.status == OPENED
user has required commercial permission
```

Required permissions depend on action:

```text
commercial:view
commercial:download
commercial:evaluate
commercial:export
```

Every sensitive action must create an audit event.

Do not:

- Do not expose commercial details just because the envelope is opened.
- Do not give System Admin automatic commercial access.
- Do not use generic document download routes for commercial files.

Related files:

```text
docs/specs/implementation-spec.md
docs/decisions/DECISION_LOG.md
```

### Late Submission Exception

Use when:

Implementing bid submission after deadline, procurement exception screens, reports, or audit logic.

Pattern:

After deadline, normal submission is blocked unless there is an active exception matching:

```text
tender_id
vendor_id
not expired
approved/granted status
```

Submission under exception must be marked as late accepted and audited.

Do not:

- Do not silently accept late bids.
- Do not create global late submission access for all vendors.
- Do not allow late submission to blend into normal reporting.

Related files:

```text
docs/specs/implementation-spec.md
agents/backlog/MASTER_TASK_TRACKER.md
```

### Vendor Registration Bot Protection

Use when:

Implementing vendor registration, forgot password, reset password, or public auth endpoints.

Pattern:

Public vendor auth endpoints should use:

```text
CAPTCHA or approved challenge
server-side validation
rate limiting
security logging
email verification where relevant
```

Do not:

- Do not trust client-side CAPTCHA only.
- Do not create vendor accounts before validation succeeds.
- Do not leak whether an email exists during password reset.

Related files:

```text
docs/specs/implementation-spec.md
docs/security/README.md
```

### Audit Events

Use when:

Implementing any workflow transition, sensitive read, download, export, permission change, exception, or security event.

Pattern:

Audit entries should include:

```text
event_type
actor
entity_type
entity_id
tender_id if applicable
vendor_id if applicable
bid_id if applicable
ip_address
user_agent
before_value
after_value
reason
metadata_json
risk_level
event_time
```

Do not:

- Do not treat audit logging as optional for regulated actions.
- Do not allow application users to edit audit logs.

Related files:

```text
docs/specs/implementation-spec.md
```

---

### Admin Portal: StatusBadge

Use when:

Displaying tender lifecycle status anywhere in `apps/web-admin/` (list tables, detail pages, approval queue, etc.).

Pattern:

```tsx
import { StatusBadge } from '@/components/ui/StatusBadge';

<StatusBadge status={tender.status} />
```

Component lives at `apps/web-admin/src/components/ui/StatusBadge.tsx`. Handles all 17 lifecycle states: Draft, Internal Review, Approved, Published, Clarification Period, Submission Closed, Technical Opening, Technical Evaluation, Commercial Sealed, Committee Commercial Opening, Commercial Evaluation / Comparison, Award Recommendation, Awarded, Tender Closed, Cancelled, Suspended, Archived. Unknown states fall back to a gray badge.

Colors are defined in `STATUS_MAP` as inline styles (see `docs/decisions/DECISION_LOG.md` — StatusBadge inline styles decision). Do not reproduce these color triples inline at call sites.

Do not:

- Do not hardcode status colors at call sites — always use `<StatusBadge />`.
- Do not add status badge colors to `tailwind.config.ts`.
- Do not import the badge in server components without adding `'use client'` if needed.

Related files:

`apps/web-admin/src/components/ui/StatusBadge.tsx`

---

### Admin Portal: Status-Gated Action Buttons

Use when:

Rendering action buttons (Submit, Publish, Cancel, Close Submissions, etc.) on tender detail or list pages.

Pattern:

Map each action to the set of statuses where it is valid:

```tsx
const EDITABLE_STATUSES = ['Draft', 'Internal Review', 'Approved'];
const CANCELLABLE_STATUSES = ['Draft', 'Internal Review', 'Approved', 'Published', 'Clarification Period'];

{tender.status === 'Draft' && <button onClick={() => handleAction('submit-for-approval')}>Submit for Approval</button>}
{tender.status === 'Approved' && <button onClick={() => handleAction('publish')}>Publish</button>}
{EDITABLE_STATUSES.includes(tender.status) && <Link href={`/tenders/${id}/edit`}>Edit</Link>}
{CANCELLABLE_STATUSES.includes(tender.status) && <button>Cancel Tender</button>}
```

Actions POST to explicit workflow endpoints (`/tenders/{id}/submit-for-approval`, `/tenders/{id}/publish`, etc.) not to generic PATCH. After action, refetch the tender so status badge and available buttons update.

Do not:

- Do not show all buttons regardless of status — users should only see actions valid for the current state.
- Do not use PATCH for regulated state transitions — use the explicit action endpoints defined in the OpenAPI contract.
- Do not optimistically update status in the UI before the API confirms the transition.

Related files:

`apps/web-admin/src/app/(admin)/tenders/[id]/page.tsx`, `api-contracts/openapi/ctmp.openapi.yaml`

---

### Admin Portal: Frontend Data Fetch Pattern

Use when:

Fetching paginated or filtered data in any admin portal list page.

Pattern:

```tsx
const [debouncedSearch, setDebouncedSearch] = useState('');

// Debounce search input — avoids firing on every keystroke
useEffect(() => {
  const t = setTimeout(() => setDebouncedSearch(search), 300);
  return () => clearTimeout(t);
}, [search]);

// Reset to page 1 when filters change
useEffect(() => { setPage(1); }, [debouncedSearch, statusFilter]);

const fetchData = useCallback(async () => {
  setLoading(true);
  try {
    const token = getAccessToken();
    const params = new URLSearchParams({ page: String(page), pageSize: '10' });
    if (debouncedSearch) params.set('q', debouncedSearch);
    const result = await get<PaginatedResponse>(`/endpoint?${params}`, token);
    setData(result);
  } catch (err) {
    setError(err instanceof Error ? err.message : 'Load failed');
  } finally {
    setLoading(false);
  }
}, [debouncedSearch, statusFilter, page]);

useEffect(() => { fetchData(); }, [fetchData]);
```

Show fixed-width skeleton rows during load (not a spinner) to avoid layout shift. Show error state with a Retry button. Show empty state with icon + clear-filters link if filters are active.

Do not:

- Do not skip debounce on search inputs — API will receive a request per keystroke.
- Do not share a single `useEffect` for fetch + debounce logic — separate concerns.
- Do not forget to reset `page` to 1 when filters change.

Related files:

`apps/web-admin/src/app/(admin)/tenders/page.tsx`, `apps/web-admin/src/lib/api.ts`, `apps/web-admin/src/lib/auth.ts`

### Audit Payloads Must Use Primitives Only

Use when:

Calling `this.audit.log({...})` from any service. The `beforeValue`, `afterValue`, and `metadata` fields are stored as JSONB and rehydrated on `verifyChain()` boot — any value type whose JS in-memory representation differs from its JSONB roundtrip will silently break the hash chain.

Pattern:

Convert all non-primitive values to plain strings/numbers/booleans/plain-objects/arrays before handing the payload to `audit.log()`. Prisma `Date` objects from `findOne()`/`update()` results are the most common offender — always call `.toISOString()`:

```ts
const updated = await this.prisma.vendor.update({ where: { id }, data: { approvedAt: new Date() } });

await this.audit.log({
  eventType: 'VENDOR_APPROVED',
  entityType: 'Vendor',
  entityId: id,
  beforeValue: { status: VendorStatus.PENDING },
  afterValue: {
    status: VendorStatus.APPROVED,
    approvedAt: updated.approvedAt.toISOString(),   // ← .toISOString(), NOT the raw Date
  },
  riskLevel: AuditRiskLevel.MEDIUM,
});
```

Same rule for `Buffer` (use `.toString('base64')`), `BigInt` (use `.toString()`), `Decimal`, and any custom class. Plain numbers, strings, booleans, `null`, plain `{}` objects, and arrays of those are safe.

Do not:

- Do NOT pass a JS `Date` directly in `beforeValue` / `afterValue` / `metadata`. `canonicalize()` sees `Object.keys(date) === []` and emits `'{}'`; Prisma writes the same `Date` to JSONB as an ISO string. The two representations don't match and the row's stored hash will not validate on the next `verifyChain` run.
- Do NOT rely on Prisma to "fix it up." The asymmetry is at canonicalize time, before Prisma's serializer touches the value.
- Do NOT add date conversions inside `canonicalize()` as a one-off — if the canonicalizer is fixed to be Date-aware, the entire historical chain has to be rebaked under the new rule. That's a coordinated migration, not a casual patch.

Related files:

`apps/api/src/modules/audit/audit.service.ts` (canonicalize, log, verifyChain), `apps/api/src/modules/vendors/vendors.service.ts:133`, `apps/api/src/modules/committee/committee.service.ts:56`, `agents/reviews/AUDIT_CHAIN_BREAK_RCA_2026-05-23.md` (full root-cause history).

### Per-Request Context via AsyncLocalStorage

Use when:

A backend service needs information about the current HTTP request (client IP, User-Agent, request id, eventually trace context) but the call site is several layers deep and threading the value through every controller→service signature would touch dozens of files.

Pattern:

1. Define a typed context interface (`{ ipAddress?, userAgent?, … }`).
2. Wrap Node's `AsyncLocalStorage<TheContext>` inside an `@Injectable()` service exposing `run(ctx, fn)` and `get(): TheContext | undefined`.
3. Add a NestJS middleware that calls `ctx.run({ ipAddress: req.ip, userAgent: req.headers['user-agent'] }, () => next())` for every request. Apply globally via `consumer.apply(...).forRoutes('*')` in `AppModule.configure()`.
4. Mark the module `@Global()` so the service is injectable anywhere without per-module imports.
5. In any consumer (`AuditService`, for example): inject the context service and use its values as **fallbacks** — explicit arguments always win. This keeps tests deterministic (no hidden ambient state surprises) and lets background jobs / scripts pass arguments directly.
6. Set `app.set('trust proxy', 1)` in `main.ts` so `req.ip` resolves to the real client IP through nginx (leftmost X-Forwarded-For), not the loopback / docker-bridge address.

```ts
// audit.service.ts (consumer pattern)
async log(entry: AuditLogEntry): Promise<void> {
  const ctx = this.requestContext.get();
  const resolvedIp = entry.ipAddress ?? ctx?.ipAddress;
  const resolvedUa = entry.userAgent ?? ctx?.userAgent;
  // … use resolvedIp/resolvedUa in the payload …
}
```

Do not:

- Do NOT make consumers depend on the context being present. Outside an HTTP request (BullMQ worker, one-shot script, cron job) `get()` returns `undefined`. Treat the values as optional everywhere.
- Do NOT use AsyncLocalStorage for transactional state (e.g. current Prisma `tx`). Pass those as arguments — they're hot-path and worth the clarity.
- Do NOT set `trust proxy: true` (boolean). That trusts every hop in `X-Forwarded-For`, including any value a client smuggled in. Use the number-of-hops form (`1`, `2`) or a CIDR list matching your actual proxy layer.
- Do NOT raise this to `AsyncLocalStorage` per concept — request context is one well-defined scope. If a second concept (e.g. tenant scoping) shows up later, add fields to the same `RequestContext` interface; don't spawn a parallel ALS instance.

Related files:

`apps/api/src/common/request-context/{request-context.service.ts,request-context.middleware.ts,request-context.module.ts}`, `apps/api/src/app.module.ts` (`configure()`), `apps/api/src/main.ts` (trust proxy), `apps/api/src/modules/audit/audit.service.ts` (consumer).

### Cross-Departmental Visibility via OR-Clause

Use when:

A user role is operationally cross-departmental (committee member, commercial evaluator, future technical evaluator pools) and the existing BUG-028 Part B dept filter would otherwise hide tenders they're actively working on. Owner reported the workaround was to temporarily re-assign people to a tender's department — fragile and a separation-of-duties leak.

Pattern:

1. Identify the authoritative relation that captures the assignment (e.g. `CommitteeMember.userId` + `session.tenderId`, `CommercialEvaluation.evaluatorUserId` + `bid.tenderId`). Reuse what exists; don't introduce a parallel "assigned tenders" table.
2. In `findAll`, change the simple `where.departmentId = { in: depts }` into `where.OR = [{departmentId in depts}, {assigned-via-relation-1}, {assigned-via-relation-2}]`. Empty `depts` becomes `{ in: [] }` so the dept arm matches nothing while the OR arms still grant access.
3. In `findOne`, mirror the logic: dept check failing falls through to `Promise.all([memberHit, evaluatorHit])` count queries against the same relations before throwing `NotFound`. Two cheap COUNT queries are fine here; the alternative (loading the full relation graph) is heavier.
4. Always keep the `system:view_all_departments` bypass arm above the OR — admin/auditor/procurement-lead get everything without paying the OR cost.

```ts
// findAll (excerpt)
where.OR = [
  { departmentId: depts.length > 0 ? { in: depts } : { in: [] } },
  { committeeSessions: { some: { committeeMembers: { some: { userId: user.id } } } } },
  { bids: { some: { commercialEvaluations: { some: { evaluatorUserId: user.id } } } } },
];

// findOne (excerpt — after dept check fails)
const [memberHit, evaluatorHit] = await Promise.all([
  this.prisma.committeeMember.count({ where: { userId: user.id, session: { tenderId: tender.id } } }),
  this.prisma.commercialEvaluation.count({ where: { evaluatorUserId: user.id, bid: { tenderId: tender.id } } }),
]);
if (memberHit === 0 && evaluatorHit === 0) throw new NotFoundException('Tender not found');
```

Do not:

- Do NOT grant `system:view_all_departments` to committee/evaluator roles as a "fix" — it leaks every department's tenders, not just the ones they were assigned to. Re-rejected explicitly during BUG-062.
- Do NOT introduce a duplicate "tender_assignees" table. The relations exist; reuse them.
- Do NOT widen the OR to "anyone in this user's tenant" or similar broad scopes. Stay tied to authoritative per-tender assignment rows.

Related files:

`apps/api/src/modules/tenders/tenders.service.ts` (BUG-062 findAll + findOne), `docs/decisions/DECISION_LOG.md` (2026-05-30 cross-dept entry).

### Dual-Perm Gate (Legacy + New)

Use when:

A permission is being split (e.g. `commercial:view` → `comparison:commercial:view`) and existing code paths still check the old name. The safe migration is to make every gate accept EITHER perm during the transition window rather than flip everything atomically.

Pattern:

1. Backend gates that hand-roll the check inside the service should `&&` the OR explicitly: `if (!perms.includes('commercial:view') && !perms.includes('comparison:commercial:view')) throw …` (BUG-052 `bids.service.ts:391`).
2. Sidebar nav entries gated through the `permission` shorthand → switch to `anyPermission: [newPerm, legacyPerm]` (`Sidebar.tsx`).
3. Page-level mounted-token checks already accept arrays via `hasPermission(token, A) || hasPermission(token, B)`; mirror the same `[newPerm, legacyPerm]` ordering everywhere so the next reader sees the pattern.
4. Once every role and every code path has migrated to the new perm, drop the legacy arm. Don't leave the OR in place "just in case" — it becomes invisible scope creep.

Do not:

- Do NOT split a permission inside a migration without updating all gates in the same commit. The gap window (DB has new perm, code still requires old) silently locks legitimate users out.
- Do NOT use the dual-gate as a permanent escape hatch for a poorly modelled permission. If both names keep stickng around indefinitely, that's a sign the split itself was wrong.

Related files:

`apps/api/src/modules/bids/bids.service.ts` (commercial branch), `apps/web-admin/src/components/layout/Sidebar.tsx` (`/commercial-comparison` entry), `apps/web-admin/src/app/(admin)/commercial-comparison/page.tsx` (page-level mounted-token check).

### Score-Storage Normalisation Display Contract

Use when:

You're rendering an evaluation score that's stored on a 0–100 percentage scale in the database (because per-criterion weighted averaging requires a uniform scale) but the user expects to see the value in absolute units against the criterion's `maxScore`.

Pattern:

1. Treat the DB value as authoritative and never mutate it at write time.
2. Add a small helper at display time: `toAbsolute(normalised, max) = (normalised / 100) * max`. Guard for `max <= 0` and `normalised == null` (return `null` so `fmtScore` formats as `—`).
3. Use it on every display surface that mixes normalised values with max-score context: per-vendor card header (vs. `totalMaxScore`), per-evaluator overall (vs. `totalMaxScore`), per-criterion matrix cell (vs. `c.maxScore`), Total column (vs. `totalMaxScore`).
4. Keep the helper local to the component file unless three+ components need it; lift to a shared util only on the third use.

```ts
function toAbsolute(normalised: number | null, max: number): number | null {
  if (normalised == null || max <= 0) return null;
  return (normalised / 100) * max;
}
// usage
fmtScore(toAbsolute(vendor.consensusScore, totalMaxScore), totalMaxScore)
```

Do not:

- Do NOT scale-on-save. Per-criterion weighted-average math depends on a uniform scale; the backend `evaluate()` deliberately normalises before persisting.
- Do NOT display the raw 0–100 value against an arbitrary `maxScore` (e.g. `fmtScore(83.3, 30)` → "83.3 / 30"). This is the WALK-032/034 regression.

Related files:

`apps/web-admin/src/components/comparison/VendorTechnicalCard.tsx`, `apps/web-admin/src/components/comparison/TechnicalMatrix.tsx`, `apps/api/src/modules/technical-evaluation/technical-evaluation.service.ts` (evaluate normalisation).

### Mounted-Token Hydration Pattern (BUG-046)

Use when:

A page or component needs to read the JWT-derived permission set (via `getAccessToken` + `hasPermission`) to gate render decisions. SSR has no `document.cookie` access; the client hydration step does. Reading the token directly during render produces SSR vs. first-client-render DOM divergence → React hydration crash (#418).

Pattern:

1. Initialise per-perm flags to `false` in `useState`.
2. Compute them inside a `useEffect(() => {...}, [])` on mount, after which the client re-renders with the real values. SSR and first client render produce identical DOM.

```tsx
const [perms, setPerms] = useState({ canEvaluate: false, canConfirm: false });
useEffect(() => {
  const t = getAccessToken();
  if (!t) return;
  setPerms({
    canEvaluate: hasPermission(t, 'commercial:evaluate'),
    canConfirm: hasPermission(t, 'comparison:commercial:confirm'),
  });
}, []);
```

Do not:

- Do NOT call `getAccessToken()` directly during render (the original BUG-046 crash).
- Do NOT skip the mount-deferred read just because "this page is client-only" — Next.js still SSRs the page shell for the layout chain. The hydration mismatch propagates upward.
- Do NOT use `localStorage` or `js-cookie` reads in `useMemo` either — same SSR/CSR divergence trap.

Related files:

`apps/web-admin/src/components/layout/Sidebar.tsx` (the original BUG-046 fix), `apps/web-admin/src/app/(admin)/tenders/[id]/page.tsx` (per-action perm gating), `apps/web-admin/src/app/(admin)/dashboard/page.tsx` (BUG-058 Quick Actions gating), `apps/web-admin/src/app/(admin)/commercial-comparison/page.tsx` (BUG-053/054 canEvaluate + canGenerateMinutes).

### Empty-State Tab Subcomponents (TabSkeleton / TabError / TabEmpty)

Use when:

You're wiring multiple tab panels on the same page (Clarifications / Bids / Audit Trail on tender detail) and each needs identical loading + error + empty UI. Repeating the wrapper structure per tab is noise.

Pattern:

1. Extract three small subcomponents at the bottom of the page file: `TabSkeleton({icon, label})`, `TabError({icon, message})`, `TabEmpty({icon, title, body})`. Each renders a centered card with the icon + relevant text.
2. Each tab panel does its own fetch via `useEffect` + `useState`. It returns `<TabSkeleton/>` while loading, `<TabError/>` on fetch failure, `<TabEmpty/>` when items are empty, otherwise the real list.
3. Pass the tab's domain icon (`MessageSquare`, `FileText`, `Shield`) through so each state still feels owned by the tab.

Do not:

- Do NOT lift these to a shared `@/components` until a second page needs them. The pattern is cheap to repeat once.
- Do NOT skip the explicit error state. Audit-history fetch failures should surface clearly, not silently render empty.

Related files:

`apps/web-admin/src/app/(admin)/tenders/[id]/page.tsx` (the three Tab*Panel components + the three Tab subcomponents at the bottom).

