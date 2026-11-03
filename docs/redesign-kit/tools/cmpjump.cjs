// Check compare-two-translations and jump-to-Bekker in each reader, both widths.
const { chromium } = require('playwright');
const path = require('path');
(async () => {
  const [file, dirs] = process.argv.slice(2);
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
  const errs = [];
  page.on('pageerror', (e) => errs.push(e.message));
  await page.goto('file://' + path.resolve(file) + '#overview');
  await page.waitForTimeout(800);
  for (const k of dirs.split(',')) {
    for (const width of ['desktop', 'phone']) {
      await page.click(`[data-width="${width}"]`);
      await page.evaluate((h) => { location.hash = h; }, `${k}-reader`);
      await page.waitForTimeout(800);
      const P = `.pane[data-pane="${width}"]`;
      const out = [];
      // compare: open the picker, pick a cmp button
      const pick = await page.$(`${P} [data-act="panel:picker"]`);
      if (pick) { await pick.evaluate((e) => e.click()); await page.waitForTimeout(300); }
      const cmp = await page.$(`${P} .over [data-act^="cmp:"]:not([data-act="cmp:off"])`) || await page.$(`${P} [data-act^="cmp:"]:not([data-act="cmp:off"])`);
      if (cmp) { await cmp.evaluate((e) => e.click()); await page.waitForTimeout(500); const on = await page.evaluate((p) => !!document.querySelector(`${p} [data-body].cmp`), P); out.push(`compare:${on ? 'ok' : 'NOT SET'}`); const off = await page.$(`${P} [data-act="cmp:off"]`); if (off) { await off.evaluate((e) => e.click()); await page.waitForTimeout(300); } }
      else out.push('compare:NO CONTROL');
      const x = await page.$(`${P} .over [data-act="close:panel"]`); if (x) { await x.evaluate((e) => e.click()); await page.waitForTimeout(200); }
      // jump: find a data-jump input anywhere (open toc if needed)
      let j = await page.$(`${P} [data-jump]`);
      if (!j) { const t = await page.$(`${P} [data-act="panel:toc"]`); if (t) { await t.evaluate((e) => e.click()); await page.waitForTimeout(300); } j = await page.$(`${P} [data-jump]`); }
      if (j) { await j.fill('1095a2'); await j.press('Enter'); await page.waitForTimeout(600); const tg = await page.evaluate((p) => { const t = document.querySelector(`${p} .target`); return t ? t.textContent.slice(0, 20) : null; }, P); out.push(`jump:${tg ? 'ok' : 'NO TARGET'}`); }
      else out.push('jump:NO INPUT');
      console.log(`${k} ${width}`.padEnd(12), out.join('  '));
    }
  }
  console.log(errs.length ? [...new Set(errs)].join('\n') : 'no script errors');
  await browser.close();
})();
