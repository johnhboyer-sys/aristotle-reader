// Functional check of round two: every direction, page, theme and width;
// every work page; the reader's controls in both panes. Needs Playwright and
// a local server serving this folder (python3 -m http.server 8765; or set BASE).
//   node docs/mockups/2026-10-30-round-three/verify.cjs
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
  // B: every work's title fits its poster.
  for (const id of ids) {
    await go(`b-work:${id}`);
    const fit = await state(() => window.U.shown().map((P) => {
      const po = P.view.querySelector('.b-po');
      const t = P.view.querySelector('.b-po-t');
      const info = P.view.querySelector('.b-po-info');
      const pr = po.getBoundingClientRect(); const tr = t.getBoundingClientRect();
      const wide = t.scrollWidth > t.clientWidth + 2;
      const under = info ? info.getBoundingClientRect().top - tr.bottom : 99;
      return { kind: P.kind, wide, below: (tr.bottom - pr.bottom) / P.scale, under: under / P.scale };
    }));
    for (const x of fit) ok(!x.wide && x.below <= 1 && x.under >= 8, `b-work:${id} ${x.kind}: title does not fit (wide ${x.wide}, below ${x.below.toFixed(0)}, gap to details ${x.under.toFixed(0)})`);
  }

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
