# API lifecycle harness

Plain-Node scripts that drive CTMP through its API and assert on the result. They found the two
missing justification controls and verified the registry-invitation feature end to end.

**Why these are not Playwright specs.** They need no browser and no `node_modules` — only `fetch`,
which Node 18+ has built in. That matters because the build box has **no npm registry access**
(`qa/playwright` cannot even install its dependencies there, which is why the Playwright suite runs
only in CI). These run anywhere Node does, including on the box, today.

They are a **complement to** `qa/playwright`, not a replacement: they prove the API's rules, not
that the UI wires up to them.

## Running

From the build box, against dev:

```bash
cd qa/api-tests/lifecycle
QA_API_URL=http://localhost:3000/api/v1 node p1_provision.js
```

`QA_API_URL` defaults to `http://localhost:3000/api/v1`. State passes between scripts through
`/tmp/qa-lifecycle-state.json`, so run them in order.

## ⚠️ Never run these against production

They create tenders, users and bids, and several deliberately provoke failures. `p1_provision.js`
creates six users. On dev that is fine and reversible; on production it is not.

Dev also relays real mail through `mail.hadiclinic.com.kw` — what protects it is the
`notifications.email_override` system setting. **Check that it is set before running anything that
sends email.** Production has it empty, correctly, which is a second reason these must not point
there.

## The scripts

| Script | Covers |
|---|---|
| `lib.js` | Shared helpers — login, request, pass/fail reporting. Not runnable alone |
| `p1_provision.js` | Creates six personas (2 procurement, 1 evaluator, 3 committee) and proves each can log in |
| `p2b_setup.js` | BoQ template, weighted criteria, the weights-must-total-100 guard, RFQ document, publish |
| `p3_bids.js` | Two vendor bids: envelopes, 3-decimal BoQ pricing, commercial terms, submit, and immutability after submit |
| `p4b_eval.js` | Close submissions, technical opening, scoring, finalise. Asserts commercial stays sealed and that evaluators **and** SYSTEM_ADMIN are refused commercial detail |
| `p5_committee.js` | Committee session, and the gates that matter: under-quorum refused, chair-absent refused, envelopes still sealed after both |
| `p6_award.js` | Commercial comparison, lowest-PASS pre-selection, award confirm, minutes PDF |
| `p7_verify.js` | Money precision, the override-justification gate, and the supersede rule on amendment |
| `probe_controls.js` | Isolates one question: does approval accept an empty body? It did — this is the script that found it |
| `t_invite.js` | Registry invitations: create, duplicate `409`, existing-supplier `409`, list, token never exposed |
| `t_convert.js` | Invitation round trip and every degradation path — garbage, unknown, expired, revoked |
| `verify_fix.js` | Re-runs the exact calls that used to return `201` on an empty body, to prove the DTOs took |

## Reading the output

Each line is `PASS`, `FAIL` or `NOTE`, and the run ends with a count. A `FAIL` is frequently the
harness being wrong rather than the system — twice during the original run it was exactly that, and
both times chasing it improved the test. Read the detail before believing the verdict.

## Known rough edges

- **Order matters** and there is no runner enforcing it. Start from `p1_provision.js`.
- `t_convert.js` seeds an invitation row with a known token **directly via SQL**, because the API
  deliberately never returns the raw token. That is the only way to exercise the public lookup, and
  it means the script needs `docker exec` access to postgres.
- Cleanup is not automatic. `scripts/purge_tender.sh` removes tenders; test users are left
  `DISABLED` because the API soft-deletes.
