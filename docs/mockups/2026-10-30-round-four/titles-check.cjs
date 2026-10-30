// Functional check of titles.html, the page of title settings for B's
// posters: every setting on every poster, desktop and phone; each title
// inside its poster and set as round four's mockup sets it; the controls;
// the thumbs on every poster and photograph, and the store they are kept in;
// both themes; a phone's width. Each check must first catch a planted fault.
// Needs Playwright and a local server serving this folder (python3 -m
// http.server 8765; or set BASE), and titles.py and build.py run first.
//   node docs/mockups/2026-10-30-round-four/titles-check.cjs
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const BASE = process.env.BASE || 'http://localhost:8765/';
const fails = [];
let checks = 0;
const ok = (cond, msg) => { checks++; if (!cond) fails.push(msg); };
// A check that misses its planted fault stops the run.
const caught = (hit, what) => { if (!hit) { console.log(`FAIL: ${what} missed a planted fault`); process.exit(1); } };
const read = (f) => fs.readFileSync(path.join(__dirname, f), 'utf8');

const reg = JSON.parse(read('../2026-10-29-directions/data.json')).registry;
const byId = Object.fromEntries(reg.works.map((w) => [w.id, w]));
const HERO = /U\.HERO = \['(\w+)'/.exec(read('core.js'))[1];
const HOME = 'The complete works of Aristotle';
const POSTERS = ['home', ...reg.works.map((w) => w.id)];
const titleOf = (po) => (po === 'home' ? HOME : byId[po].title);

// The page keeps its votes in the artifact's store, which only claude.ai
// serves. This stands in for it: an in-memory `votes` collection with the
// store's call shapes (onSnapshot on a collection, set and delete on a
// document) and an owner. __drop names a write the store loses; __push
// writes as another tab or device would; __owner = false is someone else.
const STUB = () => {
  const store = new Map();
  const listeners = new Set();
  window.__store = store;
  window.__drop = null;
  const snap = () => {
    const docs = [...store.keys()].sort().map((id) => {
      const body = Object.freeze({ ...store.get(id) });
      return { id, exists: true, data: () => body, metadata: { fromCache: false, hasPendingWrites: false } };
    });
    return { docs, size: docs.length, empty: !docs.length, docChanges: () => [], metadata: { fromCache: false, hasPendingWrites: false } };
  };
  const fire = () => setTimeout(() => listeners.forEach((f) => f(snap())), 0);
  window.__push = (id, body) => { if (body) store.set(id, body); else store.delete(id); fire(); };
  const db = {
    collection: (path) => ({
      path,
      onSnapshot: (next) => { listeners.add(next); fire(); return () => listeners.delete(next); },
      doc: (id) => ({
        id,
        path: `${path}/${id}`,
        set: async (body) => { if (window.__drop !== id) store.set(id, body); fire(); },
        delete: async () => { store.delete(id); fire(); },
      }),
    }),
  };
  const user = { isOwner: async () => window.__owner !== false, canEdit: async () => window.__owner !== false, can: async () => null, id: async () => 'u_test' };
  window.claude = { use: async (name) => (name === 'db' ? db : name === 'user' ? user : null) };
};

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
  await ctx.addInitScript(STUB);
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
  page.on('requestfailed', (r) => errs.push(`request failed: ${r.url()}`));
  const open = async () => {
    await page.goto(`${BASE}titles-test.html`, { waitUntil: 'networkidle' });
    await page.waitForFunction(() => document.documentElement.dataset.titles === 'set', null, { timeout: 60000 });
  };
  const ev = (fn, arg) => page.evaluate(fn, arg);
  const shown = () => ev(() => [...document.querySelectorAll('.it:not([hidden])')].map((x) => x.id));
  // The controls a viewer uses: chips on a wide screen, selects on a phone.
  const pick = async ({ set, po, size, tr }) => {
    const wide = await ev(() => getComputedStyle(document.getElementById('set-chips')).display !== 'none');
    if (po) await page.selectOption('#po-sel', po);
    if (set) await (wide ? page.click(`[data-set-b="${set}"]`) : page.selectOption('#set-sel', set));
    if (size) await (wide ? page.click(`[data-size-b="${size}"]`) : page.selectOption('#size-sel', size));
    if (tr) await (wide ? page.click(`[data-tr-b="${tr}"]`) : page.selectOption('#tr-sel', tr));
    await page.waitForTimeout(80);
  };
  await open();
  const OPTS = await ev(() => window.TL.OPTIONS);

  // ── Every setting on every poster, each with both photographs ────────────
  const structure = () => ev(() => [...document.querySelectorAll('.it')].map((x) => ({
    id: x.id, set: x.dataset.set, po: x.dataset.po,
    name: x.closest('.pg').querySelector('.pg-t').textContent,
    desk: [...x.querySelectorAll('.fig.desk .po.desk img')].map((i) => i.getAttribute('src')),
    phone: [...x.querySelectorAll('.fig.phone .po.phone img')].map((i) => i.getAttribute('src')),
  })));
  const structFaults = (its) => {
    const f = [];
    const seen = new Set();
    for (const x of its) {
      const key = `${x.set}--${x.po}`;
      if (x.id !== key) f.push(`${x.id}: id is not ${key}`);
      if (seen.has(key)) f.push(`${key} twice`);
      seen.add(key);
      const photo = x.po === 'home' ? HERO : x.po;
      if (x.desk.length !== 1 || x.desk[0] !== `img/desk/${photo}.jpg`) f.push(`${key}: desktop photograph ${x.desk}`);
      if (x.phone.length !== 1 || x.phone[0] !== `img/phone/${photo}.jpg`) f.push(`${key}: phone photograph ${x.phone}`);
      if (x.name !== (x.po === 'home' ? 'Home page' : titleOf(x.po))) f.push(`${key}: named ${x.name}`);
    }
    for (const o of OPTS) for (const p of POSTERS) if (!seen.has(`${o}--${p}`)) f.push(`${o}--${p} missing`);
    if (its.length !== OPTS.length * POSTERS.length) f.push(`${its.length} entries, not ${OPTS.length * POSTERS.length}`);
    for (const src of new Set(its.flatMap((x) => [...x.desk, ...x.phone]))) if (!fs.existsSync(path.join(__dirname, src))) f.push(`missing ${src}`);
    return f;
  };
  await ev(() => document.getElementById('block--Pol').remove());
  caught(structFaults(await structure()).some((x) => /block--Pol missing/.test(x)), 'entry check');
  await open();
  const st = await structure();
  ok(OPTS.join() === 'now,justified,stacked,stacked-spread,block,block-big,block-spread', `settings ${OPTS}`);
  // One check per entry (its id, photographs and name), and none missing.
  const sf = structFaults(st);
  for (const x of st) ok(!sf.some((f) => f.startsWith(`${x.id}:`) || f.startsWith(`${x.id} `)), `${x.id}: ${sf.filter((f) => f.startsWith(x.id)).join('; ')}`);
  ok(!sf.some((f) => / missing$|^missing |entries, not/.test(f)), sf.filter((f) => / missing$|^missing |entries, not/.test(f)).join('; '));
  ok(st.length === 294, `${st.length} entries`);

  // ── Each title: inside its poster, set by its rule, in Sofia Sans ────────
  // Measured in the poster's own pixels (the posters are drawn at full size
  // and scaled). A line's right edge leaves out its trailing letter space.
  const titles = () => ev((home) => {
    const cv = document.createElement('canvas').getContext('2d');
    cv.font = '600 100px "Sofia Sans"';
    const w100 = (s) => cv.measureText(s).width;
    const out = [];
    for (const it of document.querySelectorAll('.it:not([hidden])')) {
      const title = it.dataset.po === 'home' ? home : it.closest('.pg').querySelector('.pg-t').textContent;
      for (const [cut, kind] of [['desk', 'desktop'], ['phone', 'phone']]) {
        const B = window.TL.BOX[kind];
        const po = it.querySelector(`.po.${cut}`);
        const t = po.querySelector('.po-t');
        const pr = po.getBoundingClientRect();
        const fr = po.parentElement.getBoundingClientRect();
        const k = pr.width / B.w;
        const rel = (r) => ({ l: (r.left - pr.left) / k, r: (r.right - pr.left) / k, t: (r.top - pr.top) / k, b: (r.bottom - pr.top) / k });
        const spans = [...t.children];
        const lines = spans.length
          ? spans.map((s) => {
            const rg = document.createRange();
            rg.selectNodeContents(s);
            const q = rel(rg.getBoundingClientRect());
            return { text: s.textContent, l: q.l, r: q.r - parseFloat(s.style.letterSpacing), f: parseFloat(getComputedStyle(s).fontSize), box: rel(s.getBoundingClientRect()), weight: getComputedStyle(s).fontWeight, fam: getComputedStyle(s).fontFamily };
          })
          : (() => {
            const rg = document.createRange();
            rg.selectNodeContents(t);
            return [...rg.getClientRects()].filter((r) => r.width > 1).map((r) => { const q = rel(r); return { text: null, l: q.l, r: q.r, weight: getComputedStyle(t).fontWeight, fam: getComputedStyle(t).fontFamily }; });
          })();
        const model = it.dataset.set === 'now' ? null : window.TL.set(title, kind, it.dataset.set, w100).map((m) => ({ text: m.text, f: m.f, right: (w100(m.text) * m.f) / 100 + m.L * (m.text.length - 1) + m.S * (m.text.match(/ /g) || []).length }));
        out.push({ id: it.id, set: it.dataset.set, cut, kind, B, k, fit: [fr.width, fr.height], size: [pr.width, pr.height], title, text: t.textContent, tb: rel(t.getBoundingClientRect()), px: it.querySelector(`.fig.${cut} .px`).textContent, fz: parseFloat(po.style.getPropertyValue('--fz')), lines, model });
      }
    }
    return out;
  }, HOME);
  const BLOCK = ['block', 'block-big', 'block-spread'];
  const spreads = (o) => o.endsWith('-spread');
  const titleFaults = (x) => {
    const f = [];
    const tag = `${x.id} ${x.kind}`;
    const { B } = x;
    const x0 = (B.w - B.W) / 2;
    const up = x.title.toUpperCase();
    if (Math.abs(x.size[0] - x.fit[0]) > 0.6 || Math.abs(x.size[1] - x.fit[1]) > 0.6) f.push(`${tag}: poster ${x.size.map(Math.round)} does not fill its box ${x.fit.map(Math.round)}`);
    if (!x.lines.length) f.push(`${tag}: no title`);
    for (const [i, l] of x.lines.entries()) {
      if (l.l < x0 - 1 || l.r > x0 + B.W + 1.5) f.push(`${tag}: line ${i + 1} runs ${l.l.toFixed(1)}–${l.r.toFixed(1)}, outside ${x0}–${x0 + B.W}`);
      if (Math.abs(l.l - x0) > 1.5) f.push(`${tag}: line ${i + 1} starts at ${l.l.toFixed(1)}, not ${x0}`);
      if (!/^"?Sofia Sans/.test(l.fam) || l.weight !== '600') f.push(`${tag}: line ${i + 1} in ${l.fam} ${l.weight}`);
    }
    const bottom = x.set === 'now' ? x.tb.b : Math.max(...x.lines.map((l) => l.box.b));
    if (bottom > B.h - B.bottom + 1) f.push(`${tag}: title runs to ${bottom.toFixed(1)}, below ${B.h - B.bottom}`);
    // Now: its size is held to the mockup's below.
    if (x.set === 'now') {
      if (x.text !== x.title) f.push(`${tag}: reads ${x.text}`);
      if (x.px !== `${x.fz} px`) f.push(`${tag}: labelled ${x.px}, set at ${x.fz}px`);
      return f;
    }
    // The lines as the rule sets them, with the right sizes.
    const texts = x.lines.map((l) => l.text);
    if (texts.join('|') !== x.model.map((m) => m.text).join('|')) f.push(`${tag}: lines ${texts.join(' / ')}, not ${x.model.map((m) => m.text).join(' / ')}`);
    x.lines.forEach((l, i) => { if (x.model[i] && Math.abs(l.f - Math.round(x.model[i].f * 10) / 10) > 0.05) f.push(`${tag}: line ${i + 1} at ${l.f}px, not ${x.model[i].f.toFixed(1)}`); });
    // Each line ends where the rule measured it to end (the canvas against
    // the browser's own layout); in a block every line but the last meets
    // the right edge.
    x.lines.forEach((l, i) => { const m = x.model[i]; if (m && Math.abs(l.r - (x0 + m.right)) > 1.5) f.push(`${tag}: line ${i + 1} ends at ${l.r.toFixed(1)}, not ${(x0 + m.right).toFixed(1)}`); });
    if (BLOCK.includes(x.set)) x.lines.slice(0, -1).forEach((l, i) => { if (Math.abs(l.r - (x0 + B.W)) > 1.5) f.push(`${tag}: block line ${i + 1} ends at ${l.r.toFixed(1)}, not at the edge ${x0 + B.W}`); });
    // Top to bottom: a title on one line sits in the middle of the room for
    // it; a spread runs from the top of that room to the bottom; the rest
    // start at the top.
    const first = x.lines[0].box.t;
    const last = x.lines[x.lines.length - 1].box.b;
    const mid = (B.top + B.h - B.bottom) / 2;
    if (x.lines.length === 1) {
      if (Math.abs((first + last) / 2 - mid) > 1) f.push(`${tag}: one line centred at ${((first + last) / 2).toFixed(1)}, not ${mid}`);
    } else {
      if (Math.abs(first - B.top) > 1) f.push(`${tag}: title starts at ${first.toFixed(1)}, not ${B.top}`);
      if (spreads(x.set) && Math.abs(last - (B.h - B.bottom)) > 1) f.push(`${tag}: spread ends at ${last.toFixed(1)}, not ${B.h - B.bottom}`);
    }
    // The words: whole in the whole-word settings; broken words keep three
    // letters a side.
    let s = texts[0] || '';
    for (const t of texts.slice(1)) {
      if (up.startsWith(`${s} ${t}`)) s += ` ${t}`;
      else if (up.startsWith(s + t)) {
        const left = s.split(' ').pop().replace(/[^A-Z]/g, '').length;
        const right = t.split(' ')[0].replace(/[^A-Z]/g, '').length;
        if (!BLOCK.includes(x.set)) f.push(`${tag}: breaks a word (${s.split(' ').pop()}/${t.split(' ')[0]})`);
        else if (left < 3 || right < 3) f.push(`${tag}: breaks ${s.split(' ').pop()}/${t.split(' ')[0]}`);
        s += t;
      } else { f.push(`${tag}: lines do not spell the title`); break; }
    }
    if (s !== up) f.push(`${tag}: reads ${s}`);
    const fs2 = x.lines.map((l) => Math.round(l.f));
    const lo = Math.min(...fs2);
    const hi = Math.max(...fs2);
    if (x.px !== (lo === hi ? `${lo} px` : `${lo}–${hi} px`)) f.push(`${tag}: labelled ${x.px}`);
    return f;
  };
  await pick({ set: 'all', po: 'all', size: 'both' });
  // Planted: a block line spaced past the edge, a line in the wrong weight,
  // a line with the wrong words, a poster scaled short of its box, a title
  // on one line left at the top.
  await ev(() => {
    const s = document.querySelector('#block-big--EN .po.desk .po-t span');
    s.style.letterSpacing = `${parseFloat(s.style.letterSpacing) + 6}px`;
    document.querySelector('#stacked--Pol .po.phone .po-t span').style.fontWeight = '400';
    document.querySelector('#justified--home .po.desk .po-t span').textContent = 'THX';
    document.querySelector('#now--Cat .po.desk').style.transform = 'scale(.5)';
    document.querySelector('#stacked--Cat .po.desk .po-t').classList.remove('middle');
  });
  const pl = (await titles()).map((x) => ({ id: `${x.id} ${x.kind}`, f: titleFaults(x).join('; ') }));
  const hit = (id, re) => re.test((pl.find((x) => x.id === id) || {}).f || '');
  caught(hit('block-big--EN desktop', /line 1 runs .*outside/) && hit('block-big--EN desktop', /block line 1 ends/), 'title edge check');
  caught(hit('stacked--Pol phone', /in .* 400/), 'title font check');
  caught(hit('justified--home desktop', /lines .*not|spell|reads/), 'title words check');
  caught(hit('now--Cat desktop', /does not fill/), 'poster scale check');
  caught(hit('stacked--Cat desktop', /one line centred/), 'one-line title check');
  await open();
  await pick({ set: 'all', po: 'all', size: 'both' });
  const all = await titles();
  ok(all.length === 588, `${all.length} posters measured`);
  for (const x of all) { const tf = titleFaults(x); ok(!tf.length, tf.join('; ')); }
  ok(await ev(() => document.fonts.check('600 100px "Sofia Sans"')), 'Sofia Sans SemiBold not loaded');

  // ── The same titles as round four's mockup ───────────────────────────────
  // The mockup's own posters (test.html, built by build.py), each title set
  // by the same rule: the page must show exactly what the mockup shows.
  const mock = await ctx.newPage();
  await mock.goto(`${BASE}test.html#b-home`, { waitUntil: 'networkidle' });
  await mock.addScriptTag({ path: path.join(__dirname, 'title-layout.js') });
  await mock.evaluate(() => document.fonts.ready);
  await mock.click('#bar [data-width=both]');
  const mockSets = (opts) => mock.evaluate((os) => {
    const cv = document.createElement('canvas').getContext('2d');
    cv.font = '600 100px "Sofia Sans"';
    const w100 = (s) => cv.measureText(s).width;
    return window.U.shown().map((P) => {
      const t = P.view.querySelector('.b-po-t');
      const orig = t.textContent.trim();
      return { kind: P.kind, orig, fz: t.closest('.b-po').style.getPropertyValue('--fz').trim(), html: Object.fromEntries(os.filter((o) => o !== 'now').map((o) => [o, window.TL.html(window.TL.set(orig, P.kind, o, w100))])) };
    });
  }, opts);
  const pageSets = () => ev(() => Object.fromEntries([...document.querySelectorAll('.it')].flatMap((it) => ['desk', 'phone'].map((cut) => {
    const po = it.querySelector(`.po.${cut}`);
    return [`${it.id} ${cut === 'desk' ? 'desktop' : 'phone'}`, { fz: po.style.getPropertyValue('--fz').trim(), html: po.querySelector('.po-t').innerHTML, text: po.querySelector('.po-t').textContent }];
  }))));
  let compared = 0;
  const parity = async (ps) => {
    const f = [];
    compared = 0;
    for (const po of POSTERS) {
      await mock.evaluate((h) => { location.hash = h; }, po === 'home' ? 'b-home' : `b-work:${po}`);
      await mock.waitForTimeout(120);
      const m = await mockSets(OPTS);
      if (m.length !== 2) f.push(`${po}: mockup shows ${m.length} panes`);
      for (const x of m) {
        if (x.orig !== titleOf(po)) f.push(`${po} ${x.kind}: mockup title ${x.orig}`);
        for (const o of OPTS) {
          const p = ps[`${o}--${po} ${x.kind}`];
          if (!p) { f.push(`${o}--${po} ${x.kind}: not on the page`); continue; }
          compared += 2;
          if (p.fz !== x.fz) f.push(`${o}--${po} ${x.kind}: size ${p.fz}, mockup ${x.fz}`);
          if (o === 'now' ? p.text !== x.orig : p.html !== x.html[o]) f.push(`${o}--${po} ${x.kind}: set unlike the mockup`);
        }
      }
    }
    return f;
  };
  const ps = await pageSets();
  const planted = { ...ps, 'block--Juv phone': { ...ps['block--Juv phone'], html: ps['block--Juv phone'].html.replace(/font-size:[\d.]+px/, 'font-size:1px') } };
  caught((await parity(planted)).some((x) => /block--Juv phone: set unlike/.test(x)), 'mockup parity check');
  for (const f of await parity(ps)) ok(false, f);
  checks += compared;
  ok(compared === POSTERS.length * OPTS.length * 4, `${compared} comparisons with the mockup`);
  await mock.close();

  // ── The controls ─────────────────────────────────────────────────────────
  await ctx.clearCookies();
  await ev(() => localStorage.clear());
  // What the choices hide is off the page, not only marked hidden.
  const drawn = () => ev(() => ({
    entries: [...document.querySelectorAll('.it')].filter((x) => x.getClientRects().length).length,
    marked: document.querySelectorAll('.it:not([hidden])').length,
    works: [...document.querySelectorAll('.pg')].filter((x) => x.getClientRects().length).length,
  }));
  await open();
  await ev(() => { const st = document.createElement('style'); st.textContent = '.pg[hidden], .it[hidden] { display: grid !important; }'; document.head.appendChild(st); });
  caught((await drawn()).entries !== (await drawn()).marked, 'hidden-entries check');
  await open();
  const dr = await drawn();
  ok(dr.entries === 7 && dr.marked === 7 && dr.works === 1, `first view draws ${JSON.stringify(dr)}`);
  const homeIds = OPTS.map((o) => `${o}--home`);
  ok((await shown()).join() === homeIds.join(), `first view ${await shown()}`);
  const pressed = () => ev(() => ({
    set: [...document.querySelectorAll('[data-set-b][aria-pressed=true]')].map((b) => b.dataset.setB),
    size: [...document.querySelectorAll('[data-size-b][aria-pressed=true]')].map((b) => b.dataset.sizeB),
    tr: [...document.querySelectorAll('[data-tr-b][aria-pressed=true]')].map((b) => b.dataset.trB),
    po: document.getElementById('po-sel').value,
    note: document.getElementById('note').hidden ? '' : document.getElementById('note').textContent,
    one: document.getElementById('list').classList.contains('one-set'),
  }));
  let pr = await pressed();
  ok(pr.set.join() === 'all' && pr.size.join() === 'both' && pr.tr.join() === 'now' && pr.po === 'home' && !pr.note && !pr.one, `first view controls ${JSON.stringify(pr)}`);
  // Planted: an entry shown that the choices exclude.
  await ev(() => { document.getElementById('now--Cat').hidden = false; });
  caught((await shown()).join() !== homeIds.join(), 'shown-entries check');
  await open();
  await pick({ set: 'block', po: 'all' });
  let sh = await shown();
  ok(sh.length === 42 && sh.every((x) => x.startsWith('block--')), `block on every poster: ${sh.length}`);
  const dr2 = await drawn();
  ok(dr2.entries === 42 && dr2.works === 42, `block on every poster draws ${JSON.stringify(dr2)}`);
  pr = await pressed();
  ok(pr.set.join() === 'block' && pr.one && /^Block/.test(pr.note), `one setting ${JSON.stringify(pr)}`);
  await pick({ set: 'all', po: 'all' });
  ok((await shown()).length === 294, 'all settings on all posters');
  await pick({ po: 'home' });
  await page.click('#po-next');
  sh = await shown();
  const order = await ev(() => [...document.querySelectorAll('#po-sel option')].map((o) => o.value).filter((v) => v !== 'all'));
  ok(order.length === 42 && order[0] === 'home', `poster order ${order.length}`);
  ok(sh.join() === OPTS.map((o) => `${o}--${order[1]}`).join(), `next poster ${sh[0]}`);
  await page.click('#po-prev');
  await page.click('#po-prev');
  ok((await shown())[0] === `now--${order[41]}`, 'previous poster wraps to the last');
  await page.locator('h1').click();
  await page.keyboard.press('ArrowRight');
  ok((await shown())[0] === 'now--home', `arrow key steps: ${(await shown())[0]}`);
  await page.keyboard.press('ArrowRight');
  ok((await shown())[0] === `now--${order[1]}`, 'arrow key steps again');
  // Sizes: one poster each, or both.
  const figs = () => ev(() => [...document.querySelectorAll('.it:not([hidden]) .fig')].map((f) => `${f.classList.contains('desk') ? 'desk' : 'phone'}:${getComputedStyle(f).display !== 'none'}`));
  await pick({ po: 'EN', set: 'all', size: 'desk' });
  ok((await figs()).every((x) => x === 'desk:true' || x === 'phone:false'), 'desktop only');
  await pick({ size: 'phone' });
  ok((await figs()).every((x) => x === 'phone:true' || x === 'desk:false'), 'phone only');
  ok(await ev(() => getComputedStyle(document.querySelector('.pg:not([hidden]) .pg-its')).gridTemplateColumns.split(' ').length > 1), 'phone posters in columns on a wide screen');
  // One setting on every work: the works in columns, the posters of a row
  // starting level however long each photograph's line runs.
  await pick({ po: 'all', set: 'block' });
  ok(await ev(() => getComputedStyle(document.getElementById('list')).gridTemplateColumns.split(' ').length > 1), 'one setting: the works in columns');
  const tops = await ev(() => [...document.querySelectorAll('.it:not([hidden]) .fig.phone .fit')].slice(0, 4).map((f) => Math.round(f.getBoundingClientRect().top)));
  ok(tops.length === 4 && new Set(tops).size === 1, `one setting: a row of posters starts at ${tops}`);
  await pick({ po: 'EN', set: 'all' });
  await pick({ size: 'both' });
  ok((await figs()).every((x) => /:true$/.test(x)), 'desktop and phone');
  // The choices survive a reload (this viewer's browser only).
  await pick({ set: 'stacked', po: 'Pol', size: 'phone', tr: 'gray' });
  await open();
  pr = await pressed();
  ok(pr.set.join() === 'stacked' && pr.po === 'Pol' && pr.size.join() === 'phone' && pr.tr.join() === 'gray' && (await shown()).join() === 'stacked--Pol', `remembered ${JSON.stringify(pr)}`);
  await pick({ tr: 'now' });

  // ── Widths: every poster fills its box; no sideways scroll ───────────────
  const fit = () => ev(() => ({
    sw: document.documentElement.scrollWidth,
    cw: document.documentElement.clientWidth,
    off: [...document.querySelectorAll('.it:not([hidden]) .fit')].filter((f) => f.offsetParent).filter((f) => {
      const a = f.getBoundingClientRect();
      const b = f.firstElementChild.getBoundingClientRect();
      return Math.abs(a.width - b.width) > 0.6 || Math.abs(a.height - b.height) > 0.6;
    }).length,
  }));
  await ev(() => { const n = document.createElement('div'); n.id = 'plant'; n.style.width = '3000px'; n.style.height = '2px'; document.querySelector('main').appendChild(n); const l = document.getElementById('list'); l.style.setProperty('--kd', '.5'); l.style.setProperty('--kp', '.5'); });
  const pf = await fit();
  caught(pf.sw > pf.cw + 1 && pf.off > 0, 'width check');
  await open();
  for (const w of [1600, 1100, 761, 760, 390]) {
    await page.setViewportSize({ width: w, height: 900 });
    for (const size of ['both', 'desk', 'phone']) {
      for (const sel of [{ set: 'all', po: 'EN' }, { set: 'block-big', po: 'all' }]) {
        await pick({ ...sel, size });
        await page.waitForTimeout(80);
        const r = await fit();
        ok(r.sw <= r.cw + 1, `${w}px ${size} ${sel.set}/${sel.po}: page ${r.sw} wide in ${r.cw}`);
        ok(r.off === 0, `${w}px ${size} ${sel.set}/${sel.po}: ${r.off} posters not filling their boxes`);
      }
    }
  }
  // A phone: selects in place of the chips, the poster on its own row.
  await page.setViewportSize({ width: 390, height: 844 });
  const narrow = await ev(() => {
    const vis = (id) => getComputedStyle(document.getElementById(id)).display !== 'none';
    const top = (id) => Math.round(document.getElementById(id).getBoundingClientRect().top);
    return { chips: vis('set-chips') || vis('size-chips') || vis('tr-chips'), sels: vis('set-sel') && vis('size-sel') && vis('tr-sel'), row: top('set-sel') === top('size-sel'), below: top('po-sel') > top('set-sel') && top('tr-sel') === top('po-sel') };
  });
  ok(!narrow.chips && narrow.sels && narrow.row && narrow.below, `phone controls ${JSON.stringify(narrow)}`);
  await pick({ set: 'justified', po: 'Juv' });
  ok((await shown()).join() === 'justified--Juv', 'phone controls choose');
  await page.setViewportSize({ width: 1600, height: 1000 });

  // ── Both themes: B's red, at B's opacity ─────────────────────────────────
  // ── Photo treatments: what lies between the photograph and the title ────
  const TREAT = {
    now: { wash: ['rgba(0, 0, 0, 0)', '0'], filter: 'none', title: 'rgb(226, 56, 46)|0.82' },
    pale: { wash: ['rgb(244, 244, 241)', '0.6'], filter: 'none', title: 'rgb(180, 36, 25)|0.92' },
    gray: { wash: ['rgb(244, 244, 241)', '0.6'], filter: 'grayscale(1)', title: 'rgb(180, 36, 25)|0.92' },
    dark: { wash: ['rgb(18, 18, 17)', '0.7'], filter: 'none', title: 'rgb(255, 90, 77)|0.92' },
  };
  const looks = () => ev(() => [...document.querySelectorAll('.it:not([hidden]) .po')].map((po) => {
    const a = getComputedStyle(po, '::after');
    const t = getComputedStyle(po.querySelector('.po-t'));
    return { wash: [a.backgroundColor, a.opacity], filter: getComputedStyle(po.querySelector('img')).filter, title: `${t.color}|${t.opacity}`, onTop: +t.zIndex > 0 };
  }));
  const treatFaults = (ls, want, tag) => ls.flatMap((l, i) => {
    const f = [];
    if (want.wash[1] !== '0' && (l.wash[0] !== want.wash[0] || l.wash[1] !== want.wash[1])) f.push(`${tag} ${i}: wash ${l.wash}`);
    if (want.wash[1] === '0' && l.wash[1] !== '0') f.push(`${tag} ${i}: a wash ${l.wash}`);
    if (l.filter !== want.filter) f.push(`${tag} ${i}: photograph ${l.filter}`);
    if (l.title !== want.title) f.push(`${tag} ${i}: title ${l.title}`);
    if (!l.onTop) f.push(`${tag} ${i}: title under the wash`);
    return f;
  });
  await open();
  await pick({ set: 'all', po: 'Phys', size: 'both', tr: 'pale' });
  await ev(() => { document.querySelector('#block--Phys .po-t').style.color = 'rgb(0, 0, 255)'; });
  caught(treatFaults(await looks(), TREAT.pale, 'plant').length > 0, 'treatment check');
  await open();
  for (const tr of Object.keys(TREAT)) {
    await pick({ set: 'all', po: 'Phys', size: 'both', tr });
    const ls = await looks();
    ok(ls.length === 14, `${tr}: ${ls.length} posters`);
    for (const f of treatFaults(ls, TREAT[tr], tr)) ok(false, f);
    checks += ls.length;
    const note = await ev(() => (document.getElementById('note').hidden ? '' : document.getElementById('note').textContent));
    ok(tr === 'now' ? note === '' : note.includes('photograph'), `${tr}: note ${note}`);
  }
  await pick({ tr: 'now' });

  // ── Own colour, Strips, Above: the photograph at full strength ──────────
  // Own colour: the title solid, dark red or cream as titles.py chose.
  // Strips: the pale wash behind every line, nowhere else. Above: the title
  // wholly above the photograph, the photograph whole, the box holding both.
  const INK = { dark: 'rgb(139, 26, 16)', cream: 'rgb(244, 239, 230)' };
  const STRIP = 'rgba(244, 244, 241, 0.6)';
  const plain = () => ev(() => [...document.querySelectorAll('.it:not([hidden]) .po')].map((po) => {
    const a = getComputedStyle(po, '::after');
    const t = po.querySelector('.po-t');
    const ts = getComputedStyle(t);
    const r = (el) => el.getBoundingClientRect();
    const fit = r(po.parentElement);
    const lines = [...t.querySelectorAll(':scope > span')].map((l) => getComputedStyle(l).backgroundColor);
    return {
      wash: a.opacity, filter: getComputedStyle(po.querySelector('img')).filter, ink: po.dataset.ink,
      title: `${ts.color}|${ts.opacity}`, tbg: ts.backgroundColor, lines,
      tBottom: r(t).bottom, iTop: r(po.querySelector('img')).top, iBottom: r(po.querySelector('img')).bottom,
      tTop: r(t).top, fTop: fit.top, fBottom: fit.bottom,
    };
  }));
  const plainFaults = (ls, tr, tag) => ls.flatMap((l, i) => {
    const f = [];
    if (l.wash !== '0') f.push(`${tag} ${i}: a wash`);
    if (l.filter !== 'none') f.push(`${tag} ${i}: photograph ${l.filter}`);
    if (tr === 'own' && l.title !== `${INK[l.ink]}|1`) f.push(`${tag} ${i}: ${l.ink} title ${l.title}`);
    if (tr === 'strip') {
      if (l.title !== 'rgb(180, 36, 25)|0.92') f.push(`${tag} ${i}: title ${l.title}`);
      if (!l.lines.length || l.lines.some((b) => b !== STRIP)) f.push(`${tag} ${i}: strips ${l.lines}`);
      if (l.tbg !== 'rgba(0, 0, 0, 0)') f.push(`${tag} ${i}: a strip behind the whole title`);
    } else if (l.lines.some((b) => b !== 'rgba(0, 0, 0, 0)')) f.push(`${tag} ${i}: strips without Strips`);
    if (tr === 'above') {
      if (l.tBottom > l.iTop + 0.5) f.push(`${tag} ${i}: title over the photograph`);
      if (l.tTop < l.fTop - 0.5 || l.iBottom > l.fBottom + 0.5) f.push(`${tag} ${i}: poster outside its box`);
    } else if (l.iTop > l.fTop + 0.5) f.push(`${tag} ${i}: photograph below the title`);
    return f;
  });
  const PLANT = {
    own: () => { document.querySelector('#block--Phys .fig.desk .po').dataset.ink = 'dark'; document.querySelector('#block--Phys .fig.desk .po-t').style.color = 'rgb(244, 239, 230)'; },
    strip: () => { document.querySelector('#block--Phys .po-t > span').style.background = 'none'; },
    above: () => { document.querySelector('#block--Phys .fig.desk .po-t').style.position = 'absolute'; },
  };
  for (const tr of Object.keys(PLANT)) {
    await open();
    await pick({ set: 'all', po: 'Phys', size: 'both', tr });
    await ev(PLANT[tr]);
    caught(plainFaults(await plain(), tr, 'plant').length > 0, `${tr} check`);
  }
  await open();
  const inks = new Set();
  for (const po of ['Phys', 'home', 'Cat']) {
    for (const tr of Object.keys(PLANT)) {
      await pick({ set: 'all', po, size: 'both', tr });
      const ls = await plain();
      ok(ls.length === 14, `${tr} ${po}: ${ls.length} posters`);
      for (const f of plainFaults(ls, tr, `${tr} ${po}`)) ok(false, f);
      checks += ls.length;
      if (tr === 'own') ls.forEach((l) => inks.add(l.ink));
    }
  }
  ok(inks.has('dark') && inks.has('cream'), `own colour: inks ${[...inks]}`);
  await pick({ tr: 'now' });

  // ── Votes: thumbs on every poster and photograph, kept in the store ──────
  const stored = () => ev(() => Object.fromEntries(window.__store));
  const state = (key) => ev((k) => {
    const el = document.querySelector(`.vote[data-key="${k}"]`);
    return el ? { pressed: [...el.children].filter((b) => b.getAttribute('aria-pressed') === 'true').map((b) => b.dataset.v).join(), on: [...el.children].every((b) => !b.disabled), shown: getComputedStyle(el).display !== 'none' } : null;
  }, key);
  const tallyDom = () => ev(() => Object.fromEntries([...document.querySelectorAll('#tally-items .tl-i')].map((x) => [x.dataset.k, [...x.querySelectorAll('b.n')].map((b) => +b.textContent)])));
  const tallyFaults = async () => {
    const want = Object.fromEntries([...OPTS, 'photo'].map((k) => [k, [0, 0]]));
    for (const [k, d] of Object.entries(await stored())) want[k.startsWith('p:') ? 'photo' : /^t:(.+?)--/.exec(k)[1]][d.vote === 'up' ? 0 : 1]++;
    const have = await tallyDom();
    return Object.keys(want).filter((k) => String(want[k]) !== String(have[k])).map((k) => `tally ${k}: ${have[k]}, store ${want[k]}`);
  };
  const click = async (sel) => { await page.click(sel); await page.waitForTimeout(60); };
  await open();
  await pick({ set: 'all', po: 'home', size: 'both' });
  const vs = await ev(() => ({ on: document.documentElement.classList.contains('votes-on'), tally: !document.getElementById('tally').hidden, n: document.querySelectorAll('.vote').length, labels: [...document.querySelectorAll('.vote .vb')].map((b) => b.getAttribute('aria-label')) }));
  ok(vs.on && vs.tally, 'votes not shown with a store');
  ok(vs.n === 294 * 2 + 42, `${vs.n} vote controls, not ${294 * 2 + 42}`);
  ok(vs.labels.includes('Thumbs up: Bigger block, Nicomachean Ethics, desktop') && vs.labels.includes('Thumbs down: the photograph for Topics'), 'vote labels name the setting, work and size');
  // Planted: a write the store loses; a tally that disagrees with the store.
  await ev(() => { window.__drop = 't:now--home:desk'; });
  await click('#now--home .fig.desk .vb.up');
  caught((await stored())['t:now--home:desk']?.vote !== 'up' || (await state('t:now--home:desk')).pressed !== 'up', 'vote store check');
  await ev(() => { window.__drop = null; document.querySelector('#tally-items .tl-i[data-k="now"] b.n').textContent = '7'; });
  caught((await tallyFaults()).length > 0, 'tally check');
  await open();
  // Up; up again clears it; down then up leaves up; a photograph; a vote
  // made in another tab or on another device.
  await click('#now--home .fig.desk .vb.up');
  let vst = await stored();
  const nh = vst['t:now--home:desk'] || {};
  ok(nh.vote === 'up' && nh.kind === 'title' && nh.set === 'now' && nh.po === 'home' && nh.size === 'desk' && typeof nh.at === 'string', `stored ${JSON.stringify(nh)}`);
  ok((await state('t:now--home:desk')).pressed === 'up', 'up shown');
  await click('#now--home .fig.desk .vb.up');
  ok(!('t:now--home:desk' in (await stored())) && (await state('t:now--home:desk')).pressed === '', 'a second click clears the vote');
  await click('#block-big--home .fig.phone .vb.down');
  await click('#block-big--home .fig.phone .vb.up');
  ok((await stored())['t:block-big--home:phone']?.vote === 'up' && (await state('t:block-big--home:phone')).pressed === 'up', 'down then up leaves up');
  await click('#po-home .pg-h .vb.down');
  vst = await stored();
  ok(vst['p:home']?.vote === 'down' && vst['p:home'].kind === 'photo' && vst['p:home'].po === 'home' && (await state('p:home')).pressed === 'down', `photograph ${JSON.stringify(vst['p:home'])}`);
  await ev(() => window.__push('t:justified--Cat:desk', { kind: 'title', set: 'justified', po: 'Cat', size: 'desk', vote: 'up', at: '2026-10-30T00:00:00Z' }));
  await page.waitForTimeout(60);
  ok((await state('t:justified--Cat:desk')).pressed === 'up', 'a vote from elsewhere shows');
  const tf = await tallyFaults();
  ok(!tf.length, tf.join('; '));
  const td = await tallyDom();
  ok(td.now.join() === '0,0' && td['block-big'].join() === '1,0' && td.justified.join() === '1,0' && td.photo.join() === '0,1', `tally ${JSON.stringify(td)}`);
  // Someone else on the page sees the votes and cannot change them.
  const other = await browser.newContext({ viewport: { width: 1200, height: 900 } });
  await other.addInitScript(() => { window.__owner = false; });
  await other.addInitScript(STUB);
  const op = await other.newPage();
  await op.goto(`${BASE}titles-test.html`, { waitUntil: 'networkidle' });
  await op.waitForFunction(() => document.documentElement.dataset.titles === 'set', null, { timeout: 60000 });
  await op.evaluate(() => window.__push('p:home', { kind: 'photo', po: 'home', vote: 'up', at: 'x' }));
  await op.waitForTimeout(80);
  const ro = () => op.evaluate(() => {
    const el = document.querySelector('.vote[data-key="p:home"]');
    return { shown: getComputedStyle(el).display !== 'none', off: [...el.children].every((b) => b.disabled), pressed: (el.querySelector('[aria-pressed="true"]') || { dataset: {} }).dataset.v || '' };
  });
  await op.evaluate(() => { for (const b of document.querySelectorAll('.vote[data-key="p:home"] .vb')) b.disabled = false; });
  caught(!(await ro()).off, 'read-only check');
  await op.evaluate(() => { for (const b of document.querySelectorAll('.vote[data-key="p:home"] .vb')) b.disabled = true; });
  const r1 = await ro();
  ok(r1.shown && r1.off && r1.pressed === 'up', `someone else: ${JSON.stringify(r1)}`);
  await op.evaluate(() => { const b = document.querySelector('.vote[data-key="p:home"] .vb.down'); b.disabled = false; b.click(); b.disabled = true; });
  await op.waitForTimeout(80);
  ok((await op.evaluate(() => window.__store.get('p:home').vote)) === 'up', 'someone else cannot change a vote');
  await other.close();
  // Opened without the store (signed out, or outside claude.ai): no thumbs.
  const bare = await browser.newContext({ viewport: { width: 1200, height: 900 } });
  const bp = await bare.newPage();
  const berrs = [];
  bp.on('pageerror', (e) => berrs.push(e.message));
  await bp.goto(`${BASE}titles-test.html`, { waitUntil: 'networkidle' });
  await bp.waitForFunction(() => document.documentElement.dataset.titles === 'set', null, { timeout: 60000 });
  const nb = () => bp.evaluate(() => ({ shown: [...document.querySelectorAll('.vote')].filter((v) => getComputedStyle(v).display !== 'none').length, tally: !document.getElementById('tally').hidden }));
  await bp.evaluate(() => document.documentElement.classList.add('votes-on'));
  caught((await nb()).shown > 0, 'no-store check');
  await bp.evaluate(() => document.documentElement.classList.remove('votes-on'));
  const b1 = await nb();
  ok(b1.shown === 0 && !b1.tally && !berrs.length, `without a store: ${JSON.stringify(b1)} ${berrs.join('; ')}`);
  await bare.close();

  const LIGHT = ['rgb(226, 56, 46)', '0.82', 'rgb(244, 244, 241)'];
  const DARK = ['rgb(255, 90, 77)', '0.86', 'rgb(18, 18, 17)'];
  const colours = () => ev(() => ({ bg: getComputedStyle(document.body).backgroundColor, t: [...document.querySelectorAll('.it:not([hidden]) .po-t')].map((t) => `${getComputedStyle(t).color}|${getComputedStyle(t).opacity}`) }));
  const themeFaults = (c, want, tag) => [...(c.bg === want[2] ? [] : [`${tag}: background ${c.bg}`]), ...c.t.filter((x) => x !== `${want[0]}|${want[1]}`).map((x) => `${tag}: title ${x}`)];
  const themeOk = (c, want, tag) => {
    ok(c.bg === want[2], `${tag}: background ${c.bg}`);
    ok(c.t.length === 14, `${tag}: ${c.t.length} titles`);
    for (const x of c.t) ok(x === `${want[0]}|${want[1]}`, `${tag}: title ${x}`);
  };
  await pick({ set: 'all', po: 'Meta', size: 'both' });
  await ev(() => { document.querySelector('#block--Meta .po-t').style.color = 'rgb(0, 0, 255)'; });
  caught(themeFaults(await colours(), LIGHT, 'plant').length > 0, 'theme check');
  await open();
  for (const [scheme, attr, want] of [['light', null, LIGHT], ['dark', null, DARK], ['dark', 'light', LIGHT], ['light', 'dark', DARK]]) {
    await page.emulateMedia({ colorScheme: scheme });
    await ev((a) => { if (a) document.documentElement.dataset.theme = a; else delete document.documentElement.dataset.theme; }, attr);
    themeOk(await colours(), want, `${scheme}${attr ? ` / ${attr} chosen` : ''}`);
  }

  // ── A late font: the titles are set again when it arrives ───────────────
  // The page waits 4 seconds for Sofia Sans, sets the titles with a
  // stand-in, then sets them all again once the font is in. Held back here
  // for 7 seconds, the font arrives after the stand-in pass (the planted
  // case: titles measured in the wrong face) and before the final one.
  const homeSets = (pg) => pg.evaluate(() => Object.fromEntries([...document.querySelectorAll('.it[data-po="home"]')].flatMap((it) => ['desk', 'phone'].map((c) => [`${it.id} ${c}`, it.querySelector(`.po.${c} .po-t`).innerHTML]))));
  await open();
  const want = await homeSets(page);
  const slow = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
  await slow.route(/fonts\.gstatic\.com/, async (route) => { await new Promise((r) => setTimeout(r, 7000)); await route.continue(); });
  const sp = await slow.newPage();
  await sp.goto(`${BASE}titles-test.html`, { waitUntil: 'domcontentloaded' });
  await sp.waitForTimeout(5500);
  const stand = await homeSets(sp);
  caught(Object.keys(want).some((k) => !k.startsWith('now--') && stand[k] !== want[k]), 'late-font check');
  await sp.waitForFunction(() => document.documentElement.dataset.titles === 'set', null, { timeout: 60000 });
  const late = await homeSets(sp);
  for (const k of Object.keys(want)) ok(late[k] === want[k], `late font: ${k} not set again`);
  await slow.close();

  ok(!errs.length, `console: ${errs.join('; ')}`);
  await browser.close();
  if (fails.length) {
    console.log(`${fails.length} of ${checks} checks failed:`);
    for (const f of fails.slice(0, 60)) console.log(' ', f);
    process.exit(1);
  }
  console.log(`all ${checks} checks passed`);
})();
