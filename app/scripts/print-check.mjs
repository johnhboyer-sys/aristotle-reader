// One-off verification for the print stylesheet: emulate print media and also
// render an actual PDF, so we can eyeball page breaks, the Bekker gutter, and
// polytonic Greek diacritics without a human at the print dialog.
//
// Usage (dev server must be running — `npm run dev`):
//   node scripts/print-check.mjs            # EN/book/1, all three views
//   node scripts/print-check.mjs /DA/book/2 # a different page
//
// Outputs into app/.shots/print/: <view>-print.png (screen, print-media) and
// <view>.pdf (real Chromium PDF).

import { createRequire } from 'node:module';
import { existsSync, mkdirSync, readdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const BASE = process.env.SHOOT_BASE || 'http://localhost:4321';
const OUT_DIR = join(process.cwd(), '.shots', 'print');
const path = process.argv[2] || '/EN/book/1';

function resolvePlaywright() {
  const require = createRequire(import.meta.url);
  try { return require('playwright'); } catch {}
  const npxRoot = join(homedir(), '.npm', '_npx');
  if (existsSync(npxRoot)) {
    for (const hash of readdirSync(npxRoot)) {
      const p = join(npxRoot, hash, 'node_modules', 'playwright');
      if (existsSync(p)) return require(p);
    }
  }
  throw new Error('Playwright not found. Run `npx playwright --version` once to populate the cache.');
}
if (!process.env.PLAYWRIGHT_BROWSERS_PATH) {
  const cache = join(homedir(), 'Library', 'Caches', 'ms-playwright');
  if (existsSync(cache)) process.env.PLAYWRIGHT_BROWSERS_PATH = cache;
}

const { chromium } = resolvePlaywright();
mkdirSync(OUT_DIR, { recursive: true });

const browser = await chromium.launch();
try {
  for (const view of ['both', 'greek', 'english']) {
    const page = await browser.newPage({ viewport: { width: 1100, height: 1400 } });
    await page.goto(BASE + path, { waitUntil: 'networkidle' });
    // Switch the reader to the target view (button labels: Greek / Both / English).
    const label = view === 'both' ? 'Both' : view[0].toUpperCase() + view.slice(1);
    await page.click(`.view-toggle button:has-text("${label}")`);
    await page.waitForTimeout(300);

    // Confirm the print button exists and the print-only head is present in DOM.
    const hasBtn = await page.locator('.print-btn').count();
    const headText = await page.locator('.print-head').first().innerText().catch(() => '');

    await page.emulateMedia({ media: 'print' });
    await page.waitForTimeout(150);
    await page.screenshot({ path: join(OUT_DIR, `${view}-print.png`), fullPage: true });
    await page.pdf({
      path: join(OUT_DIR, `${view}.pdf`),
      preferCSSPageSize: true,   // honor @page size/orientation (bilingual = landscape)
      printBackground: true,
    });
    await page.close();
    console.log(`${view}: print-btn=${hasBtn} head="${headText.replace(/\n/g, ' / ')}"`);
  }
  console.log('→ ' + OUT_DIR);
} finally {
  await browser.close();
}
