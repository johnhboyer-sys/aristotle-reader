// Headless screenshots of the running dev server, for showing changes to a
// reviewer who is away from the machine ("remote control").
//
// Usage (dev server must be running — `npm run dev`):
//   npm run shots                 # capture all scenes below into app/.shots/
//   npm run shots -- /book/3      # one ad-hoc shot of a single path
//   npm run shots -- /book/3 book3 out.png
//
// Playwright is resolved from the local install if present, otherwise from the
// npx cache (no project dependency required). Browsers come from the shared
// ms-playwright cache. To make it first-class instead: npm i -D playwright.

import { createRequire } from 'node:module';
import { existsSync, mkdirSync, readdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const BASE = process.env.SHOOT_BASE || 'http://localhost:4321';
const OUT_DIR = join(process.cwd(), '.shots');

// --- Locate Playwright without requiring a project dependency --------------
function resolvePlaywright() {
  const require = createRequire(import.meta.url);
  try {
    return require('playwright');
  } catch {}
  const npxRoot = join(homedir(), '.npm', '_npx');
  if (existsSync(npxRoot)) {
    for (const hash of readdirSync(npxRoot)) {
      const p = join(npxRoot, hash, 'node_modules', 'playwright');
      if (existsSync(p)) return require(p);
    }
  }
  throw new Error(
    'Playwright not found. Install it (npm i -D playwright) or run `npx playwright --version` once to populate the cache.',
  );
}

if (!process.env.PLAYWRIGHT_BROWSERS_PATH) {
  const cache = join(homedir(), 'Library', 'Caches', 'ms-playwright');
  if (existsSync(cache)) process.env.PLAYWRIGHT_BROWSERS_PATH = cache;
}

// --- Scenes: edit/add freely. `run` may interact before the shot. ----------
const scenes = [
  { name: 'home', path: '/' },
  {
    // Mobile home: divisions collapsed by default → a short menu of headers.
    name: 'home-mobile',
    path: '/',
    viewport: { width: 390, height: 1400 },
  },
  {
    // Mobile home with Natural Philosophy expanded → its three sub-divisions
    // show collapsed; the first sub-division is then opened to reveal its grid.
    name: 'home-mobile-expanded',
    path: '/',
    viewport: { width: 390, height: 1400 },
    async run(page) {
      await page.click('.cat:nth-child(2) .cat-toggle');           // Natural Philosophy
      await page.click('.cat:nth-child(2) .subcat:nth-child(1) .subcat-toggle'); // II.a
      await page.waitForTimeout(300);
    },
  },
  { name: 'en-book1', path: '/EN/book/1' },
  { name: 'da-book1', path: '/DA/book/1' },
  { name: 'da-book2', path: '/DA/book/2' },
  {
    // Cross-work Greek search: ἀρετή occurs in both works → grouped by work.
    name: 'search-greek',
    path: '/search',
    async run(page) {
      await page.fill('#grk-input', 'areth');
      await page.click('.search-btn');
      await page.waitForSelector('.chapter-group', { timeout: 10000 });
    },
  },
  {
    // Exact-form match mode + a single-work filter (De Anima only).
    name: 'search-form-filter',
    path: '/search',
    async run(page) {
      await page.fill('#grk-input', 'logos');
      // Deselect EN so only DA is searched.
      await page.click('.work-chip:has-text("EN")');
      await page.check('input[name="matchmode"][value="form"]');
      await page.click('.search-btn');
      await page.waitForSelector('.chapter-group', { timeout: 10000 });
    },
  },
  {
    name: 'search-help',
    path: '/search',
    async run(page) {
      await page.click('.help-btn');
      await page.waitForSelector('.help-modal');
    },
  },
  {
    // Bekker citation jump in De Anima: 412a27, the entelecheia definition.
    name: 'da-bekker-jump',
    path: '/DA/book/2',
    async run(page) {
      await page.click('.bekker-toggle');
      await page.fill('.bekker-jump input', '412a27');
      await Promise.all([
        page.waitForURL(/loc=412a:27/, { timeout: 10000 }),
        page.click('.bekker-jump button[type="submit"]'),
      ]);
      await page.waitForSelector('.greek-line.target', { timeout: 10000 });
    },
  },
];

async function shoot(browser, scene, outName) {
  const page = await browser.newPage({ viewport: scene.viewport || { width: 1100, height: 1400 } });
  await page.goto(BASE + scene.path, { waitUntil: 'networkidle' });
  if (scene.run) await scene.run(page);
  await page.waitForTimeout(400);
  const out = join(OUT_DIR, outName || `${scene.name}.png`);
  await page.screenshot({ path: out });
  await page.close();
  console.log('  ' + out);
}

const { chromium } = resolvePlaywright();

mkdirSync(OUT_DIR, { recursive: true });
const [argPath, argName, argOut] = process.argv.slice(2);

const browser = await chromium.launch();
try {
  console.log(`Shooting ${BASE} →`);
  if (argPath) {
    await shoot(browser, { name: argName || 'shot', path: argPath }, argOut);
  } else {
    // Keep going if one scene fails so a single broken shot doesn't abort the run.
    let failed = 0;
    for (const scene of scenes) {
      try {
        await shoot(browser, scene);
      } catch (e) {
        failed++;
        console.error(`  ✗ ${scene.name}: ${e.message.split('\n')[0]}`);
      }
    }
    if (failed) console.error(`\n${failed} scene(s) failed; the rest were captured.`);
  }
} finally {
  await browser.close();
}
