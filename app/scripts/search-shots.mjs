// Screenshot gate for the search-page build: shoots the BUILT site, nothing
// injected, in the same states, URLs, sizes and interaction steps as the
// round-34 mock-up shots (redesign-build/.redesign-shots/notes/d26/search/
// menus/menus.mjs and shots.mjs), so each shot can sit beside its twin
// (see search-shots-sheet.mjs).
//
// usage: node app/scripts/search-shots.mjs --base http://127.0.0.1:4351 --out <dir>
//          [--only d01,r34-02,...] [--theme light|dark|both] [--allow-missing]
//
//   --only    comma-separated name prefixes; each must match at least one state.
//   --theme   omitted: each state in its round-34 theme (menus light; page
//             states as listed). light|dark forces one theme; both shoots each
//             state twice. A shot in a theme other than its twin's is saved as
//             <name>@<theme>.png.
//   --allow-missing  exit 0 even when states failed on a missing or hidden
//             selector. Font failures and other errors still exit non-zero.
//
// A state whose step cannot find its target is FAILED, naming the selector; it
// is never shot in the wrong state. Each step must reach its end state (see
// runStep): a step whose end state already holds is skipped, never clicked
// back off, and one that does not reach it is FAILED. Before every shot a
// search URL must show its result count (a number, or "No passages found.")
// and a bare /search its empty form; other pages are shot unchecked, and the
// result says so. Any page error, or console error from the site's own
// origin, FAILS the state. Before every shot the page must have loaded faces
// of each family in FONTS, or the state is FAILED.
//
// Writes <out>/build/<name>.png and <out>/results.json (merged across runs).
import { createRequire } from 'node:module';
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync, unlinkSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const FONTS = ['Oswald', 'Literata', 'Sofia Sans'];

const e = encodeURIComponent;
const AR = `/search?g=${e('ἀρετή')}`;
const D = [1152, 1000], W = [1152, 900], P = [390, 844], S = [844, 390];

// A step is { sel, text?, act, value?, index?, expect?, want? }; sel is what
// must be visible first. expect: what must be visible after it (a selector, or
// { sel, text }); false: no end state of its own (a submit). opens() adds one.
const opens = (step, expect) => ({ ...step, expect });
const sum = (t) => opens({ sel: 'details.opt > summary', text: t, act: 'click' }, { sel: 'details.opt[open] > summary', text: t });
const btn = (sel, text) => ({ sel, text, act: 'click' });
const typeIn = (sel, s) => ({ sel, act: 'type', value: s });
const select = (sel, value) => ({ sel, act: 'select', value });
const top = { act: 'scrollTop' };
const EDITOR = '.prox-terms'; // the proximity editor's term grid, drawn only while it is open

