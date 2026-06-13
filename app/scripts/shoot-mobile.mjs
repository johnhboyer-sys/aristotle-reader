// Mobile-viewport screenshots (iPhone-ish 390×844) of the running dev server,
// for tuning the phone layout. Mirrors shoot.mjs but with a narrow viewport and
// full-page captures so we can see the whole header/reader/search column.
//
// Usage (dev server must be running — `npm run dev`):
//   node scripts/shoot-mobile.mjs            # all scenes into app/.shots/mobile/

import { createRequire } from 'node:module';
import { existsSync, mkdirSync, readdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const BASE = process.env.SHOOT_BASE || 'http://localhost:4321';
const OUT_DIR = join(process.cwd(), '.shots', 'mobile');
const VIEWPORT = { width: 390, height: 844 };

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
  throw new Error('Playwright not found. Run `npx playwright --version` once or `npm i -D playwright`.');
}

if (!process.env.PLAYWRIGHT_BROWSERS_PATH) {
  const cache = join(homedir(), 'Library', 'Caches', 'ms-playwright');
  if (existsSync(cache)) process.env.PLAYWRIGHT_BROWSERS_PATH = cache;
}

const scenes = [
  { name: 'reader-top', path: '/book/1', full: false },        // header + first screen as the phone sees it
  {
    name: 'header-open',
    path: '/book/1',
    full: false,
    async run(page) {
      await page.click('.nav-toggle');
      await page.waitForTimeout(200);
    },
  },
  { name: 'reader-default', path: '/book/1', full: false },    // phone default = English only
  {
    name: 'reader-both',
    path: '/book/1',
    full: false,
    async run(page) {
      // Switch to bilingual the way a user would, via the toggle.
      await page.click('.view-toggle button:nth-child(2)');
      await page.waitForTimeout(200);
    },
  },
  {
    name: 'popup-both',
    path: '/book/1',
    full: false,
    async run(page) {
      await page.click('.view-toggle button:nth-child(2)'); // Both
      await page.waitForSelector('.tok');
      await page.click('.greek-col .tok >> nth=0');
      await page.waitForSelector('.popup .analysis-card', { timeout: 10000 });
      await page.waitForTimeout(400);
    },
  },
  { name: 'search', path: '/search', full: false },
  {
    name: 'search-results',
    path: '/search',
    full: true,
    async run(page) {
      await page.fill('#eng-input', 'pleasure');
      await page.click('.search-btn');
      await page.waitForSelector('.chapter-group', { timeout: 10000 });
    },
  },
  {
    name: 'search-help',
    path: '/search',
    full: true,
    async run(page) {
      await page.click('.help-btn');
      await page.waitForSelector('.help-modal');
    },
  },
];

async function shoot(browser, scene) {
  const page = await browser.newPage({ viewport: VIEWPORT, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await page.goto(BASE + scene.path, { waitUntil: 'networkidle' });
  if (scene.run) await scene.run(page);
  await page.waitForTimeout(400);
  const out = join(OUT_DIR, `${scene.name}.png`);
  await page.screenshot({ path: out, fullPage: !!scene.full });
  await page.close();
  console.log('  ' + out);
}

const { chromium } = resolvePlaywright();
mkdirSync(OUT_DIR, { recursive: true });
const browser = await chromium.launch();
try {
  console.log(`Shooting (mobile ${VIEWPORT.width}×${VIEWPORT.height}) ${BASE} →`);
  let failed = 0;
  for (const scene of scenes) {
    try { await shoot(browser, scene); }
    catch (e) { failed++; console.error(`  ✗ ${scene.name}: ${e.message.split('\n')[0]}`); }
  }
  if (failed) process.exitCode = 1;
} finally {
  await browser.close();
}
