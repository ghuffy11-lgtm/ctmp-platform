// Phase D2 — score both bids and finalise. Correct response shape ({total, items}) and EvaluateBidDto.
const { req, login, loadState, saveState, check, note, summary } = require('./lib');

const list = j => (Array.isArray(j) ? j : (j?.items || j?.data || j?.criteria || []));

(async () => {
  const st = loadState();
  console.log(`--- Phase D2: technical evaluation (${st.ref}) ---`);
  const proc1 = await login(st.users.proc1.email);
  const evalr = await login(st.users.eval.email);

  const bids = list((await req('GET', `/tenders/${st.tenderId}/bids`, { token: proc1 })).json);
  check('Bids visible to procurement', bids.length === 2, `${bids.length} bids`);

  // sealed invariant, now read correctly
  const comm = bids.map(b => b.commercialEnvelopeStatus);
  const vis = bids.map(b => b.commercialDetailsVisible);
  check('Commercial envelopes NOT opened before committee', comm.every(s => !/OPENED/i.test(s)), `states=${JSON.stringify(comm)}`);
  check('commercialDetailsVisible false for all bids', vis.every(v => v === false), `${JSON.stringify(vis)}`);
  check('Technical envelopes OPENED', bids.every(b => /OPENED/i.test(b.technicalEnvelopeStatus)), JSON.stringify(bids.map(b => b.technicalEnvelopeStatus)));

  const crit = list((await req('GET', `/tenders/${st.tenderId}/criteria`, { token: proc1 })).json);
  check('Criteria loaded', crit.length === 2, crit.map(c => `${c.code}:${c.weight}`).join(' '));

  // Vendor 1 scores higher; both PASS the mandatory gate.
  const scoreFor = (company) => company === 'Vendor 1' ? [92, 88] : [84, 80];

  for (const b of bids) {
    const s = scoreFor(b.vendorCompany);
    const criterionScores = crit.map((c, i) => ({
      criterion: c.code || c.name, weight: c.weight, score: s[i], comments: 'QA lifecycle scoring',
    }));
    const overall = Math.round(criterionScores.reduce((a, c) => a + c.score * c.weight / 100, 0));
    const r = await req('POST', `/bids/${b.id}/technical-evaluations`, {
      token: evalr, body: { score: overall, notes: `QA lifecycle evaluation for ${b.vendorCompany}`, criterionScores },
    });
    check(`Score ${b.vendorCompany} (weighted ${overall})`, r.ok, r.ok ? '' : `${r.status} ${r.text.slice(0, 250)}`);
  }

  let r = await req('POST', `/tenders/${st.tenderId}/finalize-technical-results`, { token: proc1, body: { comments: 'QA lifecycle finalisation.' } });
  check('Technical results finalised', r.ok, r.ok ? '' : `${r.status} ${r.text.slice(0, 300)}`);

  const cur = (await req('GET', `/tenders/${st.tenderId}`, { token: proc1 })).json;
  note('status after finalise', cur.status);
  st.status = cur.status;

  // technical comparison should render
  const tc = await req('GET', `/tenders/${st.tenderId}/comparison/technical`, { token: proc1 });
  check('Technical comparison available', tc.ok, `HTTP ${tc.status}`);

  saveState(st);
  process.exit(summary() ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(1); });
