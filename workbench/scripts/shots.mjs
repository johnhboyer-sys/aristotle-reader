// Product screenshots (npm run shots) — drives the Vite dev server with
// Playwright (chromium) and captures the finished-product surfaces into
// workbench/shots/ (gitignored). Reuses a dev server already listening on
// :1421, otherwise starts one and tears it down afterwards.
//
// The script seeds its own working state through the real UI — it clears the
// browser-harness library (localStorage), types the English with real
// keystrokes, creates a real footnote, and runs a real lexicon lookup — so
// every pixel in the shots is the product doing its actual job.

import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const OUT = path.join(ROOT, 'shots');
const BASE = 'http://localhost:1421';
mkdirSync(OUT, { recursive: true });

// ── dev server: reuse or spawn ─────────────────────────────────────────────
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

const browser = await chromium.launch();

function shoot(name) {
  console.log('  ✓', name);
  return path.join(OUT, name);
}

/** Clamp a clip rect to the viewport so screenshots never go out of bounds. */
function clamp(rect, vw = 1600, vh = 1000) {
  const x = Math.max(0, rect.x);
  const y = Math.max(0, rect.y);
  return { x, y, width: Math.min(rect.width, vw - x), height: Math.min(rect.height, vh - y) };
}

// dblclick a word inside a row's English cell at its exact glyph rect (PM
// escalates fast nearby double-clicks to block selection, so pause first).
async function dblclickWord(page, rowIdx, word) {
  const pt = await page.evaluate(({ rowIdx, word }) => {
    const pm = document.querySelector(`.en-cell[data-row-en="${rowIdx}"] .ProseMirror`);
    const walker = document.createTreeWalker(pm, NodeFilter.SHOW_TEXT);
    let tn;
    while ((tn = walker.nextNode())) {
      const i = tn.textContent.indexOf(word);
      if (i >= 0) {
        const r = document.createRange();
        r.setStart(tn, i);
        r.setEnd(tn, i + word.length);
        const rect = r.getBoundingClientRect();
        return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
      }
    }
    throw new Error(`word not found in row ${rowIdx}: ${word}`);
  }, { rowIdx, word });
  await page.waitForTimeout(600);
  await page.mouse.dblclick(pt.x, pt.y);
}

// click a Greek word in a spine cell (first occurrence, glyph-accurate)
async function clickGreekWord(page, word) {
  const pt = await page.evaluate((word) => {
    for (const cell of document.querySelectorAll('.grc-cell')) {
      const tn = [...cell.childNodes].find((n) => n.nodeType === 3 && n.textContent.includes(word));
      if (!tn) continue;
      const i = tn.textContent.indexOf(word);
      const r = document.createRange();
      r.setStart(tn, i);
      r.setEnd(tn, i + word.length);
      const rect = r.getBoundingClientRect();
      return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
    }
    throw new Error(`greek word not found: ${word}`);
  }, word);
  await page.mouse.click(pt.x, pt.y);
}

const row = (page, i) => page.locator(`.en-cell[data-row-en="${i}"] .ProseMirror`);

async function openChapter(page, book, chapter) {
  const bookBtn = page.locator('.book-row', { hasText: `Book ${book}` }).first();
  if ((await bookBtn.getAttribute('aria-expanded')) !== 'true') await bookBtn.click();
  const li = page.locator('.book', { has: page.locator('.book-row', { hasText: `Book ${book}` }) }).first();
  await li.locator('.chapter-row', { hasText: new RegExp(`^Chapter ${chapter}$`) }).first().click();
  await page.waitForFunction(() => {
    const en = document.querySelectorAll('.en-cell').length;
    return en > 0 && document.querySelectorAll('.en-cell .ProseMirror').length === en;
  });
}

// ── main context: seeded Ζ.17 working state ───────────────────────────────
const ctx = await browser.newContext({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 2 });
const page = await ctx.newPage();
await page.goto(BASE);
await page.evaluate(() => {
  const kill = [];
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k.startsWith('workbench:')) kill.push(k);
  }
  kill.forEach((k) => localStorage.removeItem(k));
  localStorage.setItem('workbench-theme', 'light');
});
await page.reload();
await page.waitForSelector('.chapter-grid');

await openChapter(page, 'Ζ', 17);

// The classicist's own Ζ.17 opening, one Bekker line at a time.
const lines = [
  'But what we ought to say substance is, and what sort of thing it is,',
  'let us state again, making as it were another beginning of the inquiry:',
  'for perhaps from what we say it will become clear also concerning that substance which is separated from the sensible substances, whether there is any such thing.',
  'Since, then, substance is a kind of principle and cause,',
  'we must pursue the inquiry from this point.',
];
for (let i = 0; i < lines.length; i++) {
  await row(page, i).click();
  await page.keyboard.type(lines[i], { delay: 0 });
}

// A Greek-mode phrase mid-sentence (Ζ.17, 1041a28: τὸ τί ἦν εἶναι).
await row(page, 5).click();
await page.keyboard.type('The "why" is always sought in this form: that is, the ', { delay: 0 });
await page.locator('.tb-greek').click();
await page.keyboard.type('to\\ ti/ h)=n ei)=nai', { delay: 0 });
await page.locator('.tb-greek').click();
await page.keyboard.type(', to speak logically.', { delay: 0 });

