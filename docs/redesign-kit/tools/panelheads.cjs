// Shoot the top of the word sidebar and the contents drawer in each direction.
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
(async () => {
  const [file, out, dirs] = process.argv.slice(2);
  fs.mkdirSync(out, { recursive: true });
  const b = await chromium.launch();
  for (const width of ['desktop', 'phone']) {
    const p = await b.newPage({ viewport: { width: width === 'phone' ? 900 : 1600, height: 1000 }, deviceScaleFactor: 2 });
    await p.goto('file://' + path.resolve(file) + '#overview'); await p.waitForTimeout(700);
    await p.click(`[data-width="${width}"]`);
    for (const k of dirs.split(',')) {
      await p.evaluate((h) => { location.hash = h; }, `${k}-reader`); await p.waitForTimeout(600);
      await p.evaluate((w) => {
        const kk = w;
        let st = document.getElementById('shotfix');
        if (!st) { st = document.createElement('style'); st.id = 'shotfix'; document.head.appendChild(st); }
        st.textContent = `.pane[data-pane="${kk}"] .frame { transform: none !important; } .pane[data-pane="${kk}"] .pane-box { width: ${kk === 'phone' ? 390 : 1440}px !important; height: ${kk === 'phone' ? 844 : 900}px !important; } #stage-wrap { height: auto !important; overflow: visible !important; } body { overflow: visible !important; }`;
      }, width);
      await p.waitForTimeout(200);
      const P = `.pane[data-pane="${width}"]`;
      // word sidebar
      const tok = await p.$(`${P} .tok[data-w="2"]`);
      if (tok) { await tok.evaluate((e) => e.click()); await p.waitForTimeout(500); }
      const side = await p.$(`${P} .side-host`) || await p.$(`${P} [data-side]`);
      if (side) {
        const bb = await side.boundingBox();
        await p.screenshot({ path: path.join(out, `${k}_side_${width}.png`), clip: { x: bb.x, y: bb.y, width: bb.width, height: Math.min(150, bb.height) } });
      }
      const x = await p.$(`${P} [data-act="close:word"]`); if (x) { await x.evaluate((e) => e.click()); await p.waitForTimeout(300); }
      // contents drawer
      const toc = await p.$(`${P} [data-act="panel:toc"]`);
      if (toc) { await toc.evaluate((e) => e.click()); await p.waitForTimeout(500); }
      const host = await p.$(`${P} .over .panel-host`);
      if (host) {
        const first = await host.$(':scope > *');
        const bb = await (first || host).boundingBox();
        await p.screenshot({ path: path.join(out, `${k}_toc_${width}.png`), clip: { x: bb.x, y: bb.y, width: Math.min(bb.width, width === 'phone' ? 390 : 520), height: Math.min(120, bb.height) } });
      }
      const c = await p.$(`${P} .over [data-act="close:panel"]`); if (c) { await c.evaluate((e) => e.click()); await p.waitForTimeout(300); }
    }
    await p.close();
  }
  await b.close();
  console.log('done');
})();
