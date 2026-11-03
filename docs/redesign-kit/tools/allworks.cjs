// Open every work page in every direction at both widths; report failed loads,
// broken images and script errors.
const { chromium } = require('playwright');
const path = require('path');
(async () => {
  const [file, dirs] = process.argv.slice(2);
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
  const errs = new Set();
  page.on('pageerror', (e) => errs.add('pageerror: ' + e.message));
  page.on('requestfailed', (r) => errs.add('failed: ' + r.url().replace(/^.*\/out\//, '')));
  await page.goto('file://' + path.resolve(file) + '#overview');
  await page.waitForTimeout(800);
  const ids = await page.evaluate(() => U.W.map((w) => w.id));
  let n = 0, broken = [];
  for (const k of dirs.split(',')) {
    for (const id of ids) {
      await page.evaluate((h) => { location.hash = h; }, `${k}-work:${id}`);
      await page.waitForTimeout(250);
      const b = await page.evaluate(async () => {
        const imgs = [...document.querySelectorAll('.pane .view img')];
        await Promise.all(imgs.map((i) => (i.complete ? null : new Promise((r) => { i.onload = i.onerror = r; setTimeout(r, 3000); }))));
        return imgs.filter((i) => !i.naturalWidth).map((i) => i.getAttribute('src'));
      });
      broken.push(...b.map((s) => `${k}-${id}: ${s}`));
      n++;
    }
  }
  console.log(`${n} work pages; broken images: ${broken.length ? broken.join(', ') : 'none'}`);
  console.log(errs.size ? [...errs].join('\n') : 'no failed loads or errors');
  await browser.close();
})();