// Menu and control states (menus.mjs): viewport-only shots, light.
const MENUS = [
  ['d01-match', AR, D, [sum('Match')]],
  ['d02-form', AR, D, [sum('Form')]],
  ['d03-accents-on', AR, D, [opens(btn('.opt-btn', 'Accents'), { sel: '.opt-btn[aria-pressed="true"]', text: 'Accents' }), opens(btn('.search-btn'), false)]],
  ['d05-in-works', AR, D, [opens(btn('.opt-in > summary'), 'details.opt-in[open]'), opens(btn('.opt-in label', 'Choose works'), '#works-panel')]],
  ['d30-in-menu', AR, D, [opens(btn('.opt-in > summary'), 'details.opt-in[open]')]],
  ['d31-in-authentic', AR + '&w=-Oec,MM,Prob,VV,DM,Mech,Col,Phgn,Plant,MXG,Aud,Lin,Spir,Vent,Mirab,RhetAl', D, [opens(btn('.opt-in > summary'), 'details.opt-in[open]')]],
  ['d06-advanced', AR, D, [opens(btn('.advanced-trigger'), EDITOR)]],
  ['d07-lemma-open', AR, D, [opens(btn('.opt-lemma'), '.opt-lemma[aria-pressed="true"]')]],
  ['d08-lemma-typing', '/search', D, [opens(btn('.opt-lemma'), '.opt-lemma[aria-pressed="true"]'), opens(typeIn('.query-input', 'ψυχ'), '.gs-under')]],
  ['d09-near-open', '/search', D, [opens(btn('.advanced-trigger'), EDITOR)]],
  ['d10-near-change', `/search?c=${e('l:areth')}&c=${e('l:ecis')}`, D, [opens(btn('.prox-change'), EDITOR)]],
  ['d11-group-menu', AR, D, [sum('Group')]],
  ['d12-group-grammar', AR + '&v=grammar', D, []],
  ['d13-group-form', AR + '&v=form', D, []],
  ['d14-sort-menu', AR, D, [sum('Sort')]],
  ['d15-context-menu', AR, D, [sum('Context')]],
  ['d16-perpage-menu', AR, D, [sum('Per page')]],
  ['d17-citations-only', AR + '&ps=c', D, []],
  ['d18-keyboard', '/search', D, [opens(btn('.gk-toggle'), '#grk-keys')]],
  ['d19-beta-code', '/search', D, [opens(btn('.sq-row .tog'), '.sq-row .tog[aria-pressed="true"]'), typeIn('.query-input', 'a)reth/')]],
  ['d20-both', `/search?g=${e('ἀρετή')}&e=virtue`, D, []],
  ['d21-forms-untick', AR, D, [btn('.fx input[type=checkbox] >> nth=1'), btn('.fx-apply, .sx-forms button', /Apply|Show these forms|Show [0-9,]+ instances/), top]],
  ['d23-save', AR, D, [opens(btn('.sx-save'), { sel: '.sx-save', text: 'Saved' })]],
  ['d24-word-click', AR, D, [btn('.instance mark')]],
  ['d27-word-card', AR + '#zcard', D, [btn('.instance mark')]],
  ['d28-pending-change', `/search?c=${e('l:areth')}&c=${e('l:ecis')}&cw=10`, D, [opens(btn('.prox-change'), EDITOR), { sel: '.combo-slot >> nth=1 >> .prox-relw select', act: 'select', index: 1 }]],
  ['d25-group-collapsed', AR, D, [{ ...btn('.group-head'), want: false }]],
  ['d26-any-word', `/search?g=${e('ἀρετή ἕξις')}&gm=any`, D, []],
  ['n01-three-terms', `/search?c=${e('l:areth')}&c=${e('l:ecis')}&c=${e('l:hdonh')}&cw=10`, D, []],
  ['n02-three-terms-editor', `/search?c=${e('l:areth')}&c=${e('l:ecis')}&c=${e('lb:hdonh')}&cw=10`, [1152, 1300], [opens(btn('.prox-change'), EDITOR)]],
  ['n03-before-and-not', `/search?c=${e('l:areth')}&c=${e('lb:hdonh')}&c=${e('ln:luph')}&cw=10`, D, []],
  ['n07-or-term', `/search?c=${e('l:areth')}&c=${e('l:ecis')}&c=${e('l:hdonh')}&cw=10`, [1152, 1300], [opens(btn('.prox-change'), EDITOR), select('.combo-slot >> nth=2 >> .prox-join', 'or')]],
  ['n08-term-from-term', `/search?c=${e('l:aitios')}&c=${e('l:dia')}&c=${e('g:case.acc')}&cw=5`, [1152, 1300], [opens(btn('.prox-change'), EDITOR), { sel: '.combo-slot >> nth=2 >> .prox-target', act: 'select', index: 1 }]],
  ['n04-add-term', '/search', [1152, 1200], [opens(btn('.advanced-trigger'), EDITOR), opens(btn('button', 'Add term'), '.combo-slot >> nth=2')]],
  ['n06-grammar-term', `/search?c=${e('l:areth')}&c=${e('g:case.gen,number.pl')}&cw=3`, [1152, 1200], [opens(btn('.prox-change'), EDITOR)]],
  ['n05-phone-three', `/search?c=${e('l:areth')}&c=${e('l:ecis')}&c=${e('l:hdonh')}&cw=10`, P, []],
  ['p01-options', AR, P, [btn('.z-opts')]],
  ['p02-options-match', AR, P, [btn('.z-opts'), sum('Match')]],
  ['p03-filter', AR, P, [btn('.sx-icon', 'Filter')]],
  ['p04-sort', AR, P, [btn('.sx-icon', /Sort|View/)]],
  ['p05-keyboard', AR, P, [btn('.gk-toggle')]],
  ['p06-advanced', AR, P, [btn('.z-opts'), btn('.advanced-trigger')]],
  ['q01-form', AR, P, [btn('.z-opts'), sum('Form')]],
  ['q02-accents-on', AR, P, [btn('.z-opts'), btn('.opt-btn', 'Accents')]],
  ['q03-in-works', AR, P, [btn('.z-opts'), btn('.z-in > summary'), btn('.z-in label', 'Choose works')]],
  ['q13-in-menu', AR, P, [btn('.z-opts'), btn('.z-in > summary')]],
  ['q04-lemma-typing', '/search', P, [btn('.z-opts'), btn('.z-lemma'), typeIn('.query-input', 'ψυχ')]],
  ['q05-near-editor', `/search?c=${e('l:areth')}&c=${e('l:ecis')}&c=${e('lb:hdonh')}&cw=10`, P, [btn('details.combo-panel > summary')]],
  ['q06-beta-code', '/search', P, [btn('.sq-row .tog'), typeIn('.query-input', 'a)reth/')]],
  ['q07-filter-works', AR, P, [btn('.sx-icon', 'Filter'), btn('.sx-panel button', 'Works')]],
  ['q08-filter-forms', AR, P, [btn('.sx-icon', 'Filter'), btn('.sx-panel button', 'Forms')]],
  ['q09-word-click', AR, P, [btn('.instance mark')]],
  ['q10-save', AR, P, [opens(btn('.sx-save'), { sel: '.sx-save', text: 'Saved' })]],
  ['q11-group-grammar', AR + '&v=grammar', P, []],
  ['q12-citations-only', AR + '&ps=c', P, []],
  ['s01-sideways-options', AR, S, [btn('.z-opts')]],
  ['s02-sideways-keyboard', AR, S, [btn('.gk-toggle')]],
];

