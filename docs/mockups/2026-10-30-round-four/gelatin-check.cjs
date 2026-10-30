// Functional check of gelatin.html, the vote on the gelatin silver candidates:
// every candidate with its three pictures, each cut the shape its poster asks
// for; each title inside its poster and at round four's size; the work picker;
// the thumbs and the store they are kept in; both themes; a phone's width.
// Each check must first catch a planted fault. Needs Playwright and a local
// server serving this folder (python3 -m http.server 8765; or set BASE), and
// gelatin.py run first.
//   node docs/mockups/2026-10-30-round-four/gelatin-check.cjs
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const BASE = process.env.BASE || 'http://localhost:8765/';
const fails = [];
let checks = 0;
const ok = (cond, msg) => { checks++; if (!cond) fails.push(msg); };
const caught = (hit, what) => { if (!hit) { console.log(`FAIL: ${what} missed a planted fault`); process.exit(1); } };
const candidates = JSON.parse(fs.readFileSync(path.join(__dirname, 'gelatin-candidates.json'), 'utf8'));
const KEYS = Object.entries(candidates).flatMap(([w, cs]) => cs.map((_, i) => `c:${w}:${i}`));

// Stands in for the artifact's store: an in-memory `votes` collection and an
// owner. __drop makes the next write fail.
const STUB = (owner) => `
  const docs = new Map(); let sub = null;
  const push = () => sub && sub({ docs: [...docs].map(([id, x]) => ({ id, data: () => x })) });
  window.__docs = docs;
  const db = { collection: () => ({
    onSnapshot(fn) { sub = fn; push(); return () => {}; },
    doc: (id) => ({
      async set(x) { if (window.__drop) { window.__drop = false; throw new Error('lost'); } docs.set(id, x); push(); },
      async delete() { docs.delete(id); push(); },
    }),
  }) };
  window.claude = { use: async (n) => (n === 'db' ? db : n === 'user' ? { isOwner: async () => ${owner} } : null) };`;

// Everything a shown page must hold. Lazy pictures are forced to load.
const audit = () => page.evaluate(async () => {
  const out = [];
  for (const im of document.querySelectorAll('img')) im.loading = 'eager';
  const settle = (ims) => Promise.all(ims.map((im) => (im.complete ? 0 : new Promise((r) => { im.onload = im.onerror = r; }))));
  await settle([...document.images]);
  // The local server drops connections under load: a picture gets a second try.
  const missed = [...document.images].filter((im) => !im.naturalWidth);
  for (const im of missed) { const src = im.src; im.src = ''; im.src = src; }
  await new Promise((r) => setTimeout(r, 50));
  await settle(missed);
  for (const im of document.querySelectorAll('.work:not([hidden]) img')) if (!im.naturalWidth) out.push(`no picture: ${im.getAttribute('src')}`);
  for (const po of document.querySelectorAll('.work:not([hidden]) .po')) {
    const im = po.querySelector('img');
    const want = po.classList.contains('desk') ? 2.4 : 0.8;
    if (Math.abs(im.naturalWidth / im.naturalHeight - want) > 0.02) out.push(`wrong cut: ${im.getAttribute('src')} ${im.naturalWidth}x${im.naturalHeight}`);
    const b = po.getBoundingClientRect();
    const t = po.querySelector('.po-t span').getBoundingClientRect();
    if (t.left < b.left - 1 || t.right > b.right + 1 || t.bottom > b.bottom + 1) out.push(`title outside: ${im.getAttribute('src')}`);
    const fz = parseFloat(getComputedStyle(po.querySelector('.po-t')).fontSize);
    const w = po.classList.contains('desk') ? 1440 : 390;
    if (Math.abs(fz - (parseFloat(po.style.getPropertyValue('--fz')) * b.width) / w) > 0.5) out.push(`title size: ${im.getAttribute('src')}`);
  }
  // Pictures in one row stand at one height.
  for (const r of document.querySelectorAll('.work:not([hidden]) .row')) {
    const figs = [...r.children].filter((f) => f.getBoundingClientRect().top === r.children[r.children.length - 1].getBoundingClientRect().top);
    const hs = figs.map((f) => f.querySelector('.po, img').getBoundingClientRect().height);
    if (Math.max(...hs) - Math.min(...hs) > 1) out.push(`row heights: ${r.closest('.cand').id} ${hs}`);
  }
  if (document.documentElement.scrollWidth > innerWidth) out.push(`page wider than the screen: ${document.documentElement.scrollWidth}`);
  return out;
});

