// Shared helpers for the dev lifecycle harness.
const API = process.env.QA_API_URL || 'http://localhost:3000/api/v1';
const STATE_FILE = '/tmp/qa-lifecycle-state.json';
const fs = require('fs');

const PASS = 'QaLife!2026';

function loadState() {
  try { return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8')); } catch { return {}; }
}
function saveState(s) { fs.writeFileSync(STATE_FILE, JSON.stringify(s, null, 2)); }

async function req(method, path, { token, body, raw } = {}) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  let payload;
  if (body instanceof FormData) { payload = body; }
  else if (body !== undefined) { headers['Content-Type'] = 'application/json'; payload = JSON.stringify(body); }
  const res = await fetch(API + path, { method, headers, body: payload });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* not json */ }
  return { status: res.status, ok: res.ok, json, text, raw: raw ? res : undefined };
}

async function login(username, password = PASS) {
  const r = await req('POST', '/auth/login', { body: { username, password } });
  if (!r.ok) throw new Error(`login ${username} -> ${r.status} ${r.text.slice(0, 300)}`);
  const t = r.json.accessToken || r.json.access_token || r.json.token;
  if (!t) throw new Error(`login ${username}: no token in ${JSON.stringify(r.json).slice(0, 300)}`);
  return t;
}

async function vendorLogin(email, password = PASS) {
  const r = await req('POST', '/vendor-auth/login', { body: { email, password } });
  if (!r.ok) throw new Error(`vendor login ${email} -> ${r.status} ${r.text.slice(0, 300)}`);
  const t = r.json.accessToken || r.json.access_token || r.json.token;
  if (!t) throw new Error(`vendor login ${email}: no token in ${JSON.stringify(r.json).slice(0, 400)}`);
  return t;
}

const results = [];
function check(name, cond, detail = '') {
  const ok = !!cond;
  results.push({ name, ok, detail });
  console.log(`${ok ? '  PASS' : '  FAIL'}  ${name}${detail ? '  — ' + detail : ''}`);
  return ok;
}
function note(name, detail) {
  results.push({ name, ok: null, detail });
  console.log(`  NOTE  ${name}${detail ? '  — ' + detail : ''}`);
}
function summary() {
  const p = results.filter(r => r.ok === true).length;
  const f = results.filter(r => r.ok === false).length;
  const n = results.filter(r => r.ok === null).length;
  console.log(`\n===== ${p} passed, ${f} failed, ${n} notes =====`);
  if (f) { console.log('FAILURES:'); results.filter(r => r.ok === false).forEach(r => console.log(`  - ${r.name}: ${r.detail}`)); }
  return f;
}

module.exports = { API, PASS, req, login, vendorLogin, loadState, saveState, check, note, summary, results };