// Page states (shots.mjs): full-page capture clipped to clipH, theme as listed.
// [name, path, [w, h], theme, clipH, action]
const PAGES = [
  ['r34-01-empty', '/search', W, 'light', 900],
  ['r34-02-greek', AR, W, 'light', 1500],
  ['r34-03-english', '/search?e=virtue', W, 'light', 1300],
  ['r34-04-proximity', `/search?c=${e('l:areth')}&c=${e('l:ecis')}`, W, 'light', 1300],
  ['r34-05-phrase', `/search?g=${e('τὸ τί ἦν εἶναι')}&gm=phrase&m=form`, W, 'light', 1300],
  ['r34-06-whole-section', `${AR}&wf=EN`, W, 'light', 1500, 'more'],
  ['r34-07-options-open', AR, W, 'light', 1100, 'advanced'],
  ['r34-08-advanced-guide', '/advanced', W, 'light', 1600],
  ['r34-09-greek-dark', AR, W, 'dark', 1300],
  ['r34-10-phone-empty', '/search', P, 'light', 844],
  ['r34-11-phone-greek', AR, P, 'light', 1800],
  ['r34-12-phone-greek-dark', AR, P, 'dark', 1400],
  ['r34-13-sideways-greek', AR, S, 'light', 390],
];

// Retired since round 34: reported as skipped, never shot.
export const RETIRED = { 'd04-case-on': 'no longer exists (Case option dropped)', 'd22-works-more': 'no longer exists (works "more" dropped)' };