let page;
(async () => {
  const browser = await chromium.launch();
  const open = async (o, owner = true) => {
    const c = await browser.newContext(o);
    page = await c.newPage();
    if (owner !== null) await page.addInitScript(STUB(owner));
    await page.goto(BASE + 'gelatin-test.html');
    await page.evaluate(() => document.fonts.load('600 100px "Sofia Sans"', 'A'));
    await page.waitForTimeout(200);
    return c;
  };

  // Planted faults first.
  let c = await open({ viewport: { width: 1440, height: 900 } });
  await page.evaluate(() => {
    document.querySelector('.cand:not(.now) .po.desk img').src = 'img/gel/phone/DA-0.jpg';
    document.querySelector('.cand:not(.now) .po.phone img').src = 'img/none.jpg';
    document.querySelector('.cand:not(.now) .whole img').style.height = '40px';
    document.querySelector('.po .po-t').style.fontSize = '200px';
    document.querySelector('.foot').style.width = '3000px';
  });
  const planted = await audit();
  for (const w of ['wrong cut', 'no picture', 'row heights', 'title', 'page wider']) caught(planted.some((x) => x.startsWith(w)), w);
  await c.close();

  // Every candidate, desktop and both themes, and a phone.
  for (const [name, o] of [['desktop', { viewport: { width: 1440, height: 900 } }], ['dark', { viewport: { width: 1280, height: 800 }, colorScheme: 'dark' }], ['phone', { viewport: { width: 390, height: 800 } }]]) {
    c = await open(o);
    const n = await page.$$eval('.cand:not(.now)', (x) => x.map((e) => e.dataset.key));
    ok(JSON.stringify(n.slice().sort()) === JSON.stringify(KEYS.slice().sort()), `${name}: candidates ${n.length} of ${KEYS.length}`);
    ok((await page.$$('.cand.now')).length === Object.keys(candidates).length, `${name}: a Now row per work`);
    for (const f of await audit()) ok(false, `${name}: ${f}`);
    ok(true, `${name}: audit`);
    await c.close();
  }

  // The work picker.
  c = await open({ viewport: { width: 1280, height: 800 } });
  await page.selectOption('#sel', 'Meta');
  ok((await page.$$eval('.work:not([hidden])', (x) => x.map((e) => e.dataset.w))).join() === 'Meta', 'picker shows one work');
  await page.click('#next');
  const after = await page.$eval('#sel', (s) => s.value);
  ok(after !== 'Meta' && after !== 'all' && (await page.$$('.work:not([hidden])')).length === 1, 'next moves on');
  await page.reload();
  ok((await page.$eval('#sel', (s) => s.value)) === after, 'picker remembered');
  await page.selectOption('#sel', 'all');
  ok((await page.$$('.work:not([hidden])')).length === Object.keys(candidates).length, 'all works');

  // The thumbs: up, change to down, take back, a lost write.
  const state = () => page.evaluate(() => {
    const el = document.querySelector('.vote[data-key="c:DA:0"]');
    return { up: el.querySelector('.up').getAttribute('aria-pressed'), down: el.querySelector('.down').getAttribute('aria-pressed'), doc: window.__docs.get('c:DA:0')?.vote || '', tally: document.getElementById('tally').textContent };
  });
  const thumb = (v) => page.click(`.vote[data-key="c:DA:0"] .${v}`);
  await thumb('up'); await page.waitForTimeout(30);
  let s = await state();
  ok(s.up === 'true' && s.doc === 'up' && /^1 of 48 voted · 1 up · 0 down/.test(s.tally), `vote up ${JSON.stringify(s)}`);
  await thumb('down'); await page.waitForTimeout(30);
  s = await state();
  ok(s.up === 'false' && s.down === 'true' && s.doc === 'down', `change to down ${JSON.stringify(s)}`);
  await thumb('down'); await page.waitForTimeout(30);
  s = await state();
  ok(s.down === 'false' && s.doc === '' && /^0 of 48/.test(s.tally), `take back ${JSON.stringify(s)}`);
  await page.evaluate(() => { window.__drop = true; });
  await thumb('up'); await page.waitForTimeout(30);
  s = await state();
  ok(s.up === 'false' && s.doc === '' && (await page.textContent('#vmsg')).includes('not saved'), `lost write ${JSON.stringify(s)}`);
  await c.close();

  // Not the owner: thumbs shown but shut. No store: no thumbs.
  c = await open({ viewport: { width: 1280, height: 800 } }, false);
  ok(await page.$eval('.vb', (b) => b.disabled && getComputedStyle(b.parentElement).display !== 'none'), 'not the owner: thumbs disabled');
  await c.close();
  c = await open({ viewport: { width: 1280, height: 800 } }, null);
  ok(await page.$eval('.vote', (v) => getComputedStyle(v).display === 'none'), 'no store: thumbs hidden');
  await c.close();

  await browser.close();
  for (const f of fails) console.log('FAIL:', f);
  console.log(`${checks} checks, ${fails.length} failed`);
  process.exit(fails.length ? 1 : 0);
})();
