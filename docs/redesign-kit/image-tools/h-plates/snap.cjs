// snap.cjs <html> <out.png> [width] : full-page screenshot after fonts load
const { chromium } = require('playwright');
const path = require('path');
(async () => {
  const [f, out, w] = process.argv.slice(2);
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: +(w || 1460), height: 900 } });
  await p.goto('file://' + path.resolve(f));
  await p.evaluate(() => document.fonts.ready);
  await p.waitForTimeout(1500);
  await p.screenshot({ path: out, fullPage: true });
  await b.close();
})();
