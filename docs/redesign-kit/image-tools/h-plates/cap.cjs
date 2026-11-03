const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage();
  console.log('version', b.version());
  const r = await p.evaluate(() => ({
    maskMode: CSS.supports('mask-mode', 'luminance'),
    maskShort: CSS.supports('mask', 'url(a.jpg) luminance center / cover no-repeat'),
    textWrapBalance: CSS.supports('text-wrap', 'balance'),
    containerQ: CSS.supports('container-type', 'inline-size'),
    has: CSS.supports('selector(:has(a))'),
    fontStretch: CSS.supports('font-stretch', '75%'),
  }));
  console.log(JSON.stringify(r));
  await b.close();
})();
