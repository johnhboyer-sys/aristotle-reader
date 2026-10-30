// Functional pass over every direction, page, theme and width.
const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1600, height: 1000 } });
  const p = await ctx.newPage();
  const errs = [];
  p.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
  p.on('console', (m) => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
  const url = 'file://' + __dirname + '/test.html';
  const out = [];
  const bad = [];
  await p.goto(url + '#overview', { waitUntil: 'load' });
  await p.waitForTimeout(1500);
  const ov = await p.evaluate(() => ({ visible: !document.getElementById('overview').hidden, text: document.getElementById('overview').innerText.length }));
  out.push(`overview visible=${ov.visible} chars=${ov.text}`);
  for (const dir of ['a', 'b', 'c', 'd']) {
    for (const theme of ['light', 'dark']) {
      for (const width of ['desktop', 'phone']) {
        for (const page of ['home', 'work', 'reader', 'search', 'lexicon']) {
          await p.evaluate(([d, pg, t, w]) => { const S = window.U.S; S.dir = d; S.page = pg; S.theme = t; S.width = w; S.word = null; S.panel = null; S.cmp = null; S.view = 'both'; S.trans = 'ostwald'; window.U.render(); }, [dir, page, theme, width]);
          await p.waitForTimeout(250);
          const r = await p.evaluate(() => {
            const view = document.getElementById('view');
            const frame = document.getElementById('frame');
            const sc = window.U.scroller();
            // Horizontal overflow: any element wider than the frame.
            const fw = frame.getBoundingClientRect();
            let over = 0; let who = '';
            for (const el of view.querySelectorAll('*')) {
              const r = el.getBoundingClientRect();
              if (r.width && (r.right > fw.right + 2 || r.left < fw.left - 2)) {
                const cs = getComputedStyle(el);
                if (cs.position === 'absolute' && el.closest('.a-strip,.d-tl,.b-dist')) continue;
                if (el.closest('[aria-hidden="true"]')) continue;
                over++; if (!who) who = el.className + ' ' + Math.round(r.right - fw.right);
              }
            }
            return { chars: view.innerText.length, sw: sc.scrollWidth, cw: sc.clientWidth, over, who };
          });
          const tag = `${dir} ${page} ${theme} ${width}`;
          if (r.chars < 200 || r.sw > r.cw + 2 || r.over) bad.push(`${tag}: chars=${r.chars} scrollW=${r.sw}/${r.cw} overflow=${r.over} ${r.who}`);
          out.push(`${tag}: ok chars=${r.chars}`);
        }
      }
    }
    // Reader interactions
    await p.evaluate((d) => { const S = window.U.S; S.dir = d; S.page = 'reader'; S.theme = 'light'; S.width = 'desktop'; S.word = null; S.panel = null; S.cmp = null; S.view = 'both'; S.trans = 'ostwald'; window.U.render(); }, dir);
    await p.waitForTimeout(400);
    const t = await p.evaluate(async () => {
      const U = window.U; const S = U.S; const $ = (s) => document.querySelector(s); const res = {};
      const toks = document.querySelectorAll('#view .tok');
      res.tokens = toks.length;
      toks[20].click();
      await new Promise((r) => setTimeout(r, 150));
      res.word = S.word && S.word.t;
      res.sideText = (document.querySelector('#over .side-host, #view [data-side]') || {}).innerText?.slice(0, 60) || '';
      U.stepWord(1); await new Promise((r) => setTimeout(r, 100));
      res.stepped = S.word && S.word.wi;
      const eng0 = (document.querySelector('#view .ep') || {}).textContent?.slice(0, 30);
      U.act('trans:ross'); await new Promise((r) => setTimeout(r, 150));
      res.rossFirst = (document.querySelector('#view .ep') || {}).textContent?.slice(0, 30);
      res.transChanged = eng0 !== res.rossFirst;
      U.act('cmp:rackham'); await new Promise((r) => setTimeout(r, 150));
      res.cmp = S.cmp;
      res.engCols = new Set([...document.querySelectorAll('#view .ep')].map((e) => e.parentElement && e.parentElement.className)).size;
      U.act('cmp:off'); U.act('view:greek'); await new Promise((r) => setTimeout(r, 150));
      res.greekOnlyEng = document.querySelectorAll('#view .ep').length;
      U.act('view:both');
      res.jump = U.goTo('1098a16', true);
      await new Promise((r) => setTimeout(r, 200));
      res.here = S.here;
      res.ticks = document.querySelectorAll('#view .bk').length;
      res.approx = document.querySelectorAll('#view .bk.approx').length;
      res.greekNums = [...document.querySelectorAll('#view [data-cite]')].filter((l) => /\d/.test(l.textContent)).length;
      return res;
    });
    out.push(`${dir} reader: ${JSON.stringify(t)}`);
    if (!t.word || !t.transChanged || !t.jump || t.greekOnlyEng) bad.push(`${dir} reader interactions: ${JSON.stringify(t)}`);
  }
  console.log(out.join('\n'));
  console.log('\nPROBLEMS:\n' + (bad.length ? bad.join('\n') : 'none'));
  console.log('\nERRORS:\n' + (errs.length ? [...new Set(errs)].join('\n') : 'none'));
  await b.close();
})();
