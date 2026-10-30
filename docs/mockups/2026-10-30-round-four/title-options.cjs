// Title options for B's posters (John, on round four: "I think title could
// to be bigger. It should fill the picture. Not like the letters are so big
// they cover every inch, but rather we bump up the pt a bit and space out the
// words and play with kearning." Then: "Let a word break and wrap").
//
// Rewrites every poster title in the shown panes by one of the rules in
// title-layout.js and saves one picture per poster and option in
// title-options/ (gitignored). title-sheets.py lays them out side by side.
// Needs Playwright and a local server serving this folder (python3 -m
// http.server 8765; or set BASE).
//   node docs/mockups/2026-10-30-round-four/title-options.cjs
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const BASE = process.env.BASE || 'http://localhost:8765/test.html';
const OUT = path.join(__dirname, 'title-options');
fs.mkdirSync(OUT, { recursive: true });

// The rules live in title-layout.js (shared with titles.html).
const OPTIONS = ['now', 'justified', 'stacked', 'stacked-spread', 'block', 'block-big', 'block-spread'];

// Runs in the page, after title-layout.js.
const APPLY = (opt) => {
  const cv = document.createElement('canvas').getContext('2d');
  cv.font = '600 100px "Sofia Sans"';
  const w100 = (s) => cv.measureText(s).width;
  for (const P of window.U.shown()) {
    for (const t of P.view.querySelectorAll('.b-po-t')) {
      if (!t.dataset.orig) t.dataset.orig = t.textContent.trim();
      t.removeAttribute('style');
      t.textContent = t.dataset.orig;
      if (opt === 'now') continue;
      const { top, bottom } = window.TL.BOX[P.kind];
      const lines = window.TL.set(t.dataset.orig, P.kind, opt, w100);
      t.innerHTML = window.TL.html(lines);
      t.style.textAlign = 'left';
      t.style.letterSpacing = '0';
      // A spread runs the lines from the top of the photograph to the
      // bottom; a title on one line sits in the middle.
      const at = window.TL.place(opt, lines);
      if (at !== 'top') Object.assign(t.style, { top: '0', bottom: '0', display: 'flex', flexDirection: 'column', justifyContent: at === 'middle' ? 'center' : 'space-between', paddingTop: `${top}px`, paddingBottom: `${bottom}px` });
    }
  }
};

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1600, height: 1100 }, deviceScaleFactor: 2 });
  await page.goto(`${BASE}#b-home`, { waitUntil: 'networkidle' });
  await page.addScriptTag({ path: path.join(__dirname, 'title-layout.js') });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(600);
  const posters = [['phone', 'b-home', 'home'], ['phone', 'b-work:EN', 'en'], ['phone', 'b-work:Pol', 'pol'], ['phone', 'b-work:Juv', 'juv'], ['desktop', 'b-home', 'home'], ['desktop', 'b-work:EN', 'en']];
  for (const [kind, hash, name] of posters) {
    await page.click(`#bar [data-width=${kind}]`);
    await page.evaluate((h) => { location.hash = h; }, hash);
    await page.waitForTimeout(400);
    for (const opt of OPTIONS) {
      await page.evaluate(APPLY, opt);
      await page.waitForTimeout(150);
      await page.locator(`.pane[data-pane=${kind}] .b-po`).first().screenshot({ path: path.join(OUT, `${kind}-${name}-${opt}.png`) });
    }
  }
  await browser.close();
  console.log(`${posters.length * OPTIONS.length} pictures in ${OUT}`);
})();
