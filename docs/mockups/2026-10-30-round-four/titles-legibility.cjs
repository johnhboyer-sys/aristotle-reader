// Pictures for the legibility measure (titles-legibility.py): every poster
// of the titles page in Now and Bigger block, desktop and phone, under each
// photo treatment, shot three ways: as shown (w), without its title (g), and
// its title alone on plain ground (m, which finds the letters even where they
// vanish into the photograph). Writes title-legibility/ (gitignored). Needs
// Playwright, titles.py run, and a local server serving this folder
// (python3 -m http.server 8765; or set BASE).
//   node docs/mockups/2026-10-30-round-four/titles-legibility.cjs
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const BASE = process.env.BASE || 'http://localhost:8765/';
const OUT = path.join(__dirname, 'title-legibility');
const TREATS = ['now', 'pale', 'gray', 'dark'];
const SETTINGS = ['now', 'block-big'];
const SIZES = ['desk', 'phone'];

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
  await page.goto(`${BASE}titles-test.html`, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => document.documentElement.dataset.titles === 'set', null, { timeout: 60000 });
  await page.evaluate(() => { const st = document.createElement('style'); st.id = 'lg'; document.head.appendChild(st); });
  const style = (css) => page.evaluate((c) => { document.getElementById('lg').textContent = c; }, css);
  const click = async (sel) => { await page.click(sel); await page.waitForTimeout(80); };
  await page.selectOption('#po-sel', 'all');
  let n = 0;
  for (const size of SIZES) {
    await click(`[data-size-b="${size}"]`);
    for (const set of SETTINGS) {
      await click(`[data-set-b="${set}"]`);
      const posters = page.locator(`.it:not([hidden]) .po.${size}`);
      const ids = await page.evaluate((c) => [...document.querySelectorAll(`.it:not([hidden]) .po.${c}`)].map((po) => po.closest('.it').dataset.po), size);
      const shoot = async (dir, tag) => {
        fs.mkdirSync(path.join(OUT, dir), { recursive: true });
        for (let i = 0; i < ids.length; i++) {
          await posters.nth(i).screenshot({ path: path.join(OUT, dir, `${size}-${set}-${ids[i]}-${tag}.png`) });
          n++;
        }
      };
      await click('[data-tr-b="now"]');
      await style('.po img { visibility: hidden !important; } .po::after { opacity: 0 !important; } .po-t { color: #000 !important; opacity: 1 !important; }');
      await shoot('mask', 'm');
      for (const tr of TREATS) {
        await click(`[data-tr-b="${tr}"]`);
        await style('');
        await shoot(tr, 'w');
        await style('.po-t { visibility: hidden !important; }');
        await shoot(tr, 'g');
      }
      await style('');
    }
  }
  await browser.close();
  console.log(`${n} pictures in ${OUT}`);
})();
