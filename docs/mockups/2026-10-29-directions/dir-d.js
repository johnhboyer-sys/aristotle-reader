/* Direction D · Measure. Swiss: the corpus as measured data. Lengths, counts
   and spans are set as type and as bars on one grid; one sans face at three
   widths sets everything, the Greek included; one signal colour marks where
   you are and what you chose. */
(function () {
  'use strict';
  const U = window.U;
  const { esc, fmt, ROMAN } = U;
  const Dd = (window.T.d = {});

  const I = {
    moon: '<svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><path d="M13.2 10.1A5.6 5.6 0 0 1 5.9 2.8a5.6 5.6 0 1 0 7.3 7.3z" fill="none" stroke="currentColor" stroke-width="1.4"/></svg>',
    search: '<svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><circle cx="6.8" cy="6.8" r="4.6" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M10.4 10.4 14 14" stroke="currentColor" stroke-width="1.5"/></svg>',
    menu: '<svg viewBox="0 0 16 16" width="18" height="18" aria-hidden="true"><path d="M2 4h12M2 8h12M2 12h12" stroke="currentColor" stroke-width="1.6"/></svg>',
    x: '<svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><path d="M3.5 3.5l9 9M12.5 3.5l-9 9" stroke="currentColor" stroke-width="1.6"/></svg>',
    caret: '<svg viewBox="0 0 10 6" width="10" height="6" aria-hidden="true"><path d="M1 1l4 4 4-4" fill="none" stroke="currentColor" stroke-width="1.5"/></svg>',
  };
  const head = (on) => `<header class="d-head">
      <a href="#" class="d-name" data-go="home">Aristotle Reader</a>
      <nav class="d-nav" aria-label="Site">${[['home', 'Works'], ['search', 'Search'], ['lexicon', 'Lexicon'], ['phrases', 'Phrases'], ['support', 'Support']].map(([k, l]) => `<a href="#" ${k === 'phrases' || k === 'support' ? 'data-noop' : `data-go="${k}"`}${on === k ? ' aria-current="page"' : ''}>${l}</a>`).join('')}<button type="button" class="d-ib" data-act="theme" aria-label="Dark or light">${I.moon}</button></nav>
    </header>`;
  const foot = () => `<footer class="d-foot">
      <div><h4>Read</h4><a href="#" data-go="home">Works</a><a href="#" data-go="search">Search</a><a href="#" data-go="lexicon">Lexicon</a><a href="#" data-noop>Phrases</a></div>
      <div><h4>About</h4><a href="#" data-noop>Texts and licences</a><a href="#" data-noop>Desktop app</a><a href="#" data-noop>Report an error</a><a href="#" data-noop>Play a game</a></div>
      <div><h4>The other readers</h4><a href="#" data-noop>Plato</a><a href="#" data-noop>Homer</a><a href="#" data-noop>Greek Drama</a><a href="#" data-noop>Grammata</a></div>
      <div><h4>Support</h4><p>The reader is free to use. A gift keeps it that way.</p><a href="#" class="d-btn sig" data-noop>Make a gift</a></div>
      <p class="d-by">Site by John H. Boyer</p>
    </footer>`;

  // ── Home: the works, measured ────────────────────────────────────────────
  Dd.sort = 'bekker';
  function workRows() {
    const maxP = Math.max(...U.W.map((w) => U.pages(w)));
    const divs = U.divisions();
    if (Dd.sort !== 'bekker') {
      const all = divs.flatMap((d) => d.groups.flatMap((g) => g.works));
      all.sort((a, b) => (Dd.sort === 'len' ? U.pages(b) - U.pages(a) : a.title.localeCompare(b.title)));
      return `<ol class="d-works">${all.map((w) => row(w, maxP)).join('')}</ol>`;
    }
    return divs.map((d) => {
      const ws = d.groups.flatMap((g) => g.works);
      const tot = ws.reduce((n, w) => n + U.pages(w), 0);
      return `<section class="d-div"><header class="d-div-h"><span class="d-num">${d.numeral || '—'}</span><h2>${esc(d.appendix ? 'Doubted and spurious works' : d.title)}</h2><p><b>${fmt(tot)}</b> pages · ${ws.length} work${ws.length === 1 ? '' : 's'}</p></header>
        ${d.groups.map((g) => `${g.label ? `<h3 class="d-sub">${esc(g.label)}</h3>` : ''}<ol class="d-works">${g.works.map((w) => row(w, maxP)).join('')}</ol>`).join('')}</section>`;
    }).join('');
  }
  function row(w, maxP) {
    const p = U.pages(w);
    return `<li><a href="#" data-go="work:${w.id}"><span class="d-wt"><b>${esc(w.title)}</b><span lang="grc">${esc(w.greekTitle || '')}</span></span>
      <span class="d-bar"><i style="width:${((p / maxP) * 100).toFixed(2)}%"></i></span><span class="d-pg">${p}</span>
      <span class="d-wm">${w.books > 1 ? `${w.books} books` : '1 book'}<br>${esc(U.spanText(w, true))}${w.authenticity !== 'genuine' ? '<br><em>spurious</em>' : ''}</span></a></li>`;
  }
  Dd.home = () => `<div class="d-page">${head('home')}
      <section class="d-hero">
        <div class="d-hero-n"><p class="d-huge">${fmt(U.corpusPages())}</p><p class="d-cap">of the 1,462 pages in Bekker’s edition, whose numbers every citation of Aristotle uses. Forty works, in Greek with English beside it.</p></div>
        <div class="d-hero-t">
          <div class="d-field d-big"><label for="d-q">Search Greek or English</label><div><input id="d-q" placeholder="ἀρετή, φύσις, justice" data-search autocomplete="off"><button type="button" class="d-btn" data-go="search">${I.search}</button></div></div>
          <div class="d-field" data-jump-host><label for="d-go">Go to a Bekker line</label><div><input id="d-go" data-jump placeholder="1094a1" autocomplete="off"><button type="button" class="d-btn" data-act="jumpgo">Go</button></div><p class="d-msg" data-jump-msg></p></div>
          <a href="#" class="d-cont" data-go="reader:${U.RESUME.cite}"><span>Continue</span><b>Nicomachean Ethics I.7</b><span class="d-num2">${U.RESUME.cite}</span></a>
        </div>
      </section>
      <section class="d-list">
        <header class="d-list-h"><h2>Works</h2><span class="d-seg" role="group" aria-label="Order">${[['bekker', 'By division'], ['len', 'By length'], ['az', 'A–Z']].map(([k, l]) => `<button type="button" data-act="dsort:${k}" aria-pressed="${Dd.sort === k}">${l}</button>`).join('')}</span><span class="d-key">Bar: length in Bekker pages</span></header>
        <div data-rows>${workRows()}</div>
      </section>
      ${foot()}</div>`;
  Dd.act = (S, a, v, el) => {
    if (a === 'dsort') { Dd.sort = v; const r = U.$('#view [data-rows]'); if (r) r.innerHTML = workRows(); U.$$('#view [data-act^="dsort:"]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.act === a + ':' + v))); }
    if (a === 'msg' && v === 'book') { const m = U.$('#view [data-jump-msg]'); if (m) m.textContent = 'This mockup carries Book I.'; }
    if (a === 'wf') { el.classList.toggle('on'); }
  };

  // ── A work ───────────────────────────────────────────────────────────────
  Dd.work = (S) => {
    const w = U.work(S.workId) || U.work('EN');
    const en = w.id === 'EN';
    const chs = U.chapters(w.id);
    const books = Object.keys(chs).map(Number).sort((a, b) => a - b);
    const trs = w.translations.map((t) => ({ ...t, ...U.transParts(t) }));
    const lens = books.map((n) => { const sp = U.bookSpan(w, n); return sp ? U.citeX(sp[1]) - U.citeX(sp[0]) : 0; });
    const maxL = Math.max(...lens, 0.01);
    const years = trs.map((t) => parseInt(t.year, 10)).filter(Boolean);
    const y0 = Math.min(1800, ...years) - 5;
    const y1 = Math.max(1970, ...years) + 5;
    const yx = (y) => `${(((y - y0) / (y1 - y0)) * 100).toFixed(2)}%`;
    const ticks = [];
    for (let y = Math.ceil(y0 / 25) * 25; y <= y1; y += 25) ticks.push(y);
    const d = U.divisionOf(w.id);
    return `<div class="d-page">${head('')}
      <section class="d-wk">
        <div class="d-wk-t">
          <p class="d-kick">${d ? `${d.numeral ? `${d.numeral} · ` : ''}${esc(d.appendix ? 'Doubted and spurious works' : d.title)}` : 'Commentary'}</p>
          <h1>${esc(w.title)}</h1>
          <p class="d-gt" lang="grc">${esc(w.greekTitle || '')}</p>
          <p class="d-lede">${esc(w.blurb)}</p>
          <p class="d-acts"><a href="#" class="d-btn sig" data-go="reader">Read</a>${en ? `<a href="#" class="d-btn" data-go="reader:${U.RESUME.cite}">Resume ${U.RESUME.cite}</a>` : ''}<a href="#" class="d-btn" data-go="reader:greek">Greek only</a>${trs.length > 1 ? '<a href="#" class="d-btn" data-go="reader:compare">Compare</a>' : ''}</p>
          ${en ? '' : '<p class="d-note">In this mockup the reader opens the <i>Ethics</i>.</p>'}
        </div>
        <dl class="d-facts">
          <div><dt>Books</dt><dd>${w.books}</dd></div>
          <div><dt>Chapters</dt><dd>${U.chapterCount(w.id)}</dd></div>
          <div><dt>Bekker pages</dt><dd>${U.pages(w) || '—'}</dd></div>
          <div><dt>Translations</dt><dd>${trs.length}</dd></div>
          <div class="d-wide"><dt>Bekker span</dt><dd class="d-span">${esc(U.spanText(w))}</dd></div>
        </dl>
      </section>
      <section class="d-sec"><header class="d-sec-h"><h2>${w.books > 1 ? 'Books' : 'Chapters'}</h2><span class="d-key">Bar: length in Bekker pages</span></header>
        <ol class="d-bks">${books.map((n, i) => { const sp = U.bookSpan(w, n); const open = en && n === 1; return `<li class="${open ? 'open' : ''}"><a href="#" data-go="${open ? 'reader' : `work:${w.id}`}"><span class="d-bn">${w.books > 1 ? esc(w.bookLabels[n - 1]) : '—'}</span><span class="d-bar"><i style="width:${((lens[i] / maxL) * 100).toFixed(1)}%"></i></span><span class="d-bm"><b>${chs[n].length}</b> ch.</span><span class="d-bs">${sp ? `${esc(sp[0])}–${esc(sp[1])}` : ''}</span></a>
          ${open ? `<ol class="d-chs">${U.chapterList().map((c) => `<li><a href="#" data-go="reader:${c.bekker.split('–')[0]}"><b>${c.ch}</b><span>${esc(c.title)}</span><small>${esc(c.bekker)}</small></a></li>`).join('')}</ol>` : ''}</li>`; }).join('')}</ol></section>
      <section class="d-sec"><header class="d-sec-h"><h2>Translations</h2><span class="d-key">By year</span></header>
        <div class="d-tl"><div class="d-tl-ax">${ticks.map((y) => `<span style="left:${yx(y)}">${y}</span>`).join('')}</div>
          ${trs.map((t, i) => `<a href="#" class="d-tl-m r${i % 2}" data-go="reader:${t.id}" style="left:${yx(parseInt(t.year, 10) || y0)}"><i></i><b>${esc(t.short)}</b><span>${esc(t.year)}</span></a>`).join('')}</div>
        <table class="d-tab"><thead><tr><th>Translator</th><th>Published</th><th>Year</th><th></th></tr></thead><tbody>${trs.map((t) => `<tr><td>${esc(t.who)}${(w.defaultTranslation || trs[0].id) === t.id ? ' <em>opens first</em>' : ''}</td><td>${esc(t.pub)}</td><td class="d-tn">${esc(t.year)}</td><td><a href="#" data-go="reader:${t.id}">Read →</a></td></tr>`).join('')}</tbody></table>
      </section>
      ${U.further(w.id).length ? `<section class="d-sec"><header class="d-sec-h"><h2>In print</h2></header><ul class="d-print">${U.further(w.id).map((r) => `<li><span>${esc(r.kind)}</span><p>${r.cite}</p></li>`).join('')}</ul></section>` : ''}
      <section class="d-sec"><header class="d-sec-h"><h2>Sources</h2></header><p class="d-p">Greek: ${esc(w.greekSource.full)}<br>Translations: ${trs.map((t) => esc(t.name)).join('; ')}.</p></section>
      ${foot()}</div>`;
  };

  // ── The reader ───────────────────────────────────────────────────────────
  Dd.reader = (S) => `<div class="d-rd" data-body>
      <header class="d-rh" data-sticky>
        <div class="d-rh-row">
          <button type="button" class="d-ib" data-act="panel:toc" aria-label="Contents">${I.menu}</button>
          <a href="#" class="d-rn" data-go="home">Aristotle Reader</a>
          <a href="#" class="d-rw" data-go="work:EN"><span class="d-full">Nicomachean Ethics</span><span class="d-short">Nic. Eth.</span> <b>I</b></a>
          <span class="d-rsp"></span>
          <span class="d-seg d-inv" role="group" aria-label="Reading view">${[['greek', 'Greek'], ['both', 'Both'], ['english', 'English']].map(([v, l]) => `<button type="button" data-act="view:${v}" aria-pressed="${S.view === v}">${l}</button>`).join('')}</span>
          <button type="button" class="d-tsel" data-act="panel:pick" data-keep data-hp="tsel"></button>
          <button type="button" class="d-tb" data-act="cmp:toggle" aria-pressed="${!!S.cmp}">Compare</button>
          <span class="d-rsp2"></span>
          <a href="#" class="d-ib" data-go="search" aria-label="Search">${I.search}</a>
          <a href="#" class="d-tb" data-go="lexicon">Lexicon</a>
          <button type="button" class="d-tb" data-act="panel:aa" data-keep>Aa</button>
          <button type="button" class="d-ib" data-act="theme" aria-label="Dark or light">${I.moon}</button>
        </div>
        <div class="d-prog" data-prog style="--p:0"><i></i><span class="d-pl">Book I · ch. <b data-here-ch>1</b> · <b data-here>1094a1</b></span></div>
      </header>
      <main class="d-text" data-text></main>
    </div>`;
  Dd.hp = { tsel: (S) => `${esc(U.trans(S.trans).short)} <span>${esc(U.trans(S.trans).year)}</span>${S.cmp ? ` + ${esc(U.trans(S.cmp).short)} <span>${esc(U.trans(S.cmp).year)}</span>` : ''} ${I.caret}` };

  Dd.text = (S) => {
    const tr = U.readerTrans(S);
    const cols = S.view === 'greek' ? ['g'] : S.view === 'english' ? tr : ['g', ...tr];
    let html = '';
    const bySeg = [];
    for (const bk of U.BLOCKS) { if (!bySeg[bk.si]) bySeg[bk.si] = []; bySeg[bk.si].push(bk); }
    for (const blocks of bySeg) {
      if (!blocks) continue;
      const col = blocks[0].col;
      const page = col.slice(0, -1);
      const side = col.slice(-1);
      html += `<section class="d-seg-c"><div class="d-mg"><p class="d-colno"><span>${page}</span><b>${side}</b></p></div><div class="d-flow">`;
      for (const bk of blocks) {
        if (bk.start) html += `<div class="d-row d-chh" style="--n:${cols.length}">${cols.map((c, i) => `<div>${i === 0 ? `<p class="d-chn"><b>${esc(bk.chapter)}</b><span>${esc(bk.bekker)}</span></p>` : ''}${c === 'ostwald' && U.TITLES[bk.chapter] ? `<p class="d-ott">${esc(U.TITLES[bk.chapter])}</p>` : ''}</div>`).join('')}</div>`;
        html += `<div class="d-row" style="--n:${cols.length}">${cols.map((c) => (c === 'g'
          ? `<div class="d-gc" lang="grc">${bk.lines.map((L) => `<div class="d-gl${L.cont ? ' cont' : ''}"${L.cont ? '' : ` data-cite="${bk.col}${L.n}"`}><span class="d-ln">${!L.cont && U.showNum(L.n) ? L.n : ''}</span><span class="d-lt">${U.lineHTML(bk, L)}</span></div>`).join('')}</div>`
          : `<div class="d-ec">${cols.length > 2 || (S.view === 'english' && tr.length > 1) ? '' : ''}${U.engHTML(bk, c)}</div>`)).join('')}</div>`;
      }
      html += '</div></section>';
    }
    if (tr.length > 1 && S.view !== 'greek') html = `<div class="d-row d-names" style="--n:${cols.length}">${cols.map((c) => `<p>${c === 'g' ? 'Greek · Bywater 1894' : `${esc(U.trans(c).short)} ${esc(U.trans(c).year)}`}</p>`).join('')}</div>` + html;
    return html;
  };

  // The word sidebar as a table of features.
  Dd.side = (S) => {
    if (!S.word) return '';
    const cards = U.cards(S.word.k);
    return `<aside class="d-side" role="dialog" aria-label="Word: ${esc(S.word.t)}">
      <div class="d-side-h"><p class="d-sw" lang="grc">${esc(S.word.t)}</p><p class="d-sloc">${esc(S.word.cite)}</p><button type="button" class="d-ib d-x" data-act="close:word" aria-label="Close">${I.x}</button></div>
      <div class="d-side-b">${cards.map((c, i) => { const f = U.features(c.rows[0] ? c.rows[0].text : ''); return `<section class="d-card">
        <p class="d-cn">${cards.length > 1 ? `${i + 1} of ${cards.length}` : 'Analysis'}</p>
        <table class="d-ftab"><tbody>
          <tr><th>Lemma</th><td lang="grc" class="d-lem">${esc(c.head)}${c.hom ? ` <small>${esc(c.hom)}</small>` : ''}</td></tr>
          ${c.gloss ? `<tr><th>Gloss</th><td>${esc(c.gloss)}</td></tr>` : ''}
          ${Object.entries(f).map(([k, v]) => `<tr><th>${k[0].toUpperCase() + k.slice(1)}</th><td>${esc(v)}</td></tr>`).join('')}
          ${c.rows.length > 1 ? `<tr><th>Also</th><td>${c.rows.slice(1).map((r) => esc(U.longParse(r.text))).join('<br>')}</td></tr>` : ''}
          ${c.rows.some((r) => r.dialect) ? `<tr><th>Dialect</th><td>${esc(c.rows.find((r) => r.dialect).dialect)}</td></tr>` : ''}
        </tbody></table>
        ${c.ref ? `<a href="#" class="d-freq" data-go="lexicon:${esc(c.ref.slug)}"><b>${fmt(c.ref.count)}</b><span>places in Aristotle →</span></a>` : ''}
        ${c.lsj ? `<button type="button" class="d-btn d-lsj" data-act="card:${esc(c.id)}" aria-expanded="${S.card === c.id}">${S.card === c.id ? 'Hide' : 'Show'} the LSJ entry</button>` : ''}
        ${S.card === c.id ? U.t8(c.lsj) : ''}
      </section>`; }).join('') || '<p>No analysis for this form.</p>'}
      <p class="d-steps"><button type="button" data-act="step:-1">← Previous word</button><button type="button" data-act="step:1">Next word →</button></p></div>
    </aside>`;
  };

  Dd.note = (S) => {
    if (!S.fn) return '';
    const at = S.fnAt || { x: 800, y: 300 };
    return `<div class="d-pop" style="left:${Math.max(12, Math.min(at.x - 30, 1440 - 400))}px;top:${at.y + 8}px" role="note"><p class="d-cn">Ostwald, note ${esc(S.fn.split('.')[1])}</p><p>${U.footnote(S.fn)}</p><button type="button" class="d-ib d-x" data-act="close:fn" aria-label="Close">${I.x}</button></div>`;
  };

  Dd.panel = (S) => {
    const at = S.panelAt || { x: 20, y: 80, r: 20 };
    if (S.panel === 'toc') {
      return `<aside class="d-toc" aria-label="Contents"><div class="d-toc-h"><a href="#" data-go="home">All works</a><button type="button" class="d-ib" data-act="close:panel" aria-label="Close">${I.x}</button></div>
        <p class="d-toc-t">Nicomachean Ethics</p>
        <div class="d-field" data-jump-host><label for="d-toc-go">Go to</label><div><input id="d-toc-go" data-jump placeholder="1097a15"><button type="button" class="d-btn" data-act="jumpgo">Go</button></div><p class="d-msg" data-jump-msg></p></div>
        <ol class="d-toc-l">${U.bookList().map((b) => `<li><a href="#" ${b.b === 1 ? 'data-act="ch:1"' : 'data-act="msg:book"'} class="d-tb2"><b>${ROMAN[b.b]}</b><span class="d-bar"><i style="width:${(((U.citeX(b.last) - U.citeX(b.first)) / 11) * 100).toFixed(1)}%"></i></span><small>${b.n} ch.</small></a>${b.b === 1 ? `<ol>${U.chapterList().map((c) => `<li><a href="#" data-act="ch:${c.ch}" data-ch-link="${c.ch}"><b>${c.ch}</b><span>${esc(c.title)}</span><small>${esc(c.bekker)}</small></a></li>`).join('')}</ol>` : ''}</li>`).join('')}</ol></aside>`;
    }
    if (S.panel === 'pick') {
      return `<div class="d-menu" style="left:${at.x}px;top:${at.y + 6}px"><p class="d-cn">Translation</p>${U.EN_TRANS.map((t) => `<button type="button" data-act="trans:${t.id}" aria-pressed="${S.trans === t.id}"><b>${esc(t.year)}</b><span>${esc(t.short)}</span><small>${esc(t.pub)}</small></button>`).join('')}<p class="d-cn">Compare with</p>${U.EN_TRANS.filter((t) => t.id !== S.trans).map((t) => `<button type="button" data-act="cmp:${t.id}" aria-pressed="${S.cmp === t.id}"><b>${esc(t.year)}</b><span>${esc(t.short)}</span></button>`).join('')}<button type="button" data-act="cmp:off" aria-pressed="${!S.cmp}"><b>—</b><span>No comparison</span></button></div>`;
    }
    if (S.panel === 'aa') {
      const sl = (k, label, min, max) => `<label class="d-sl"><span>${label}</span><output>${Math.round(S[k] * 100)}%</output><input type="range" min="${min}" max="${max}" step="0.05" value="${S[k]}" data-range="${k}"></label>`;
      return `<div class="d-menu d-aa" style="right:${at.r - 10}px;top:${at.y + 6}px"><span class="d-seg d-ph" role="group" aria-label="Reading view">${[['greek', 'Greek'], ['both', 'Both'], ['english', 'English']].map(([v, l]) => `<button type="button" data-act="view:${v}" aria-pressed="${S.view === v}">${l}</button>`).join('')}</span>${sl('fs', 'Text size', 0.8, 1.4)}${sl('lh', 'Line spacing', 0.85, 1.4)}${sl('cw', 'Column width', 0.75, 1.3)}<label class="d-chk"><input type="checkbox" checked> Add the citation when I copy Greek</label><p class="d-aaf"><button type="button" class="d-btn" data-noop>Print</button><button type="button" class="d-btn" data-act="reset">Reset</button></p></div>`;
    }
    return '';
  };

  // ── Search ───────────────────────────────────────────────────────────────
  Dd.search = (S) => {
    const R = U.search;
    const max = Math.max(...R.works.map((x) => x.count));
    const en = R.groups.find((g) => g.work === 'EN');
    const b1 = en.books.find((b) => b.book === 1);
    return `<div class="d-page">${head('search')}
      <section class="d-sq">
        <div class="d-field d-big"><label for="d-sq">Greek</label><div><input id="d-sq" value="${esc(R.q)}" lang="grc"><button type="button" class="d-btn sig">Search</button></div></div>
        <div class="d-field"><label for="d-se">English</label><div><input id="d-se" placeholder="virtue, excellence"></div></div>
        <dl class="d-opts"><div><dt>Form</dt><dd>Any form of the word</dd></div><div><dt>Accents</dt><dd>Ignored</dd></div><div><dt>Words</dt><dd>All of them</dd></div><div><dt>English</dt><dd>Every translation</dd></div><div><dt>Works</dt><dd>All 41</dd></div><div><dt>More</dt><dd><a href="#" data-noop>Wildcards, grammar, nearness</a></dd></div></dl>
      </section>
      <section class="d-sr">
        <div class="d-sr-n"><p class="d-huge2">${fmt(R.count)}</p><p>places in <b>${R.works.length}</b> works <a href="#" data-noop>Export CSV</a></p></div>
        <ol class="d-dist">${R.works.map((x) => `<li><button type="button" data-act="wf:${x.work}"${x.work === 'EN' ? ' class="on"' : ''}><span class="d-wt2">${esc(x.title)}</span><span class="d-bar"><i style="width:${((x.count / max) * 100).toFixed(1)}%"></i></span><b>${x.count}</b></button></li>`).join('')}</ol>
      </section>
      <section class="d-sec"><header class="d-sec-h"><h2>Nicomachean Ethics <small>Book I · ${b1.chapters.reduce((n, c) => n + c.hits.length, 0)} of ${en.count}</small></h2></header>
        <table class="d-hits"><thead><tr><th>Bekker</th><th>Greek</th><th>Ross 1908</th></tr></thead><tbody>
          ${b1.chapters.map((c) => `<tr class="d-hch"><td colspan="3">Chapter ${esc(c.chapter)} <span>${esc(c.bekker)}</span></td></tr>${(() => { let last = ''; return c.hits.map((h) => { const win = U.hitWindow(h.cite, h.form); const e = U.engAt(h.cite, 'ross', 170); const same = e === last; last = e; return `<tr><td><a href="#" data-go="reader:${h.cite}">${h.cite}</a></td><td lang="grc">${win ? win.find((l) => l.here).html : esc(h.form)}</td><td>${same ? '<span class="d-mid">same passage</span>' : esc(e)}</td></tr>`; }).join(''); })()}`).join('')}
        </tbody></table></section>
      ${foot()}</div>`;
  };

  // ── Lexicon ──────────────────────────────────────────────────────────────
  Dd.lexicon = (S) => {
    const L = U.lemmaPage(S.lex) || U.lemmaPage('arete');
    const dz = L.distinctiveness;
    const wmax = Math.max(...L.byWork.map((x) => x.count));
    const cmp = dz ? [['Before Aristotle', dz.before_aristotle], ['Aristotle', dz.in_aristotle], ['His contemporaries', dz.contemporary]] : [];
    const cmax = Math.max(...cmp.map((x) => x[1]), 1);
    return `<div class="d-page">${head('lexicon')}
      <section class="d-lx">
        <div><p class="d-kick">Lexicon · ${fmt(U.LEMMA_TOTAL)} words</p><h1 class="d-lxw" lang="grc">${esc(L.head)}</h1><p class="d-lede">${esc((L.glosses || []).join('; '))}</p></div>
        <div class="d-lx-n"><p class="d-huge2">${fmt(L.count)}</p><p>places in Aristotle, in ${L.byWork.length} works</p></div>
      </section>
      ${cmp.length ? `<section class="d-sec"><header class="d-sec-h"><h2>Who uses it</h2><span class="d-key">Places, by when the author wrote</span></header><ol class="d-cmp">${cmp.map(([k, n]) => `<li class="${k === 'Aristotle' ? 'me' : ''}"><span>${k}</span><span class="d-bar"><i style="width:${((n / cmax) * 100).toFixed(1)}%"></i></span><b>${fmt(n)}</b></li>`).join('')}</ol></section>` : ''}
      <section class="d-sec"><header class="d-sec-h"><h2>By work</h2></header><ol class="d-dist d-dist2">${L.byWork.map((x) => `<li><a href="#" data-go="work:${x.work}"><span class="d-wt2">${esc(x.title)}</span><span class="d-bar"><i style="width:${((x.count / wmax) * 100).toFixed(1)}%"></i></span><b>${x.count}</b></a></li>`).join('')}</ol></section>
      <section class="d-sec d-two"><div><header class="d-sec-h"><h2>Dictionary</h2><span class="d-key">LSJ</span></header>${U.t8(L.key)}</div><div><header class="d-sec-h"><h2>Bonitz</h2></header><p class="d-p">Bonitz’s <i>Index Aristotelicus</i> entry, with the places he picks out for each sense, appears here once the transcription reaches this word.</p>
        <header class="d-sec-h"><h2>Places</h2></header>${L.instancesByWork.slice(0, 2).map((g) => `<p class="d-pl"><b>${esc(g.title)}</b> ${g.books[0].chapters.slice(0, 4).flatMap((c) => c.instances).slice(0, 12).map((i) => `<a href="#" ${g.work === 'EN' && g.books[0].book === 1 ? `data-go="reader:${i[0]}${i[1]}"` : 'data-noop'}>${i[0]}${i[1]}</a>`).join(' ')} …</p>`).join('')}</div></section>
      ${foot()}</div>`;
  };
})();
