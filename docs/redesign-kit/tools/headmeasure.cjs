// Measure every item in each design header: text baselines and cap-height
// centres, icon centres, and the gaps between items. Reports the spread.
// usage: node headmeasure.cjs <index.html> b,d,h,p [verbose]
const { chromium } = require('playwright');
const path = require('path');
(async () => {
  const [file, dirs, verbose] = process.argv.slice(2);
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1600, height: 1000 } });
  await p.goto('file://' + path.resolve(file) + '#overview'); await p.waitForTimeout(800);
  const rows = [];
  for (const width of ['desktop', 'phone']) {
    await p.click(`[data-width="${width}"]`);
    for (const k of dirs.split(',')) {
      for (const page of ['home', 'reader']) {
        await p.evaluate((h) => { location.hash = h; }, `${k}-${page}`);
        await p.waitForTimeout(450);
        await p.evaluate(() => document.fonts.ready);
        const r = await p.evaluate(({ w, page }) => {
          const pane = document.querySelector(`.pane[data-pane="${w}"] .view`);
          const hd = page === 'reader' ? pane.querySelector('[data-sticky]') : pane.querySelector('header');
          const hb = hd.getBoundingClientRect();
          const sc = hb.width / hd.offsetWidth;
          const cv = document.createElement('canvas').getContext('2d');
          const items = [];
          const vis = (el) => el.offsetParent !== null && getComputedStyle(el).visibility !== 'hidden';
          // text leaves: elements whose own direct text is non-empty
          const walker = document.createTreeWalker(hd, NodeFilter.SHOW_TEXT);
          const seen = new Set();
          let n;
          while ((n = walker.nextNode())) {
            const t = n.textContent.replace(/\s+/g, ' ').trim();
            if (!t) continue;
            const el = n.parentElement;
            if (!vis(el) || seen.has(el)) continue;
            seen.add(el);
            const cs = getComputedStyle(el);
            const rg = document.createRange(); rg.selectNodeContents(n);
            const rr = rg.getBoundingClientRect();
            if (!rr.width || !rr.height || rr.right < hb.left || rr.left > hb.right || rr.bottom < hb.top || rr.top > hb.bottom) continue;
            cv.font = `${cs.fontStyle} ${cs.fontWeight} ${cs.fontStretch === '100%' ? '' : ''} ${cs.fontSize} ${cs.fontFamily}`;
            const m = cv.measureText(t);
            const asc = m.fontBoundingBoxAscent;
            const capH = cv.measureText('H').actualBoundingBoxAscent;
            const base = (rr.top - hb.top) / sc + asc;
            items.push({ kind: 'text', label: t.slice(0, 22), base, cap: base - capH / 2, fs: parseFloat(cs.fontSize), fam: cs.fontFamily.split(',')[0].replace(/"/g, ''), left: (rr.left - hb.left) / sc, right: (rr.right - hb.left) / sc });
          }
          for (const svg of hd.querySelectorAll('svg')) {
            if (!vis(svg.closest('button, a') || svg)) continue;
            const r = svg.getBoundingClientRect();
            if (!r.height || r.right < hb.left || r.left > hb.right || r.bottom < hb.top || r.top > hb.bottom) continue;
            const host = svg.closest('button, a');
            items.push({ kind: 'icon', label: (host && (host.getAttribute('aria-label') || host.textContent.trim())) || 'svg', mid: (r.top + r.height / 2 - hb.top) / sc, h: r.height / sc, left: (r.left - hb.left) / sc, right: (r.right - hb.left) / sc });
          }
          items.sort((a, b) => a.left - b.left);
          return { H: hb.height / sc, items };
        }, { w: width, page });
        rows.push({ id: `${k} ${page} ${width}`, ...r });
      }
    }
  }
  for (const r of rows) {
    const texts = r.items.filter((x) => x.kind === 'text');
    const icons = r.items.filter((x) => x.kind === 'icon');
    const bases = texts.map((x) => x.base);
    const caps = texts.map((x) => x.cap).concat(icons.map((x) => x.mid));
    const spread = (a) => (a.length ? Math.max(...a) - Math.min(...a) : 0);
    console.log(`${r.id.padEnd(20)} h=${r.H.toFixed(0)}  baseline spread ${spread(bases).toFixed(1)}px  centre spread (caps+icons) ${spread(caps).toFixed(1)}px  sizes [${[...new Set(texts.map((x) => x.fs))].join(', ')}]`);
    if (verbose) for (const x of r.items) console.log(x.kind === 'text' ? `    text  ${x.label.padEnd(24)} base ${x.base.toFixed(1)}  cap-mid ${x.cap.toFixed(1)}  ${x.fs}px ${x.fam}  x ${x.left.toFixed(0)}–${x.right.toFixed(0)}` : `    icon  ${x.label.padEnd(24)} mid  ${x.mid.toFixed(1)}  h ${x.h.toFixed(1)}  x ${x.left.toFixed(0)}–${x.right.toFixed(0)}`);
  }
  await b.close();
})();
