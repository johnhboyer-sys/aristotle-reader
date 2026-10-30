// Functional check of round four: every direction, page, theme and width;
// every work page; the reader's controls in both panes. Needs Playwright and
// a local server serving this folder (python3 -m http.server 8765; or set BASE).
//   node docs/mockups/2026-10-30-round-four/verify.cjs
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const BASE = process.env.BASE || 'http://localhost:8765/test.html';
const fails = [];
let checks = 0;
const ok = (cond, msg) => { checks++; if (!cond) fails.push(msg); };

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
  const errs = [];
  page.on('pageerror', (e) => errs.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
  page.on('requestfailed', (r) => errs.push(`request failed: ${r.url()}`));
  await page.goto(`${BASE}#overview`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(600);

  const go = async (hash) => { await page.evaluate((h) => { location.hash = h; }, hash); await page.waitForTimeout(250); };
  const state = (fn, arg) => page.evaluate(fn, arg);
  // Each shown pane: no sideways overflow inside the design.
  const overflow = () => state(() => window.U.shown().map((P) => {
    const v = P.view;
    const wide = [...v.querySelectorAll('*')].filter((n) => {
      if (n.closest('.c-fig, .c-tree, svg, .t8')) return false;
      const r = n.getBoundingClientRect();
      const f = P.frame.getBoundingClientRect();
      return r.width > 0 && (r.right - f.right) / P.scale > 2;
    }).slice(0, 3).map((n) => n.className || n.tagName);
    return { pane: P.kind, sw: v.scrollWidth, cw: v.clientWidth, wide };
  }));
  // Images referenced by the panes exist on disk.
  const imgs = () => state(() => window.U.shown().flatMap((P) => [...P.view.querySelectorAll('img')].map((i) => i.getAttribute('src'))));

  const DIRS = ['a', 'b', 'd'];
  const PAGES = ['home', 'work', 'reader', 'search', 'lexicon'];
  // Positive controls: the checks must catch a planted fault.
  await go('a-home');
  await state(() => { const n = document.createElement('div'); n.id = 'plant'; n.style.width = '3000px'; n.style.height = '4px'; window.U.PANES[1].view.appendChild(n); });
  const planted = await overflow();
  if (!planted.some((x) => x.pane === 'phone' && (x.sw > x.cw + 1 || x.wide.length))) { console.log('FAIL: overflow check missed a planted 3000px element'); process.exit(1); }
  await state(() => document.getElementById('plant').remove());
  if (fs.existsSync(path.join(__dirname, 'img/w640/NOPE.jpg'))) { console.log('FAIL: image check control'); process.exit(1); }
  for (const theme of ['light', 'dark']) {
    await page.click(`#bar [data-theme-pick=${theme}]`);
    for (const d of DIRS) {
      for (const p of PAGES) {
        await go(`${d}-${p}`);
        const o = await overflow();
        for (const x of o) ok(x.sw <= x.cw + 1 && !x.wide.length, `${d}-${p} ${theme} ${x.pane}: overflow ${x.sw}>${x.cw} ${x.wide.join(',')}`);
        for (const s of await imgs()) ok(fs.existsSync(path.join(__dirname, s)), `${d}-${p}: missing image ${s}`);
        const empty = await state(() => window.U.shown().filter((P) => P.view.textContent.trim().length < 200).map((P) => P.kind));
        ok(!empty.length, `${d}-${p} ${theme}: empty pane ${empty}`);
        // John's notes: no pictures in the reader, search or the lexicon.
        if (['reader', 'search', 'lexicon'].includes(p)) {
          const pics = await state(() => window.U.shown().reduce((n, P) => n + P.view.querySelectorAll('img').length, 0));
          ok(pics === 0, `${d}-${p}: ${pics} pictures on a page that should have none`);
        }
        if (p === 'home') {
          const pics = await state(() => window.U.shown().map((P) => P.view.querySelectorAll('img').length));
          ok(d !== 'b' || pics.every((n) => n === 1), `${d}-home: B should show one photograph, shows ${pics}`);
        }
      }
    }
  }
  await page.click('#bar [data-theme-pick=light]');

  // Every work page in every direction.
  const ids = await state(() => window.U.W.map((w) => w.id));
  for (const d of DIRS) {
    for (const id of ids) {
      await go(`${d}-work:${id}`);
      const t = await state((wid) => window.U.shown().every((P) => P.view.textContent.includes(window.U.work(wid).title)), id);
      ok(t, `${d}-work:${id}: title missing`);
      const o = await overflow();
      for (const x of o) ok(x.sw <= x.cw + 1 && !x.wide.length, `${d}-work:${id} ${x.pane}: overflow ${x.wide.join(',')}`);
      for (const s of await imgs()) ok(fs.existsSync(path.join(__dirname, s)), `${d}-work:${id}: missing image ${s}`);
    }
  }

  // Books on a long work's page start closed; Open all and Close all work.
  for (const d of DIRS) {
    await go(`${d}-work:Meta`);
    const closed = await state(() => window.U.shown().map((P) => [...P.view.querySelectorAll('details[data-book]')].filter((x) => x.open).length));
    const count = await state(() => window.U.shown().map((P) => P.view.querySelectorAll('details[data-book]').length));
    ok(count.every((n) => n === 14) && closed.every((n) => n === 0), `${d}-work:Meta: books ${count} (open ${closed})`);
    await page.locator('.pane[data-pane=desktop] [data-act="books:open"]').click();
    await page.waitForTimeout(100);
    ok(await page.locator('.pane[data-pane=desktop] details[data-book][open]').count() === 14, `${d}: Open all books did not open them`);
    await page.locator('.pane[data-pane=desktop] [data-act="books:close"]').click();
    await page.waitForTimeout(100);
    ok(await page.locator('.pane[data-pane=desktop] details[data-book][open]').count() === 0, `${d}: Close all did not close them`);
    await page.locator('.pane[data-pane=phone] details[data-book] summary').nth(1).click();
    await page.waitForTimeout(100);
    ok(await page.locator('.pane[data-pane=phone] details[data-book][open]').count() === 1, `${d}: a book did not open on the phone`);
    ok(await page.locator('.pane[data-pane=phone] details[data-book][open] [data-go]').count() > 0, `${d}: an open book shows no chapters`);
  }
  // B: the home page's photograph changes.
  await go('b-home');
  const before = await page.locator('.pane[data-pane=desktop] .b-po img').getAttribute('src');
  await page.locator('.pane[data-pane=desktop] [data-act=hero]').click();
  await page.waitForTimeout(150);
  ok(before !== await page.locator('.pane[data-pane=desktop] .b-po img').getAttribute('src'), 'b-home: Next photograph did not change it');
  // B: every poster runs across the page at the home page's size, with the
  // wide cut on a desktop and the tall cut on a phone; the title fits inside
  // it, and a work's details come below it.
  const posters = () => state(() => Promise.all(window.U.shown().map(async (P) => {
    const po = P.view.querySelector('.b-po');
    const img = po.querySelector('img');
    const t = po.querySelector('.b-po-t');
    if (!img.complete || !img.naturalWidth) await new Promise((r) => { img.onload = r; img.onerror = r; setTimeout(r, 4000); });
    const s = P.scale;
    const pr = po.getBoundingClientRect(); const ir = img.getBoundingClientRect(); const tr = t.getBoundingClientRect();
    return {
      kind: P.kind,
      w: pr.width / s, h: pr.height / s, vw: P.view.clientWidth,
      fill: Math.abs(ir.width - pr.width) / s <= 1 && Math.abs(ir.height - pr.height) / s <= 1,
      cut: (img.getAttribute('src').match(/^img\/(\w+)\//) || [])[1],
      nat: img.naturalWidth / img.naturalHeight,
      wide: t.scrollWidth > t.clientWidth + 2,
      room: (pr.bottom - tr.bottom) / s,
      side: !!P.view.querySelector('.b-po-info'),
      below: !!P.view.querySelector('.b-po ~ .b-po-below'),
    };
  })));
  const WANT = { desktop: { h: 600, cut: 'desk', ar: 2.4 }, phone: { h: 488, cut: 'phone', ar: 0.8 } };
  const posterFaults = (x, work) => {
    const f = [];
    const want = WANT[x.kind];
    if (Math.abs(x.w - x.vw) > 1 || Math.abs(x.h - want.h) > 1) f.push(`poster ${x.w.toFixed(0)}x${x.h.toFixed(0)}, page ${x.vw}`);
    if (!x.fill) f.push('photograph does not fill the poster');
    if (x.cut !== want.cut || !(Math.abs(x.nat - want.ar) <= 0.03)) f.push(`cut ${x.cut} at ${x.nat.toFixed(2)} to 1`);
    if (x.wide || x.room < 8) f.push(`title does not fit (wide ${x.wide}, room below ${x.room.toFixed(0)})`);
    if (x.side) f.push('details beside the photograph');
    if (work && !x.below) f.push('no details below the photograph');
    return f;
  };
  // Positive controls: a desktop cut on the phone and an overlong title are caught.
  await go('b-work:EN');
  await state(() => {
    const ph = window.U.PANES.find((P) => P.kind === 'phone').view.querySelector('.b-po img');
    ph.setAttribute('src', ph.getAttribute('src').replace('img/phone/', 'img/desk/'));
    window.U.PANES.find((P) => P.kind === 'desktop').view.querySelector('.b-po-t').textContent = 'W'.repeat(40);
  });
  const planted2 = await posters();
  const caught = planted2.map((x) => posterFaults(x, true).join('; '));
  if (!/cut desk/.test(caught[planted2.findIndex((x) => x.kind === 'phone')]) || !/title does not fit/.test(caught[planted2.findIndex((x) => x.kind === 'desktop')])) { console.log('FAIL: poster check missed a planted fault', caught); process.exit(1); }
  await state(() => window.U.render());
  for (const id of ids) {
    await go(`b-work:${id}`);
    for (const x of await posters()) { const f = posterFaults(x, true); ok(!f.length, `b-work:${id} ${x.kind}: ${f.join('; ')}`); }
  }
  for (let i = 0; i < 8; i++) {
    await go('b-home');
    await state((n) => { window.U.S.hero = n; window.U.render(); }, i);
    for (const x of await posters()) { const f = posterFaults(x, false); ok(!f.length, `b-home photograph ${i} ${x.kind}: ${f.join('; ')}`); }
  }

  // Round three's notes, in every direction.
  // 1. A work page lists its translations once: one link opens each.
  const transLinks = () => state(() => window.U.shown().map((P) => {
    const w = window.U.work(window.U.S.workId);
    return {
      kind: P.kind,
      counts: w.translations.map((t) => P.view.querySelectorAll(`[data-go="reader:${t.id}"]`).length),
      heads: [...P.view.querySelectorAll('h2')].filter((h) => /^Translations?$/i.test(h.textContent.trim())).length,
    };
  }));
  await go('a-work:Pol');
  await state(() => { const a = document.createElement('a'); a.dataset.go = `reader:${window.U.work(window.U.S.workId).translations[0].id}`; window.U.PANES[0].view.appendChild(a); });
  if (!(await transLinks()).some((x) => x.counts.includes(2))) { console.log('FAIL: translations check missed a planted duplicate'); process.exit(1); }
  await state(() => window.U.render());
  for (const d of DIRS) {
    for (const id of ids) {
      await go(`${d}-work:${id}`);
      for (const x of await transLinks()) ok(x.counts.every((n) => n === 1) && !x.heads, `${d}-work:${id} ${x.kind}: translations linked ${x.counts.join(',')} times, ${x.heads} Translations headings`);
    }
  }
  // 2. The site menu marks the current page in the accent colour; italic only in D.
  const ACC = { a: '--acc', b: '--red-ink', d: '--red' };
  const ON = { home: 'Works', work: 'Works', search: 'Search', lexicon: 'Lexicon' };
  const navOn = (acc) => state((v) => window.U.shown().map((P) => {
    const on = [...P.view.querySelectorAll('nav[aria-label="Site"] a.on')];
    const probe = document.createElement('span');
    probe.style.color = `var(${v})`;
    P.view.appendChild(probe);
    const want = getComputedStyle(probe).color;
    probe.remove();
    return { kind: P.kind, n: on.length, text: on[0] ? on[0].textContent.trim() : '', color: on[0] ? getComputedStyle(on[0]).color === want : false, italic: on[0] ? getComputedStyle(on[0]).fontStyle === 'italic' : false };
  }), acc);
  await go('b-search');
  await state(() => window.U.PANES.forEach((P) => P.view.querySelectorAll('nav a.on').forEach((a) => a.classList.remove('on'))));
  if (!(await navOn(ACC.b)).some((x) => x.n === 0)) { console.log('FAIL: menu check missed a planted fault'); process.exit(1); }
  await state(() => window.U.render());
  for (const theme of ['light', 'dark']) {
    await page.click(`#bar [data-theme-pick=${theme}]`);
    for (const d of DIRS) {
      for (const pg of Object.keys(ON)) {
        await go(`${d}-${pg}`);
        for (const x of await navOn(ACC[d])) ok(x.n === 1 && x.text === ON[pg] && x.color && x.italic === (d === 'd'), `${d}-${pg} ${theme} ${x.kind}: menu marks ${x.n} (${x.text}), accent ${x.color}, italic ${x.italic}`);
      }
    }
  }
  await page.click('#bar [data-theme-pick=light]');
  // 3. The phone reader sets Greek and English side by side; compare stacks
  //    the second translation under the first; English only puts two side by side.
  const phoneRows = () => state(() => {
    const P = window.U.PANES.find((x) => x.kind === 'phone');
    const s = P.scale;
    const vr = P.view.getBoundingClientRect();
    return [...P.view.querySelectorAll('[data-text] .a-row, [data-text] .b-row, [data-text] .d-row')].slice(0, 14).map((r) => {
      const cols = [...r.children];
      const rc = cols.map((c) => c.getBoundingClientRect());
      const nums = [...r.querySelectorAll('[class$="-ln"], .bk')].filter((n) => n.textContent.trim()).map((n) => n.getBoundingClientRect());
      return {
        n: cols.length,
        greek: cols[0].getAttribute('lang') === 'grc',
        side: rc[1].left >= rc[0].right - 1 && Math.abs(rc[1].top - rc[0].top) < 2,
        w: Math.min(...rc.slice(0, 2).map((x) => x.width / s)),
        stack: cols.length < 3 || (rc[2].top >= rc[1].bottom - 1 && Math.abs(rc[2].left - rc[1].left) < 2),
        inside: nums.every((x) => x.left >= vr.left - 1 && x.right <= vr.right + 1),
      };
    });
  });
  const setView = (v, cmp) => state(([v2, c2]) => { Object.assign(window.U.S, { word: null, view: v2, trans: 'ostwald', cmp: c2 }); window.U.render(); }, [v, cmp]);
  await go('b-reader');
  await setView('both', null);
  await state(() => { const st = document.createElement('style'); st.id = 'plant2'; st.textContent = '.frame [data-text] .b-row { grid-template-columns: minmax(0, 1fr) !important; }'; document.head.appendChild(st); });
  if (!(await phoneRows()).some((x) => !x.side)) { console.log('FAIL: parallel check missed a planted single column'); process.exit(1); }
  await state(() => document.getElementById('plant2').remove());
  for (const d of DIRS) {
    await go(`${d}-reader`);
    for (const [v, cmp, label] of [['both', null, 'Greek and English'], ['both', 'ross', 'compare'], ['english', 'ross', 'two translations']]) {
      await setView(v, cmp);
      const rows = await phoneRows();
      ok(rows.length >= 6, `${d}-reader phone ${label}: only ${rows.length} rows`);
      for (const [i, x] of rows.entries()) ok(x.side && x.w >= 120 && x.stack && x.inside && x.greek === (v === 'both'), `${d}-reader phone ${label} row ${i}: side ${x.side}, width ${x.w.toFixed(0)}, stack ${x.stack}, numbers inside ${x.inside}`);
    }
    await setView('both', null);
  }
  // 4. D: the Aldine page scrolls with the text; on a phone it is a banner cut
  //    from the top of its detail. D's Greek is set in Gentium Book Plus.
  const dPics = () => state(() => window.U.shown().map((P) => {
    const f = P.view.querySelector('.d-hero-f, .d-wk-f');
    const img = f.querySelector('img');
    const ir = img.getBoundingClientRect();
    return { kind: P.kind, sticky: [...P.view.querySelectorAll('figure')].filter((x) => getComputedStyle(x).position === 'sticky').length, src: img.getAttribute('src'), w: ir.width / P.scale, h: ir.height / P.scale, vw: P.view.clientWidth };
  }));
  const dGreek = () => state(() => window.U.shown().map((P) => [...P.view.querySelectorAll('[lang="grc"]')].map((n) => getComputedStyle(n).fontFamily).filter((f) => !/^"?Gentium Book Plus/.test(f)).length));
  // Planted faults: a sticky figure, a whole page on the phone, Greek in EB Garamond.
  await go('d-work');
  await state(() => {
    window.U.PANES[0].view.querySelector('.d-wk-f').style.position = 'sticky';
    const ph = window.U.PANES.find((P) => P.kind === 'phone').view.querySelector('.d-wk-f img');
    ph.setAttribute('src', ph.getAttribute('src').replace('.jpg', '-page.jpg'));
    window.U.PANES[0].view.querySelector('[lang="grc"]').style.fontFamily = '"EB Garamond"';
  });
  const pl = await dPics();
  const plg = await dGreek();
  if (!pl.some((x) => x.sticky) || !pl.some((x) => x.kind === 'phone' && /-page\.jpg$/.test(x.src)) || !plg.some((n) => n > 0)) { console.log('FAIL: D checks missed a planted fault'); process.exit(1); }
  await state(() => window.U.render());
  for (const pg of ['home', 'work', 'work:Pol']) {
    await go(`d-${pg}`);
    const r = await dPics();
    for (const x of r) {
      ok(!x.sticky, `d-${pg} ${x.kind}: ${x.sticky} sticky pictures`);
      if (x.kind === 'phone') ok(!/-page\.jpg$/.test(x.src) && x.h <= 170 && x.w >= x.vw - 40, `d-${pg} phone: not a banner (${x.src}, ${x.w.toFixed(0)} by ${x.h.toFixed(0)})`);
      else ok(/-page\.jpg$/.test(x.src), `d-${pg} desktop: the whole page should show (${x.src})`);
    }
  }
  for (const pg of ['lexicon', 'reader', 'work', 'search']) {
    await go(`d-${pg}`);
    const fam = await dGreek();
    ok(fam.every((n) => n === 0), `d-${pg}: Greek not in Gentium Book Plus (${fam})`);
  }
  ok(await page.evaluate(() => [...document.fonts].some((f) => f.family.replace(/"/g, '') === 'Gentium Book Plus' && f.status === 'loaded')), 'Gentium Book Plus did not load');

  // The reader, in each direction, in both panes.
  for (const d of DIRS) {
    for (const kind of ['desktop', 'phone']) {
      await go(`${d}-reader`);
      await page.evaluate(() => { window.U.S.word = null; window.U.S.view = 'both'; window.U.S.trans = 'ostwald'; window.U.S.cmp = null; window.U.render(); });
      await page.waitForTimeout(200);
      const pane = `.pane[data-pane=${kind}]`;
      const other = kind === 'desktop' ? '.pane[data-pane=phone]' : '.pane[data-pane=desktop]';
      // A word opens in both panes.
      await page.locator(`${pane} .tok`).nth(5).click();
      await page.waitForTimeout(150);
      ok(await page.locator(`${pane} .over [role=dialog]`).count() === 1, `${d} ${kind}: word sidebar did not open`);
      ok(await page.locator(`${other} .over [role=dialog]`).count() === 1, `${d} ${kind}: other pane did not open the word`);
      ok(await page.locator(`${pane} .tok.on`).count() === 1, `${d} ${kind}: word not marked`);
      // The LSJ card opens and closes.
      const lsj = page.locator(`${pane} .over [data-act^="card:"]`).first();
      if (await lsj.count()) { await lsj.click(); await page.waitForTimeout(100); ok(await page.locator(`${pane} .over .t8`).count() >= 1, `${d} ${kind}: LSJ entry did not open`); }
      // Next word.
      const before = await page.locator(`${pane} .over [role=dialog]`).getAttribute('aria-label');
      await page.locator(`${pane} .over [data-act="step:1"]`).click();
      await page.waitForTimeout(100);
      ok(before !== await page.locator(`${pane} .over [role=dialog]`).getAttribute('aria-label'), `${d} ${kind}: next word did not move`);
      await page.locator(`${pane} .over [data-act="close:word"]`).click();
      await page.waitForTimeout(100);
      ok(await page.locator(`.over [role=dialog]`).count() === 0, `${d} ${kind}: word did not close`);
      // Views: through the head on desktop, through Aa on the phone.
      if (kind === 'desktop') {
        await page.locator(`${pane} [data-sticky] [data-act="view:greek"]`).click();
      } else {
        await page.locator(`${pane} [data-act="panel:aa"]`).click();
        await page.waitForTimeout(100);
        await page.locator(`${pane} .over [data-act="view:greek"]`).click();
      }
      await page.waitForTimeout(150);
      ok(await page.locator(`${pane} [data-body][data-view=greek]`).count() === 1, `${d} ${kind}: Greek view did not apply`);
      ok(await page.locator(`${pane} [data-t]`).count() === 0, `${d} ${kind}: English still shown in Greek view`);
      await page.evaluate(() => { window.U.act('view:both'); });
      await page.waitForTimeout(100);
      // Translation and compare.
      if (kind === 'desktop') {
        await page.locator(`${pane} [data-act="panel:picker"]`).click();
        await page.waitForTimeout(100);
        await page.locator(`${pane} .over [data-act="trans:ross"]`).click();
        await page.waitForTimeout(100);
        ok(await page.locator(`${pane} [data-t=ross]`).count() > 0, `${d} ${kind}: Ross not shown`);
        await page.locator(`${pane} .over [data-act="cmp:rackham"]`).click();
        await page.waitForTimeout(150);
        ok(await page.locator(`${pane} [data-t=rackham]`).count() > 0 && await page.locator(`${pane} [data-body].cmp`).count() === 1, `${d} ${kind}: compare did not apply`);
        const o = await overflow();
        for (const x of o) ok(x.sw <= x.cw + 1, `${d} compare ${x.pane}: overflow`);
        await page.locator(`${pane} .over [data-act="cmp:off"]`).click();
        await page.waitForTimeout(100);
        await page.locator(`${pane} .over [data-act="trans:ostwald"]`).click();
        await page.waitForTimeout(100);
        await page.keyboard.press('Escape');
      } else {
        await page.locator(`${pane} .over [data-act="trans:ross"]`).click();
        await page.waitForTimeout(100);
        ok(await page.locator(`${pane} [data-t=ross]`).count() > 0, `${d} ${kind}: Ross not shown from Aa`);
        await page.evaluate(() => { window.U.act('trans:ostwald'); });
        await page.keyboard.press('Escape');
      }
      await page.waitForTimeout(100);
      // A footnote.
      const fn = page.locator(`${pane} .fn`).first();
      await fn.scrollIntoViewIfNeeded();
      await fn.click();
      await page.waitForTimeout(100);
      ok(await page.locator(`${pane} .over [role=note]`).count() === 1, `${d} ${kind}: note did not open`);
      await page.locator(`${pane} .over [data-act="close:fn"]`).click();
      // Contents: chapter 7, then a Bekker jump.
      await page.locator(`${pane} [data-act="panel:toc"]`).click();
      await page.waitForTimeout(150);
      await page.locator(`${pane} .over [data-act="ch:7"]`).click();
      await page.waitForTimeout(250);
      ok(await page.locator(`${pane} [data-here-ch]`).first().textContent() === '7', `${d} ${kind}: chapter 7 not reached (${await page.locator(`${pane} [data-here-ch]`).first().textContent()})`);
      await page.locator(`${pane} [data-act="panel:toc"]`).click();
      await page.waitForTimeout(150);
      await page.locator(`${pane} .over [data-jump]`).fill('1101a20');
      await page.locator(`${pane} .over [data-jump]`).press('Enter');
      await page.waitForTimeout(250);
      ok(await page.locator(`${pane} .target`).count() === 1, `${d} ${kind}: Bekker jump did not mark the line`);
      ok(['10', '11'].includes(await page.locator(`${pane} [data-here-ch]`).first().textContent()), `${d} ${kind}: Bekker jump landed in the wrong chapter`);
      // Book menu message for another book.
      await page.locator(`${pane} [data-act="panel:book"]`).click();
      await page.waitForTimeout(100);
      await page.locator(`${pane} .over [data-act="msg:book"]`).first().click();
      await page.waitForTimeout(100);
      ok(/Book I/.test(await page.locator(`${pane} [data-jump-msg]`).first().textContent()), `${d} ${kind}: no message for another book`);
    }
  }

  // Home: search goes to search; a work link opens its page.
  for (const d of DIRS) {
    await go(`${d}-home`);
    await page.locator('.pane[data-pane=desktop] [data-search]').first().press('Enter');
    await page.waitForTimeout(150);
    ok(await state(() => window.U.S.page) === 'search', `${d}: search field did not open search`);
    await go(`${d}-home`);
    await page.locator('.pane[data-pane=phone] [data-go="work:Poet"]').first().click();
    await page.waitForTimeout(150);
    ok(await state(() => window.U.S.page === 'work' && window.U.S.workId === 'Poet'), `${d}: Poetics link did not open its page`);
  }

  // Width control.
  for (const w of ['desktop', 'phone', 'both']) {
    await page.click(`#bar [data-width=${w}]`);
    await page.waitForTimeout(150);
    const shown = await state(() => window.U.shown().map((P) => P.kind).join(','));
    ok(shown === { desktop: 'desktop', phone: 'phone', both: 'desktop,phone' }[w], `width ${w}: shows ${shown}`);
  }

  ok(!errs.length, `errors: ${errs.slice(0, 5).join(' | ')}`);
  await browser.close();
  if (fails.length) { console.log(`${fails.length} FAIL\n${fails.slice(0, 60).join('\n')}`); process.exit(1); }
  console.log(`all ${checks} checks passed`);
})();