export const STATES = [
  ...MENUS.map(([name, path, [w, h], steps]) => ({ name, kind: 'menu', path, w, h, theme: 'light', steps, twin: `menus/m34/${name}.png` })),
  ...PAGES.map(([name, path, [w, h], theme, clipH, action]) => ({ name, kind: 'page', path, w, h, theme, clipH, action, twin: `round34/${name}.png` })),
];

// ---------------------------------------------------------------------------

function resolvePlaywright() {
  const require = createRequire(import.meta.url);
  try { return require('playwright'); } catch {}
  const r = join(homedir(), '.npm', '_npx');
  if (existsSync(r)) for (const h of readdirSync(r)) { const p = join(r, h, 'node_modules', 'playwright'); if (existsSync(p)) return require(p); }
  throw new Error('Playwright not found');
}
if (!process.env.PLAYWRIGHT_BROWSERS_PATH) {
  const c = join(homedir(), 'Library', 'Caches', 'ms-playwright');
  if (existsSync(c)) process.env.PLAYWRIGHT_BROWSERS_PATH = c;
}

class StepFail extends Error { constructor(cause, msg) { super(msg); this.cause = cause; } }

const describe = (s) => s.text === undefined ? s.sel : `${s.sel} [text ${s.text instanceof RegExp ? s.text : JSON.stringify(s.text)}]`;
const spec = (x) => typeof x === 'string' ? { sel: x } : x;
const visible = (p, x) => { const { sel, text } = spec(x); return p.locator(`${sel} >> visible=true`, text === undefined ? {} : { hasText: text }); };

async function need(p, s) {
  const loc = (s.text === undefined ? p.locator(s.sel) : p.locator(s.sel, { hasText: s.text })).first();
  try { await loc.waitFor({ state: 'visible', timeout: 4000 }); }
  catch {
    const n = await loc.count();
    if (!n) throw new StepFail('missing', `missing selector: ${describe(s)}`);
    throw new StepFail('hidden', `selector present but not visible: ${describe(s)}`);
  }
  return loc;
}

// A toggle's state: a summary's <details> open, else aria-expanded, else
// aria-pressed; null when the element is none of these.
const toggled = (loc) => loc.evaluate(el => {
  if (el.tagName === 'SUMMARY' && el.parentElement?.tagName === 'DETAILS') return el.parentElement.open;
  const a = el.getAttribute('aria-expanded') ?? el.getAttribute('aria-pressed');
  return a === null ? null : a === 'true';
}).catch(() => undefined);
const selected = (loc, s) => loc.evaluate((el, s) => s.index !== undefined ? el.selectedIndex === s.index : el.value === s.value, { index: s.index, value: s.value }).catch(() => undefined);

async function act(p, loc, s) {
  if (s.act === 'click') await loc.click({ timeout: 5000 });
  else if (s.act === 'type') { await loc.fill('', { timeout: 5000 }); await loc.type(s.value, { delay: 40 }); }
  else if (s.act === 'select') {
    try { await loc.selectOption(s.index !== undefined ? { index: s.index } : s.value, { timeout: 5000 }); }
    catch { throw new StepFail('other', `cannot select ${s.index !== undefined ? 'index ' + s.index : JSON.stringify(s.value)} in ${describe(s)}`); }
  }
  await p.waitForTimeout(900);
}

async function until(fn, ms = 3000) {
  for (const t0 = Date.now(); ; await new Promise(r => setTimeout(r, 150))) { if (await fn()) return true; if (Date.now() - t0 > ms) return false; }
}

