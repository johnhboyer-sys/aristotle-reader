// Ad-hoc shot: open a book, click Greek tokens until a popup shows a rich LSJ
// entry (>=4 lsj-cit citations), then screenshot the popup. Captures into the
// path given as the first CLI arg.
import { createRequire } from 'node:module';
import { existsSync, mkdirSync, readdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const BASE = process.env.SHOOT_BASE || 'http://localhost:4321/aristotle-reader';
const OUT = process.argv[2] || join(process.cwd(), '.shots', 'lsj.png');

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
  throw new Error('Playwright not found');
}
if (!process.env.PLAYWRIGHT_BROWSERS_PATH) {
  const cache = join(homedir(), 'Library', 'Caches', 'ms-playwright');
  if (existsSync(cache)) process.env.PLAYWRIGHT_BROWSERS_PATH = cache;
}

const { chromium } = resolvePlaywright();
mkdirSync(join(process.cwd(), '.shots'), { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1100, height: 1400 } });
await page.goto(BASE + '/EN/book/1', { waitUntil: 'networkidle' });
// Make sure Greek tokens are visible.
const greekBtn = page.locator('.view-toggle button', { hasText: 'Greek' });
if (await greekBtn.count()) { await greekBtn.first().click(); await page.waitForTimeout(300); }

const toks = page.locator('.tok');
const n = await toks.count();
let captured = false;
for (let i = 0; i < Math.min(n, 400) && !captured; i++) {
  await toks.nth(i).click();
  try {
    await page.waitForSelector('.lsj-section', { timeout: 800 });
  } catch { await page.keyboard.press('Escape').catch(() => {}); continue; }
  const cits = await page.locator('.lsj-entry .lsj-cit').count();
  if (cits >= 4) {
    const surface = await page.locator('.popup-surface').textContent();
    console.log(`token #${i} "${surface?.trim()}" → ${cits} citations`);
    await page.locator('.popup').screenshot({ path: OUT });
    captured = true;
  } else {
    await page.keyboard.press('Escape').catch(() => {});
    await page.waitForTimeout(50);
  }
}
if (!captured) console.error('No rich LSJ entry found among scanned tokens.');
else console.log('  ' + OUT);
await browser.close();
process.exit(captured ? 0 : 1);
