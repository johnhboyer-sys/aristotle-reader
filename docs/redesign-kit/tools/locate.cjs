// Find which direction's page matches each comment's location text.
const { chromium } = require('playwright');
const path = require('path');
(async () => {
  const [file] = process.argv.slice(2);
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1600, height: 1000 } });
  await p.goto('file://' + path.resolve(file) + '#overview'); await p.waitForTimeout(800);
  const norm = (s) => s.replace(/\s+/g, '');
  for (const k of ['b', 'd', 'h', 'p']) {
    await p.click('[data-width="phone"]');
    await p.evaluate((h) => { location.hash = h; }, `${k}-reader`); await p.waitForTimeout(700);
    const head = await p.evaluate(() => { const h = document.querySelector('.pane[data-pane="phone"] [data-sticky]') || document.querySelector('.pane[data-pane="phone"] header'); return h ? h.innerText.replace(/\s+/g, ' ').trim() : ''; });
    const btn = await p.evaluate(() => { const v = document.querySelector('.pane[data-pane="phone"]'); const bs = [...v.querySelectorAll('header button, [data-sticky] button')]; return bs.map((x) => { const cs = getComputedStyle(x); return `${x.innerText.trim() || x.getAttribute('aria-label')}${cs.borderTopWidth !== '0px' && cs.borderTopStyle !== 'none' ? '[box]' : ''}`; }).join(' | '); });
    const search = await p.evaluate(() => { const v = document.querySelector('.pane[data-pane="phone"] [data-sticky]') || document.querySelector('.pane[data-pane="phone"] header'); const s = v && [...v.querySelectorAll('[data-go="search"], [aria-label*="earch"]')].filter((x) => x.offsetParent !== null); return s ? s.length : 0; });
    console.log(`${k} phone reader head: "${head}"  search visible: ${search}\n   buttons: ${btn}`);
    await p.evaluate((h) => { location.hash = h; }, `${k}-work`); await p.waitForTimeout(600);
    const sum = await p.evaluate(() => { const s = document.querySelector('.pane[data-pane="phone"] details summary'); if (!s) return null; const sp = s.querySelector('span'); return { text: s.innerText.replace(/\s+/g, ''), first: sp ? sp.innerText : '', color: sp ? getComputedStyle(sp).color : '' }; });
    console.log(`   work: first book summary ${JSON.stringify(sum)}`);
  }
  await b.close();
})();
