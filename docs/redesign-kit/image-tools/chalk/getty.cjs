// Search the Getty's collection site in a browser and list the results.
// usage: node getty.cjs <query> [<query> ...]
const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1400, height: 1000 } });
  for (const q of process.argv.slice(2)) {
    const api = [];
    p.on('response', async (r) => { if (/data\.getty\.edu|api/.test(r.url()) && /json/.test(r.headers()['content-type'] || '')) api.push(r.url()); });
    await p.goto(`https://www.getty.edu/art/collection/search?q=${encodeURIComponent(q)}&open_content=true`, { waitUntil: 'networkidle', timeout: 90000 }).catch((e) => console.log('goto', e.message));
    await p.waitForTimeout(3000);
    const items = await p.evaluate(() => [...document.querySelectorAll('a[href*="/art/collection/object/"]')].map((a) => ({ href: a.href, text: a.innerText.replace(/\s+/g, ' ').trim().slice(0, 140) })));
    const seen = new Set();
    console.log(`== ${q}: ${items.length} links; api calls: ${api.slice(0, 3).join(' ')}`);
    for (const it of items) { if (seen.has(it.href)) continue; seen.add(it.href); console.log('  ', it.text, '|', it.href.split('/').pop()); }
  }
  await b.close();
})();
