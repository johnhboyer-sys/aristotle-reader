const { chromium } = require('playwright');
const path = require('path');
(async () => {
  const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1600, height: 1000 } });
  await p.goto('file://' + path.resolve(process.argv[2]) + '#overview'); await p.waitForTimeout(700);
  await p.click('[data-width="phone"]');
  await p.evaluate(() => { location.hash = 'p-reader'; }); await p.waitForTimeout(800);
  const r = await p.evaluate(() => {
    const h = document.querySelector('.pane[data-pane="phone"] [data-sticky]');
    const sc = h.getBoundingClientRect().width / h.offsetWidth;
    const cs = getComputedStyle(h);
    return { pad: cs.paddingLeft + ' ' + cs.paddingRight, gap: cs.columnGap, w: h.clientWidth, kids: [...h.children].map((c) => { const s = getComputedStyle(c); const r = c.getBoundingClientRect(); return `${(c.className || c.tagName).toString().slice(0, 40).padEnd(40)} disp ${s.display.padEnd(12)} pos ${s.position.padEnd(8)} w ${(r.width / sc).toFixed(1).padStart(6)} basis ${s.flexBasis} grow ${s.flexGrow} minW ${s.minWidth} ml ${s.marginLeft} mr ${s.marginRight}`; }) };
  });
  console.log(JSON.stringify({ pad: r.pad, gap: r.gap, w: r.w })); console.log(r.kids.join('\n'));
  await b.close();
})();
