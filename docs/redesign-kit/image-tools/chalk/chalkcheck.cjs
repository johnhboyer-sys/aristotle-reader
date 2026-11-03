// Each logic work in B, both switch settings, both widths: which image file
// loads, did it load, and does the credit name the right holder?
const { chromium } = require('playwright');
const path = require('path');
(async () => {
  const [file] = process.argv.slice(2);
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1600, height: 1000 } });
  const failed = [];
  p.on('requestfailed', (r) => failed.push(r.url()));
  await p.goto('file://' + path.resolve(file) + '#b-home'); await p.waitForTimeout(1500);
  let bad = 0;
  for (const width of ['desktop', 'phone']) {
    await p.click(`[data-width="${width}"]`);
    for (const v of ['~bw~chalk', '~bw~getty', '~printed~chalk', '~printed~getty']) {
      for (const id of ['Cat', 'Int', 'APr', 'APo', 'Top', 'SE', 'Isa']) {
        await p.evaluate((h) => { location.hash = h; }, `b-work:${id}${v}`); await p.waitForTimeout(250);
        const r = await p.evaluate((w) => {
          const pane = document.querySelector(`.pane[data-pane="${w}"]`);
          const img = pane.querySelector('.b-po img');
          const cr = pane.querySelector('.b-cr');
          return { src: img ? img.getAttribute('src') : '', ok: img ? img.complete && img.naturalWidth > 0 : false, holder: cr ? (cr.textContent.match(/(J\. Paul Getty Museum|Het Utrechts Archief)/) || [''])[0] : '' };
        }, width);
        const wantChalk = !v.includes('getty') && ['Int', 'APr', 'Top'].includes(id);
        const isChalk = r.src.includes('/chalk/');
        const wantHolder = wantChalk && id !== 'Top' ? 'Het Utrechts Archief' : 'J. Paul Getty Museum';
        const wantPrinted = v.includes('printed');
        const isPrinted = r.src.includes('printed');
        const ok = r.ok && isChalk === wantChalk && r.holder === wantHolder && isPrinted === wantPrinted;
        if (!ok) { bad++; console.log('BAD', width, id, v, JSON.stringify(r)); }
      }
    }
  }
  console.log(bad ? `${bad} BAD` : 'all 56 logic-work pages load the right picture and credit', failed.length ? `; failed loads: ${failed.slice(0, 5).join(' ')}` : '');
  await b.close();
})();
