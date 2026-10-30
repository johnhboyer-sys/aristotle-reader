// Functional check of titles.html, the page of title settings for B's
// posters: every setting on every poster, desktop and phone; each title
// inside its poster and set as round four's mockup sets it; the controls;
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

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
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
  const pick = async ({ set, po, size }) => {
    const wide = await ev(() => getComputedStyle(document.getElementById('set-chips')).display !== 'none');
    if (po) await page.selectOption('#po-sel', po);
    if (set) await (wide ? page.click(`[data-set-b="${set}"]`) : page.selectOption('#set-sel', set));
    if (size) await (wide ? page.click(`[data-size-b="${size}"]`) : page.selectOption('#size-sel', size));
    await page.waitForTimeout(80);
  };
  await open();
  const OPTS = await ev(() => window.TL.OPTIONS);

  // ── Every setting on every poster, each with both photographs ────────────
  const structure = () => ev(() => [...document.querySelectorAll('.it')].map((x) => ({
    id: x.id, set: x.dataset.set, po: x.dataset.po,
    name: x.querySelector('.it-w').textContent,
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
      const title = it.dataset.po === 'home' ? home : it.querySelector('.it-w').textContent;
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
    const first = x.lines[0].box.t;
    const last = x.lines[x.lines.length - 1].box.b;
    if (Math.abs(first - B.top) > 1) f.push(`${tag}: title starts at ${first.toFixed(1)}, not ${B.top}`);
    // A spread needs two lines; a title on one line stays at the top.
    if (spreads(x.set) && x.lines.length > 1 && Math.abs(last - (B.h - B.bottom)) > 1) f.push(`${tag}: spread ends at ${last.toFixed(1)}, not ${B.h - B.bottom}`);
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
  // a line with the wrong words, a poster scaled short of its box.
  await ev(() => {
    const s = document.querySelector('#block-big--EN .po.desk .po-t span');
    s.style.letterSpacing = `${parseFloat(s.style.letterSpacing) + 6}px`;
    document.querySelector('#stacked--Pol .po.phone .po-t span').style.fontWeight = '400';
    document.querySelector('#justified--home .po.desk .po-t span').textContent = 'THX';
    document.querySelector('#now--Cat .po.desk').style.transform = 'scale(.5)';
  });
  const pl = (await titles()).map((x) => ({ id: `${x.id} ${x.kind}`, f: titleFaults(x).join('; ') }));
  const hit = (id, re) => re.test((pl.find((x) => x.id === id) || {}).f || '');
  caught(hit('block-big--EN desktop', /line 1 runs .*outside/) && hit('block-big--EN desktop', /block line 1 ends/), 'title edge check');
  caught(hit('stacked--Pol phone', /in .* 400/), 'title font check');
  caught(hit('justified--home desktop', /lines .*not|spell|reads/), 'title words check');
  caught(hit('now--Cat desktop', /does not fill/), 'poster scale check');
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
  await open();
  const homeIds = OPTS.map((o) => `${o}--home`);
  ok((await shown()).join() === homeIds.join(), `first view ${await shown()}`);
  const pressed = () => ev(() => ({
    set: [...document.querySelectorAll('[data-set-b][aria-pressed=true]')].map((b) => b.dataset.setB),
    size: [...document.querySelectorAll('[data-size-b][aria-pressed=true]')].map((b) => b.dataset.sizeB),
    po: document.getElementById('po-sel').value,
    note: document.getElementById('note').hidden ? '' : document.getElementById('note').textContent,
    one: document.getElementById('list').classList.contains('one-set'),
  }));
  let pr = await pressed();
  ok(pr.set.join() === 'all' && pr.size.join() === 'both' && pr.po === 'home' && !pr.note && !pr.one, `first view controls ${JSON.stringify(pr)}`);
  // Planted: an entry shown that the choices exclude.
  await ev(() => { document.getElementById('now--Cat').hidden = false; });
  caught((await shown()).join() !== homeIds.join(), 'shown-entries check');
  await open();
  await pick({ set: 'block', po: 'all' });
  let sh = await shown();
  ok(sh.length === 42 && sh.every((x) => x.startsWith('block--')), `block on every poster: ${sh.length}`);
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
  ok(await ev(() => getComputedStyle(document.getElementById('list')).gridTemplateColumns.split(' ').length > 1), 'phone posters in columns on a wide screen');
  await pick({ size: 'both' });
  ok((await figs()).every((x) => /:true$/.test(x)), 'desktop and phone');
  // The choices survive a reload (this viewer's browser only).
  await pick({ set: 'stacked', po: 'Pol', size: 'phone' });
  await open();
  pr = await pressed();
  ok(pr.set.join() === 'stacked' && pr.po === 'Pol' && pr.size.join() === 'phone' && (await shown()).join() === 'stacked--Pol', `remembered ${JSON.stringify(pr)}`);

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
    return { chips: vis('set-chips') || vis('size-chips'), sels: vis('set-sel') && vis('size-sel'), row: top('set-sel') === top('size-sel'), below: top('po-sel') > top('set-sel') };
  });
  ok(!narrow.chips && narrow.sels && narrow.row && narrow.below, `phone controls ${JSON.stringify(narrow)}`);
  await pick({ set: 'justified', po: 'Juv' });
  ok((await shown()).join() === 'justified--Juv', 'phone controls choose');
  await page.setViewportSize({ width: 1600, height: 1000 });

  // ── Both themes: B's red, at B's opacity ─────────────────────────────────
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

  ok(!errs.length, `console: ${errs.join('; ')}`);
  await browser.close();
  if (fails.length) {
    console.log(`${fails.length} of ${checks} checks failed:`);
    for (const f of fails.slice(0, 60)) console.log(' ', f);
    process.exit(1);
  }
  console.log(`all ${checks} checks passed`);
})();
