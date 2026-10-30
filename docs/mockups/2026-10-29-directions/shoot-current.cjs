// Shots of the current site for the overview: home, the Ethics page, the
// reader with a word open, and search. Needs Playwright; writes shots/*.png,
// which shoot-current.py turns into the small JPEGs build.py inlines.
//   node docs/mockups/2026-10-29-directions/shoot-current.cjs
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const out = path.join(__dirname, 'shots');
fs.mkdirSync(out, { recursive: true });
const A = 'https://aristotle.johnhboyer.com';
const jobs = [
  { name: 'home', url: `${A}/`, full: true },
  { name: 'work', url: `${A}/EN`, full: true },
  { name: 'reader', url: `${A}/EN/book/1`, click: '.tok', nth: 3 },
  { name: 'search', url: `${A}/search?q=%E1%BC%80%CF%81%CE%B5%CF%84%CE%AE`, wait: 3000 },
];
(async () => {
  const browser = await chromium.launch();
  for (const j of jobs) {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    await page.goto(j.url, { waitUntil: 'networkidle' });
    await page.waitForTimeout(j.wait || 800);
    if (j.click) { await page.locator(j.click).nth(j.nth).click(); await page.waitForTimeout(2000); }
    await page.screenshot({ path: path.join(out, `${j.name}.png`), fullPage: !!j.full });
    await page.close();
  }
  await browser.close();
  console.log('shots taken; run shoot-current.py to make the JPEGs');
})();
