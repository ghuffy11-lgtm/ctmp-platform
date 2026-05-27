// One-off PDF renderer for PROJECT_WORKFLOW_2026-05-28.md.
// Runs inside the ctmp-api container (which already has puppeteer-core +
// /usr/bin/chromium-browser from Phase E). Reads the markdown, extracts each
// ```mermaid block, embeds them in an HTML page that renders via mermaid.js
// from CDN, and prints to PDF via puppeteer.
//
// Usage (on staging, from /mnt/repo/ctmp-platform):
//   docker exec -i ctmp-api node /tmp/render-workflow-pdf.mjs \
//     /tmp/PROJECT_WORKFLOW_2026-05-28.md /tmp/project-workflow.pdf

import fs from 'fs/promises';
import path from 'path';
import puppeteer from 'puppeteer-core';

const [, , inputPath, outputPath] = process.argv;
if (!inputPath || !outputPath) {
  console.error('Usage: render-workflow-pdf.mjs <input.md> <output.pdf>');
  process.exit(1);
}

const md = await fs.readFile(inputPath, 'utf8');

// Split the markdown into segments: prose vs. mermaid blocks. We render
// prose as basic HTML (headings, paragraphs, lists, blockquotes) and mermaid
// blocks as <div class="mermaid"> placeholders that mermaid.js will hydrate.
function mdToHtml(src) {
  const segments = [];
  const re = /```mermaid\n([\s\S]*?)```/g;
  let last = 0;
  let m;
  while ((m = re.exec(src)) !== null) {
    if (m.index > last) segments.push({ type: 'prose', text: src.slice(last, m.index) });
    segments.push({ type: 'mermaid', code: m[1].trim() });
    last = m.index + m[0].length;
  }
  if (last < src.length) segments.push({ type: 'prose', text: src.slice(last) });

  return segments
    .map(s => (s.type === 'mermaid' ? renderMermaid(s.code) : renderProse(s.text)))
    .join('\n');
}

function renderProse(text) {
  // Minimal markdown subset: headings, bullet list, blockquote, bold, code,
  // hr, paragraph splitting. Enough for this workflow document.
  const html = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  const lines = html.split('\n');
  const out = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();
    if (!trimmed) { i++; continue; }

    // Headings
    let h = trimmed.match(/^(#{1,6})\s+(.+)$/);
    if (h) { out.push(`<h${h[1].length}>${inline(h[2])}</h${h[1].length}>`); i++; continue; }

    // Horizontal rule
    if (/^---+$/.test(trimmed)) { out.push('<hr/>'); i++; continue; }

    // Blockquote
    if (trimmed.startsWith('&gt; ')) {
      const buf = [];
      while (i < lines.length && lines[i].trim().startsWith('&gt; ')) {
        buf.push(lines[i].trim().replace(/^&gt;\s?/, ''));
        i++;
      }
      out.push(`<blockquote>${inline(buf.join(' '))}</blockquote>`);
      continue;
    }

    // Bullet list
    if (/^[-*]\s/.test(trimmed)) {
      const items = [];
      while (i < lines.length && /^[-*]\s/.test(lines[i].trim())) {
        items.push(`<li>${inline(lines[i].trim().replace(/^[-*]\s+/, ''))}</li>`);
        i++;
      }
      out.push(`<ul>${items.join('')}</ul>`);
      continue;
    }

    // Paragraph — gather consecutive non-blank, non-block lines
    const buf = [];
    while (i < lines.length) {
      const ln = lines[i];
      const t = ln.trim();
      if (!t) break;
      if (/^(#{1,6})\s+/.test(t) || /^---+$/.test(t) || /^[-*]\s/.test(t) || t.startsWith('&gt; ')) break;
      buf.push(t);
      i++;
    }
    if (buf.length > 0) out.push(`<p>${inline(buf.join(' '))}</p>`);
  }
  return out.join('\n');
}

function inline(s) {
  return s
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/`([^`]+)`/g, '<code>$1</code>');
}

function renderMermaid(code) {
  // Mermaid.js requires the raw text inside the div, NOT entity-encoded.
  return `<div class="mermaid">${code}</div>`;
}

const body = mdToHtml(md);

const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>CTMP — Complete Project Workflow</title>
<script src="https://cdn.jsdelivr.net/npm/mermaid@10/dist/mermaid.min.js"></script>
<style>
  * { box-sizing: border-box; }
  body {
    font-family: 'Helvetica Neue', Arial, sans-serif;
    color: #1a1c1e;
    padding: 20mm 18mm;
    line-height: 1.55;
    font-size: 11pt;
  }
  h1 { font-size: 22pt; margin: 0 0 8pt; color: #022448; border-bottom: 3pt solid #022448; padding-bottom: 6pt; }
  h2 { font-size: 15pt; margin: 24pt 0 8pt; color: #022448; border-bottom: 1pt solid #d0d5dd; padding-bottom: 4pt; }
  h3 { font-size: 12pt; margin: 18pt 0 6pt; color: #022448; }
  p { margin: 8pt 0; }
  ul { margin: 8pt 0; padding-left: 22pt; }
  li { margin: 3pt 0; }
  blockquote {
    background: #fff3e0; border-left: 3pt solid #d8a800;
    padding: 8pt 12pt; margin: 10pt 0; font-size: 10pt;
  }
  hr { border: none; border-top: 1pt solid #ccc; margin: 18pt 0; }
  code { font-family: 'Courier New', monospace; background: #f0f3f7; padding: 1pt 4pt; border-radius: 2pt; font-size: 10pt; }
  .mermaid { margin: 16pt 0; text-align: center; break-inside: avoid; page-break-inside: avoid; }
  .mermaid svg { max-width: 100%; height: auto; }
</style>
</head>
<body>
${body}
<script>
  mermaid.initialize({
    startOnLoad: false,
    theme: 'default',
    flowchart: { useMaxWidth: true, htmlLabels: true, curve: 'basis' },
    stateDiagram: { useMaxWidth: true }
  });
  (async () => {
    try {
      await mermaid.run({ suppressErrors: true });
    } catch (e) {
      console.error('mermaid.run failed:', e && e.message ? e.message : String(e));
    }
    document.body.setAttribute('data-mermaid-ready', '1');
  })();
</script>
</body></html>`;

const tmpHtml = outputPath + '.html';
await fs.writeFile(tmpHtml, html, 'utf8');

const browser = await puppeteer.launch({
  executablePath: process.env.PUPPETEER_EXECUTABLE_PATH ?? '/usr/bin/chromium-browser',
  headless: true,
  args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--font-render-hinting=none'],
});

try {
  const page = await browser.newPage();
  page.on('console', msg => console.log(`[page-console:${msg.type()}]`, msg.text()));
  page.on('pageerror', err => console.error('[page-error]', err.message));
  page.on('requestfailed', req => console.error('[page-req-failed]', req.url(), req.failure()?.errorText));
  await page.goto('file://' + path.resolve(tmpHtml), { waitUntil: 'networkidle0', timeout: 60000 });
  await page.waitForSelector('body[data-mermaid-ready="1"]', { timeout: 30000 });
  // Small buffer so mermaid SVGs settle.
  await new Promise(r => setTimeout(r, 1000));

  const pdf = await page.pdf({
    format: 'A4',
    printBackground: true,
    margin: { top: '0', bottom: '0', left: '0', right: '0' },
  });
  await fs.writeFile(outputPath, pdf);
  console.log(`wrote ${outputPath} (${pdf.length} bytes)`);
} finally {
  await browser.close();
  // Keep the .html file for debugging if anything looks off.
}
