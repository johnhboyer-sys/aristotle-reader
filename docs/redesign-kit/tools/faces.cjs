// B's title faces: check the two switches (hash, click, keys), then report the
// size each face sets a range of titles at, and any title wider than its box.
const { chromium } = require('playwright');
const path = require('path');
(async () => {
  const [file] = process.argv.slice(2);
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1600, height: 1000 } });
  const errs = [];
  p.on('pageerror', (e) => errs.push(e.message));
  await p.goto('file://' + path.resolve(file) + '#b-work:Top~printed~anton');
  await p.waitForTimeout(1500);
  const st = () => p.evaluate(() => ({ hash: location.hash, cls: document.querySelector('.pane .frame').className, photo: U.variant('b'), font: U.variant('b', 'font'), segs: document.querySelectorAll('#var-seg .seg').length }));
  console.log('hash in   ', JSON.stringify(await st()));
  await p.click('#var-seg [data-variant="bebas"]'); await p.waitForTimeout(300);
  console.log('click     ', JSON.stringify(await st()));
  await p.keyboard.press('f'); await p.waitForTimeout(300);
  console.log('key f     ', JSON.stringify(await st()));
  await p.keyboard.press('v'); await p.waitForTimeout(300);
  console.log('key v     ', JSON.stringify(await st()));
  await p.evaluate(() => { location.hash = 'h-work:APo~early'; }); await p.waitForTimeout(500);
  console.log('h early   ', JSON.stringify(await p.evaluate(() => ({ hash: location.hash, v: U.variant('h'), segs: document.querySelectorAll('#var-seg .seg').length }))));
  await p.evaluate(() => document.fonts.ready); await p.waitForTimeout(1500);
  const IDS = ['Cat', 'Int', 'Top', 'EN', 'Phgn', 'Juv', 'MXG', 'GC', 'Sens', 'Mirab'];
  for (const width of ['phone', 'desktop']) {
    await p.click(`[data-width="${width}"]`);
    for (const f of ['r5', 'xc', 'anton', 'oswald', 'bebas', 'shoulders']) {
      const row = [];
      for (const id of IDS) {
        await p.evaluate((h) => { location.hash = h; }, `b-work:${id}~${f}`);
        await p.waitForTimeout(220);
        const r = await p.evaluate((w) => {
          const el = document.querySelector(`.pane[data-pane="${w}"] .b-po-t`);
          if (!el) return null;
          // Measure the letters, not the boxes: each line's text, less the
          // letter spacing after its last letter, against the title's edges.
          const box = el.getBoundingClientRect();
          const sc = box.width / el.clientWidth || 1;
          let worst = 0;
          for (const ln of el.querySelectorAll('.ln')) {
            const r = document.createRange(); r.selectNodeContents(ln);
            const rr = r.getBoundingClientRect();
            const L = parseFloat(ln.style.letterSpacing) || 0;
            worst = Math.max(worst, ((rr.right - box.right) / sc) - L, (box.left - rr.left) / sc);
          }
          const over = worst > 1.5 ? Math.round(worst) : 0;
          return { set: el.dataset.set, n: el.querySelectorAll('.ln').length, over, txt: [...el.querySelectorAll('.ln')].map((x) => x.textContent).join('/') };
        }, width);
        row.push(r ? `${id} ${r.set}${r.over ? ` OVER ${r.over}px` : ''}${r.n > 1 ? ` [${r.txt}]` : ''}` : `${id} -`);
      }
      console.log(width.padEnd(8), f.padEnd(10), row.join(' | '));
    }
  }
  console.log(errs.length ? errs.join('\n') : 'no script errors');
  await b.close();
})();
