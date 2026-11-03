// Screenshot design pages of the round mockup at true size (the pane only).
// usage: node shoot.cjs <index.html> <outdir> <spec> [<spec> ...]
// A spec is a hash such as "e-home" or "e-work:Cat", plus flags: "@phone"
// for the phone pane, "@dark", "@max=3000" to cap the height, and
// "@click=<css selector>" (repeatable) to click something first.
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

(async () => {
  const [file, out, ...hashes] = process.argv.slice(2);
  fs.mkdirSync(out, { recursive: true });
  const browser = await chromium.launch();
  for (const spec of hashes) {
    const [hash, ...flags] = spec.split('@');
    const phone = flags.includes('phone');
    const dark = flags.includes('dark');
    const maxf = flags.find((f) => f.startsWith('max='));
    const max = maxf ? +maxf.slice(4) : 6000;
    const page = await browser.newPage({ viewport: { width: phone ? 900 : 1600, height: 1000 }, deviceScaleFactor: 1 });
    await page.goto('file://' + path.resolve(file) + '#' + hash);
    await page.waitForTimeout(400);
    await page.click(`[data-width="${phone ? 'phone' : 'desktop'}"]`);
    if (dark) await page.click('[data-theme-pick="dark"]');
    for (const f of flags.filter((x) => x.startsWith('click='))) { await page.click(f.slice(6)); await page.waitForTimeout(400); }
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(900);
    const box = await page.evaluate(({ phone, max }) => {
      const k = phone ? 'phone' : 'desktop';
      const fig = document.querySelector(`.pane[data-pane="${k}"]`);
      const view = fig.querySelector('.view');
      const w = phone ? 390 : 1440;
      const h = Math.min(max, view.scrollHeight);
      const st = document.createElement('style');
      st.textContent = `.pane[data-pane="${k}"] .frame { transform: none !important; width: ${w}px !important; height: ${h}px !important; }
        .pane[data-pane="${k}"] .pane-box { width: ${w}px !important; height: ${h}px !important; border-radius: 0 !important; box-shadow: none !important; }
        #stage-wrap { height: auto !important; overflow: visible !important; }
        body { overflow: visible !important; } #bar { display: none !important; }`;
      document.head.appendChild(st);
      return { h };
    }, { phone, max });
    await page.waitForTimeout(300);
    const el = await page.$(`.pane[data-pane="${phone ? 'phone' : 'desktop'}"] .pane-box`);
    const name = spec.replace(/[^a-z0-9]+/gi, '_');
    await el.screenshot({ path: path.join(out, name + '.png') });
    console.log(name, box.h);
    await page.close();
  }
  await browser.close();
})();
