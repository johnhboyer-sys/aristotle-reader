const { chromium } = require('playwright');
const path = require('path');
(async () => {
  const [file, hash, sel] = process.argv.slice(2);
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1600, height: 1000 } });
  p.on('console', (m) => console.log('console:', m.text()));
  await p.goto('file://' + path.resolve(file) + '#' + hash);
  await p.waitForTimeout(2500);
  const r = await p.evaluate((sel) => [...document.querySelectorAll(sel)].map((el) => {
    const cs = getComputedStyle(el);
    return { fs: cs.fontSize, lh: cs.lineHeight, ff: cs.fontFamily.slice(0, 40), cw: el.clientWidth, sw: el.scrollWidth, ch: el.clientHeight, sh: el.scrollHeight, pane: el.closest('.pane').dataset.pane };
  }), sel);
  console.log(JSON.stringify(r, null, 1));
  await b.close();
})();
