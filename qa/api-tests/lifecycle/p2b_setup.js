// Phase B2 — BoQ template, criteria, RFQ document, publish. Resumes the tender from state.
const { req, login, loadState, saveState, check, note, summary } = require('./lib');

(async () => {
  const st = loadState();
  console.log(`--- Phase B2: BoQ / criteria / RFQ / publish  (${st.ref}) ---`);
  const proc1 = await login(st.users.proc1.email);

  // ---------- BoQ template (quantities only; vendors supply prices) ----------
  const items = [
    { itemNo: '1', description: 'Server rack + PDU', qty: 2, unit: 'EA', sortOrder: 1 },
    { itemNo: '2', description: 'UPS 10kVA', qty: 1, unit: 'EA', sortOrder: 2 },
    { itemNo: '3', description: 'Structured cabling', qty: 1, unit: 'LS', sortOrder: 3 },
  ];
  let r = await req('PUT', `/tenders/${st.tenderId}/boq`, { token: proc1, body: { items } });
  check('BoQ template saved', r.ok, r.ok ? `${items.length} lines` : `${r.status} ${r.text.slice(0, 250)}`);

  r = await req('GET', `/tenders/${st.tenderId}/boq`, { token: proc1 });
  const got = Array.isArray(r.json) ? r.json : (r.json?.items || []);
  check('BoQ reads back', got.length === 3, `${got.length} rows`);
  st.boq = got.map(x => ({ id: x.id, itemNo: x.itemNo, qty: x.qty }));

  // ---------- criteria ----------
  const criteria = [
    { code: 'TECH', name: 'Technical compliance', maxScore: 100, weight: 60, mandatory: true, sortOrder: 1 },
    { code: 'DELIV', name: 'Delivery capability', maxScore: 100, weight: 40, mandatory: false, sortOrder: 2 },
  ];
  r = await req('PUT', `/tenders/${st.tenderId}/criteria`, { token: proc1, body: { criteria } });
  check('Criteria saved (60/40, one mandatory gate)', r.ok, r.ok ? '' : `${r.status} ${r.text.slice(0, 250)}`);

  // weights must total 100 — prove the guard
  const badW = await req('PUT', `/tenders/${st.tenderId}/criteria`, {
    token: proc1,
    body: { criteria: [{ code: 'X', name: 'Bad weight', maxScore: 100, weight: 55, mandatory: false }] },
  });
  check('Criteria weights must total 100', badW.status >= 400, `HTTP ${badW.status}`);
  // restore the good set if the bad one somehow stuck
  if (badW.ok) await req('PUT', `/tenders/${st.tenderId}/criteria`, { token: proc1, body: { criteria } });

  // ---------- RFQ document (publish requires >= 1) ----------
  const pdf = Buffer.from(
    '%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n' +
    '3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 300 200]>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n');
  const fd = new FormData();
  fd.append('file', new Blob([pdf], { type: 'application/pdf' }), 'qa-rfq.pdf');
  fd.append('documentType', 'RFQ');
  r = await req('POST', `/tenders/${st.tenderId}/documents`, { token: proc1, body: fd });
  check('RFQ document uploaded', r.ok, r.ok ? '' : `${r.status} ${r.text.slice(0, 250)}`);

  // ---------- publish ----------
  r = await req('POST', `/tenders/${st.tenderId}/publish`, { token: proc1, body: {} });
  check('Publish accepted', r.ok, r.ok ? '' : `${r.status} ${r.text.slice(0, 250)}`);
  const cur = (await req('GET', `/tenders/${st.tenderId}`, { token: proc1 })).json;
  check('Status is Published', /published|clarification/i.test(cur.status || ''), `status=${cur.status}`);
  st.status = cur.status;

  saveState(st);
  process.exit(summary() ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(1); });
