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
// SMOKE_PORT runs it on its own port, with its own server: a server already
// answering there may be another checkout's, so it refuses. On the default
// :1421 a running server is reused, which can test another checkout's code.
const PORT = process.env.SMOKE_PORT ?? '1421';
const BASE = `http://localhost:${PORT}`;

async function serverUp() {
  try {
    const res = await fetch(BASE, { signal: AbortSignal.timeout(1500) });
    return res.ok;
  } catch {
    return false;
  }
}

/** Anything answering at all, a 404 included. */
async function portAnswers() {
  try {
    await fetch(BASE, { signal: AbortSignal.timeout(1500) });
    return true;
  } catch {
    return false;
  }
}

let devProc = null;
if (process.env.SMOKE_PORT && (await portAnswers())) {
  console.error(`:${PORT} is already in use, perhaps by another checkout. Pick a free SMOKE_PORT.`);
  process.exit(1);
}
if (!(await serverUp())) {
  console.log('starting dev server…');
  devProc = spawn('npx', ['vite', '--port', PORT], { cwd: ROOT, stdio: 'ignore' });
  for (let i = 0; i < 60 && !(await serverUp()); i++) await new Promise((r) => setTimeout(r, 500));
  if (!(await serverUp())) {
    devProc.kill();
    throw new Error(`dev server did not come up on :${PORT}`);
  }
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

await run('insert a footnote and click its marker', async () => {
  // The footnote body is typed in the side panel. Inserting a footnote, or
  // clicking its marker, opens that panel with the cursor in the note's body.
  const cell = page.locator('.en-cell[data-row-en="2"] .ProseMirror');
  await cell.click();
  await page.keyboard.type('smoke note');
  await page.keyboard.press('Shift+Home');
  await page.getByRole('button', { name: 'Insert footnote' }).click();
  await page.waitForSelector('.fn-body .ProseMirror');
  check(
    'inserting a footnote opens the panel at its body',
    await page.evaluate(() => !!document.activeElement?.closest('.fn-body')),
  );
  await page.getByRole('button', { name: 'Close footnotes' }).click();
  await page.locator('.en-cell[data-row-en="2"] .fn-marker').first().click();
  await page.waitForSelector('.fn-body .ProseMirror');
  check(
    'clicking a marker opens the panel at its body',
    await page.evaluate(() => !!document.activeElement?.closest('.fn-body')),
  );
});

await run('click a marker while the Ask panel holds the side slot', async () => {
  // The footnotes panel cannot show while Ask is open, so the click must not
  // leave the footnotes toggle stuck on or grab focus when Ask closes.
  await page.getByRole('button', { name: 'Close footnotes' }).click();
  await page.getByRole('button', { name: 'Toggle Ask AI panel' }).click();
  await page.locator('.en-cell[data-row-en="2"] .fn-marker').first().click();
  const toggle = page.getByRole('button', { name: 'Toggle footnotes panel' });
  check('the footnotes toggle stays off', (await toggle.getAttribute('aria-pressed')) === 'false');
  await page.getByRole('button', { name: 'Toggle Ask AI panel' }).click();
  check('closing Ask does not open footnotes', (await page.locator('.fn-body').count()) === 0);
});

await run('translate a line with AI', async () => {
  // The popover that shows a suggestion crashed on render ("state is not a
  // store"), so Translate with AI did nothing at all. The browser harness
  // answers with the dev fake provider.
  await page.evaluate(() => {
    window.__assistFake = 'smoke suggestion';
    window.__assistFakeDelayMs = 100;
  });
  await page.locator('.en-cell[data-row-en="4"] .ProseMirror').click({ button: 'right' });
  await page.locator('[role="menu"]').getByText('Translate with AI').click();
  await page.waitForSelector('.assist-popover .assist-text');
  check(
    'the suggestion appears in the popover',
    (await page.locator('.assist-popover .assist-text').innerText()).includes('smoke suggestion'),
  );
  await page.getByRole('button', { name: 'Dismiss' }).click();
  await page.evaluate(() => { window.__assistFake = undefined; });
});

await run('the spark shows on the active line and opens assist', async () => {
  // John could not find the ✦: it showed only while the mouse was over the
  // active line, at the far right of the English column. It now shows
  // whenever the cursor is in a line, and only there.
  await page.evaluate(() => {
    window.__assistFake = 'spark suggestion';
    window.__assistFakeDelayMs = 50;
  });
  const cell = page.locator('.en-cell[data-row-en="5"]');
  await cell.locator('.ProseMirror').click();
  await page.mouse.move(5, 5); // off the line
  await page.waitForTimeout(300); // the fade-in
  const shown = (row) =>
    page.locator(`.en-cell[data-row-en="${row}"] .assist-glyph`).evaluate((g) => {
      const s = getComputedStyle(g);
      return Number(s.opacity) > 0.3 && s.pointerEvents === 'auto';
    });
  check('the ✦ shows on the active line without hovering', await shown(5));
  check('other lines show no ✦', !(await shown(6)));
  const box = await cell.locator('.assist-glyph').boundingBox();
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await page.waitForSelector('.en-cell[data-row-en="5"] .assist-popover .assist-text');
  check(
    'clicking it brings a suggestion for that line',
    (await cell.locator('.assist-popover .assist-text').innerText()).includes('spark suggestion'),
  );
  await page.getByRole('button', { name: 'Dismiss' }).click();
  await page.evaluate(() => { window.__assistFake = undefined; });

  // Now that the ✦ shows on the active line, English must never run
  // underneath it. Where a line wraps depends on its words, so check the room
  // the text may use: the editor's content box must end before the ✦ begins.
  const clear = await cell.evaluate((c) => {
    const g = c.querySelector('.assist-glyph').getBoundingClientRect();
    const ed = c.querySelector('.row-editor');
    const right = ed.getBoundingClientRect().right - parseFloat(getComputedStyle(ed).paddingRight);
    return { ok: right <= g.left + 0.5, detail: `text may reach ${right.toFixed(1)}, ✦ starts at ${g.left.toFixed(1)}` };
  });
  check('English stays clear of the ✦', clear.ok, clear.detail);
});

await run('pick a model in the Ask AI panel, and keep it', async () => {
  // The pick is remembered per provider in settings.assist.models; the
  // harness has no provider chosen, so the panel shows Claude Code's models.
  const toggle = page.getByRole('button', { name: 'Toggle Ask AI panel' });
  await toggle.click();
  const picker = page.getByLabel('AI model');
  check('the picker offers Claude Code’s models', (await picker.locator('option').allInnerTexts()).includes('Opus'));
  await picker.selectOption('opus');
  await page.waitForFunction(() => (localStorage.getItem('workbench:settings') ?? '').includes('"opus"'));
  await page.reload();
  await page.waitForSelector('.library');
  if ((await page.locator('.chapter-grid').count()) === 0) await page.locator('.chapter-row').first().click();
  await page.waitForSelector('.chapter-grid');
  if ((await page.locator('.ask-panel').count()) === 0) await toggle.click();
  check('the pick survives a reload', (await page.getByLabel('AI model').inputValue()) === 'opus');
  await page.getByLabel('AI model').selectOption('');

  // Switching provider in Settings while the panel is open: the panel must
  // show the new provider's models once you come back to it.
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByRole('tab', { name: 'AI assist' }).click();
  await page.getByText('Codex (OpenAI)', { exact: true }).click();
  await page.locator('.dialog[aria-label="Settings"]').getByRole('button', { name: 'Close' }).click();
  await page.locator('.ask-panel').hover();
  await page.waitForFunction(() => document.querySelector('.ask-model')?.textContent?.includes('Codex'));
  check(
    'the panel follows a provider change made in Settings',
    (await page.getByLabel('AI model').locator('option').allInnerTexts()).includes('GPT-6-Luna'),
  );
  await page.evaluate(() => {
    const s = JSON.parse(localStorage.getItem('workbench:settings') || '{}');
    delete s.assist;
    localStorage.setItem('workbench:settings', JSON.stringify(s));
  });
  await page.reload();
  await page.waitForSelector('.library');
  if ((await page.locator('.chapter-grid').count()) === 0) await page.locator('.chapter-row').first().click();
  await page.waitForSelector('.chapter-grid');
  if ((await page.locator('.ask-panel').count()) > 0) await toggle.click();
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

await run('a heading keeps English clear of the ✦ in Lane and Weave', async () => {
  // Headings and subtitles break out of the flowing Interpolated line, so
  // they keep the ✦'s corner like any line in the Lines view.
  await page.locator('.grc-cell').first().click({ button: 'right' });
  await page.locator('.ctx-menu-item', { hasText: 'Mark as' }).hover();
  await page.locator('.ctx-submenu .ctx-menu-item', { hasText: 'Heading' }).click();
  await page.waitForSelector('.en-cell[data-heading-level]');
  await page.locator('.view-toggle-btn', { hasText: 'Interpolated' }).click();
  for (const layout of ['Lane', 'Weave']) {
    const btn = page.locator('.view-toggle-btn', { hasText: layout });
    if ((await btn.count()) > 0) await btn.click();
    const cell = page.locator('.en-cell[data-heading-level]').first();
    await cell.locator('.ProseMirror').click();
    const clear = await cell.evaluate((c) => {
      const g = c.querySelector('.assist-glyph').getBoundingClientRect();
      const ed = c.querySelector('.row-editor');
      const right = ed.getBoundingClientRect().right - parseFloat(getComputedStyle(ed).paddingRight);
      return { ok: right <= g.left + 0.5, detail: `text may reach ${right.toFixed(1)}, ✦ starts at ${g.left.toFixed(1)}` };
    });
    check(`${layout}: a heading's English stays clear of the ✦`, clear.ok, clear.detail);
  }
  await page.locator('.view-toggle-btn', { hasText: 'Lines' }).click();
});

await run('switch view with the cursor in an English cell', async () => {
  // Switching view unmounts the focused editor, and its blur handler wrote
  // $state while Svelte was tearing the old view down: an uncaught
  // state_unsafe_mutation on every switch made from inside a cell. Typing
  // first leaves a commit pending, which the blur then runs in the teardown;
  // on a heading that commit refreshes the outline, more $state.
  const before = complaints.length;
  const en = page.locator('.en-cell .ProseMirror').first();
  for (const [target, typed] of [['Interpolated', 'x'], ['Lane', ''], ['Weave', ''], ['Lines', 'y']]) {
    await en.click();
    if (typed) await page.keyboard.type(typed);
    await page.locator('.view-toggle-btn', { hasText: target }).click();
    await page.waitForTimeout(100); // let a deferred error surface in this step
  }
  check('switching view from inside a cell raises no error', complaints.length === before);
  const kept = await en.innerText();
  check('text typed just before a switch is kept', kept.includes('x') && kept.includes('y'), kept);

  // The focused line's Greek is lit while its English has the cursor, and
  // goes dark when the editor loses focus the ordinary way.
  await page.locator('.view-toggle-btn', { hasText: 'Interpolated' }).click();
  await page.locator('.view-toggle-btn', { hasText: 'Lane' }).click();
  await en.click();
  check('the focused line is lit', (await page.locator('.flow-grc.lit').count()) === 1);
  await page.evaluate(() => document.activeElement?.blur());
  await page.waitForTimeout(50);
  check('the light goes out on blur', (await page.locator('.flow-grc.lit').count()) === 0);
  await page.locator('.view-toggle-btn', { hasText: 'Lines' }).click();
});

await run('type into an empty Lane cell after clicking it', async () => {
  // An empty cell shows a dotted placeholder (a ::before box) that focus
  // removes. A click landed on that box, and Chromium, finding it gone once
  // the press had focused the cell, left the old selection where it was:
  // the cell had focus but no caret, and typing went nowhere. It needs a
  // selection already on the page, as a blur leaves one; set it here so the
  // step does not lean on the steps before it. Row 1 flows (row 0 is the
  // heading made above).
  await page.locator('.view-toggle-btn', { hasText: 'Interpolated' }).click();
  await page.locator('.view-toggle-btn', { hasText: 'Lane' }).click();
  const en = page.locator('.en-cell[data-row-en="1"] .ProseMirror');
  if ((await en.innerText()).trim() !== '') throw new Error('row 1 is not empty, so this cannot test an empty cell');
  await page.evaluate(() => {
    document.activeElement?.blur();
    getSelection().collapse(document.querySelector('.chapter-editor'), 0);
  });
  await en.click();
  await page.keyboard.type('xq');
  check('typing into an empty Lane cell lands', (await en.innerText()).trim() === 'xq', JSON.stringify(await en.innerText()));
  await page.locator('.view-toggle-btn', { hasText: 'Lines' }).click();
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

await run('undo a structural edit and switch chapter at once', async () => {
  // A structural undo refreshes the footnote list on the next tick. When the
  // same flush unmounts the editor (a chapter switch), that refresh used to
  // run anyway and show the old chapter's notes in the new chapter's panel.
  await page.locator('.add-work', { hasText: 'New document…' }).click();
  const dialog = page.locator('.dialog', { has: page.locator('text=New document') });
  await dialog.locator('input[type="text"]').first().fill('Smoke Race');
  await dialog.locator('textarea').fill('Prima pars.\n\nSecunda pars.');
  await dialog.locator('input[value="paragraphs"]').check(); // structural edits need paragraph rows
  await dialog.locator('.primary-btn').click();
  await page.waitForFunction(() => document.querySelector('.chapter-head h1')?.textContent?.includes('Smoke Race'));
  // Footnotes live in the sentence layer, so the note goes in from there.
  await page.locator('.view-toggle-btn', { hasText: 'Interpolated' }).click();
  await page.getByRole('button', { name: 'By sentence' }).click();
  await page.locator('.en-cell .ProseMirror').first().click();
  await page.keyboard.type('racephrase');
  await page.keyboard.press('Shift+Home');
  await page.getByRole('button', { name: 'Insert footnote' }).click();
  await page.waitForSelector('.fn-panel .fn-snippet:has-text("racephrase")');
  await page.locator('.view-toggle-btn', { hasText: 'Paragraphs' }).click();
  await page.locator('.grc-cell').first().click({ button: 'right' });
  await page.locator('.ctx-menu-item', { hasText: 'Insert heading line here' }).hover();
  await page.locator('.ctx-submenu .ctx-menu-item').first().click();
  await page.waitForSelector('.en-cell[data-heading-level]');
  const stale = await page.evaluate(async () => {
    const target = [...document.querySelectorAll('.work')]
      .find((w) => w.querySelector('.work-title')?.textContent?.includes('Metaphysics'))
      ?.querySelector('.chapter-row');
    if (!target) throw new Error('no Metaphysics chapter row in the rail');
    let switched = false;
    let seen = false;
    const panelShowsOld = () => !!document.querySelector('.fn-panel')?.textContent?.includes('racephrase');
    const obs = new MutationObserver(() => {
      if (switched && panelShowsOld()) seen = true;
    });
    obs.observe(document.body, { childList: true, subtree: true, characterData: true });
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', metaKey: true, bubbles: true }));
    target.click();
    switched = true;
    for (let i = 0; i < 20; i++) await new Promise((r) => requestAnimationFrame(r));
    obs.disconnect();
    return seen || panelShowsOld();
  });
  await page.waitForFunction(() => document.querySelector('.chapter-head h1')?.textContent?.includes('Metaphysics'));
  check("the new chapter's footnotes never show the old chapter's", !stale);
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
