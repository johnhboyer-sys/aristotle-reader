// The golden-search battery: fixed searches on the four live readers, each with an
// expected answer and where that answer comes from. Run after every search deploy:
//   node docs/search-counting/battery/run.mjs [--site plato] [--base-plato https://…]
// A case whose status is "known-bug" is expected to FAIL; when it passes, the bug is
// fixed (or the case no longer reaches it) and the case should be promoted.
import { createRequire } from 'node:module';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
function playwright() {
  // PLAYWRIGHT_MODULE: a playwright package whose browsers are installed, when the
  // npx cache holds a newer one than ~/Library/Caches/ms-playwright.
  if (process.env.PLAYWRIGHT_MODULE) return require(process.env.PLAYWRIGHT_MODULE);
  try { return require('playwright'); } catch {}
  const root = join(homedir(), '.npm', '_npx');
  for (const h of existsSync(root) ? readdirSync(root) : []) {
    const p = join(root, h, 'node_modules', 'playwright');
    if (existsSync(p)) return require(p);
  }
  throw new Error('Playwright not found: run `npx playwright --version` once to fill the npx cache.');
}
if (!process.env.PLAYWRIGHT_BROWSERS_PATH) {
  const cache = join(homedir(), 'Library', 'Caches', 'ms-playwright');
  if (existsSync(cache)) process.env.PLAYWRIGHT_BROWSERS_PATH = cache;
}

const here = dirname(fileURLToPath(import.meta.url));
const { sites, cases } = JSON.parse(readFileSync(join(here, 'cases.json'), 'utf8'));
const arg = n => { const i = process.argv.indexOf(n); return i > 0 ? process.argv[i + 1] : undefined; };
const only = arg('--site');
for (const s of Object.keys(sites)) sites[s] = arg(`--base-${s}`) ?? sites[s];

function check(c, got) {
  const fails = [];
  const e = c.expect;
  if (e.bar && got.bar && !got.bar.startsWith(e.bar)) fails.push(`bar "${got.bar}", want "${e.bar}…"`);
  const num = re => { const m = got.bar.replace(/,/g, '').match(re); return m ? Number(m[1]) : null; };
  if (e.units != null && num(/^(\d+) /) !== e.units) fails.push(`${num(/^(\d+) /)} units, want ${e.units}`);
  if (e.hits != null && num(/(\d+) hits?\b/) !== e.hits) fails.push(`${num(/(\d+) hits?\b/)} hits, want ${e.hits}`);
  for (const w of e.has ?? []) if (!got.text.includes(w)) fails.push(`page lacks "${w}"`);
  for (const h of e.headsHas ?? []) if (!got.heads.includes(h)) fails.push(`Forms list lacks the headword ${h} (has ${got.heads.join(', ') || 'none'})`);
  for (const h of e.headsLack ?? []) if (got.heads.includes(h)) fails.push(`Forms list has the headword ${h}`);
  if (e.headsLack?.length && !e.headsHas?.length) fails.push('a "headsLack" check needs a "headsHas" check beside it');
  // An absence proves nothing unless the forms under test were shown at all.
  if (e.lacks?.length && !e.has?.length) fails.push('a "lacks" check needs a "has" check beside it');
  for (const w of e.lacks ?? []) if (got.text.includes(w)) fails.push(`page has "${w}"`);
  if (e.url && !decodeURIComponent(got.url).includes(e.url)) fails.push(`address ${decodeURIComponent(got.url)}, want "${e.url}"`);
  return fails;
}

const { chromium } = playwright();
const browser = await chromium.launch();
let bad = 0, flipped = 0, ran = 0;
for (const c of cases) {
  if (only && c.site !== only) continue;
  ran++;
  const ctx = await browser.newContext({ serviceWorkers: 'block' });
  const page = await ctx.newPage();
  const url = sites[c.site] + c.path;
  let got = { bar: '', text: '', heads: [], url: '' };
  try {
    await page.goto(url, { waitUntil: 'networkidle', timeout: 90000 });
    await page.waitForFunction(
      () => /\d[\d,]* (chapters|sections|scenes|speeches|passages)\b|No \w+ found/.test(document.body.innerText),
      null, { timeout: 90000 });
    // The count fills in as works load: read it once it has held still.
    const readBar = async () => ((await page.locator('body').innerText())
      .match(/\d[\d,]* (chapters|sections|scenes|speeches|passages)\b[^\n]*|No \w+ found\.?/) ?? [''])[0];
    let last = await readBar(), steady = 0;
    for (let i = 0; i < 40 && steady < 3; i++) {
      await page.waitForTimeout(500);
      const now = await readBar();
      steady = now === last ? steady + 1 : 0;
      last = now;
    }
    await page.waitForTimeout(1000);
    const text = await page.locator('body').innerText();
    // The Forms list names every headword the Greek hits belong to: absences are
    // checked there, not in the page, whose passages show other words.
    const heads = await page.evaluate(() => [...document.querySelectorAll('.fx-list .fx-head')]
      .flatMap(e => e.textContent.split('·').map(h => h.trim())).filter(Boolean));
    const bar = (text.match(/\d[\d,]* (chapters|sections|scenes|speeches|passages)\b[^\n]*|No \w+ found\.?/) ?? [''])[0];
    got = { bar, text, heads, url: page.url() };
  } catch (err) { got.bar = ''; got.err = err.message.split('\n')[0]; }
  await ctx.close();
  const bug = c.status === 'known-bug';
  // A page that did not load, or showed no results, examined nothing: that is an
  // error for every case. A known bug must still return results, or "lacks X"
  // would pass on an empty page and read as a fix.
  // A count can show while some passage sources failed (the page says so): the
  // results are partial, so neither a count nor an absence can be trusted.
  const partial = /didn[’']t load/.test(got.text);
  const broken = got.err || !got.bar ? `no result bar (${got.err ?? 'page loaded without one'})`
    : partial ? 'some passage sources did not load; results are partial'
    : bug && /^No \w+ found/.test(got.bar) ? 'no results, so the bug was not reached' : null;
  const fails = broken ? [broken] : check(c, got);
  const pass = fails.length === 0;
  const mark = broken ? 'ERROR' : bug ? (pass ? 'FIXED?' : 'bug ok') : (pass ? 'ok' : 'FAIL');
  if (broken || (!bug && !pass)) bad++;
  if (bug && pass) flipped++;
  console.log(`${mark.padEnd(7)} ${c.site.padEnd(9)} ${c.id}  |  ${got.bar || got.err || '(nothing)'}`);
  if (!pass && (!bug || broken)) for (const f of fails) console.log(`          - ${f}`);
}
await browser.close();
console.log(`\n${ran} cases: ${bad} failing or broken, ${flipped} known bugs now passing`);
if (!ran) { console.log('examined nothing'); process.exit(2); }
process.exit(bad ? 1 : 0);
