// H's site bar at both widths, in every title face: one row, nothing cut?
// usage: node navfit.cjs <index.html> <faces,...> [control]
// "control" widens the name in the bar, which must fail on a phone.
const { chromium } = require('playwright');
const path = require('path');
(async () => {
  const [file, faces, control] = process.argv.slice(2);
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1600, height: 1000 } });
  await p.goto('file://' + path.resolve(file) + '#overview'); await p.waitForTimeout(800);
  if (control) await p.addStyleTag({ content: '.dir-h .h-brand { min-width: 220px; display: inline-block; }' });
  let bad = 0;
  for (const width of ['phone', 'desktop']) {
    await p.click(`[data-width="${width}"]`);
    for (const f of faces.split(',')) {
      for (const pg of ['home', 'work:EN', 'search', 'lexicon']) {
        await p.evaluate((h) => { location.hash = h; }, `h-${pg}~later~${f}`); await p.waitForTimeout(500);
        await p.evaluate(() => document.fonts.ready); await p.waitForTimeout(150);
        const r = await p.evaluate((w) => {
          const nav = document.querySelector(`.pane[data-pane="${w}"] .h-nav`);
          if (!nav) return { none: true };
          const sc = nav.getBoundingClientRect().width / nav.offsetWidth;
          const nb = nav.getBoundingClientRect();
          const kids = [...nav.querySelectorAll('.h-brand, .h-links > *')].filter((x) => x.offsetParent !== null);
          // One row when every item shares a horizontal band with every other.
          const bx = kids.map((x) => x.getBoundingClientRect());
          const rows = { size: Math.max(...bx.map((r) => r.top)) < Math.min(...bx.map((r) => r.bottom)) ? 1 : 2 };
          const cut = kids.filter((x) => { const r = x.getBoundingClientRect(); return r.top < nb.top - 1 || r.bottom > nb.bottom + 1 || r.right > nb.right + 1; }).map((x) => x.textContent.trim() || x.getAttribute('aria-label'));
          const brand = nav.querySelector('.h-brand').getBoundingClientRect().width / sc;
          const free = (nav.querySelector('.h-links').getBoundingClientRect().left - nav.querySelector('.h-brand').getBoundingClientRect().right) / sc;
          return { rows: rows.size, cut, brand: Math.round(brand), free: Math.round(free) };
        }, width);
        const ok = r.none || (r.rows === 1 && !r.cut.length);
        if (!ok) bad++;
        console.log(`${ok ? 'ok ' : 'BAD'} ${width.padEnd(8)}${f.padEnd(11)}${pg.padEnd(9)} ${r.none ? 'no nav' : `rows:${r.rows} brand:${r.brand}px gap-to-links:${r.free}px cut:[${r.cut.join(', ')}]`}`);
      }
    }
  }
  console.log(bad ? `${bad} BAD` : 'all bars on one row');
  await b.close();
})();
