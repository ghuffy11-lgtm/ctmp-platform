// Targeted probe: does approval actually require written comments?
// The 2026-08-21 handover lists this under "Controls verified working". Testing it
// against a tender that is genuinely in INTERNAL_REVIEW, so the status guard cannot mask it.
const { req, login, loadState, check, summary, note } = require('./lib');

const d = n => new Date(Date.now() + n * 86400000).toISOString();

(async () => {
  const st = loadState();
  console.log('--- Probe: approval / opening comment requirements ---');
  const proc1 = await login(st.users.proc1.email);
  const proc2 = await login(st.users.proc2.email);

  // throwaway tender, taken to INTERNAL_REVIEW
  let r = await req('POST', '/tenders', {
    token: proc1,
    body: {
      title: `QA CONTROL PROBE — DELETE ME — ${new Date().toISOString().slice(0, 16)}`,
      description: 'Probe: is approval possible with no comments?',
      departmentId: st.departmentId, submissionDeadline: d(3), clarificationDeadline: d(1),
      estimatedBudget: 1000, visibility: 'PUBLIC', procurementType: 'Open Tender',
    },
  });
  if (!r.ok) { check('probe tender created', false, `${r.status} ${r.text.slice(0, 200)}`); return process.exit(1); }
  const id = r.json.id, ref = r.json.referenceNumber || r.json.reference;
  check('probe tender created', true, ref);

  r = await req('POST', `/tenders/${id}/submit-for-approval`, { token: proc1, body: {} });
  check('probe tender in INTERNAL_REVIEW', r.ok, `HTTP ${r.status}`);
  const before = (await req('GET', `/tenders/${id}`, { token: proc1 })).json;
  check('status is Internal Review', /internal/i.test(before.status), before.status);

  // THE PROBE: approve with no comments at all
  const bare = await req('POST', `/tenders/${id}/approve`, { token: proc2, body: {} });
  const after = (await req('GET', `/tenders/${id}`, { token: proc1 })).json;

  console.log(`\n  approve with NO comments -> HTTP ${bare.status}; tender is now "${after.status}"`);
  check('CONTROL: approval requires written comments', bare.status >= 400,
    bare.status < 400 ? `ACCEPTED with no comments — tender went to ${after.status}` : `refused ${bare.status}`);

  // what got recorded in the audit entry?
  const al = await req('GET', `/tenders/${id}/audit-logs`, { token: st.adminTok });
  const rows = Array.isArray(al.json) ? al.json : (al.json?.items || al.json?.data || []);
  const ap = rows.find(x => /APPROVED/i.test(x.eventType || ''));
  note('TENDER_APPROVED audit row', ap ? JSON.stringify({ risk: ap.riskLevel, after: ap.afterValue }).slice(0, 220) : 'not found');

  console.log(`\n  probe tender ${ref} (${id}) left for teardown`);
  const fs = require('fs');
  const s = JSON.parse(fs.readFileSync('/tmp/qa-lifecycle-state.json', 'utf8'));
  s.probeTender = { id, ref };
  fs.writeFileSync('/tmp/qa-lifecycle-state.json', JSON.stringify(s, null, 2));

  summary();
  process.exit(0);
})().catch(e => { console.error('FATAL', e); process.exit(1); });
