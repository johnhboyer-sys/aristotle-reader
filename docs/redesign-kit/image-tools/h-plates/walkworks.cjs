// Visit every work page (both panes, light and dark) and report overflow and errors.
const { chromium } = require('playwright');
const path = require('path');
(async () => {
  const [file, k] = process.argv.slice(2);
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1600, height: 1000 } });
  const errs = [];
  p.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
  p.on('console', (m) => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
  p.on('requestfailed', (r) => errs.push('failed load: ' + r.url().split('/').slice(-3).join('/')));
  await p.goto('file://' + path.resolve(file) + '#' + k + '-home');
  await p.waitForTimeout(1500);
  const ids = await p.evaluate(() => window.U.W.map((w) => w.id));
  for (const theme of ['light', 'dark']) {
    await p.click(`[data-theme-pick="${theme}"]`);
    for (const id of ids) {
      await p.evaluate((h) => { location.hash = h; }, `${k}-work:${id}`);
      await p.waitForTimeout(250);
      const r = await p.evaluate(() => [...document.querySelectorAll('.pane:not([hidden]) .view')].map((v) => {
        const pane = v.closest('.pane').dataset.pane;
        const t = v.querySelector('.h-h1');
        const tp = v.querySelector('.h-tplate-g');
        const info = `${t ? Math.round(parseFloat(getComputedStyle(t).fontSize)) : '-'}${tp ? '/' + Math.round(parseFloat(getComputedStyle(tp).fontSize)) : ''}`;
        return (v.scrollWidth > v.clientWidth + 1 ? `${pane} WIDE ${v.scrollWidth}` : `${pane} ok`) + ` (${info})`;
      }));
      if (theme === 'light') console.log(id.padEnd(8), r.join(' | '));
      else if (r.some((x) => x.includes('WIDE'))) console.log('dark', id, r.join(' | '));
    }
  }
  console.log(errs.length ? [...new Set(errs)].join('\n') : 'no errors');
  await b.close();
})();
