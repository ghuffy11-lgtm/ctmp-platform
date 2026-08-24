// Phase G — money precision from the comparison payload, override/justification gates
// via amend, supersede rule, and the audit trail.
const { req, login, loadState, saveState, check, note, summary } = require('./lib');

(async () => {
  const st = loadState();
  console.log(`--- Phase G: precision, override gates, supersede, audit (${st.ref}) ---`);
  const proc1 = await login(st.users.proc1.email);

  const cmp = (await req('GET', `/tenders/${st.tenderId}/comparison/commercial`, { token: proc1 })).json;
  const rows = cmp.vendors || [];
  console.log('  vendor row fields: ' + Object.keys(rows[0] || {}).join(', '));

  const tot = r => r.finalPrice ?? r.totalPrice ?? r.boqTotal ?? r.commercialTotal ?? r.total;
  const priced = rows.map(r => ({ v: r.vendorName, t: tot(r), pass: r.technicalResult, bidId: r.bidId }));
  console.log('  priced: ' + JSON.stringify(priced));

  const v1 = priced.find(p => /Vendor 1/.test(p.v)), v2 = priced.find(p => /Vendor 2/.test(p.v));
  check('Vendor 1 total = 6802.125', String(v1?.t) === '6802.125', `got ${v1?.t}`);
  check('Vendor 2 total = 7502', /^7502(\.0+)?$/.test(String(v2?.t)), `got ${v2?.t}`);
  check('Server marked Vendor 1 as lowest-PASS', cmp.lowestPassBidId === v1?.bidId, `lowestPassBidId=${cmp.lowestPassBidId?.slice(0, 8)} v1=${v1?.bidId?.slice(0, 8)}`);
  check('Both vendors PASS', priced.every(p => p.pass === 'PASS'), JSON.stringify(priced.map(p => p.pass)));

  // ---------- award record ----------
  const awards = (await req('GET', `/tenders/${st.tenderId}/awards`, { token: proc1 })).json;
  const aList = Array.isArray(awards) ? awards : (awards?.items || awards?.data || []);
  check('One award recorded', aList.length === 1, `${aList.length} award rows`);
  const a0 = aList[0] || {};
  check('Award amount 6802.125 (3 decimals preserved)', String(a0.awardedAmount ?? a0.amount) === '6802.125',
    `${a0.awardedAmount ?? a0.amount}`);

  // ---------- OVERRIDE GATE via amend ----------
  const noText = await req('POST', `/tenders/${st.tenderId}/award/amend`, { token: proc1, body: { newBidId: v2.bidId } });
  check('Amend to non-lowest WITHOUT justification refused', noText.status >= 400,
    `HTTP ${noText.status} ${(noText.json?.message?.message || JSON.stringify(noText.json?.message) || '').toString().slice(0, 140)}`);

  const shortText = await req('POST', `/tenders/${st.tenderId}/award/amend`, { token: proc1, body: { newBidId: v2.bidId, justificationText: 'too short' } });
  check('Amend with <20-char justification refused (BUG-149)', shortText.status >= 400,
    `HTTP ${shortText.status} ${(shortText.json?.message?.message || JSON.stringify(shortText.json?.message) || '').toString().slice(0, 140)}`);

  const good = await req('POST', `/tenders/${st.tenderId}/award/amend`, {
    token: proc1,
    body: { newBidId: v2.bidId, justificationText: 'QA lifecycle run: amending to the second vendor purely to verify the supersede rule and the justification gate.' },
  });
  check('Amend WITH valid justification accepted', good.ok, good.ok ? '' : `${good.status} ${good.text.slice(0, 220)}`);

  // ---------- supersede rule: awards are never deleted ----------
  const after = (await req('GET', `/tenders/${st.tenderId}/awards`, { token: proc1 })).json;
  const aAfter = Array.isArray(after) ? after : (after?.items || after?.data || []);
  check('Both award rows retained (never deleted)', aAfter.length === 2, `${aAfter.length} rows`);
  const superseded = aAfter.filter(x => x.supersededByAwardId || x.superseded_by_award_id);
  check('Original marked superseded_by_award_id', superseded.length === 1, `${superseded.length} superseded`);

  saveState(st);
  process.exit(summary() ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(1); });
