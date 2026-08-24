// Phase E — committee session, quorum + chair gates, commercial envelope opening.
const { req, login, loadState, saveState, check, note, summary } = require('./lib');

const list = j => (Array.isArray(j) ? j : (j?.items || j?.data || []));

(async () => {
  const st = loadState();
  console.log(`--- Phase E: committee commercial opening (${st.ref}) ---`);
  const proc1 = await login(st.users.proc1.email);

  // resolve committee user ids
  const users = list((await req('GET', '/users', { token: st.adminTok })).json);
  const byEmail = e => (users.find(u => (u.email || '').toLowerCase() === e.toLowerCase()) || {}).id;
  const m1 = byEmail(st.users.com1.email), m2 = byEmail(st.users.com2.email), m3 = byEmail(st.users.com3.email);
  check('Committee member ids resolved', !!(m1 && m2 && m3), `${[m1, m2, m3].filter(Boolean).length}/3`);

  // ---------- create session: 3 members, quorum 3, chair = first ----------
  let r = await req('POST', `/tenders/${st.tenderId}/committee-sessions`, {
    token: proc1,
    body: { scheduledAt: new Date().toISOString(), location: 'QA Run', memberIds: [m1, m2, m3], requiredQuorumCount: 3 },
  });
  check('Committee session created (3 members, quorum 3)', r.ok, r.ok ? '' : `${r.status} ${r.text.slice(0, 250)}`);
  if (!r.ok) { saveState(st); return process.exit(summary() || 1); }
  const sessionId = r.json.id;
  st.sessionId = sessionId;
  const members = r.json.committeeMembers || [];
  const chair = members.find(m => m.isChair);
  check('Exactly one chair designated', members.filter(m => m.isChair).length === 1, `chair userId=${chair?.userId?.slice(0, 8)}`);

  // a session below 2 members must be refused
  const tiny = await req('POST', `/tenders/${st.tenderId}/committee-sessions`, {
    token: proc1, body: { scheduledAt: new Date().toISOString(), memberIds: [m1] },
  });
  check('Session with <2 members refused', tiny.status >= 400, `HTTP ${tiny.status}`);

  // ---------- QUORUM GATE 1: only 2 of 3 present, quorum is 3 ----------
  r = await req('POST', `/committee-sessions/${sessionId}/attendance`, { token: proc1, body: { attendeeIds: [m1, m2] } });
  check('Attendance recorded (2 of 3)', r.ok, r.ok ? '' : `${r.status} ${r.text.slice(0, 200)}`);

  let open = await req('POST', `/committee-sessions/${sessionId}/open-commercial-envelopes`, { token: proc1, body: { remarks: 'QA under-quorum probe' } });
  check('UNDER-QUORUM opening REFUSED', open.status >= 400, `HTTP ${open.status} — ${(open.json?.message?.message || open.json?.message || open.text || '').toString().slice(0, 150)}`);

  // ---------- QUORUM GATE 2: 3 present but CHAIR absent ----------
  const nonChair = members.filter(m => !m.isChair).map(m => m.userId);
  r = await req('POST', `/committee-sessions/${sessionId}/attendance`, { token: proc1, body: { attendeeIds: nonChair } });
  if (r.ok) {
    open = await req('POST', `/committee-sessions/${sessionId}/open-commercial-envelopes`, { token: proc1, body: { remarks: 'QA chair-absent probe' } });
    check('CHAIR-ABSENT opening REFUSED', open.status >= 400, `HTTP ${open.status} — ${(open.json?.message?.message || open.json?.message || '').toString().slice(0, 150)}`);
  } else note('chair-absent probe skipped', `attendance update ${r.status}`);

  // still sealed after both refusals
  let bids = list((await req('GET', `/tenders/${st.tenderId}/bids`, { token: proc1 })).json);
  check('Commercial STILL sealed after refusals', bids.every(b => !/OPENED/i.test(b.commercialEnvelopeStatus)),
    JSON.stringify(bids.map(b => b.commercialEnvelopeStatus)));

  // ---------- satisfy quorum: all 3 present incl. chair ----------
  r = await req('POST', `/committee-sessions/${sessionId}/attendance`, { token: proc1, body: { attendeeIds: [m1, m2, m3] } });
  check('Attendance recorded (3 of 3, chair present)', r.ok, r.ok ? '' : `${r.status} ${r.text.slice(0, 200)}`);

  // opening without remarks
  const noRemarks = await req('POST', `/committee-sessions/${sessionId}/open-commercial-envelopes`, { token: proc1, body: {} });
  note('opening without remarks', `HTTP ${noRemarks.status}`);

  if (!noRemarks.ok) {
    open = await req('POST', `/committee-sessions/${sessionId}/open-commercial-envelopes`, { token: proc1, body: { remarks: 'QA lifecycle — quorum met, opening commercial envelopes.' } });
  } else open = noRemarks;
  check('Commercial envelopes OPENED at quorum', open.ok, open.ok ? '' : `${open.status} ${open.text.slice(0, 250)}`);

  bids = list((await req('GET', `/tenders/${st.tenderId}/bids`, { token: proc1 })).json);
  check('Envelope state now OPENED', bids.every(b => /OPENED/i.test(b.commercialEnvelopeStatus)),
    JSON.stringify(bids.map(b => b.commercialEnvelopeStatus)));

  const cur = (await req('GET', `/tenders/${st.tenderId}`, { token: proc1 })).json;
  note('status after opening', cur.status);
  st.status = cur.status;

  saveState(st);
  process.exit(summary() ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(1); });
