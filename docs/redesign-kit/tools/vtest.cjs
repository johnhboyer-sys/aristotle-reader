const { chromium } = require('playwright');
const path = require('path');
(async () => {
  const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1600, height: 900 } });
  const errs = []; p.on('pageerror', (e) => errs.push(e.message));
  await p.goto('file://' + path.resolve(process.argv[2]) + '#h-work:Cat~early'); await p.waitForTimeout(800);
  const st = async () => p.evaluate(() => ({ hash: location.hash, v: U.variant('h'), cls: document.querySelector('.pane .frame').className, seg: document.querySelector('#var-seg').hidden, btns: [...document.querySelectorAll('#var-seg button')].map((x) => x.textContent + ':' + x.getAttribute('aria-pressed')).join(' ') }));
  console.log('from hash', JSON.stringify(await st()));
  await p.click('#var-seg [data-variant="later"]'); await p.waitForTimeout(300); console.log('click later', JSON.stringify(await st()));
  await p.keyboard.press('v'); await p.waitForTimeout(300); console.log('key v', JSON.stringify(await st()));
  await p.click('[data-page="overview"]'); await p.waitForTimeout(300); console.log('overview', JSON.stringify(await st()));
  console.log(errs.length ? errs.join('\n') : 'no errors'); await b.close();
})();
