// Count the works each direction's home page links to, and list any of the 41 it leaves out.
const { chromium } = require('playwright');
const path = require('path');
(async () => {
  const [file, dirs] = process.argv.slice(2);
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
  await page.goto('file://' + path.resolve(file) + '#overview');
  await page.waitForTimeout(800);
  for (const k of dirs.split(',')) {
    for (const width of ['desktop', 'phone']) {
      await page.click(`[data-width="${width}"]`);
      await page.evaluate((h) => { location.hash = h; }, `${k}-home`);
      await page.waitForTimeout(700);
      const r = await page.evaluate((w) => {
        const v = document.querySelector(`.pane[data-pane="${w}"] .view`);
        const ids = new Set([...v.querySelectorAll('[data-go^="work:"]')].map((a) => a.dataset.go.slice(5)));
        const all = U.W.map((x) => x.id);
        return { n: ids.size, missing: all.filter((id) => !ids.has(id)), total: all.length };
      }, width);
      console.log(k, width, `${r.n}/${r.total}`, r.missing.length ? 'missing: ' + r.missing.join(' ') : '');
    }
  }
  await browser.close();
})();
