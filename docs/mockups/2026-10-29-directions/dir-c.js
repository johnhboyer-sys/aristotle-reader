/* Direction C · Axis. A parallel text, made into the site's structure: one
   centre line runs down every page, the Greek set to its left and the English
   to its right. Each text keeps its own Bekker numbers on its own side. */
(function () {
  'use strict';
  const U = window.U;
  const { esc, fmt, ROMAN, GNUM } = U;
  const C = (window.T.c = {});

  const I = {
    search: '<svg viewBox="0 0 16 16" width="15" height="15" aria-hidden="true"><circle cx="6.8" cy="6.8" r="4.6" fill="none" stroke="currentColor" stroke-width="1.2"/><path d="M10.4 10.4 14 14" stroke="currentColor" stroke-width="1.2"/></svg>',
    moon: '<svg viewBox="0 0 16 16" width="15" height="15" aria-hidden="true"><path d="M13.2 10.1A5.6 5.6 0 0 1 5.9 2.8a5.6 5.6 0 1 0 7.3 7.3z" fill="none" stroke="currentColor" stroke-width="1.2"/></svg>',
    menu: '<svg viewBox="0 0 16 16" width="17" height="17" aria-hidden="true"><path d="M2 4.5h12M2 8h12M2 11.5h12" stroke="currentColor" stroke-width="1.2"/></svg>',
    x: '<svg viewBox="0 0 16 16" width="15" height="15" aria-hidden="true"><path d="M3.5 3.5l9 9M12.5 3.5l-9 9" stroke="currentColor" stroke-width="1.2"/></svg>',
    caret: '<svg viewBox="0 0 10 6" width="9" height="6" aria-hidden="true"><path d="M1 1l4 4 4-4" fill="none" stroke="currentColor" stroke-width="1.2"/></svg>',
  };
  const nav = (on) => `<header class="c-nav">
      <div class="c-l"><a href="#" class="c-gname" data-go="home" lang="grc">Ἀριστοτέλης</a></div>
      <div class="c-r"><a href="#" class="c-ename" data-go="home">The Aristotle Reader</a>
        <nav class="c-links" aria-label="Site">${[['home', 'Works'], ['search', 'Search'], ['lexicon', 'Lexicon'], ['phrases', 'Phrases']].map(([k, l]) => `<a href="#" ${k === 'phrases' ? 'data-noop' : `data-go="${k}"`}${on === k ? ' aria-current="page"' : ''}>${l}</a>`).join('')}<button type="button" class="c-ib" data-act="theme" aria-label="Dark or light">${I.moon}</button></nav></div>
    </header>`;
  const foot = () => `<footer class="c-foot c-pair"><div class="c-l"><a href="#" data-noop>Texts and licences</a><a href="#" data-noop>Support</a><a href="#" data-noop>Desktop app</a><a href="#" data-noop>Report an error</a></div><div class="c-r"><a href="#" data-noop>The Plato Reader</a><a href="#" data-noop>The Homer Reader</a><a href="#" data-noop>The Greek Drama Reader</a><a href="#" data-noop>Grammata</a><span>Site by John H. Boyer</span></div></footer>`;
  const pair = (l, r, cls = '') => `<div class="c-pair ${cls}"><div class="c-l">${l}</div><div class="c-r">${r}</div></div>`;

  // ── Home ─────────────────────────────────────────────────────────────────
  C.home = () => {
    const divs = U.divisions();
    return `<div class="c-page">${nav('home')}
      <section class="c-mast">
        ${pair('<h1 class="c-h1" lang="grc">Ἀριστοτέλους ἅπαντα</h1>', '<p class="c-h1 c-h1e">The complete works</p>')}
        <form class="c-pair c-qs" onsubmit="return false">
          <div class="c-l"><label class="c-lab" for="c-qg">Search the Greek</label><input id="c-qg" class="c-in" lang="grc" placeholder="ἀρετή, φύσις" data-search></div>
          <div class="c-r"><label class="c-lab" for="c-qe">Search the English</label><input id="c-qe" class="c-in" placeholder="virtue, nature" data-search></div>
        </form>
        <div class="c-axisbox" data-jump-host><label for="c-go">Go to</label><input id="c-go" data-jump placeholder="1094a1" autocomplete="off"><p class="c-msg" data-jump-msg></p></div>
        <p class="c-cont"><a href="#" data-go="reader:${U.RESUME.cite}">Continue the <i>Nicomachean Ethics</i> at I.7, ${U.RESUME.cite} →</a></p>
      </section>
      ${divs.map((d) => {
        const ws = d.groups.flatMap((g) => g.works);
        const sp = ws.filter((w) => U.workSpan(w));
        const span = d.appendix ? '' : `${U.parseCite(U.workSpan(sp[0]).first).col}–${U.parseCite(U.workSpan(sp[sp.length - 1]).last).col}`;
        return `<section class="c-div">
          ${pair(`<p class="c-dn"><span>${esc(span)}</span><b>${d.numeral || '·'}</b></p>`, `<h2 class="c-dt">${esc(d.appendix ? 'Works of doubted authorship' : d.title)}</h2>`, 'c-dh')}
          ${d.groups.map((g) => `${g.label ? pair('', `<h3 class="c-sub2">${esc(g.label)}</h3>`) : ''}
            <ul class="c-list">${g.works.map((w) => `<li><a href="#" data-go="work:${w.id}" class="c-pair c-row"><span class="c-l"><span class="c-gt" lang="grc">${esc(w.greekTitle || '')}</span></span><span class="c-r"><span class="c-et">${esc(w.title)}</span><span class="c-meta">${w.books > 1 ? `${w.books} books · ` : ''}${esc(U.spanText(w))}${w.authenticity !== 'genuine' ? ' · <i>spurious</i>' : ''}</span></span></a></li>`).join('')}</ul>`).join('')}
        </section>`;
      }).join('')}
      ${foot()}</div>`;
  };

  // ── A work ───────────────────────────────────────────────────────────────
  C.work = (S) => {
    const w = U.work(S.workId) || U.work('EN');
    const en = w.id === 'EN';
    const chs = U.chapters(w.id);
    const books = Object.keys(chs).map(Number).sort((a, b) => a - b);
    const trs = w.translations.map((t) => ({ ...t, ...U.transParts(t) }));
    const first = en ? U.BLOCKS[0].lines.slice(0, 2).map((L) => U.lineHTML(U.BLOCKS[0], L)).join(' ').replace(/(δοκεῖ<\/span>·).*$/s, '$1') : '';
    const fr = U.further(w.id);
    return `<div class="c-page">${nav('')}
      <section class="c-wh">
        ${pair(`<h1 class="c-wg" lang="grc">${esc(w.greekTitle || '')}</h1>`, `<p class="c-we">${esc(w.title)}</p>`)}
        ${pair(`<div class="c-gside">${en ? `<p class="c-first" lang="grc">${first}</p><p class="c-ref">1094a1–2</p>` : ''}<dl class="c-facts"><dt>Greek text</dt><dd>${esc(w.greekSource.short)}</dd><dt>${U.isBekker(w) ? 'Bekker' : 'Busse'}</dt><dd>${esc(U.spanText(w))}</dd>${U.pages(w) ? `<dt>Pages</dt><dd>${U.pages(w)}</dd>` : ''}</dl></div>`,
          `<div class="c-eside"><p class="c-blurb">${esc(w.blurb)}${w.authenticity !== 'genuine' ? ' <i>Spurious: transmitted with Aristotle’s works but not by him.</i>' : ''}</p>
            <p class="c-acts"><a href="#" class="c-read" data-go="reader">Read the ${esc(w.title.replace(/^(On |De )/, (m) => m))} →</a></p>
            <p class="c-acts2">${en ? `<a href="#" data-go="reader:${U.RESUME.cite}">Resume at ${U.RESUME.cite}</a>` : ''}<a href="#" data-go="reader:greek">Greek only</a>${trs.length > 1 ? '<a href="#" data-go="reader:compare">Compare two translations</a>' : ''}</p>
            ${en ? '' : '<p class="c-note">In this mockup the reader opens the <i>Ethics</i>.</p>'}</div>`)}
      </section>
      <section class="c-sec">
        ${pair('<h2 class="c-sh">Books</h2>', '<h2 class="c-sh"><span class="c-hide">Books</span></h2>')}
        <ul class="c-list c-books">${books.map((n) => { const sp = U.bookSpan(w, n); return `<li><a href="#" class="c-pair c-row" data-go="${en && n === 1 ? 'reader' : `work:${w.id}`}"><span class="c-l"><span class="c-bs">${sp ? `${esc(sp[0])}–${esc(sp[1])}` : ''}</span><span class="c-gn" lang="grc">${w.books > 1 ? GNUM[n] || n : ''}</span></span><span class="c-r"><span class="c-et">${w.books > 1 ? `Book ${esc(w.bookLabels[n - 1])}` : 'The treatise'}</span><span class="c-meta">${chs[n].length} chapter${chs[n].length === 1 ? '' : 's'}</span></span></a></li>`; }).join('')}</ul>
      </section>
      <section class="c-sec">
        ${pair('<h2 class="c-sh">The Greek</h2>', '<h2 class="c-sh">The English</h2>')}
        ${pair(`<p class="c-txt">${esc(w.greekSource.full)}</p><p class="c-txt c-mid">Greek line numbers are Bekker’s, exact to the line.</p>`, `<ul class="c-trs">${trs.map((t) => `<li><a href="#" data-go="reader:${t.id}"><b>${esc(t.who)}</b><span>${esc(t.pub)}, ${esc(t.year)}</span>${(w.defaultTranslation || trs[0].id) === t.id ? '<em>opens first</em>' : ''}</a></li>`).join('')}</ul><p class="c-txt c-mid">Each translation keeps its own Bekker numbers, aligned to the Greek: upright where fixed, italic where estimated.</p>`)}
      </section>
      ${fr.length ? `<section class="c-sec">${pair('<h2 class="c-sh">In print</h2>', `<ul class="c-print">${fr.map((r) => `<li>${r.cite}</li>`).join('')}</ul>`)}</section>` : ''}
      ${foot()}</div>`;
  };

  // ── The reader ───────────────────────────────────────────────────────────
  C.reader = (S) => `<div class="c-rd" data-body>
      <header class="c-rh" data-sticky>
        <div class="c-pair c-rh1">
          <div class="c-l"><button type="button" class="c-ib c-menu" data-act="panel:toc" aria-label="Contents">${I.menu}</button><a href="#" class="c-rg" data-go="work:EN" lang="grc">Ἠθικὰ Νικομάχεια <b>Α</b></a></div>
          <div class="c-r"><a href="#" class="c-re" data-go="work:EN">Nicomachean Ethics <b>I</b></a>
            <span class="c-tools"><a href="#" data-go="search" aria-label="Search" title="Search">${I.search}</a><a href="#" data-go="lexicon" title="Lexicon">Lexicon</a><button type="button" class="c-ib" data-act="panel:aa" data-keep aria-label="Text settings">Aa</button><button type="button" class="c-ib" data-act="theme" aria-label="Dark or light">${I.moon}</button></span></div>
        </div>
        <div class="c-pair c-rh2" data-hp="heads"></div>
      </header>
      <main class="c-text" data-text></main>
    </div>`;
  C.hp = {
    heads: (S) => {
      const g = `<div class="c-l"><span class="c-vw" role="group" aria-label="Reading view">${[['greek', 'Greek'], ['both', 'Both'], ['english', 'English']].map(([v, l]) => `<button type="button" data-act="view:${v}" aria-pressed="${S.view === v}">${l}</button>`).join('')}</span><span class="c-src">Bywater 1894 · <span class="c-here" data-here>1094a1</span></span></div>`;
      const tabs = S.cmp
        ? `<span class="c-pk"><button type="button" data-act="panel:pickL" data-keep>${esc(U.trans(S.trans).short)} ${esc(U.trans(S.trans).year)} ${I.caret}</button><span class="c-amp">and</span><button type="button" data-act="panel:pickR" data-keep>${esc(U.trans(S.cmp).short)} ${esc(U.trans(S.cmp).year)} ${I.caret}</button><button type="button" class="c-tab c-cmpx" data-act="cmp:off">One translation</button></span>`
        : `<span class="c-tabs" role="group" aria-label="Translation">${U.EN_TRANS.map((t) => `<button type="button" class="c-tab" data-act="trans:${t.id}" aria-pressed="${S.trans === t.id}">${esc(t.short)} <span>${esc(t.year)}</span></button>`).join('')}<button type="button" class="c-tab c-cmp" data-act="cmp:on">+ Compare</button></span>`;
      return `${g}<div class="c-r">${tabs}</div>`;
    },
  };

  C.text = (S) => {
    const tr = U.readerTrans(S);
    const showG = S.view !== 'english';
    const showE = S.view !== 'greek';
    let html = '';
    let lastSi = -1;
    const ecols = showE ? tr : [];
    for (const bk of U.BLOCKS) {
      const segStart = bk.si !== lastSi;
      lastSi = bk.si;
      if (bk.start) {
        html += `<div class="c-rrow c-chh">${showG ? `<div class="c-gcol"><p class="c-chb">${esc(bk.bekker)}</p></div>` : ''}${showE ? `<div class="c-ecols" style="--n:${ecols.length}">${ecols.map((c) => `<div><p class="c-chn">Chapter ${esc(bk.chapter)}${c === 'ostwald' && U.TITLES[bk.chapter] ? `<i>${esc(U.TITLES[bk.chapter])}</i>` : ''}</p></div>`).join('')}</div>` : ''}</div>`;
      }
      if (segStart) html += `<div class="c-rrow c-cref">${showG ? `<div class="c-gcol"><span>${bk.col}</span></div>` : ''}${showE ? `<div class="c-ecols" style="--n:${ecols.length}">${ecols.map(() => `<span>${bk.col}</span>`).join('')}</div>` : ''}</div>`;
      html += `<div class="c-rrow">${showG ? `<div class="c-gcol" lang="grc">${bk.lines.map((L) => `<div class="c-gl${L.cont ? ' cont' : ''}"${L.cont ? '' : ` data-cite="${bk.col}${L.n}"`}><span class="c-lt">${U.lineHTML(bk, L)}</span><span class="c-ln">${!L.cont && U.showNum(L.n) ? L.n : ''}</span></div>`).join('')}</div>` : ''}${showE ? `<div class="c-ecols" style="--n:${ecols.length}">${ecols.map((c) => `<div class="c-ec">${U.engHTML(bk, c)}</div>`).join('')}</div>` : ''}</div>`;
    }
    return html;
  };

  // The word sidebar: the parse spelt out in words.
  C.side = (S) => {
    if (!S.word) return '';
    const cards = U.cards(S.word.k);
    return `<aside class="c-side" role="dialog" aria-label="Word: ${esc(S.word.t)}">
      <div class="c-side-h"><p class="c-sw" lang="grc">${esc(S.word.t)}</p><p class="c-sloc">${esc(S.word.cite)}</p><button type="button" class="c-ib c-x" data-act="close:word" aria-label="Close">${I.x}</button></div>
      <div class="c-side-b">${cards.map((c) => `<section class="c-card">
          <p class="c-lem" lang="grc">${esc(c.head)}${c.hom ? ` <small>${esc(c.hom)}</small>` : ''}</p>
          ${c.gloss ? `<p class="c-gls">${esc(c.gloss)}</p>` : ''}
          ${c.rows.map((r) => `<p class="c-prs">${esc(U.longParse(r.text))}${r.dialect ? `, <i>${esc(r.dialect)}</i>` : ''}</p>`).join('')}
          <p class="c-cl">${c.ref ? `<a href="#" data-go="lexicon:${esc(c.ref.slug)}">${fmt(c.ref.count)} places in Aristotle</a>` : ''}${c.lsj ? `<button type="button" data-act="card:${esc(c.id)}" aria-expanded="${S.card === c.id}">${S.card === c.id ? 'Close the LSJ entry' : 'The LSJ entry'}</button>` : ''}</p>
          ${S.card === c.id ? U.t8(c.lsj) : ''}
        </section>`).join('') || '<p class="c-prs">No analysis for this form.</p>'}
        <p class="c-step"><button type="button" data-act="step:-1">← previous word</button><button type="button" data-act="step:1">next word →</button></p>
      </div>
    </aside>`;
  };

  C.note = (S) => {
    if (!S.fn) return '';
    const at = S.fnAt || { x: 800, y: 300 };
    return `<div class="c-pop" style="left:${Math.max(12, Math.min(at.x - 40, 1440 - 400))}px;top:${at.y + 8}px" role="note"><p class="c-pk2">Ostwald’s note ${esc(S.fn.split('.')[1])}</p><p>${U.footnote(S.fn)}</p><button type="button" class="c-ib c-x" data-act="close:fn" aria-label="Close">${I.x}</button></div>`;
  };

  C.panel = (S) => {
    const at = S.panelAt || { x: 20, y: 80, r: 20 };
    if (S.panel === 'toc') {
      return `<aside class="c-toc" aria-label="Contents"><div class="c-toc-h"><a href="#" data-go="home">All works</a><button type="button" class="c-ib" data-act="close:panel" aria-label="Close">${I.x}</button></div>
        <p class="c-toc-t"><span lang="grc">Ἠθικὰ Νικομάχεια</span>Nicomachean Ethics</p>
        <div class="c-toc-go" data-jump-host><label for="c-toc-go">Go to</label><input id="c-toc-go" data-jump placeholder="1097a15"><p class="c-msg" data-jump-msg></p></div>
        <ol class="c-toc-l">${U.bookList().map((b) => `<li><p class="c-toc-b"><span lang="grc">${GNUM[b.b]}</span>Book ${ROMAN[b.b]}<small>${b.first}–${b.last}</small></p>${b.b === 1 ? `<ol>${U.chapterList().map((c) => `<li><a href="#" data-act="ch:${c.ch}" data-ch-link="${c.ch}"><span>${c.ch}</span><span>${esc(c.title)}<small>${esc(c.bekker)}</small></span></a></li>`).join('')}</ol>` : ''}</li>`).join('')}</ol></aside>`;
    }
    if (S.panel === 'pickL' || S.panel === 'pickR') {
      const side = S.panel === 'pickL' ? 'trans' : 'cmp';
      const cur = side === 'trans' ? S.trans : S.cmp;
      return `<div class="c-menu" style="left:${at.x}px;top:${at.y + 6}px">${U.EN_TRANS.map((t) => `<button type="button" data-act="${side}:${t.id}" aria-pressed="${cur === t.id}"><b>${esc(t.short)}</b> ${esc(t.pub)}, ${esc(t.year)}</button>`).join('')}</div>`;
    }
    if (S.panel === 'aa') {
      const sl = (k, label, min, max) => `<label class="c-sl"><span>${label}</span><output>${Math.round(S[k] * 100)}%</output><input type="range" min="${min}" max="${max}" step="0.05" value="${S[k]}" data-range="${k}"></label>`;
      return `<div class="c-menu c-aa" style="right:${at.r - 10}px;top:${at.y + 6}px">${sl('fs', 'Text size', 0.8, 1.4)}${sl('lh', 'Line spacing', 0.85, 1.4)}${sl('cw', 'Column width', 0.75, 1.3)}<label class="c-chk"><input type="checkbox" checked> Add the citation when I copy Greek</label><p class="c-aaf"><button type="button" data-noop>Print</button><button type="button" data-act="reset">Reset</button></p></div>`;
    }
    return '';
  };

  // ── Search: the two fields face each other ───────────────────────────────
  C.search = (S) => {
    const R = U.search;
    const en = R.groups.find((g) => g.work === 'EN');
    const b1 = en.books.find((b) => b.book === 1);
    return `<div class="c-page">${nav('search')}
      <form class="c-pair c-sq" onsubmit="return false">
        <div class="c-l"><label class="c-lab" for="c-sg">Greek</label><input id="c-sg" class="c-in c-big" lang="grc" value="${esc(R.q)}"><p class="c-opts">any form of the word · accents ignored · all the words</p></div>
        <div class="c-r"><label class="c-lab" for="c-se">English</label><input id="c-se" class="c-in c-big" placeholder="virtue, excellence"><p class="c-opts">in every translation · all the words · <a href="#" data-noop>more ways to search</a></p></div>
      </form>
      <div class="c-axisbox c-sgo"><button type="button" class="c-go">Search</button></div>
      <p class="c-count"><span>${fmt(R.count)} places in ${R.works.length} works · <a href="#" data-noop>export</a></span></p>
      <section class="c-res">
        ${pair(`<h2 class="c-rg2" lang="grc">${esc(U.work('EN').greekTitle)}</h2>`, `<h2 class="c-rg2">Nicomachean Ethics <small>${en.count} places; Book I below</small></h2>`, 'c-rgh')}
        ${b1.chapters.map((c) => `${pair(`<p class="c-rch">${esc(c.bekker)}</p>`, `<p class="c-rch">Chapter ${esc(c.chapter)}${U.TITLES[c.chapter] ? ` · <i>${esc(U.TITLES[c.chapter])}</i>` : ''}</p>`)}
          ${(() => { let last = ''; return c.hits.map((h) => { const win = U.hitWindow(h.cite, h.form); const e = U.engAt(h.cite, 'ross', 200); const same = e === last; last = e; return `<a href="#" class="c-pair c-hit" data-go="reader:${h.cite}"><span class="c-l" lang="grc">${win ? win.find((l) => l.here).html : esc(h.form)}</span><span class="c-hr">${h.cite}</span><span class="c-r">${same ? '<span class="c-mid">the same passage</span>' : esc(e)}</span></a>`; }).join(''); })()}`).join('')}
        ${R.groups.filter((g) => g.work !== 'EN').slice(0, 8).map((g) => pair(`<p class="c-og" lang="grc">${esc((U.work(g.work) || {}).greekTitle || '')}</p>`, `<p class="c-og">${esc(g.title)} <span>${g.count}</span></p>`, 'c-other')).join('')}
      </section>
      ${foot()}</div>`;
  };

  // ── Lexicon: forms on the Greek side, works on the English side ──────────
  C.lexicon = (S) => {
    const L = U.lemmaPage(S.lex) || U.lemmaPage('arete');
    const forms = {};
    L.instancesByWork.forEach((g) => g.books.forEach((b) => b.chapters.forEach((c) => c.instances.forEach((i) => { forms[i[2]] = (forms[i[2]] || 0) + 1; }))));
    const fl = Object.entries(forms).sort((a, b) => b[1] - a[1]).slice(0, 12);
    const fmax = fl.length ? fl[0][1] : 1;
    const wmax = Math.max(...L.byWork.map((x) => x.count));
    const dz = L.distinctiveness;
    return `<div class="c-page">${nav('lexicon')}
      <section class="c-lxh">${pair(`<h1 class="c-lxw" lang="grc">${esc(L.head)}</h1>`, `<p class="c-lxg">${esc((L.glosses || []).join('; '))}</p><p class="c-lxn">${fmt(L.count)} places in Aristotle${dz ? `; ${fmt(dz.before_aristotle)} in the authors before him, ${fmt(dz.contemporary)} in his contemporaries` : ''}.</p>`)}</section>
      <section class="c-sec">${pair('<h2 class="c-sh">Forms</h2>', '<h2 class="c-sh">Works</h2>')}
        <div class="c-pair c-bfly"><ul class="c-l c-fl">${fl.map(([f, n]) => `<li><span lang="grc">${esc(f)}</span><b>${n}</b><i style="width:${((n / fmax) * 100).toFixed(1)}%"></i></li>`).join('')}</ul>
          <ul class="c-r c-wl">${L.byWork.map((x) => `<li><a href="#" data-go="work:${x.work}"><i style="width:${((x.count / wmax) * 100).toFixed(1)}%"></i><b>${x.count}</b><span>${esc(x.title)}</span></a></li>`).join('')}</ul></div>
      </section>
      <section class="c-sec">${pair('<h2 class="c-sh">Bonitz</h2>', '<h2 class="c-sh">The LSJ entry</h2>')}
        ${pair('<p class="c-txt">Bonitz’s <i>Index Aristotelicus</i> sorts these places by sense. His entry for this word will stand here once the transcription reaches it.</p>', U.t8(L.key))}</section>
      ${foot()}</div>`;
  };
})();
