// Ad-hoc shots of the Help feature: first-visit tip, then the open modal.
import { createRequire } from 'node:module';
import { existsSync, mkdirSync, readdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const BASE = process.env.SHOOT_BASE || 'http://localhost:4321/aristotle-reader';
function resolvePlaywright() {
  const require = createRequire(import.meta.url);
  try { return require('playwright'); } catch {}
  const npxRoot = join(homedir(), '.npm', '_npx');
  if (existsSync(npxRoot)) for (const h of readdirSync(npxRoot)) {
    const p = join(npxRoot, h, 'node_modules', 'playwright');
    if (existsSync(p)) return require(p);
  }
  throw new Error('Playwright not found');
}
if (!process.env.PLAYWRIGHT_BROWSERS_PATH) {
  const cache = join(homedir(), 'Library', 'Caches', 'ms-playwright');
  if (existsSync(cache)) process.env.PLAYWRIGHT_BROWSERS_PATH = cache;
}
const OUT = join(process.cwd(), '.shots');
mkdirSync(OUT, { recursive: true });
const { chromium } = resolvePlaywright();
const browser = await chromium.launch();

async function shot(path, name, run, theme) {
  const ctx = await browser.newContext({ viewport: { width: 1100, height: 900 } });
  const page = await ctx.newPage();
  await page.goto(BASE + path, { waitUntil: 'networkidle' });
  if (theme === 'dark') {
    await page.evaluate(() => { document.documentElement.dataset.theme = 'dark'; localStorage.setItem('ne-theme', 'dark'); });
  }
  await page.waitForTimeout(400);
  if (run) await run(page);
  await page.waitForTimeout(400);
  await page.screenshot({ path: join(OUT, name) });
  console.log('  ' + name);
  await ctx.close();
}

// 1. Fresh visit → tip should auto-appear (fresh context = empty localStorage).
await shot('/EN/book/1', 'help-tip.png');
// 2. Click the ? button → modal.
await shot('/EN/book/1', 'help-modal.png', async (page) => {
  await page.click('.help-trigger');
  await page.waitForSelector('.help-modal');
});
// 3. Modal in dark mode.
await shot('/EN/book/1', 'help-modal-dark.png', async (page) => {
  await page.click('.help-trigger');
  await page.waitForSelector('.help-modal');
}, 'dark');
// 4. Mobile width — header with the ? button.
const ctx = await browser.newContext({ viewport: { width: 390, height: 800 } });
const page = await ctx.newPage();
await page.goto(BASE + '/EN/book/1', { waitUntil: 'networkidle' });
await page.waitForTimeout(500);
await page.screenshot({ path: join(OUT, 'help-mobile.png') });
console.log('  help-mobile.png');
await ctx.close();

await browser.close();
