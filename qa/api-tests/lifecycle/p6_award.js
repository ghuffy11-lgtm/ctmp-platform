// Phase F — commercial comparison, lowest-PASS pre-selection, award confirm, minutes PDF.
const { req, login, loadState, saveState, check, note, summary } = require('./lib');
const fs = require('fs');

const list = j => (Array.isArray(j) ? j : (j?.items || j?.data || j?.rows || []));

(async () => {
  const st = loadState();
  console.log(`--- Phase F: comparison + award (${st.ref}) ---`);
  const proc1 = await login(st.users.proc1.email);
  const evalr = await login(st.users.eval.email);

  // ---------- commercial comparison ----------
  const cmpR = await req('GET', `/tenders/${st.tenderId}/comparison/commercial`, { token: proc1 });
  check('Commercial comparison loads (post-opening)', cmpR.ok, `HTTP ${cmpR.status}`);
  if (!cmpR.ok) { console.log(cmpR.text.slice(0, 400)); saveState(st); return process.exit(summary() || 1); }

  const cmp = cmpR.json;
  const rows = list(cmp.vendors || cmp.bids || cmp);
  check('Comparison has both vendors', rows.length === 2, `${rows.length} rows`);
  console.log('  comparison keys: ' + Object.keys(cmp).join(', '));
  console.log('  row sample: ' + JSON.stringify(rows[0]).slice(0, 400));

  // technical evaluator must still be blocked from commercial detail even AFTER opening
  const blocked = await req('GET', `/tenders/${st.tenderId}/comparison/commercial`, { token: evalr });
  check('Evaluator STILL blocked after opening (opening != visibility)', blocked.status === 403, `HTTP ${blocked.status}`);

  // SYSTEM_ADMIN too
  const adminBlocked = await req('GET', `/tenders/${st.tenderId}/comparison/commercial`, { token: st.adminTok });
  check('SYSTEM_ADMIN STILL blocked after opening', adminBlocked.status === 403, `HTTP ${adminBlocked.status}`);

  // ---------- money precision + lowest identification ----------
  const priced = rows.map(r => ({
    vendor: r.vendorCompany || r.companyName || r.vendorName,
    total: r.totalPrice ?? r.total ?? r.boqTotal ?? r.finalPrice,
    pass: r.technicalResult ?? r.technicalPass ?? r.passed,
    lowest: r.isLowest ?? r.lowest ?? r.preSelected,
    bidId: r.bidId || r.id,
  }));
  console.log('  priced: ' + JSON.stringify(priced));

  const totals = priced.map(p => String(p.total ?? ''));
  check('Totals carry 3 decimals', totals.every(t => /\.\d{3}$/.test(t)), totals.join(' | '));

  // expected: Vendor 1 = 2*1250.750 + 3400.125 + 900.500 = 6802.125
  //           Vendor 2 = 2*1400.500 + 3600.250 + 1100.750 = 7502.000
  const v1 = priced.find(p => /Vendor 1/.test(p.vendor || ''));
  const v2 = priced.find(p => /Vendor 2/.test(p.vendor || ''));
  check('Vendor 1 total == 6802.125 (3-decimal arithmetic)', String(v1?.total) === '6802.125', `got ${v1?.total}`);
  check('Vendor 2 total == 7502.000', /^7502(\.000)?$/.test(String(v2?.total)), `got ${v2?.total}`);

  const lowest = priced.reduce((a, b) => (Number(a.total) <= Number(b.total) ? a : b));
  check('Lowest is Vendor 1', /Vendor 1/.test(lowest.vendor || ''), `${lowest.vendor} @ ${lowest.total}`);
  st.lowestBidId = lowest.bidId;

  // ---------- quorum gate before award ----------
  const q = await req('GET', `/tenders/${st.tenderId}/quorum`, { token: proc1 });
  check('Quorum endpoint reports state', q.ok, JSON.stringify(q.json).slice(0, 200));

  // ---------- non-lowest override must demand justification ----------
  const highest = priced.find(p => p.bidId !== lowest.bidId);
  const badOverride = await req('POST', `/tenders/${st.tenderId}/award/confirm`, {
    token: proc1, body: { bidId: highest.bidId, isLowest: false },
  });
  check('Override without justification REFUSED', badOverride.status >= 400,
    `HTTP ${badOverride.status} ${(badOverride.json?.message?.message || badOverride.json?.message || '').toString().slice(0, 160)}`);

  // ---------- zero-friction award of the lowest ----------
  const conf = await req('POST', `/tenders/${st.tenderId}/award/confirm`, {
    token: proc1, body: { bidId: lowest.bidId, isLowest: true, notifyWinner: false, notifyLosers: false },
  });
  check('Award lowest-PASS in one call (no text, no PDF)', conf.ok, conf.ok ? '' : `${conf.status} ${conf.text.slice(0, 250)}`);

  const cur = (await req('GET', `/tenders/${st.tenderId}`, { token: proc1 })).json;
  check('Tender is AWARDED', /awarded/i.test(cur.status || ''), `status=${cur.status}`);
  note('awardedAmount', String(cur.awardedAmount ?? cur.awarded_amount ?? '(not in payload)'));

  // ---------- minutes PDF ----------
  const pdf = await req('GET', `/tenders/${st.tenderId}/award/minutes.pdf`, { token: proc1, raw: true });
  check('Award Minutes PDF generated', pdf.status === 200, `HTTP ${pdf.status}, ${pdf.text.length} bytes`);
  if (pdf.status === 200) {
    fs.writeFileSync('/tmp/qa-minutes.pdf', Buffer.from(pdf.text, 'binary'));
    check('PDF looks like a PDF', pdf.text.slice(0, 5) === '%PDF-', pdf.text.slice(0, 8));
  }

  saveState(st);
  process.exit(summary() ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(1); });
