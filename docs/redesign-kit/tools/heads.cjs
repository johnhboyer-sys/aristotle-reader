// Screenshot every design header (site menu and reader bar) for each
// direction at desktop and phone, at 2x, into <out>/<dir>_<page>_<width>.png
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
(async () => {
  const [file, out, dirs] = process.argv.slice(2);
  fs.mkdirSync(out, { recursive: true });
  const b = await chromium.launch();
  for (const width of ['desktop', 'phone']) {
    const p = await b.newPage({ viewport: { width: width === 'phone' ? 900 : 1600, height: 1000 }, deviceScaleFactor: 2 });
    await p.goto('file://' + path.resolve(file) + '#overview'); await p.waitForTimeout(800);
    await p.click(`[data-width="${width}"]`);
    for (const k of dirs.split(',')) {
      for (const page of ['home', 'work', 'reader', 'search']) {
        await p.evaluate((h) => { location.hash = h; }, `${k}-${page}`);
        await p.waitForTimeout(500);
        await p.evaluate(() => document.fonts.ready);
        // undo the pane's scaling so the shot is at true size
        await p.evaluate((w) => {
          const kk = w === 'phone' ? 'phone' : 'desktop';
          let st = document.getElementById('shotfix');
          if (!st) { st = document.createElement('style'); st.id = 'shotfix'; document.head.appendChild(st); }
          st.textContent = `.pane[data-pane="${kk}"] .frame { transform: none !important; } .pane[data-pane="${kk}"] .pane-box { width: ${kk === 'phone' ? 390 : 1440}px !important; height: 900px !important; } #stage-wrap { height: auto !important; overflow: visible !important; } body { overflow: visible !important; }`;
        }, width);
        await p.waitForTimeout(250);
        const sel = page === 'reader' ? '[data-sticky]' : 'header';
        const el = await p.$(`.pane[data-pane="${width}"] .view ${sel}`);
        if (!el) { console.log('no header', k, page, width); continue; }
        await el.screenshot({ path: path.join(out, `${k}_${page}_${width}.png`) });
      }
    }
    await p.close();
  }
  await b.close();
  console.log('done');
})();
