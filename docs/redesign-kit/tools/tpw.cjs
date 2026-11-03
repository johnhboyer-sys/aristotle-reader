const { chromium } = require('playwright');
const path = require('path');
(async () => {
  const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1600, height: 1000 } });
  await p.goto('file://' + path.resolve(process.argv[2]) + '#b-reader'); await p.waitForTimeout(1500);
  for (const w of ['desktop', 'phone']) {
    await p.click(`[data-width="${w}"]`); await p.waitForTimeout(800);
    console.log(w, JSON.stringify(await p.evaluate((w) => { const e = document.querySelector(`.pane[data-pane="${w}"] .b-tp-inc`); return e ? { W: e.clientWidth, text: e.dataset.title, set: [...e.querySelectorAll('.ln')].map((x) => x.style.fontSize + ' ' + x.textContent) } : null; }, w)));
  }
  await b.close();
})();
