#!/usr/bin/env bash
# rasterize_vendor_logo.sh — produce branding/vendor_logo.png from the uploaded
# vendor SVG, for use in emails (email clients don't render SVG). Uses the
# chromium already inside the api image. Run after a vendor logo is (re)uploaded
# or on a fresh deploy. Pass the compose project's api container name (default
# ctmp-api).
#
#   bash scripts/rasterize_vendor_logo.sh [api_container]
set -euo pipefail
API="${1:-ctmp-api}"
docker exec -i "$API" node <<'JS'
const fs = require('fs');
let puppeteer; try { puppeteer = require('puppeteer'); } catch { puppeteer = require('puppeteer-core'); }
(async () => {
  const dir = '/data/branding';
  const svg = fs.readdirSync(dir).find(f => f.startsWith('vendor_logo') && f.endsWith('.svg'));
  if (!svg) { console.log('NO_SVG'); process.exit(1); }
  const b64 = fs.readFileSync(dir + '/' + svg).toString('base64');
  const browser = await puppeteer.launch({
    executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || '/usr/bin/chromium-browser',
    args: ['--no-sandbox', '--disable-setuid-sandbox'], headless: 'new',
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1000, height: 600, deviceScaleFactor: 3 });
  await page.setContent('<html><body style="margin:0;padding:0;"><img id="L" src="data:image/svg+xml;base64,' + b64 + '" style="display:block;width:260px;height:auto;"></body></html>', { waitUntil: 'networkidle0' });
  await page.waitForSelector('#L');
  await (await page.$('#L')).screenshot({ path: dir + '/vendor_logo.png', omitBackground: true });
  await browser.close();
  console.log('RASTERIZED -> ' + dir + '/vendor_logo.png');
})().catch(e => { console.error('ERR ' + e.message); process.exit(1); });
JS
