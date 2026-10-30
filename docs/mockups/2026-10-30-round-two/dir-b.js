/* Direction B · Collection. Each work with an early photograph from the
   Getty's collection, chosen for what the work is about. The prints are shown
   whole, as a museum shows them, on a quiet ground; the reader stays plain. */
(function () {
  'use strict';
  const U = window.U;
  const { esc, fmt, ROMAN } = U;
  const B = (window.T.b = {});
  B.keepPanelOnTrans = true;

  const ICON = {
    close: '<svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><path d="M3.5 3.5l9 9M12.5 3.5l-9 9" stroke="currentColor" stroke-width="1.2"/></svg>',
    moon: '<svg viewBox="0 0 16 16" width="15" height="15" aria-hidden="true"><path d="M13.2 10.1A5.6 5.6 0 0 1 5.9 2.8a5.6 5.6 0 1 0 7.3 7.3z" fill="none" stroke="currentColor" stroke-width="1.2"/></svg>',
    search: '<svg viewBox="0 0 16 16" width="15" height="15" aria-hidden="true"><circle cx="6.8" cy="6.8" r="4.6" fill="none" stroke="currentColor" stroke-width="1.2"/><path d="M10.4 10.4 14 14" stroke="currentColor" stroke-width="1.2"/></svg>',
    menu: '<svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><path d="M2 5h12M2 11h12" stroke="currentColor" stroke-width="1.2"/></svg>',
    caret: '<svg viewBox="0 0 10 6" width="9" height="6" aria-hidden="true"><path d="M1 1l4 4 4-4" fill="none" stroke="currentColor" stroke-width="1.2"/></svg>',
  };
  const DIV = { 'Logic (Organon)': 'Logic', 'Natural Philosophy': 'Natural philosophy', Metaphysics: 'Metaphysics', 'Moral and Political Philosophy': 'Ethics and politics', 'Rhetoric and Poetics': 'Rhetoric and poetics' };
  const tag = (w) => (w.authenticity && w.authenticity !== 'genuine' ? `<span class="b-tag">${esc(w.authenticity)}</span>` : '');
  const ph = (id) => U.PH[id];
  const ar = (id) => { const p = ph(id); return p ? (p.w / p.h).toFixed(3) : '1'; };
  const img = (id, size, alt = '') => `<img src="${U.img(id, size)}" alt="${esc(alt)}" width="${ph(id) ? ph(id).w : 800}" height="${ph(id) ? ph(id).h : 800}" loading="lazy" decoding="async">`;
  const credit = (id, full) => {
    const p = ph(id);
    if (!p) return '';
    return `<span class="b-cr"><span class="b-cr-t"><i>${esc(p.title)}</i>, ${esc(p.date)}</span><span class="b-cr-m">${esc(p.maker)}${full ? ` · ${esc(p.medium)}` : ''}</span>${full ? `<span class="b-cr-g">The J. Paul Getty Museum, Los Angeles, ${esc(p.acc)}. Digital image courtesy of the Getty’s Open Content Program. <a href="#" data-noop>Object record ↗</a></span>` : ''}</span>`;
  };

  const nav = (on) => `<header class="b-nav">
      <a class="b-brand" href="#" data-go="home">The Aristotle Reader</a>
      <nav class="b-links" aria-label="Site">
        ${[['home', 'Works'], ['search', 'Search'], ['lexicon', 'Lexicon'], ['phrases', 'Phrases'], ['support', 'Support']].map(([k, l]) => `<a href="#" ${k === 'phrases' || k === 'support' ? 'data-noop' : `data-go="${k}"`} class="${on === k ? 'on' : ''}${k === 'phrases' || k === 'support' ? ' b-x-s' : ''}">${l}</a>`).join('')}
        <button type="button" class="b-ib" data-act="theme" aria-label="Dark or light">${ICON.moon}</button>
      </nav>
    </header>`;
  const foot = () => `<footer class="b-foot">
      <p class="b-foot-also">Also: <a href="#" data-noop>The Plato Reader</a> <a href="#" data-noop>The Homer Reader</a> <a href="#" data-noop>The Greek Drama Reader</a> <a href="#" data-noop>Grammata</a></p>
      <p class="b-foot-site"><a href="#" data-noop>Texts &amp; licences</a> <a href="#" data-noop>Picture credits</a> <a href="#" data-noop>Support</a> <a href="#" data-noop>Desktop app</a> <a href="#" data-noop>Report an error</a> <a href="#" data-noop>Play a game</a> <span>Site by John H. Boyer</span></p>
    </footer>`;

  // ── Home ─────────────────────────────────────────────────────────────────
  const plate = (w) => `<figure class="b-pl" style="--ar:${ar(w.id)}"><a href="#" data-go="work:${w.id}">${img(w.id, 'w640', `${w.title}: ${ph(w.id) ? ph(w.id).title : ''}`)}<figcaption><span class="b-pl-t">${esc(w.title)}${tag(w)}</span><span class="b-pl-g" lang="grc">${esc(w.greekTitle)}</span></figcaption></a></figure>`;
  B.home = () => {
    const divs = U.divisions();
    return `<div class="b-page">${nav('home')}
      <section class="b-hero">
        <div class="b-hero-t">
          <h1 class="b-h1">The complete works of Aristotle, in Greek and English</h1>
          <p class="b-lead">Click any Greek word to parse it and read its dictionary entry. Search every work in Greek or English.</p>
          <div class="b-search">${ICON.search}<input data-search placeholder="φύσις, justice, ἀρετή …" aria-label="Search the corpus" autocomplete="off" spellcheck="false"><button type="button" data-go="search">Search</button></div>
          <p class="b-cont"><a href="#" data-go="reader:${U.RESUME.cite}">Continue reading <i>Nicomachean Ethics</i>, Book I, chapter 7</a></p>
        </div>
        <figure class="b-hero-f">${img('HOME', 'w1600', 'Plaster model of the lunar craters Aristotle and Eudoxus')}<figcaption><span class="b-cap">${ph('HOME').cap}</span>${credit('HOME')}</figcaption></figure>
      </section>
      <p class="b-intro">A photograph for each work, from the first century of the camera. All from the J. Paul Getty Museum.</p>
      ${divs.map((d) => {
        const ws = d.groups.flatMap((g) => g.works);
        return `<section class="b-div">
          <header class="b-dh"><h2>${d.appendix ? 'Doubted and spurious works' : esc(DIV[d.title] || d.title)}</h2><span>${ws.length} work${ws.length === 1 ? '' : 's'}</span></header>
          ${d.groups.map((g) => `${g.label ? `<h3 class="b-sub">${esc(g.label)}</h3>` : ''}<div class="b-gal">${g.works.map(plate).join('')}</div>`).join('')}
        </section>`;
      }).join('')}
      ${foot()}</div>`;
  };

  // ── A work ───────────────────────────────────────────────────────────────
  B.work = (S) => {
    const w = U.work(S.workId) || U.work('EN');
    const en = w.id === 'EN';
    const d = U.divisionOf(w.id);
    const trs = w.translations.map((t) => ({ ...t, ...U.transParts(t) }));
    const books = U.workBooks(w.id);
    const fr = U.further(w.id);
    const kinds = { translation: 'Translation', commentary: 'Commentary', collection: 'In print' };
    const isa = U.work('Isa');
    const many = books.length > 1;
    const p = ph(w.id);
    return `<div class="b-page">${nav('')}
      <section class="b-wk">
        <figure class="b-wk-f" style="--ar:${ar(w.id)}">${p ? img(w.id, 'w1600', p.title) : ''}<figcaption>${p ? `<span class="b-cap">${p.cap}</span>${credit(w.id, true)}` : ''}</figcaption></figure>
        <div class="b-wk-t">
          <p class="b-crumb"><a href="#" data-go="home">Works</a> · ${d ? esc(d.appendix ? 'Doubted and spurious works' : DIV[d.title] || d.title) : 'Commentary'}</p>
          <p class="b-wk-gt" lang="grc">${esc(w.greekTitle)}</p>
          <h1 class="b-wk-h1">${esc(w.title)}${tag(w)}</h1>
          <p class="b-wk-blurb">${esc(w.blurb)}</p>
          <div class="b-ctas">
            <a href="#" class="b-btn pri" data-go="reader">Start reading</a>
            ${en ? `<a href="#" class="b-btn" data-go="reader:${U.RESUME.cite}">Resume at Book I, chapter 7</a>` : ''}
            <a href="#" class="b-btn" data-go="reader:greek">Greek only</a>
            ${trs.length > 1 ? '<a href="#" class="b-btn" data-go="reader:compare">Compare translations</a>' : ''}
          </div>
          ${en ? '' : '<p class="b-mock">In this mockup the reader opens the <i>Ethics</i>.</p>'}
          <dl class="b-facts">
            <div><dt>Greek</dt><dd>${esc(w.greekSource.short || w.greekSource.full)}</dd></div>
            <div><dt>English</dt><dd>${trs.map((t) => `${esc(t.who)}, ${esc(t.year)}`).join('<br>')}</dd></div>
            <div><dt>Length</dt><dd>${esc(U.extent(w))}</dd></div>
          </dl>
        </div>
      </section>
      <section class="b-sec">
        <header class="b-sh"><h2>${many ? 'Books and chapters' : 'Chapters'}</h2>${en ? '<p>Chapter titles are Ostwald’s</p>' : ''}</header>
        <div class="b-books${many ? '' : ' one'}">
          ${books.map((b) => `<section class="b-bk">
            ${many ? `<h3><span>Book ${esc(b.label)}</span><small>${b.chapters.length} chapters</small></h3>` : ''}
            <ol class="b-chs">${b.chapters.map((c) => `<li><a href="#" data-go="${en && b.n === 1 ? `reader:${c.bekker.split('–')[0]}` : 'reader'}"><span class="b-cn">${esc(c.ch)}</span><span class="b-ct">${esc(c.title || `Chapter ${c.ch}`)}</span><span class="b-cb">${esc(c.bekker)}</span></a></li>`).join('')}</ol>
          </section>`).join('')}
        </div>
      </section>
      <section class="b-sec b-two">
        <div><header class="b-sh"><h2>Translations</h2></header>
          <ul class="b-trs">${trs.map((t) => `<li><a href="#" data-go="reader:${t.id}"><span>${esc(t.who)}</span><small>${esc(t.pub)}${t.year ? `, ${esc(t.year)}` : ''}${(w.defaultTranslation || trs[0].id) === t.id ? ' · opens first' : ''}</small></a></li>`).join('')}</ul>
          ${w.commentaries ? `<header class="b-sh"><h2>Commentary</h2></header><ul class="b-trs"><li><a href="#" data-go="work:Isa"><span>Porphyry, <i>Isagoge</i></span><small>${esc(isa.blurb)}</small></a></li></ul>` : ''}
        </div>
        <div>${fr.length ? `<header class="b-sh"><h2>In print</h2></header><ul class="b-print">${fr.map((r) => `<li><small>${kinds[r.kind] || r.kind}</small><span>${r.cite}</span></li>`).join('')}</ul>` : ''}
          <header class="b-sh"><h2>Sources</h2></header><p class="b-cred"><b>Greek</b> ${esc(w.greekSource.full)}<br><b>English</b> ${trs.map((t) => esc(t.name)).join('; ')}<br><a href="#" data-noop>Texts &amp; licences</a></p>
        </div>
      </section>
      ${foot()}</div>`;
  };

  // ── The reader ───────────────────────────────────────────────────────────
  B.reader = (S) => `<div class="b-rd" data-body>
      <header class="b-rh" data-sticky>
        <button type="button" class="b-ib" data-act="panel:toc" aria-label="Contents">${ICON.menu}</button>
        <a class="b-rh-w" href="#" data-go="work:EN"><span class="full">Nicomachean Ethics</span><span class="short">Ethics</span></a>
        <button type="button" class="b-rh-b" data-act="panel:book" data-keep>Book I ${ICON.caret}</button>
        <span class="b-rh-ch"><span>Chapter <b data-here-ch>1</b></span><i data-here-title></i></span>
        <span class="b-msg" data-jump-msg></span>
        <span class="b-sp"></span>
        <span class="b-seg hide-s" role="group" aria-label="Reading view">${['greek', 'both', 'english'].map((v) => `<button type="button" data-act="view:${v}" aria-pressed="${S.view === v}">${v[0].toUpperCase() + v.slice(1)}</button>`).join('')}</span>
        <button type="button" class="b-rh-b hide-s" data-act="panel:picker" data-keep data-hp="tr"></button>
        <button type="button" class="b-ib hide-s" data-go="search" aria-label="Search">${ICON.search}</button>
        <button type="button" class="b-ib b-aab" data-act="panel:aa" data-keep aria-label="Text and view settings">Aa</button>
        <button type="button" class="b-ib" data-act="theme" aria-label="Dark or light">${ICON.moon}</button>
      </header>
      <main class="b-text" data-text></main>
    </div>`;

  B.hp = { tr: (S) => `${esc(U.trans(S.trans).short)}${S.cmp ? ` and ${esc(U.trans(S.cmp).short)}` : ''} ${ICON.caret}` };

  B.text = (S) => {
    const tr = U.readerTrans(S);
    const cols = S.view === 'greek' ? ['g'] : S.view === 'english' ? tr : ['g', ...tr];
    let lastSi = -1;
    let html = `<div class="b-bookh"><figure>${img('EN', 'w640', ph('EN').title)}</figure><div><p class="b-bk-gt" lang="grc">Ἠθικὰ Νικομάχεια, Α</p><p class="b-bk-t">Nicomachean Ethics<span>Book I</span></p><p class="b-bk-s">Greek: Bywater, 1894${S.view === 'greek' ? '' : ` · English: ${tr.map((t) => `${esc(U.trans(t).who)}, ${esc(U.trans(t).year)}`).join(' and ')}`}</p></div></div>`;
    for (const bk of U.BLOCKS) {
      const segStart = bk.si !== lastSi;
      lastSi = bk.si;
      if (bk.start) html += `<div class="b-chh"><span class="b-chn">${esc(bk.chapter)}</span><div><p class="b-cht">${esc(U.TITLES[bk.chapter] || '')}</p><p class="b-chb">Chapter ${esc(bk.chapter)} · ${esc(bk.bekker)}</p></div></div>`;
      html += `<div class="b-row" style="--n:${cols.length}">${cols.map((c) => {
        if (c === 'g') {
          return `<div class="b-gc" lang="grc">${bk.lines.map((L, i) => {
            const first = segStart && i === 0 && !L.cont;
            const num = L.cont ? '' : first || L.n === 1 ? `${bk.col}${L.n === 1 ? '' : L.n}` : U.showNum(L.n) ? L.n : '';
            return `<div class="b-gl${L.cont ? ' cont' : ''}"${L.cont ? '' : ` data-cite="${bk.col}${L.n}"`}><span class="b-ln${typeof num === 'string' && num ? ' col' : ''}">${num}</span><span class="b-lt">${U.lineHTML(bk, L)}</span></div>`;
          }).join('')}</div>`;
        }
        return `<div class="b-ec" data-t="${c}">${U.engHTML(bk, c)}</div>`;
      }).join('')}</div>`;
    }
    return html;
  };

  B.side = (S) => {
    if (!S.word) return '';
    const cards = U.cards(S.word.k);
    const bk = U.blockOfCite(S.word.cite);
    return `<aside class="b-side" role="dialog" aria-label="Word: ${esc(S.word.t)}">
      <div class="b-side-h"><p class="b-w" lang="grc">${esc(S.word.t)}</p><p class="b-loc">Book I, chapter ${esc(bk ? bk.chapter : '1')} · ${esc(S.word.cite)}</p><button type="button" class="b-x" data-act="close:word" aria-label="Close">${ICON.close}</button></div>
      <div class="b-side-b">
        ${cards.length ? cards.map((c) => `<section class="b-card">
          <p class="b-lem" lang="grc">${esc(c.head)}${c.hom ? `<small>${esc(c.hom)}</small>` : ''}</p>
          ${c.gloss ? `<p class="b-gls">${esc(c.gloss)}</p>` : ''}
          <ul class="b-prs">${c.rows.map((r) => `<li>${esc(U.longParse(r.text))}${r.dialect ? ` <em>${esc(r.dialect)}</em>` : ''}</li>`).join('')}</ul>
          <p class="b-card-f">${c.lsj ? `<button type="button" data-act="card:${esc(c.id)}" aria-expanded="${S.card === c.id}">${S.card === c.id ? 'Hide' : 'Show'} the LSJ entry</button>` : ''}${c.ref ? `<a href="#" data-go="lexicon:${esc(c.ref.slug)}">${fmt(c.ref.count)} times in Aristotle</a>` : ''}</p>
          ${S.card === c.id ? U.t8(c.lsj) : ''}
        </section>`).join('') : '<p class="b-none">No analysis for this form.</p>'}
        <p class="b-keys"><button type="button" data-act="step:-1">← Previous word</button><button type="button" data-act="step:1">Next word →</button></p>
      </div>
    </aside>`;
  };

  B.note = (S, P) => {
    if (!P.ui.fn) return '';
    const at = P.ui.fnAt || { x: 600, y: 300 };
    const wpx = P.kind === 'phone' ? 340 : 380;
    const x = Math.max(12, Math.min(at.x - 20, P.W0 - wpx - 12));
    return `<div class="b-note" style="left:${x}px;top:${at.y + 6}px;width:${wpx}px" role="note"><p class="b-note-k">Ostwald’s note ${esc(P.ui.fn.split('.')[1])}</p><p>${U.footnote(P.ui.fn)}</p><button type="button" class="b-x" data-act="close:fn" aria-label="Close">${ICON.close}</button></div>`;
  };

  const views = (S) => `<div class="b-seg wide" role="group" aria-label="Reading view">${['greek', 'both', 'english'].map((v) => `<button type="button" data-act="view:${v}" aria-pressed="${S.view === v}">${v[0].toUpperCase() + v.slice(1)}</button>`).join('')}</div>`;
  const transList = (S) => `<ul class="b-pick">${U.EN_TRANS.map((t) => `<li><button type="button" data-act="trans:${t.id}" aria-pressed="${S.trans === t.id}"><span>${esc(t.who)}</span><small>${esc(t.pub)}, ${esc(t.year)}</small></button></li>`).join('')}</ul>
      <p class="b-mk">Beside it</p>
      <p class="b-cmps">${U.EN_TRANS.filter((t) => t.id !== S.trans).map((t) => `<button type="button" data-act="cmp:${t.id}" aria-pressed="${S.cmp === t.id}">${esc(t.short)}</button>`).join('')}<button type="button" data-act="cmp:off" aria-pressed="${!S.cmp}">None</button></p>`;
  B.panel = (S, P) => {
    const at = P.ui.panelAt || { x: 20, y: 60, r: 20 };
    const phone = P.kind === 'phone';
    if (P.ui.panel === 'toc') {
      return `<aside class="b-toc" aria-label="Contents">
        <div class="b-toc-h"><a href="#" data-go="home">All works</a><button type="button" class="b-x" data-act="close:panel" aria-label="Close">${ICON.close}</button></div>
        <figure class="b-toc-f">${img('EN', 'w640', ph('EN').title)}</figure>
        <p class="b-toc-w">Nicomachean Ethics</p>
        <div class="b-toc-go" data-jump-host><label for="b-go-${P.kind}">Go to a Bekker line</label><input id="b-go-${P.kind}" data-jump placeholder="1097a15" autocomplete="off" spellcheck="false"><p class="b-msg" data-jump-msg></p></div>
        <ol class="b-toc-b">${U.bookList().map((b) => `<li><p class="b-toc-bh">Book ${ROMAN[b.b]}<small>${b.n} chapters</small></p>
          ${b.b === 1 ? `<ol class="b-toc-c">${U.chapterList().map((c) => `<li><a href="#" data-act="ch:${c.ch}" data-ch-link="${c.ch}"><span>${c.ch}</span>${esc(c.title)}</a></li>`).join('')}</ol>` : ''}</li>`).join('')}</ol>
      </aside>`;
    }
    if (P.ui.panel === 'book') return `<div class="b-menu" style="left:${phone ? 12 : at.x}px;top:${at.y + 8}px"><ul class="b-bm">${U.bookList().map((b) => `<li><a href="#" ${b.b === 1 ? 'data-act="ch:1" aria-current="true"' : 'data-act="msg:book"'}><span>Book ${ROMAN[b.b]}</span><small>${b.n} chapters</small></a></li>`).join('')}</ul></div>`;
    if (P.ui.panel === 'picker') return `<div class="b-menu b-pk" style="right:${at.r}px;top:${at.y + 8}px"><p class="b-mk">Translation</p>${transList(S)}<p class="b-note2">Each translation keeps its own Bekker numbers in the margin.</p></div>`;
    if (P.ui.panel === 'aa') {
      const sl = (k, label, min, max) => `<label class="b-sl"><span>${label}</span><output>${Math.round(S[k] * 100)}%</output><input type="range" min="${min}" max="${max}" step="0.05" value="${S[k]}" data-range="${k}"></label>`;
      return `<div class="b-menu b-aa" style="${phone ? 'left:12px;right:12px' : `right:${at.r}px`};top:${at.y + 8}px">
        ${views(S)}${phone ? `<p class="b-mk">Translation</p>${transList(S)}` : ''}
        ${sl('fs', 'Text size', 0.8, 1.4)}${sl('lh', 'Line spacing', 0.85, 1.4)}${phone ? '' : sl('cw', 'Column width', 0.75, 1.3)}
        <label class="b-chk"><input type="checkbox" checked> <span>Add the citation when I copy Greek</span></label>
        <p class="b-aa-f"><button type="button" data-noop>Print</button><button type="button" data-act="reset">Reset</button></p>
      </div>`;
    }
    return '';
  };

  // ── Search ───────────────────────────────────────────────────────────────
  B.search = () => {
    const R = U.search;
    const en = R.groups.find((g) => g.work === 'EN');
    const b1 = en.books.find((b) => b.book === 1);
    return `<div class="b-page">${nav('search')}
      <section class="b-sq">
        <div class="b-sq-f"><input value="${esc(R.q)}" lang="grc" aria-label="Search" data-search><button type="button" class="b-btn pri" data-go="search">Search</button></div>
        <p class="b-sq-o"><span class="b-seg" role="group" aria-label="Language"><button type="button" aria-pressed="true">Greek</button><button type="button">English</button><button type="button">Both</button></span><span>any form · accents ignored · all works</span><a href="#" data-noop>More options</a><a href="#" data-noop>How search works</a></p>
      </section>
      <section class="b-sr">
        <div class="b-sr-head">
          <p class="b-sr-n"><b>${fmt(R.count)}</b> places in ${R.works.length} works</p>
          <p class="b-sr-l"><span lang="grc">${esc(R.head)}</span>, ${esc(R.gloss)} · <a href="#" data-go="lexicon:arete">Lexicon</a> · <a href="#" data-noop>Export as CSV</a></p>
        </div>
        <p class="b-sr-w">${R.works.map((x, i) => `<a href="#" data-noop class="${i === 0 ? 'on' : ''}">${esc(x.title)} <span>${x.count}</span></a>`).join('')}</p>
        <section class="b-sg"><h2>Nicomachean Ethics <span>${en.count} places · Book I shown</span></h2>
          ${b1.chapters.map((c) => `<div class="b-sch"><h3>Chapter ${esc(c.chapter)} <i>${esc(U.TITLES[c.chapter] || '')}</i></h3>
            ${(() => { let last = ''; return c.hits.map((h) => { const win = U.hitWindow(h.cite, h.form); const e = U.engAt(h.cite, 'ross'); const same = e === last; last = e; return `<div class="b-hit"><a href="#" class="b-hr" data-go="reader:${h.cite}">${h.cite}</a><div class="b-hg" lang="grc">${win ? win.filter((l) => l.here).map((l) => l.html).join(' ') : esc(h.form)}</div>${same ? '' : `<p class="b-he">${esc(e)} <span>Ross</span></p>`}</div>`; }).join(''); })()}</div>`).join('')}
        </section>
        ${R.groups.filter((g) => g.work !== 'EN').slice(0, 5).map((g) => `<section class="b-sg closed"><h2>${esc(g.title)} <span>${g.count} place${g.count === 1 ? '' : 's'}</span></h2></section>`).join('')}
      </section>
      ${foot()}</div>`;
  };

  // ── Lexicon ──────────────────────────────────────────────────────────────
  B.lexicon = (S) => {
    const L = U.lemmaPage(S.lex) || U.lemmaPage('arete');
    const dz = L.distinctiveness;
    const top = L.byWork[0];
    return `<div class="b-page">${nav('lexicon')}
      <section class="b-lx">
        <div class="b-lx-t">
          <p class="b-lx-w" lang="grc">${esc(L.head)}</p>
          <p class="b-lx-gl">${esc((L.glosses || []).join('; '))}</p>
          <dl class="b-lx-n">
            <div><dt>in Aristotle</dt><dd>${fmt(L.count)}</dd></div>
            ${dz ? `<div><dt>before him</dt><dd>${fmt(dz.before_aristotle)}</dd></div><div><dt>his contemporaries</dt><dd>${fmt(dz.contemporary)}</dd></div>` : ''}
            <div><dt>works</dt><dd>${L.byWork.length}</dd></div>
          </dl>
        </div>
        ${ph(top.work) ? `<figure class="b-lx-f"><a href="#" data-go="work:${top.work}">${img(top.work, 'w640', ph(top.work).title)}</a><figcaption>Most often in the <i>${esc(top.title)}</i>: ${top.count} times</figcaption></figure>` : ''}
      </section>
      <section class="b-sec"><header class="b-sh"><h2>By work</h2></header><ol class="b-bw">${L.byWork.map((x) => `<li><a href="#" data-go="work:${x.work}"><span>${esc(x.title)}</span><b>${x.count}</b></a></li>`).join('')}</ol></section>
      <section class="b-sec b-two"><div><header class="b-sh"><h2>LSJ</h2></header>${U.t8(L.key)}</div>
        <div><header class="b-sh"><h2>Key passages</h2></header><p class="b-p">Bonitz’s <i>Index Aristotelicus</i> sorts the places by sense and marks the ones that decide each meaning. They will appear here once the transcription reaches this word.</p>
        <header class="b-sh"><h2>Nearby</h2></header><p class="b-near">${U.ALPHA.slice(0, 18).map((x) => `<a href="#" data-noop${x[1] === L.slug ? ' class="on"' : ''} lang="grc">${esc(x[0])}</a>`).join('')}</p></div></section>
      ${foot()}</div>`;
  };
})();
