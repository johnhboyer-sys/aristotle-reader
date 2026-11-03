// A fresh page on each logic work's link, as the overview opens it: does the
// default setting show the blackboard? (Fresh browser, no carried switches.)
const { chromium } = require('playwright');
const path = require('path');
(async () => {
  const [file] = process.argv.slice(2);
  const b = await chromium.launch();
  let bad = 0;
  for (const id of ['APr', 'Int', 'Top', 'SE']) {
    const p = await b.newPage({ viewport: { width: 1600, height: 1000 } });
    await p.goto('file://' + path.resolve(file) + `#b-work:${id}`); await p.waitForTimeout(1200);
    const src = await p.evaluate(() => document.querySelector('.pane[data-pane="desktop"] .b-po img').getAttribute('src'));
    const want = id !== 'SE';
    const ok = src.includes('/chalk/') === want;
    if (!ok) bad++;
    console.log(ok ? 'ok ' : 'BAD', id, src);
    await p.close();
  }
  console.log(bad ? `${bad} BAD` : 'defaults right');
  await b.close();
})();
