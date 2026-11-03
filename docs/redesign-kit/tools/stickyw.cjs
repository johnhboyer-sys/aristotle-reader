// The works list on each search page: after the hits scroll by, is the list
// still in view at the top of the pane? (desktop; on a phone it is a row)
// usage: node stickyw.cjs <index.html> b,d,h,p [control]
// "control" turns the list's stickiness off, which must fail.
const { chromium } = require('playwright');
const path = require('path');
(async () => {
  const [file, dirs, control] = process.argv.slice(2);
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1600, height: 1000 } });
  await p.goto('file://' + path.resolve(file) + '#overview'); await p.waitForTimeout(800);
  if (control) await p.addStyleTag({ content: '.b-sr-w, .d-sr-w, .h-sr-w, .p-sr-w { position: static !important; }' });
  await p.click('[data-width="desktop"]');
  let bad = 0;
  for (const k of dirs.split(',')) {
    await p.evaluate((h) => { location.hash = h; }, `${k}-search`); await p.waitForTimeout(700);
    const r = await p.evaluate((k) => {
      const pane = document.querySelector('.pane[data-pane="desktop"]');
      const nav = pane.querySelector(`.${k}-sr-w`);
      if (!nav) return { none: true };
      // the scrolling box: the nearest ancestor that scrolls
      let sc = nav.parentElement; while (sc && !(sc.scrollHeight > sc.clientHeight + 4 && /(auto|scroll)/.test(getComputedStyle(sc).overflowY))) sc = sc.parentElement;
      if (!sc) return { noscroll: true };
      const before = nav.getBoundingClientRect().top;
      sc.scrollTop = nav.getBoundingClientRect().top - sc.getBoundingClientRect().top + sc.scrollTop + 900;
      const box = sc.getBoundingClientRect(); const nb = nav.getBoundingClientRect();
      const scale = box.height / sc.clientHeight;
      return { top: Math.round((nb.top - box.top) / scale), bottom: Math.round((nb.bottom - box.top) / scale), h: Math.round(sc.clientHeight), moved: Math.round(before - nb.top) };
    }, k);
    const ok = !r.none && !r.noscroll && r.top >= 0 && r.top < 60;
    if (!ok) bad++;
    console.log(`${ok ? 'ok ' : 'BAD'} ${k}  ${r.none ? 'no works list' : r.noscroll ? 'nothing scrolls' : `list top ${r.top}px from the pane's top after scrolling 900px past it`}`);
  }
  console.log(bad ? `${bad} BAD` : 'the works list stays in view in every direction');
  await b.close();
})();
