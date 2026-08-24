// Verify the three DTO fixes against the deployed dev API, by re-running the exact
// calls that returned 201 before the fix.
const { req, login, check, summary, note } = require('./lib');

const d = n => new Date(Date.now() + n * 86400000).toISOString();
const PASS = 'QaLife!2026';

(async () => {
  console.log('--- Verify: approve / reject / open-envelopes now require justification ---');

  const admin = await login('admin@ctmp.local', 'Admin@12345!');

  // re-enable the two procurement personas (teardown disabled them)
  const us = (await req('GET', '/users', { token: admin })).json;
  const arr = us.items || us.data || us;
  for (const key of ['qa-life-proc1', 'qa-life-proc2']) {
    const u = arr.find(x => (x.email || '').startsWith(key));
    if (u) await req('PATCH', `/users/${u.id}`, { token: admin, body: { status: 'ACTIVE' } });
  }
  const proc1 = await login('qa-life-proc1@hadiclinic.com.kw', PASS);
  const proc2 = await login('qa-life-proc2@hadiclinic.com.kw', PASS);
  check('personas re-enabled', !!(proc1 && proc2));

  const deps = (await req('GET', '/departments', { token: admin })).json;
  const depId = ((deps.items || deps.data || deps).find(x => /information technology/i.test(x.name)) || (deps.items || deps)[0]).id;

  // fresh tender -> Internal Review, so the status guard cannot mask the result
  let r = await req('POST', '/tenders', {
    token: proc1,
    body: {
      title: `QA DTO FIX VERIFY — DELETE ME — ${new Date().toISOString().slice(0, 16)}`,
      description: 'Verifying approve/reject/open now demand justification.',
      departmentId: depId, submissionDeadline: d(3), clarificationDeadline: d(1),
      estimatedBudget: 1000, visibility: 'PUBLIC', procurementType: 'Open Tender',
    },
  });
  const id = r.json.id, ref = r.json.referenceNumber || r.json.reference;
  check('probe tender created', r.ok, ref);
  await req('POST', `/tenders/${id}/submit-for-approval`, { token: proc1, body: {} });
  const s = (await req('GET', `/tenders/${id}`, { token: proc1 })).json;
  check('tender in Internal Review', /internal/i.test(s.status), s.status);

  // ---- THE FIX: empty body must now be refused (was 201) ----
  const empty = await req('POST', `/tenders/${id}/approve`, { token: proc2, body: {} });
  check('approve with EMPTY body refused', empty.status === 400,
    `HTTP ${empty.status} ${JSON.stringify(empty.json?.message?.message ?? empty.json?.message ?? '').slice(0, 140)}`);

  const short = await req('POST', `/tenders/${id}/approve`, { token: proc2, body: { comments: 'ok' } });
  check('approve with 2-char comment refused', short.status === 400,
    `HTTP ${short.status} ${JSON.stringify(short.json?.message?.message ?? short.json?.message ?? '').slice(0, 140)}`);

  const still = (await req('GET', `/tenders/${id}`, { token: proc1 })).json;
  check('tender STILL in Internal Review after refusals', /internal/i.test(still.status), still.status);

  const good = await req('POST', `/tenders/${id}/approve`, {
    token: proc2, body: { comments: 'Approved for the QA verification run after checking scope and budget.' },
  });
  check('approve WITH valid comments accepted', good.ok, `HTTP ${good.status}`);
  const done = (await req('GET', `/tenders/${id}`, { token: proc1 })).json;
  check('tender is Approved', /approved/i.test(done.status), done.status);

  // ---- reject on a second tender ----
  r = await req('POST', '/tenders', {
    token: proc1,
    body: {
      title: `QA DTO FIX VERIFY REJECT — DELETE ME — ${new Date().toISOString().slice(0, 16)}`,
      description: 'Verifying reject demands a reason.',
      departmentId: depId, submissionDeadline: d(3), clarificationDeadline: d(1),
      estimatedBudget: 1000, visibility: 'PUBLIC', procurementType: 'Open Tender',
    },
  });
  const rid = r.json.id, rref = r.json.referenceNumber || r.json.reference;
  await req('POST', `/tenders/${rid}/submit-for-approval`, { token: proc1, body: {} });
  const rEmpty = await req('POST', `/tenders/${rid}/reject`, { token: proc2, body: {} });
  check('reject with EMPTY body refused', rEmpty.status === 400,
    `HTTP ${rEmpty.status} ${JSON.stringify(rEmpty.json?.message?.message ?? rEmpty.json?.message ?? '').slice(0, 140)}`);
  const rGood = await req('POST', `/tenders/${rid}/reject`, { token: proc2, body: { reason: 'Rejected during the QA verification run; scope needs revision before approval.' } });
  check('reject WITH valid reason accepted', rGood.ok, `HTTP ${rGood.status}`);

  // ---- OpenAPI now documents the bodies ----
  const oa = await req('GET', '/../docs-json');
  if (oa.json?.paths) {
    const p = oa.json.paths['/api/v1/committee-sessions/{sessionId}/open-commercial-envelopes']?.post;
    check('open-commercial-envelopes now has a request body schema', !!p?.requestBody,
      p?.requestBody ? JSON.stringify(p.requestBody.content['application/json'].schema) : 'still absent');
    const ap = oa.json.paths['/api/v1/tenders/{id}/approve']?.post;
    check('approve now has a request body schema', !!ap?.requestBody,
      ap?.requestBody ? JSON.stringify(ap.requestBody.content['application/json'].schema) : 'still absent');
  } else note('OpenAPI fetch', `status ${oa.status}`);

  console.log(`\n  probe tenders: ${ref} (${id}), ${rref} (${rid}) — purge these`);
  summary();
  process.exit(0);
})().catch(e => { console.error('FATAL', e); process.exit(1); });
