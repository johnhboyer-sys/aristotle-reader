// Full-page screenshot of the overview at a given viewport width and scheme.
// usage: node ovshot.cjs <index.html> <out.png> <width> [dark]
const { chromium } = require('playwright');
const path = require('path');
(async () => {
  const [file, out, width, dark] = process.argv.slice(2);
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: +width, height: 900 }, colorScheme: dark ? 'dark' : 'light' });
  const errs = [];
  page.on('pageerror', (e) => errs.push(e.message));
  page.on('requestfailed', (r) => errs.push('failed: ' + r.url()));
  await page.goto('file://' + path.resolve(file) + '#overview');
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(1200);
  // load lazy images
  await page.evaluate(async () => { for (const i of document.querySelectorAll('#overview img')) { i.loading = 'eager'; } });
  await page.evaluate(async () => { const h = document.body.scrollHeight; for (let y = 0; y < h; y += 600) { window.scrollTo(0, y); await new Promise((r) => setTimeout(r, 60)); } window.scrollTo(0, 0); });
  await page.waitForTimeout(800);
  const sw = await page.evaluate(() => [document.documentElement.scrollWidth, window.innerWidth]);
  await page.screenshot({ path: out, fullPage: true });
  console.log('scrollWidth', sw.join(' / '), errs.length ? errs.join('\n') : 'no errors');
  await browser.close();
})();
