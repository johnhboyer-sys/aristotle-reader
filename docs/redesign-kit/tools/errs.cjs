// Print console errors and page errors for a mockup hash.
const { chromium } = require('playwright');
const path = require('path');
(async () => {
  const [file, ...hashes] = process.argv.slice(2);
  const browser = await chromium.launch();
  for (const h of hashes) {
    const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
    const errs = [];
    page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errs.push(`${m.type()}: ${m.text()}`); });
    page.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
    await page.goto('file://' + path.resolve(file) + '#' + h);
    await page.waitForTimeout(2500);
    console.log(h, errs.length ? '\n  ' + errs.join('\n  ') : 'clean');
    await page.close();
  }
  await browser.close();
})();
