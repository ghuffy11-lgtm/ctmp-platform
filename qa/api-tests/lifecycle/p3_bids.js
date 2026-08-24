// Phase C — two vendor bids: envelopes, 3-decimal BoQ pricing, commercial terms, submit, immutability.
const { req, vendorLogin, loadState, saveState, check, note, summary } = require('./lib');

const PDF = Buffer.from(
  '%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n' +
  '3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 300 200]>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n');

async function upload(tok, path, name, field = 'file', extra = {}) {
  const fd = new FormData();
  fd.append(field, new Blob([PDF], { type: 'application/pdf' }), name);
  for (const [k, v] of Object.entries(extra)) fd.append(k, v);
  return req('POST', path, { token: tok, body: fd });
}

const VENDORS = [
  { key: 'A', email: 'vendor1@vendor.test', prices: [1250.750, 3400.125, 900.500],
    terms: { brandManufacturer: 'Mindray', countryOfOrigin: 'China', warrantyYears: 3,
             deliveryFrom: 4, deliveryTo: 8, deliveryUnit: 'WEEKS', paymentTerms: '25% signing\n75% delivery' } },
  { key: 'B', email: 'vendor2@vendor.test', prices: [1400.500, 3600.250, 1100.750],
    terms: { brandManufacturer: 'Schneider', countryOfOrigin: 'France', warrantyYears: 2,
             deliveryFrom: 6, deliveryTo: 10, deliveryUnit: 'WEEKS', paymentTerms: '100% on delivery' } },
];

(async () => {
  const st = loadState();
  console.log(`--- Phase C: vendor bids (${st.ref}) ---`);
  st.bids = st.bids || {};

  for (const v of VENDORS) {
    console.log(`\n  [vendor ${v.key}] ${v.email}`);
    const tok = await vendorLogin(v.email);
    check(`vendor ${v.key} login`, !!tok);

    // tender must be visible to the vendor
    const vis = await req('GET', `/tenders/${st.tenderId}`, { token: tok });
    check(`vendor ${v.key} can see the published tender`, vis.ok, `HTTP ${vis.status}`);

    // draft bid
    let r = await req('POST', `/tenders/${st.tenderId}/bids/draft`, { token: tok, body: {} });
    if (!r.ok) { check(`vendor ${v.key} draft bid`, false, `${r.status} ${r.text.slice(0, 200)}`); continue; }
    const bidId = r.json.id || r.json.bidId;
    st.bids[v.key] = { bidId, email: v.email, prices: v.prices };
    check(`vendor ${v.key} draft bid created`, !!bidId);

    // technical envelope doc
    r = await upload(tok, `/bids/${bidId}/envelopes/TECHNICAL/documents`, `tech-${v.key}.pdf`);
    check(`vendor ${v.key} technical envelope doc`, r.ok, r.ok ? '' : `${r.status} ${r.text.slice(0, 200)}`);

    // commercial envelope doc
    r = await upload(tok, `/bids/${bidId}/envelopes/COMMERCIAL/documents`, `comm-${v.key}.pdf`);
    check(`vendor ${v.key} commercial envelope doc`, r.ok, r.ok ? '' : `${r.status} ${r.text.slice(0, 200)}`);

    // BoQ pricing with 3 decimals
    const lines = st.boq.map((b, i) => ({ tenderBoqItemId: b.id, status: 'BIDDING', unitPrice: v.prices[i] }));
    r = await req('PUT', `/bids/${bidId}/boq-items`, { token: tok, body: { items: lines } });
    if (!r.ok) r = await req('POST', `/bids/${bidId}/boq-items`, { token: tok, body: { items: lines } });
    check(`vendor ${v.key} BoQ priced`, r.ok, r.ok ? '' : `${r.status} ${r.text.slice(0, 220)}`);

    // commercial terms
    r = await req('PUT', `/bids/${bidId}/commercial-terms`, { token: tok, body: v.terms });
    if (!r.ok) r = await req('POST', `/bids/${bidId}/commercial-terms`, { token: tok, body: v.terms });
    check(`vendor ${v.key} commercial terms`, r.ok, r.ok ? '' : `${r.status} ${r.text.slice(0, 220)}`);

    // submit
    r = await req('POST', `/bids/${bidId}/submit`, { token: tok, body: {} });
    check(`vendor ${v.key} bid SUBMITTED`, r.ok, r.ok ? '' : `${r.status} ${r.text.slice(0, 250)}`);

    // immutability — a second submit and a price edit must both be refused
    const again = await req('POST', `/bids/${bidId}/submit`, { token: tok, body: {} });
    check(`vendor ${v.key} re-submit refused (immutable)`, again.status >= 400, `HTTP ${again.status}`);
    const edit = await req('PUT', `/bids/${bidId}/boq-items`, { token: tok, body: { items: lines } });
    check(`vendor ${v.key} price edit after submit refused`, edit.status >= 400, `HTTP ${edit.status} ${edit.text.slice(0, 140)}`);
  }

  saveState(st);
  process.exit(summary() ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(1); });