// A real footnote on "substance" in row 0, body typed in the panel.
await page.locator('button[aria-label="Toggle footnotes panel"]').click();
await dblclickWord(page, 0, 'substance');
await page.locator('.tb-fn').click();
await page.waitForSelector('.fn-entry');
await page.keyboard.type('Reading οὐσία as “substance” throughout; see Ross ad loc.', { delay: 0 });

// Park the caret at the end of the wrapped row so the focused-row affordance
// shows in the shot; let the status pill fade and autosave reach “Saved”.
await page.evaluate(() => { document.querySelector('.chapter-editor').scrollTop = 0; });
{
  const pt = await page.evaluate(() => {
    const pm = document.querySelector('.en-cell[data-row-en="2"] .ProseMirror');
    const tn = [...pm.childNodes].filter((n) => n.nodeType === 3).pop();
    const r = document.createRange();
    r.setStart(tn, tn.textContent.length - 1);
    r.setEnd(tn, tn.textContent.length);
    const rect = r.getBoundingClientRect();
    return { x: rect.right - 1, y: rect.top + rect.height / 2 };
  });
  await page.mouse.click(pt.x, pt.y);
}
await page.waitForTimeout(2800); // status pill (2.6s) fades; autosave shows “Saved”
await page.evaluate(() => { document.querySelector('.chapter-editor').scrollTop = 0; });
await page.waitForTimeout(100);

// (1) full app, light — Ζ.17 with real rows (row 2 wraps), footnote panel open
await page.screenshot({ path: shoot('01-full-app-light.png') });

// (2) same in dark. The theme flip only swaps CSS variables; the editor and
// rail are composited scroll layers whose repaint can lag one capture in
// headless Chromium — take a throwaway capture to force the composite,
// then the real one.
await page.locator('button[aria-label="Toggle theme"]').click();
await page.waitForTimeout(400);
await page.screenshot();
await page.waitForTimeout(200);
await page.screenshot({ path: shoot('02-full-app-dark.png') });
await page.locator('button[aria-label="Toggle theme"]').click();
await page.waitForTimeout(400);
await page.screenshot();

// (3) editor close-up: gutter + wrapped-row alignment (rows 0–6)
await page.evaluate(() => { document.querySelector('.chapter-editor').scrollTop = 0; });
await page.waitForTimeout(100);
{
  const grid = await page.locator('.chapter-grid').boundingBox();
  await page.screenshot({
    path: shoot('03-editor-closeup-gutter.png'),
    clip: clamp({ x: grid.x, y: grid.y, width: Math.min(grid.width, 1240), height: 300 }),
  });
}

// (4) Greek-mode phrase mid-sentence, rendered τὸ τί ἦν εἶναι
{
  const cell = await page.locator('.en-cell[data-row-en="5"]').boundingBox();
  await page.screenshot({
    path: shoot('04-greek-mode-phrase.png'),
    clip: clamp({ x: cell.x - 620, y: cell.y - 40, width: cell.width + 620, height: 120 }),
  });
}

// (5) lexicon drawer open on a real lookup (οὐσίαν → οὐσία)
await page.locator('button[aria-label="Toggle footnotes panel"]').click(); // give the drawer the full width
await page.locator('button[aria-label="Toggle lexicon drawer"]').click();
await clickGreekWord(page, 'οὐσίαν');
await page.waitForSelector('.lex-analysis');
await page.screenshot({ path: shoot('05-lexicon-drawer.png') });
await page.locator('button[aria-label="Toggle lexicon drawer"]').click();

// (6) library rail with Book Ζ expanded
{
  const rail = await page.locator('.rail').boundingBox();
  await page.evaluate(() => {
    document.querySelector('.chapter-row.selected')?.scrollIntoView({ block: 'center' });
  });
  await page.screenshot({
    path: shoot('06-library-rail.png'),
    clip: clamp({ x: rail.x, y: rail.y, width: rail.width + 1, height: rail.height }),
  });
}

// (8) footnote panel close-up (before leaving the seeded context)
await page.locator('button[aria-label="Toggle footnotes panel"]').click();
await page.waitForSelector('.fn-entry');
{
  const panel = await page.locator('.side-panel').boundingBox();
  await page.screenshot({
    path: shoot('08-footnote-panel.png'),
    clip: clamp({ x: panel.x, y: panel.y, width: panel.width, height: Math.min(panel.height, 340) }),
  });
}

await ctx.close();

// (7) the not-onboarded quiet state: no corpus on this machine at all
{
  const ctx7 = await browser.newContext({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 2 });
  const p7 = await ctx7.newPage();
  // Only the corpus DATA endpoint — '**/corpus/**' would also swallow Vite's
  // /src/lib/corpus/*.ts module URLs and kill the app's module graph.
  await p7.route(/\/corpus\/[^/]+\/[^/]+\.json$/, (route) => route.fulfill({ status: 404, body: 'not found' }));
  await p7.goto(BASE);
  await p7.evaluate(() => {
    const kill = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k.startsWith('workbench:')) kill.push(k);
    }
    kill.forEach((k) => localStorage.removeItem(k));
    localStorage.setItem('workbench-theme', 'light');
  });
  await p7.reload();
  await p7.waitForSelector('.empty-state');
  await p7.screenshot({ path: shoot('07-not-onboarded.png') });
  await ctx7.close();
}

await browser.close();
if (devProc) devProc.kill();
console.log(`\n8 shots → ${OUT}`);
