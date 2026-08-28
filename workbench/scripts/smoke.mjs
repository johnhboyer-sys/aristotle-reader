// Smoke run (npm run smoke) — drives the Vite dev server with Playwright and
// fails on any console error or uncaught exception, anywhere in the pass.
//
// Why this exists: a prop added to a component's TYPE but not to its
// destructuring threw "workTitle is not defined" at render and blanked the
// editor. `tsc --noEmit` was clean and 1,825 unit tests passed — the type was
// right, and nothing in the suite renders a component. Only a browser can say
// whether the app runs, so this is the cheapest thing that can: load it, click
// through the surfaces, and refuse to pass if the console complains.
//
// It is not a screenshot pass (see shots.mjs for that) and it asserts very
// little on purpose. What it checks is that nothing explodes, plus a handful
// of outcomes that would otherwise fail silently.
//
// Uses the browser-harness library (localStorage), never the Tauri one, so it
// touches none of the real library on disk.

import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const BASE = 'http://localhost:1421';

async function serverUp() {
  try {
    const res = await fetch(BASE, { signal: AbortSignal.timeout(1500) });
    return res.ok;
  } catch {
    return false;
  }
}

let devProc = null;
if (!(await serverUp())) {
  console.log('starting dev server…');
  devProc = spawn('npx', ['vite'], { cwd: ROOT, stdio: 'ignore' });
  for (let i = 0; i < 60 && !(await serverUp()); i++) await new Promise((r) => setTimeout(r, 500));
  if (!(await serverUp())) throw new Error('dev server did not come up on :1421');
}

// Playwright pins its browser to this package's exact revision, so a machine
// whose cache was filled by a different version has nothing this can use. Say
// the one command that fixes it rather than dying in a stack trace.
let browser;
try {
  browser = await chromium.launch();
} catch (err) {
  if (devProc) devProc.kill();
  console.error(String(err).split('\n')[0]);
  console.error('\nNo browser for this Playwright build. Run:\n\n    npx playwright install chromium\n');
  process.exit(1);
}
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
// A broken app should fail fast and say so, not sit through Playwright's
// 30-second default at every step.
page.setDefaultTimeout(10_000);

/** Everything the page complained about, with the step it complained during. */
const complaints = [];
let step = 'load';
page.on('console', (msg) => {
  if (msg.type() === 'error') complaints.push(`[${step}] console: ${msg.text()}`);
});
page.on('pageerror', (err) => complaints.push(`[${step}] uncaught: ${err.message}`));

const checks = [];
function check(name, ok, detail = '') {
  checks.push({ name, ok, detail });
  console.log(`  ${ok ? '✓' : '✗'} ${name}${ok || !detail ? '' : ` — ${detail}`}`);
}

/**
 * Run one step. A step that throws does NOT take the process with it: the
 * console errors collected so far are the diagnosis, and dying on the
 * Playwright timeout would bury them under a stack trace. The failure is
 * recorded and the pass stops.
 */
let stopped = null;
async function run(name, fn) {
  if (stopped) return;
  step = name;
  console.log(`· ${name}`);
  try {
    await fn();
  } catch (err) {
    stopped = name;
    const first = String(err.message ?? err).split('\n')[0];
    check(name, false, first);
  }
}

// ── the pass ───────────────────────────────────────────────────────────────

await run('load with an empty harness library', async () => {
  await page.goto(BASE);
  await page.evaluate(() => {
    for (const key of Object.keys(localStorage)) {
      if (key.startsWith('workbench:library:')) localStorage.removeItem(key);
    }
  });
  await page.reload();
  await page.waitForSelector('.library');
  check('the library rail renders', await page.locator('.library').isVisible());
});

await run('open a corpus chapter', async () => {
  // The first chapter, by position rather than by label: the Metaphysics books
  // are lettered in GREEK ("Book Α" is an alpha), so a Latin "A" in a selector
  // matches nothing — and the first book is already open, so clicking it would
  // close the chapter this is trying to reach.
  await page.locator('.chapter-row').first().click();
  await page.waitForSelector('.chapter-grid');
  const heading = (await page.locator('.chapter-head h1').first().innerText()).trim();
  check('the chapter opens with its work title', heading.startsWith('Metaphysics'), heading);
});

await run('create a document', async () => {
  await page.locator('.add-work', { hasText: 'New document…' }).click();
  const dialog = page.locator('.dialog', { has: page.locator('text=New document') });
  await dialog.locator('input[type="text"]').first().fill('Smoke Draft');
  await dialog.locator('textarea').fill('Prima linea.\nSecunda linea.');
  await dialog.locator('.primary-btn').click();
  await page.waitForSelector('.chapter-head h1');
  const heading = (await page.locator('.chapter-head h1').first().innerText()).trim();
  check('the new document opens', heading.startsWith('Smoke Draft'), heading);
});

await run('fold the work you are reading', async () => {
  // The regression this catches: the effect that unfolds the OPEN work used to
  // undo the user's own fold, so the work being read was the one that could
  // not be folded.
  const work = page.locator('.work', { has: page.locator('.work-title', { hasText: 'Smoke Draft' }) });
  await work.locator('.work-toggle').click();
  check('folding hides the work body', (await work.locator('.chapters').count()) === 0);
  await work.locator('.work-toggle').click();
});

await run('rename it in Work details', async () => {
  const title = page.locator('.work-title', { hasText: 'Smoke Draft' }).first();
  await title.click({ button: 'right' });
  await page.locator('.rail-menu-item', { hasText: 'Work details…' }).click();
  await page.locator('#work-title').fill('Smoke Renamed');
  await page.locator('#work-author').fill('Nobody');
  await page.locator('#work-language').fill('Latin');
  await page.locator('.primary-btn', { hasText: 'Save' }).click();
  await page.waitForSelector('.author-head');
  const heading = (await page.locator('.chapter-head h1').first().innerText()).trim();
  check('the editor header takes the new title', heading.startsWith('Smoke Renamed'), heading);
  check(
    'the work shelves under its author',
    (await page.locator('.author-head', { hasText: 'Nobody' }).count()) === 1,
  );
});

await run('remove it', async () => {
  const title = page.locator('.work-title', { hasText: 'Smoke Renamed' }).first();
  await title.click({ button: 'right' });
  await page.locator('.rail-menu-item', { hasText: 'Remove work…' }).click();
  await page.locator('.rail-menu-item', { hasText: 'Remove it' }).click();
  await page.waitForFunction(() => !document.body.innerText.includes('Smoke Renamed'));
  const left = await page.evaluate(() =>
    Object.keys(localStorage).filter((k) => k.startsWith('workbench:library:smoke')).length,
  );
  check('the work and its files are gone', left === 0, `${left} storage keys left`);
});

// ── verdict ────────────────────────────────────────────────────────────────

await browser.close();
if (devProc) devProc.kill();

const failed = checks.filter((c) => !c.ok);
if (complaints.length > 0) {
  console.log('\nthe page complained:');
  for (const c of complaints) console.log('  ' + c);
}
if (stopped) console.log(`\nstopped at "${stopped}" — the steps after it did not run.`);
if (failed.length > 0 || complaints.length > 0) {
  console.log(`\nsmoke FAILED — ${failed.length} check(s), ${complaints.length} console error(s)`);
  process.exit(1);
}
console.log(`\nsmoke passed — ${checks.length} checks, no console errors`);
