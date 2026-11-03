const { chromium } = require('playwright');
const path = require('path');
(async () => {
  const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1600, height: 1000 } });
  await p.goto('file://' + path.resolve(process.argv[2]) + '#overview'); await p.waitForTimeout(700);
  await p.click('[data-width="phone"]');
  const sel = 'main:nth-of-type(1) > section:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(1) > span:nth-of-type(18)';
  for (const k of ['b', 'd', 'h', 'p']) for (const pg of ['home', 'work', 'reader', 'search', 'lexicon']) {
    await p.evaluate((h) => { location.hash = h; }, `${k}-${pg}`); await p.waitForTimeout(350);
    const r = await p.evaluate((sel) => {
      const v = document.querySelector('.pane[data-pane="phone"] .view');
      const el = v.querySelector(sel);
      if (!el) return null;
      const box = el.closest('section');
      return { text: el.textContent, cls: el.className, parent: el.parentElement.className, section: box.className, rows: [...el.parentElement.children].length };
    }, sel);
    if (r) console.log(k, pg, JSON.stringify(r));
  }
  await b.close();
})();
