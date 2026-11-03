// H's titles hide what overflows their box. For the home page and every work
// page, in every title face, at both widths: is any letter's ink cut off at the
// top, bottom or sides? Reports each title that loses ink, and how much.
// usage: node hclip.cjs <index.html> <faces,...>
const { chromium } = require('playwright');
const path = require('path');
(async () => {
  const [file, faces] = process.argv.slice(2);
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1600, height: 1000 } });
  await p.goto('file://' + path.resolve(file) + '#h-home');
  await p.evaluate(() => document.fonts.ready); await p.waitForTimeout(2500);
  const ids = await p.evaluate(() => U.W.map((w) => w.id));
  const bad = []; let n = 0; let worstSeen = -Infinity;
  for (const width of ['phone', 'desktop']) {
    await p.click(`[data-width="${width}"]`);
    for (const f of faces.split(',')) {
      for (const id of ['HOME', ...ids]) {
        await p.evaluate((h) => { location.hash = h; }, id === 'HOME' ? `h-home~later~${f}` : `h-work:${id}~later~${f}`);
        await p.waitForTimeout(160);
        await p.evaluate(() => document.fonts.ready);
        const r = await p.evaluate((w) => {
          const el = document.querySelector(`.pane[data-pane="${w}"] .h-h1`);
          if (!el) return null;
          const eb = el.getBoundingClientRect(); const sc = eb.width / el.offsetWidth || 1;
          const cv = document.createElement('canvas').getContext('2d');
          // every character, with its line (by the top of its box) and its font
          const chars = [];
          const walk = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
          for (let t = walk.nextNode(); t; t = walk.nextNode()) {
            if (t.parentElement.closest('.h-tag')) continue;
            const cs = getComputedStyle(t.parentElement);
            for (let i = 0; i < t.data.length; i++) {
              if (/\s/.test(t.data[i])) continue;
              const rg = document.createRange(); rg.setStart(t, i); rg.setEnd(t, i + 1);
              const rr = rg.getClientRects()[0]; if (!rr) continue;
              chars.push({ ch: t.data[i], r: rr, cs });
            }
          }
          let top = Infinity, bot = -Infinity, left = Infinity, right = -Infinity; let unset = 0;
          for (const c of chars) {
            const fs = parseFloat(c.cs.fontSize);
            // A canvas takes no percentage width in its font, so the face is
            // measured at its normal width: heights do not change with width,
            // and side overhangs are scaled by the character's real width.
            const want = `${c.cs.fontStyle} ${c.cs.fontWeight} ${fs}px ${c.cs.fontFamily}`;
            cv.font = '1px x-no-font'; cv.font = want;
            if (!cv.font.includes(String(fs))) { unset++; continue; }
            const m = cv.measureText(c.ch);
            const k = m.width ? c.r.width / sc / m.width : 1;
            // the box of one character is its font's ascent and descent; the
            // baseline sits the font's descent above the box's bottom
            const base = c.r.bottom - m.fontBoundingBoxDescent * sc;
            top = Math.min(top, base - m.actualBoundingBoxAscent * sc);
            bot = Math.max(bot, base + m.actualBoundingBoxDescent * sc);
            left = Math.min(left, c.r.left - m.actualBoundingBoxLeft * k * sc);
            right = Math.max(right, c.r.left + m.actualBoundingBoxRight * k * sc);
          }
          if (!chars.length || unset) return { none: true, unset, n: chars.length };
          const out = { top: (eb.top - top) / sc, bottom: (bot - eb.bottom) / sc, left: (eb.left - left) / sc, right: (right - eb.right) / sc };
          return { worst: Math.max(...Object.values(out)), out, n: chars.length, title: el.textContent.trim() };
        }, width);
        if (!r) continue;
        if (r.none) { bad.push(`${width} ${f} ${id}: measured nothing (${r.n} characters, ${r.unset} fonts not set)`); continue; }
        n++; worstSeen = Math.max(worstSeen, r.worst);
        if (r.worst > 0.5) bad.push(`${width.padEnd(8)}${f.padEnd(11)}${id.padEnd(6)} ${Object.entries(r.out).filter(([, v]) => v > 0.5).map(([k, v]) => `${k} ${v.toFixed(1)}px`).join(', ')}  “${r.title}”`);
      }
    }
  }
  console.log(`${n} titles checked; closest approach to the box ${worstSeen.toFixed(1)}px; ink cut off: ${bad.length ? bad.length + '\n' + bad.join('\n') : 'none'}`);
  await b.close();
})();
