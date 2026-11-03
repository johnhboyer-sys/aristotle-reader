// H's reader bar in every title face, both widths: one row, nothing past the edge?
// usage: node rhfit.cjs <index.html> <faces,...> [control]
// "control" widens the work name past the bar, which must fail.
const { chromium } = require('playwright');
const path = require('path');
(async () => {
  const [file, faces, control] = process.argv.slice(2);
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1600, height: 1000 } });
  await p.goto('file://' + path.resolve(file) + '#overview'); await p.waitForTimeout(800);
  if (control) await p.addStyleTag({ content: '.dir-h .h-rh-w { min-width: 420px; display: inline-block; }' });
  let bad = 0;
  for (const width of ['phone', 'desktop']) {
    await p.click(`[data-width="${width}"]`);
    for (const f of faces.split(',')) {
      await p.evaluate((h) => { location.hash = h; }, `h-reader~later~${f}`); await p.waitForTimeout(600);
      await p.evaluate(() => document.fonts.ready); await p.waitForTimeout(150);
      const r = await p.evaluate((w) => {
        const bar = document.querySelector(`.pane[data-pane="${w}"] .h-rh`);
        const nb = bar.getBoundingClientRect(); const sc = nb.width / bar.offsetWidth;
        // Items in the row: shown, in the flow and with a size (the empty
        // spacer and the message under the bar are not).
        const kids = [...bar.children].filter((x) => x.offsetParent !== null && getComputedStyle(x).position !== 'absolute' && x.getBoundingClientRect().width > 0 && x.getBoundingClientRect().height > 0);
        const bx = kids.map((x) => x.getBoundingClientRect());
        const one = Math.max(...bx.map((r) => r.top)) < Math.min(...bx.map((r) => r.bottom));
        const over = Math.round((Math.max(...bx.map((r) => r.right)) - nb.right) / sc);
        return { one, over, n: kids.length, w: Math.round(bar.querySelector('.h-rh-w').getBoundingClientRect().width / sc) };
      }, width);
      const ok = r.one && r.over <= 0;
      if (!ok) bad++;
      console.log(`${ok ? 'ok ' : 'BAD'} ${width.padEnd(8)}${f.padEnd(11)} one row:${r.one} past edge:${r.over}px work name:${r.w}px`);
    }
  }
  console.log(bad ? `${bad} BAD` : 'all reader bars on one row');
  await b.close();
})();
