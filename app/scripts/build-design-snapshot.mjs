// Build a self-contained HTML snapshot of the PRINT layout for Claude Design.
// Claude Design renders standalone HTML on screen (not @media print, not PDF),
// so we capture the real rendered reader DOM and BAKE the print rules in as
// regular on-screen CSS, framed inside page-shaped containers (landscape Letter
// for bilingual, portrait for monolingual). Open the result in Claude Design and
// restyle freely — colours, type, rules, spacing — the structure matches print.
//
// Usage (dev server running): node scripts/build-design-snapshot.mjs
// Output: app/.shots/print/print-preview.html

import { createRequire } from 'node:module';
import { existsSync, readdirSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const BASE = process.env.SHOOT_BASE || 'http://localhost:4321/aristotle-reader';
const OUT_DIR = join(process.cwd(), '.shots', 'print');
const CSS = readFileSync(join(process.cwd(), 'src', 'styles', 'global.css'), 'utf8');

// Split the stylesheet into the base (screen) rules and the trailing @media
// print block, then UNWRAP the print block so its rules apply on screen.
const idx = CSS.indexOf('@media print {');
const baseCSS = CSS.slice(0, idx);
let printInner = CSS.slice(idx + '@media print {'.length);
printInner = printInner.slice(0, printInner.lastIndexOf('}')); // drop the closing brace of @media

function resolvePlaywright() {
  const require = createRequire(import.meta.url);
  try { return require('playwright'); } catch {}
  const r = join(homedir(), '.npm', '_npx');
  for (const h of readdirSync(r)) { const p = join(r, h, 'node_modules', 'playwright'); if (existsSync(p)) return require(p); }
  throw new Error('Playwright not found');
}
if (!process.env.PLAYWRIGHT_BROWSERS_PATH) {
  const c = join(homedir(), 'Library', 'Caches', 'ms-playwright');
  if (existsSync(c)) process.env.PLAYWRIGHT_BROWSERS_PATH = c;
}

// Capture the reader-body for one view, trimmed to the first `segs` segments.
async function capture(browser, view, segs) {
  const page = await browser.newPage({ viewport: { width: 1300, height: 1500 } });
  await page.goto(BASE + '/EN/book/1', { waitUntil: 'networkidle' });
  const label = view === 'both' ? 'Both' : view[0].toUpperCase() + view.slice(1);
  await page.click(`.view-toggle button:has-text("${label}")`);
  await page.waitForTimeout(300);
  const html = await page.evaluate((n) => {
    const rb = document.querySelector('.reader-body').cloneNode(true);
    const keep = rb.querySelectorAll('.segment');
    keep.forEach((s, i) => { if (i >= n) s.remove(); });
    return rb.outerHTML;
  }, segs);
  await page.close();
  return html;
}

const { chromium } = resolvePlaywright();
mkdirSync(OUT_DIR, { recursive: true });
const browser = await chromium.launch();
const both = await capture(browser, 'both', 2);
const english = await capture(browser, 'english', 1);
const greek = await capture(browser, 'greek', 1);
await browser.close();

const frame = `
  /* Page frames simulate the printed sheet on screen (Claude Design has no
     print media). Padding mirrors the @page margins. */
  body { background:#e9e6df; margin:0; padding:2rem; }
  .sheet { background:#fff; margin:0 auto 2rem; box-shadow:0 2px 12px rgba(0,0,0,.18); }
  .sheet-landscape { width:11in; min-height:8.5in; padding:1.5cm 1.6cm; }
  .sheet-portrait  { width:8.5in; min-height:11in; padding:1.9cm 1.4cm; }
  .sheet .reader-body { padding:0 !important; margin:0 !important; }
  .sheet-label { width:11in; max-width:11in; margin:0 auto .5rem; font:600 13px system-ui; color:#555; }
`;

const out = `<!DOCTYPE html>
<html lang="en"><head>
<meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Aristotle reader — print layout snapshot</title>
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link href="https://fonts.googleapis.com/css2?family=Cardo:ital@0;1&family=EB+Garamond:ital,wght@0,400;0,600;1,400&display=swap" rel="stylesheet" />
<style>
${baseCSS}
/* ===== print rules, unwrapped so they render on screen ===== */
${printInner}
/* ===== page frames ===== */
${frame}
</style>
</head><body>
  <div class="sheet-label">Bilingual — landscape Letter</div>
  <div class="sheet sheet-landscape">${both}</div>
  <div class="sheet-label">English — portrait Letter</div>
  <div class="sheet sheet-portrait">${english}</div>
  <div class="sheet-label">Greek — portrait Letter</div>
  <div class="sheet sheet-portrait">${greek}</div>
</body></html>`;

const path = join(OUT_DIR, 'print-preview.html');
writeFileSync(path, out);
console.log('wrote ' + path + ' (' + Math.round(out.length / 1024) + ' KB)');
