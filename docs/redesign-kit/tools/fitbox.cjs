// For every work page in B, every face, both widths: does the title's ink stay
// inside its photograph (top, bottom, left, right)? Reports any that do not.
const { chromium } = require('playwright');
const path = require('path');
(async () => {
  const [file] = process.argv.slice(2);
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1600, height: 1000 } });
  await p.goto('file://' + path.resolve(file) + '#b-home');
  await p.evaluate(() => document.fonts.ready); await p.waitForTimeout(2500);
  const ids = await p.evaluate(() => U.W.map((w) => w.id));
  const bad = []; let n = 0;
  for (const width of ['phone', 'desktop']) {
    await p.click(`[data-width="${width}"]`);
    for (const f of ['r5', 'xc', 'anton', 'oswald', 'bebas', 'shoulders']) {
      for (const id of [...ids, 'HOME']) {
        await p.evaluate((h) => { location.hash = h; }, id === 'HOME' ? `b-home~${f}` : `b-work:${id}~${f}`);
        await p.waitForTimeout(140);
        const r = await p.evaluate((w) => {
          const po = document.querySelector(`.pane[data-pane="${w}"] .b-po`);
          const t = po && po.querySelector('.b-po-t');
          if (!t) return null;
          const img = po.querySelector('img');
          const box = (img || po).getBoundingClientRect();
          const sc = box.width / (img || po).offsetWidth || 1;
          let top = Infinity, bot = -Infinity, left = Infinity, right = -Infinity;
          const cv = document.createElement('canvas').getContext('2d');
          const cs = getComputedStyle(t);
          for (const ln of t.querySelectorAll('.ln')) {
            // the baseline: a zero-size box sitting on it at the line's start
            const mk = document.createElement('span');
            mk.style.cssText = 'display:inline-block;width:0;height:0;vertical-align:baseline';
            ln.insertBefore(mk, ln.firstChild);
            const base = mk.getBoundingClientRect().bottom;
            mk.remove();
            const rg = document.createRange(); rg.selectNodeContents(ln);
            const rr = rg.getBoundingClientRect();
            const L = (parseFloat(ln.style.letterSpacing) || 0) * sc;
            const fs = parseFloat(ln.style.fontSize);
            cv.font = `${cs.fontWeight} ${fs}px ${cs.fontFamily}`;
            const m = cv.measureText(ln.textContent.toUpperCase());
            top = Math.min(top, base - m.actualBoundingBoxAscent * sc);
            bot = Math.max(bot, base + m.actualBoundingBoxDescent * sc);
            left = Math.min(left, rr.left); right = Math.max(right, rr.right - L);
          }
          const out = { t: (box.top - top) / sc, b: (bot - box.bottom) / sc, l: (box.left - left) / sc, r: (right - box.right) / sc };
          return { worst: Math.max(out.t, out.b, out.l, out.r), out };
        }, width);
        n++;
        if (r && r.worst > 1) bad.push(`${width} ${f} ${id} ${JSON.stringify(Object.fromEntries(Object.entries(r.out).map(([k, v]) => [k, Math.round(v)])))}`);
      }
    }
  }
  console.log(`${n} title settings checked; outside the photograph: ${bad.length ? '\n' + bad.join('\n') : 'none'}`);
  await b.close();
})();
