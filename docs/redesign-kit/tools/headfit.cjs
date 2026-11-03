// The reader's top bar on a phone: does everything fit, and is search there?
const { chromium } = require('playwright');
const path = require('path');
(async () => {
  const [file, dirs] = process.argv.slice(2);
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1600, height: 1000 } });
  await p.goto('file://' + path.resolve(file) + '#overview'); await p.waitForTimeout(800);
  for (const width of ['phone', 'desktop']) {
    await p.click(`[data-width="${width}"]`);
    for (const k of dirs.split(',')) {
      await p.evaluate((h) => { location.hash = h; }, `${k}-reader`); await p.waitForTimeout(700);
      await p.evaluate(() => document.fonts.ready);
      const r = await p.evaluate((w) => {
        const h = document.querySelector(`.pane[data-pane="${w}"] [data-sticky]`);
        const kids = [...h.children].filter((x) => x.offsetParent !== null);
        const hb = h.getBoundingClientRect(); const sc = hb.width / h.offsetWidth;
        const right = Math.max(...kids.map((x) => x.getBoundingClientRect().right));
        const search = !!h.querySelector('[data-go="search"]') && h.querySelector('[data-go="search"]').offsetParent !== null;
        const boxed = [...h.querySelectorAll('button')].filter((x) => x.offsetParent !== null && getComputedStyle(x).borderTopStyle !== 'none' && parseFloat(getComputedStyle(x).borderTopWidth) > 0).map((x) => x.innerText.trim() || x.getAttribute('aria-label'));
        return { overflow: Math.round((right - hb.right) / sc), scroll: h.scrollWidth - h.clientWidth, search, boxed, text: h.innerText.replace(/\s+/g, ' ').trim() };
      }, width);
      console.log(`${width.padEnd(8)}${k}  search:${r.search}  boxed:[${r.boxed.join(', ')}]  overflow:${r.overflow}px scroll:${r.scroll}  "${r.text}"`);
    }
  }
  await b.close();
})();
