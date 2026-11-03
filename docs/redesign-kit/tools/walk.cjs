// Visit every page of the given directions at desktop and phone, light and
// dark; report script errors, failed image loads, and anything wider than its
// pane (sideways scroll inside the design).
// usage: node walk.cjs <index.html> e[,f,...]
const { chromium } = require('playwright');
const path = require('path');
(async () => {
  const [file, dirs] = process.argv.slice(2);
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
  const errs = [];
  page.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
  page.on('requestfailed', (r) => errs.push('failed load: ' + r.url().split('/').slice(-3).join('/')));
  page.on('response', (r) => { if (r.status() >= 400) errs.push(`HTTP ${r.status()}: ${r.url().split('/').slice(-3).join('/')}`); });
  await page.goto('file://' + path.resolve(file) + '#overview');
  await page.waitForTimeout(1500);
  for (const k of dirs.split(',')) {
    for (const theme of ['light', 'dark']) {
      await page.click(`[data-theme-pick="${theme}"]`);
      for (const pg of ['home', 'work', 'reader', 'search', 'lexicon']) {
        await page.evaluate((h) => { location.hash = h; }, `${k}-${pg}`);
        await page.waitForTimeout(700);
        const wide = await page.evaluate(() => [...document.querySelectorAll('.pane:not([hidden]) .view')].map((v) => {
          const pane = v.closest('.pane').dataset.pane;
          const over = [...v.querySelectorAll('*')].filter((el) => { const r = el.getBoundingClientRect(); const vr = v.getBoundingClientRect(); return r.width > 0 && r.right > vr.right + 2 && getComputedStyle(el).position !== 'fixed'; }).slice(0, 3).map((el) => `${el.tagName.toLowerCase()}.${[...el.classList].join('.')}`);
          return v.scrollWidth > v.clientWidth + 1 ? `${pane}: wider than pane (${v.scrollWidth} > ${v.clientWidth}) ${over.join(' ')}` : '';
        }).filter(Boolean));
        console.log(`${k}-${pg} ${theme}`.padEnd(22), wide.length ? wide.join(' | ') : 'ok');
      }
    }
  }
  console.log(errs.length ? [...new Set(errs)].join('\n') : 'no script errors or failed loads');
  await browser.close();
})();