// Runs step n and proves its end state. With `expect`, that must be visible
// after; without, a click on a toggle must leave it on (want: false, off) and
// a select must hold its option. A step whose end state already holds is
// skipped, so no step can toggle its state back off. Returns null, or
// { skipped } or { unchecked } (a step with no end state to prove).
async function runStep(p, s, n = 1) {
  if (s.act === 'scrollTop') { await p.evaluate(() => scrollTo(0, 0)); await p.waitForTimeout(900); return null; }
  const tag = `step ${n} (${s.act} ${describe(s)})`;
  if (s.expect) {
    if (await visible(p, s.expect).count()) return { skipped: `${tag}: ${describe(spec(s.expect))} already visible` };
    await act(p, await need(p, s), s);
    if (!await until(async () => (await visible(p, s.expect).count()) > 0)) throw new StepFail('state', `${tag}: expected ${describe(spec(s.expect))} visible after it`);
    return null;
  }
  const loc = await need(p, s);
  if (s.expect === false || s.act === 'type') { await act(p, loc, s); return s.expect === false ? null : { unchecked: `${tag}: no end state given` }; }
  if (s.act === 'select') {
    if (await selected(loc, s)) return { skipped: `${tag}: already selected` };
    await act(p, loc, s);
    if (!await until(() => selected(loc, s))) throw new StepFail('state', `${tag}: the option did not stay selected`);
    return null;
  }
  const want = s.want ?? true, was = await toggled(loc);
  if (was === want) return { skipped: `${tag}: already ${want ? 'open' : 'closed'}` };
  await act(p, loc, s);
  if (was === null) return { unchecked: `${tag}: not a toggle, and no end state given` };
  if (!await until(async () => (await toggled(loc)) === want)) throw new StepFail('state', `${tag}: expected it ${want ? 'open' : 'closed'} after the click, found it ${want ? 'closed' : 'open'} or gone`);
  return null;
}

// What a page must show before it is shot. A search URL (g, e or c): its
// result count, a number or "No passages found."; a bare /search: the empty
// form. Returns what it saw; any other page is not checked, and says so.
async function checkRender(p, path) {
  const u = new URL(path, 'http://x');
  if (!/\/search\/?$/.test(u.pathname)) return `render not checked: ${u.pathname} is not the search page`;
  if (['g', 'e', 'c'].some(k => u.searchParams.getAll(k).some(v => v.trim()))) {
    const c = visible(p, '.result-count').first();
    try { await c.waitFor({ state: 'visible', timeout: 20000 }); }
    catch {
      const err = await visible(p, '.search-error').first().textContent({ timeout: 500 }).catch(() => null);
      throw new StepFail('render', `search did not render: no visible .result-count${err ? `; search error: ${err.trim()}` : ''}`);
    }
    const t = (await c.textContent()).trim();
    if (!/^(\d[\d,]* instances?\b|No passages found\.)/.test(t)) throw new StepFail('render', `result count reads ${JSON.stringify(t)}`);
    return t;
  }
  if (!await visible(p, '.query-input').count()) throw new StepFail('render', 'empty form did not render: no visible .query-input');
  if (await p.locator('.result-count').count()) throw new StepFail('render', 'bare /search shows a result count');
  return 'empty form';
}

