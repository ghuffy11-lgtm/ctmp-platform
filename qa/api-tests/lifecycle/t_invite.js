// Verify the vendor registry invitation feature end to end on dev.
const { req, login, check, note, summary } = require('./lib');
const crypto = require('crypto');

const uniq = Date.now().toString(36);
const TARGET = `qa-invitee-${uniq}@example.com`;

(async () => {
  console.log('--- vendor registry invitation ---');
  const admin = await login('admin@ctmp.local', 'Admin@12345!');
  check('SYSTEM_ADMIN login (fresh JWT carries vendor:invite)', !!admin);

  // ---- create ----
  let r = await req('POST', '/vendor-invitations', {
    token: admin, body: { email: TARGET, companyName: 'ACME Trading Co.' },
  });
  check('create invitation', r.status === 201, `HTTP ${r.status} ${r.text.slice(0, 200)}`);
  if (r.status !== 201) return process.exit(summary() || 1);
  const inv = r.json;
  check('emailStatus SENT', inv.emailStatus === 'SENT', String(inv.emailStatus));
  check('status PENDING', inv.status === 'PENDING', inv.status);
  note('expiresAt', new Date(inv.expiresAt).toISOString().slice(0, 10));
  const days = Math.round((new Date(inv.expiresAt) - Date.now()) / 86400000);
  check('TTL is 14 days', days === 14, `${days} days`);

  // ---- duplicate ----
  const dup = await req('POST', '/vendor-invitations', {
    token: admin, body: { email: TARGET, companyName: 'ACME Trading Co.' },
  });
  check('duplicate refused 409', dup.status === 409, `HTTP ${dup.status}`);
  check('409 carries INVITATION_ALREADY_PENDING', /INVITATION_ALREADY_PENDING/.test(dup.text), dup.text.slice(0, 120));

  // ---- existing vendor account ----
  const existing = await req('POST', '/vendor-invitations', {
    token: admin, body: { email: 'vendor1@vendor.test', companyName: 'Already Registered' },
  });
  check('invite to existing supplier refused 409', existing.status === 409, `HTTP ${existing.status} ${existing.text.slice(0, 120)}`);

  // ---- validation ----
  const bad = await req('POST', '/vendor-invitations', { token: admin, body: { email: 'not-an-email', companyName: 'X' } });
  check('invalid email + short name refused 400', bad.status === 400, `HTTP ${bad.status}`);

  // ---- list ----
  const list = await req('GET', '/vendor-invitations?pageSize=5', { token: admin });
  check('list returns the invitation', list.ok && (list.json.items || []).some(i => i.email === TARGET),
    `total=${list.json?.total}`);
  const row = (list.json.items || []).find(i => i.email === TARGET);
  check('list row exposes no token', row && !JSON.stringify(row).match(/[0-9a-f]{64}/), 'no 64-hex in row');
  check('invitedByName populated', !!row?.invitedByName, String(row?.invitedByName));

  // ---- resolve (public, unauthenticated) ----
  const badTok = await req('GET', '/vendor-auth/invite/deadbeef');
  check('garbage token -> 200 {valid:false}', badTok.status === 200 && badTok.json?.valid === false,
    `HTTP ${badTok.status} ${badTok.text.slice(0, 80)}`);

  process.env.__INV_ID = inv.id;
  console.log(`\n  invitation id: ${inv.id}`);
  console.log(`  target: ${TARGET}`);
  require('fs').writeFileSync('/tmp/qa-invite.json', JSON.stringify({ id: inv.id, email: TARGET }));

  summary();
  process.exit(0);
})().catch(e => { console.error('FATAL', e); process.exit(1); });
