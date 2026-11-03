// Drive each direction's reader controls at desktop and phone; report what
// opens, what is missing, and any script error.
// usage: node controls.cjs <index.html> e,f,g,h
const { chromium } = require('playwright');
const path = require('path');
(async () => {
  const [file, dirs] = process.argv.slice(2);
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
  const errs = [];
  page.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
  await page.goto('file://' + path.resolve(file) + '#overview');
  await page.waitForTimeout(1200);
  for (const k of dirs.split(',')) {
    for (const width of ['desktop', 'phone']) {
      await page.click(`[data-width="${width}"]`);
      await page.evaluate((h) => { location.hash = h; }, `${k}-reader`);
      await page.waitForTimeout(900);
      const P = `.pane[data-pane="${width}"]`;
      const out = [];
      const has = async (sel) => (await page.$(`${P} ${sel}`)) !== null;
      const click = async (sel) => { const el = await page.$(`${P} ${sel}`); if (!el) return false; await el.evaluate((e) => e.click()); await page.waitForTimeout(350); return true; };
      const panelFilled = async () => page.evaluate((p) => { const h = document.querySelector(`${p} .over .panel-host`); return !!(h && h.textContent.trim().length > 20); }, P);
      const sideFilled = async () => page.evaluate((p) => { const h = document.querySelector(`${p} .side-host`) || document.querySelector(`${p} [data-side]`); return !!(h && h.textContent.trim().length > 20); }, P);
      // a word
      if (await click('.tok[data-w="2"]')) out.push(`word:${(await sideFilled()) ? 'opens' : 'NO SIDEBAR'}`); else out.push('word:NO TOKENS');
      if (await click('[data-act="card:' + '"]')) {}
      const lsj = await page.$(`${P} .over [data-act^="card:"]`);
      if (lsj) { await lsj.evaluate((e) => e.click()); await page.waitForTimeout(350); out.push(`lsj:${(await page.$(`${P} .over .t8`)) ? 'shows' : 'NO ENTRY'}`); } else out.push('lsj:no button');
      await click('[data-act="close:word"]') || (await page.$(`.over [data-act="close:word"]`));
      const closeBtn = await page.$(`${P} .over [data-act="close:word"]`); if (closeBtn) { await closeBtn.evaluate((e) => e.click()); await page.waitForTimeout(300); }
      for (const pnl of ['toc', 'book', 'picker', 'aa']) {
        if (await click(`[data-act="panel:${pnl}"]`)) { out.push(`${pnl}:${(await panelFilled()) ? 'opens' : 'EMPTY'}`); const x = await page.$(`${P} .over [data-act="close:panel"]`); if (x) await x.evaluate((e) => e.click()); else await click(`[data-act="panel:${pnl}"]`); await page.waitForTimeout(250); }
        else out.push(`${pnl}:-`);
      }
      for (const v of ['greek', 'english', 'both']) {
        const ok = await click(`[data-act="view:${v}"]`) || await (async () => { if (await click('[data-act="panel:aa"]')) { const r = await page.$(`${P} .over [data-act="view:${v}"]`); if (r) { await r.evaluate((e) => e.click()); await page.waitForTimeout(300); return true; } } return false; })();
        const cur = await page.evaluate(() => U.S.view);
        out.push(`${v}:${ok && cur === v ? 'ok' : ok ? 'state ' + cur : 'NO CONTROL'}`);
      }
      const fnb = await page.$(`${P} .fn`);
      if (fnb) { await fnb.evaluate((e) => e.click()); await page.waitForTimeout(300); out.push(`note:${(await panelFilled()) ? 'opens' : 'EMPTY'}`); const x = await page.$(`${P} .over [data-act="close:fn"]`); if (x) await x.evaluate((e) => e.click()); }
      console.log(`${k} ${width}`.padEnd(12), out.join('  '));
    }
  }
  console.log(errs.length ? [...new Set(errs)].join('\n') : 'no script errors');
  await browser.close();
})();