// Every family in FONTS must have at least one loaded face. document.fonts.check
// alone is no proof: it answers true for a family that was never declared.
async function checkFonts(p) {
  const rep = await p.evaluate(async (fams) => {
    await document.fonts.ready;
    const faces = (f) => [...document.fonts].filter(x => x.family.replace(/^["']|["']$/g, '') === f);
    const out = {}; let forced = false;
    for (const f of fams) {
      let loaded = faces(f).filter(x => x.status === 'loaded').length;
      if (!loaded && faces(f).length) { forced = true; await document.fonts.load(`16px "${f}"`).catch(() => {}); loaded = faces(f).filter(x => x.status === 'loaded').length; }
      out[f] = { declared: faces(f).length, loaded };
    }
    return { out, forced };
  }, FONTS);
  const bad = Object.entries(rep.out).filter(([, v]) => !v.loaded);
  if (bad.length) throw new StepFail('font', bad.map(([f, v]) => `font "${f}" not loaded (declared faces ${v.declared}, loaded 0)`).join('; '));
  if (rep.forced) { await p.waitForTimeout(300); await p.evaluate(() => document.fonts.ready); }
}

async function shoot(browser, st, theme, base, file) {
  const ctx = await browser.newContext({ viewport: { width: st.w, height: st.h }, colorScheme: theme, deviceScaleFactor: 1, isMobile: st.w < 900, hasTouch: st.w < 900 });
  await ctx.addInitScript(t => { try { localStorage.setItem('ne-theme', t); } catch {} }, theme);
  const p = await ctx.newPage(); const errs = [], notes = { skipped: [], unchecked: [] };
  p.on('pageerror', x => errs.push(x.message));
  // Console errors from the site's own origin only; a blocked third-party
  // request logs one that says nothing about the page.
  const origin = new URL(base).origin;
  p.on('console', m => { if (m.type() === 'error' && (m.location().url || '').startsWith(origin)) errs.push(`console: ${m.text()}`); });
  const lost = []; p.on('requestfailed', r => lost.push(`${r.url().slice(0, 80)} (${r.failure()?.errorText})`));
  try {
    await p.goto(base + st.path, { waitUntil: 'networkidle', timeout: 90000 });
    await p.evaluate(() => document.fonts.ready);
    if (st.kind === 'menu') {
      await p.waitForTimeout(1500);
      for (const [i, s] of st.steps.entries()) { const r = await runStep(p, s, i + 1); if (r?.skipped) notes.skipped.push(r.skipped); if (r?.unchecked) notes.unchecked.push(r.unchecked); }
      await p.evaluate(() => document.fonts.ready); await p.mouse.move(1, 1); await p.waitForTimeout(1600);
      notes.render = await checkRender(p, st.path);
      await checkFonts(p);
      await p.screenshot({ path: file });
    } else {
      await p.waitForTimeout(2000);
      let y0 = 0;
      if (st.action === 'more') {
        const r = await runStep(p, btn('.inst-more')); if (r?.skipped) notes.skipped.push(r.skipped); if (r?.unchecked) notes.unchecked.push(r.unchecked);
        await p.mouse.move(1, 1); await p.waitForLoadState('networkidle'); await p.waitForTimeout(1500);
        // round 34: the opened hit's head row sits 24px from the top of the shot
        await need(p, { sel: '.z-ohead' });
        y0 = await p.evaluate(() => { const h = document.querySelector('.z-ohead'); return Math.max(0, Math.round(h.getBoundingClientRect().top + scrollY - 24)); });
      }
      if (st.action === 'advanced') { const r = await runStep(p, opens(btn('button', /^(Advanced|Proximity)/), EDITOR)); if (r?.skipped) notes.skipped.push(r.skipped); }
      notes.render = await checkRender(p, st.path);
      await checkFonts(p);
      const full = await p.evaluate(() => document.documentElement.scrollHeight);
      await p.screenshot({ path: file, fullPage: true, clip: { x: 0, y: y0, width: st.w, height: Math.min(st.clipH, full - y0) } });
    }
    await p.waitForTimeout(300);
    if (errs.length) throw new StepFail('error', `page error: ${errs[0].split('\n')[0].slice(0, 160)}${errs.length > 1 ? ` (+${errs.length - 1} more)` : ''}`);
    return { status: 'shot', errs, ...notes };
  } catch (x) {
    if (existsSync(file)) unlinkSync(file); // no picture under a failed verdict
    if (x instanceof StepFail) return { status: 'failed', cause: x.cause, reason: x.message + (x.cause === 'font' && lost.length ? `; failed requests: ${lost.join(', ')}` : ''), errs, ...notes };
    return { status: 'failed', cause: 'other', reason: String(x.message).split('\n')[0].slice(0, 200), errs, ...notes };
  } finally { await ctx.close(); }
}

function args(argv) {
  const a = { theme: null, only: null, allowMissing: false };
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i];
    if (k === '--allow-missing') a.allowMissing = true;
    else if (['--base', '--out', '--only', '--theme'].includes(k) && argv[i + 1] !== undefined) a[k.slice(2)] = argv[++i];
    else throw new Error(`unknown or incomplete argument: ${k}`);
  }
  if (!a.base || !a.out) throw new Error('--base and --out are required');
  if (a.theme && !['light', 'dark', 'both'].includes(a.theme)) throw new Error(`--theme must be light, dark or both, not ${a.theme}`);
  a.base = a.base.replace(/\/$/, '');
  return a;
}

async function main() {
  let a;
  try { a = args(process.argv.slice(2)); } catch (x) { console.error(x.message); process.exit(2); }
  const out = resolve(a.out), dir = join(out, 'build'); mkdirSync(dir, { recursive: true });

  let todo = STATES, skipped = Object.entries(RETIRED);
  if (a.only) {
    const toks = a.only.split(',').map(s => s.trim()).filter(Boolean);
    const unknown = toks.filter(t => !STATES.some(s => s.name.startsWith(t)) && !Object.keys(RETIRED).some(r => r.startsWith(t)));
    if (unknown.length) { console.error(`--only matched no state: ${unknown.join(', ')}`); process.exit(2); }
    todo = STATES.filter(s => toks.some(t => s.name.startsWith(t)));
    skipped = skipped.filter(([r]) => toks.some(t => r.startsWith(t)));
  }
  const runs = todo.flatMap(st => (a.theme === 'both' ? ['light', 'dark'] : [a.theme || st.theme]).map(theme => ({ st, theme })));

  const resPath = join(out, 'results.json');
  const results = existsSync(resPath) ? JSON.parse(readFileSync(resPath, 'utf8')) : {};
  const { chromium } = resolvePlaywright();
  const browser = await chromium.launch();
  const tally = { shot: [], failed: [] };
  for (const { st, theme } of runs) {
    const fname = theme === st.theme ? `${st.name}.png` : `${st.name}@${theme}.png`;
    const file = join(dir, fname);
    if (existsSync(file)) unlinkSync(file); // never leave an old picture under a new verdict
    const r = await shoot(browser, st, theme, a.base, file);
    results[`${st.name}@${theme}`] = { name: st.name, theme, file: r.status === 'shot' ? `build/${fname}` : null, ...r, base: a.base, at: new Date().toISOString() };
    tally[r.status].push({ name: fname, ...r });
    console.log(`${r.status === 'shot' ? 'ok    ' : 'FAILED'} ${fname}${r.reason ? '  ' + r.reason : ''}${r.status === 'shot' ? `  [${r.render}]` : ''}`);
    for (const k of ['skipped', 'unchecked']) for (const m of r[k] || []) console.log(`         ${k} ${m}`);
    writeFileSync(resPath, JSON.stringify(results, null, 1));
  }
  await browser.close();

  console.log(`\nshot ${tally.shot.length} / failed ${tally.failed.length} / skipped ${skipped.length}  (base ${a.base})`);
  const groups = {};
  for (const f of tally.failed) (groups[f.reason] ||= []).push(f.name.replace(/\.png$/, ''));
  for (const [reason, names] of Object.entries(groups).sort((x, y) => y[1].length - x[1].length)) console.log(`  FAILED ${names.length}: ${reason}\n         ${names.join(', ')}`);
  for (const [r, why] of skipped) console.log(`  skipped: ${r} — ${why}`);
  const withErrs = [...tally.shot, ...tally.failed].filter(x => x.errs.length);
  if (withErrs.length) console.log(`  page errors in ${withErrs.length}: ${withErrs.map(x => x.name).join(', ')}`);
  const unchecked = tally.shot.filter(x => x.unchecked?.length || !/^(\d|No passages|empty form)/.test(x.render));
  if (unchecked.length) console.log(`  shot with something unchecked (${unchecked.length}): ${unchecked.map(x => x.name.replace(/\.png$/, '')).join(', ')}`);

  const hard = tally.failed.filter(f => !(a.allowMissing && (f.cause === 'missing' || f.cause === 'hidden')));
  process.exit(hard.length ? 1 : 0);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
