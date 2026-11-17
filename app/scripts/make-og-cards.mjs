// Share cards (og:image, 1200×630) in B: the plate's ink on the left, the title on the right.
//   public/og-default.png   the home: the bust, "The complete works of Aristotle", its Greek, John's line
//   public/og/<Work>.jpg    each work: its plate, title, Greek title, and its page's reading line
// The words come from the built work pages, so a card says what its page says:
//   node scripts/make-og-cards.mjs [--base http://127.0.0.1:4321] [--only Cat,EN]
// Fonts load from Google Fonts, as on the site; the run needs the network.
import { chromium } from 'playwright';
import { readFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const app = fileURLToPath(new URL('..', import.meta.url));
const flag = name => { const i = process.argv.indexOf(name); return i > 0 ? process.argv[i + 1] : undefined; };
const base = (flag('--base') || 'https://aristotle.johnhboyer.com').replace(/\/$/, '');
const only = flag('--only')?.split(',');
const plates = JSON.parse(readFileSync(`${app}src/data/plates.json`, 'utf8'));

const HOME = { id: 'home', title: 'The complete works of Aristotle', greek: 'Ἀριστοτέλους ἅπαντα τὰ σῳζόμενα', line: 'Read and search every work in Greek & English.' };
const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');

function card(c) {
  const [x0, y0, x1, y1] = plates[c.id].ink;
  // The plate's ink box, fitted into the left panel.
  const W = 460, H = 470, iw = x1 - x0, ih = y1 - y0, s = Math.min(W / iw, H / ih);
  const dw = iw * s, dh = ih * s;
  const img = readFileSync(`${app}public/plates/desk/${c.id}.jpg`).toString('base64');
  return `<!doctype html><html><head><meta charset="utf-8">
<link href="https://fonts.googleapis.com/css2?family=Oswald:wght@700&family=Literata:opsz,wght@7..72,400&family=Sofia+Sans:wght@600&display=block" rel="stylesheet">
<style>
html,body{margin:0}
.c{width:1200px;height:630px;background:#ebeae4;position:relative;overflow:hidden;color:#141413}
.brand{position:absolute;left:56px;top:34px;font:600 24px "Sofia Sans"}
.pl{position:absolute;left:${56 + (W - dw) / 2}px;top:${92 + (H - dh) / 2}px;width:${dw}px;height:${dh}px;overflow:hidden}
.pl img{position:absolute;left:${-x0 * s}px;top:${-y0 * s}px;width:${1280 * s}px;height:${914 * s}px;mix-blend-mode:multiply}
.tx{position:absolute;left:548px;right:56px;top:92px;height:470px;display:flex;flex-direction:column;justify-content:center}
h1{margin:0;font:700 var(--fs) / .98 Oswald;text-transform:uppercase;letter-spacing:.005em;overflow-wrap:normal}
.gk{margin-top:18px;font:400 var(--gs,34px)/1.2 Literata;color:#b42419}
.ln{margin-top:22px;font:400 var(--ls,26px)/1.3 Literata;white-space:nowrap}
.rule{position:absolute;left:56px;right:56px;top:584px;border-top:2px solid #141413}
.url{position:absolute;right:56px;top:594px;font:600 20px "Sofia Sans";color:#5d5c57}
</style></head><body><div class="c">
<div class="brand">Aristotle Reader</div>
<div class="pl"><img src="data:image/jpeg;base64,${img}"></div>
<div class="tx"><h1>${esc(c.title)}</h1><div class="gk">${esc(c.greek)}</div><div class="ln">${esc(c.line)}</div></div>
<div class="rule"></div><div class="url">aristotle.johnhboyer.com</div>
</div></body></html>`;
}

const browser = await chromium.launch();
const page = await (await browser.newContext({ viewport: { width: 1200, height: 630 } })).newPage();

// The words of each work's card, read from its page.
const ids = Object.keys(plates).filter(id => id !== 'home' && id !== '404' && (!only || only.includes(id)));
const cards = only && !only.includes('home') ? [] : [HOME];
for (const id of ids) {
  await page.goto(`${base}/${id}/`, { waitUntil: 'domcontentloaded' });
  const w = await page.evaluate(() => ({
    title: document.querySelector('h1.b-po-t')?.dataset.title?.trim(),
    greek: document.querySelector('.b-wk-gt')?.textContent.trim(),
    line: document.querySelector('.b-reading-mode')?.textContent.trim(),
  }));
  for (const [k, v] of Object.entries(w)) if (!v) throw Error(`${base}/${id}/ has no ${k} for its card`);
  cards.push({ id, ...w });
}

mkdirSync(`${app}public/og`, { recursive: true });
for (const c of cards) {
  await page.setContent(card(c), { waitUntil: 'networkidle' });
  await page.evaluate(() => document.fonts.ready);
  const fit = await page.evaluate(() => {
    const h = document.querySelector('h1'), box = document.querySelector('.tx'), c = document.querySelector('.c');
    // The largest title (≤ 112px) that fits the column in at most four lines, no word broken.
    let fs = 112;
    for (; fs >= 40; fs -= 2) {
      h.style.setProperty('--fs', fs + 'px');
      const lines = Math.round(h.getBoundingClientRect().height / (fs * 0.98));
      if (h.scrollWidth <= box.clientWidth && lines <= 4 && box.scrollHeight <= box.clientHeight) break;
    }
    // A long Greek title or reading line steps down until it fits on the card.
    const right = c.getBoundingClientRect().right - 56;
    for (const [sel, v, max] of [['.gk', '--gs', 34], ['.ln', '--ls', 26]]) {
      const el = document.querySelector(sel);
      for (let px = max; px >= 18 && (el.scrollWidth > box.clientWidth || el.getBoundingClientRect().right > right); px--) c.style.setProperty(v, px + 'px');
    }
    const over = [...box.children].some(el => el.scrollWidth > box.clientWidth + 1) || box.scrollHeight > box.clientHeight;
    return { fs, over };
  });
  if (fit.over) throw Error(`${c.id}: the words do not fit the card`);
  const path = c.id === 'home' ? `${app}public/og-default.png` : `${app}public/og/${c.id}.jpg`;
  await page.screenshot(c.id === 'home' ? { path } : { path, type: 'jpeg', quality: 88 });
  console.log(`${c.id}  title ${fit.fs}px  ${c.title} · ${c.greek} · ${c.line}`);
}
await browser.close();
console.log(`${cards.length} cards`);
