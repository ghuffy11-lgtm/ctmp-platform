// Phase A — provision personas and vendors on DEV.
const { req, login, loadState, saveState, check, note, summary, PASS } = require('./lib');

const USERS = [
  { key: 'proc1', email: 'qa-life-proc1@hadiclinic.com.kw', displayName: 'QA Life Procurement 1', role: 'PROCUREMENT_ADMIN' },
  { key: 'proc2', email: 'qa-life-proc2@hadiclinic.com.kw', displayName: 'QA Life Procurement 2', role: 'PROCUREMENT_ADMIN' },
  { key: 'eval',  email: 'qa-life-eval@hadiclinic.com.kw',  displayName: 'QA Life Tech Evaluator', role: 'TECHNICAL_EVALUATOR' },
  { key: 'com1',  email: 'qa-life-com1@hadiclinic.com.kw',  displayName: 'QA Life Committee Chair', role: 'COMMERCIAL_COMMITTEE_MEMBER' },
  { key: 'com2',  email: 'qa-life-com2@hadiclinic.com.kw',  displayName: 'QA Life Committee 2', role: 'COMMERCIAL_COMMITTEE_MEMBER' },
  { key: 'com3',  email: 'qa-life-com3@hadiclinic.com.kw',  displayName: 'QA Life Committee 3', role: 'COMMERCIAL_COMMITTEE_MEMBER' },
];

(async () => {
  const st = loadState();
  console.log('--- Phase A: provision ---');

  const adminTok = await login('admin@ctmp.local', 'Admin@12345!');
  check('SYSTEM_ADMIN login', !!adminTok);
  st.adminTok = adminTok;

  // roles + departments
  const roles = (await req('GET', '/roles', { token: adminTok })).json;
  const roleArr = Array.isArray(roles) ? roles : (roles.data || roles.items || []);
  const roleId = c => (roleArr.find(r => r.code === c) || {}).id;
  check('roles loaded', roleArr.length > 0, `${roleArr.length} roles`);

  const depsR = (await req('GET', '/departments', { token: adminTok })).json;
  const deps = Array.isArray(depsR) ? depsR : (depsR.data || depsR.items || []);
  st.departmentId = (deps.find(d => /information technology/i.test(d.name)) || deps[0]).id;
  check('department chosen', !!st.departmentId);

  // users (idempotent: 409/400 on existing is fine, we just log in after)
  st.users = st.users || {};
  for (const u of USERS) {
    const rid = roleId(u.role);
    if (!rid) { check(`role ${u.role} exists`, false); continue; }
    const r = await req('POST', '/users', {
      token: adminTok,
      body: {
        email: u.email, displayName: u.displayName, authType: 'LOCAL', password: PASS,
        roleId: rid, departmentIds: [st.departmentId], primaryDepartmentId: st.departmentId,
        sendWelcomeEmail: false,
      },
    });
    if (r.ok) { st.users[u.key] = { email: u.email, id: r.json.id, role: u.role }; check(`create ${u.key} (${u.role})`, true); }
    else if (r.status === 409 || /exist/i.test(r.text)) { st.users[u.key] = { email: u.email, role: u.role }; note(`${u.key} already existed`, ''); }
    else { check(`create ${u.key}`, false, `${r.status} ${r.text.slice(0, 200)}`); }
  }

  // verify each persona can log in
  for (const u of USERS) {
    try { const t = await login(u.email); st.users[u.key].tok = t; check(`login ${u.key}`, !!t); }
    catch (e) { check(`login ${u.key}`, false, e.message.slice(0, 200)); }
  }

  saveState(st);
  process.exit(summary() ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(1); });
