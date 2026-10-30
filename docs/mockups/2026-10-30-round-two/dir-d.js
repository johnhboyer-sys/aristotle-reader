/* Direction D · Aldine. Every work beside its first printing: the Greek
   Aristotle of Aldus Manutius, Venice 1495–98. The pages are shown as plates,
   documents with their sources, not as a costume for the site: the site
   itself stays modern, set in one Garamond, black and rubric red. */
(function () {
  'use strict';
  const U = window.U;
  const { esc, fmt, ROMAN } = U;
  const Dd = (window.T.d = {});
  Dd.keepPanelOnTrans = true;

  const ICON = {
    close: '<svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><path d="M3.5 3.5l9 9M12.5 3.5l-9 9" stroke="currentColor" stroke-width="1.2"/></svg>',
    moon: '<svg viewBox="0 0 16 16" width="15" height="15" aria-hidden="true"><path d="M13.2 10.1A5.6 5.6 0 0 1 5.9 2.8a5.6 5.6 0 1 0 7.3 7.3z" fill="none" stroke="currentColor" stroke-width="1.2"/></svg>',
    search: '<svg viewBox="0 0 16 16" width="15" height="15" aria-hidden="true"><circle cx="6.8" cy="6.8" r="4.6" fill="none" stroke="currentColor" stroke-width="1.2"/><path d="M10.4 10.4 14 14" stroke="currentColor" stroke-width="1.2"/></svg>',
    menu: '<svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><path d="M2 4h12M2 8h12M2 12h8" stroke="currentColor" stroke-width="1.2"/></svg>',
    caret: '<svg viewBox="0 0 10 6" width="9" height="6" aria-hidden="true"><path d="M1 1l4 4 4-4" fill="none" stroke="currentColor" stroke-width="1.2"/></svg>',
  };
  const DIV = { 'Logic (Organon)': 'Logic', 'Natural Philosophy': 'Natural philosophy', Metaphysics: 'Metaphysics', 'Moral and Political Philosophy': 'Ethics and politics', 'Rhetoric and Poetics': 'Rhetoric and poetics' };
  // The plate beside each division.
  const PLATE = { 'Logic (Organon)': 'APr', 'Natural Philosophy': 'Phys', Metaphysics: 'Meta', 'Moral and Political Philosophy': 'Pol', 'Rhetoric and Poetics': null };
  const tag = (w) => (w.authenticity && w.authenticity !== 'genuine' ? `<span class="d-tag">${esc(w.authenticity)}</span>` : '');
  const A = (k) => U.ALD[k];
  const det = (k, alt) => { const a = A(k); return a ? `<img src="img/ald/${k}.jpg" alt="${esc(alt || `The opening of ${a.head} in the Aldine edition`)}" width="${a.dw}" height="${a.dh}" loading="lazy" decoding="async">` : ''; };
  const page = (k, alt) => { const a = A(k); return a ? `<img src="img/ald/${k}-page.jpg" alt="${esc(alt || 'A page of the Aldine edition')}" width="${a.pw}" height="${a.ph}" loading="lazy" decoding="async">` : ''; };
  const src = (k) => { const a = A(k); return a ? `Venice: Aldus Manutius, ${a.year}. Vol. ${a.vol}. Boston Public Library copy` : ''; };
  const NOT = { Rhet: 'Aldus left the <i>Rhetoric</i> out of his Aristotle and printed it in 1508, among the Greek rhetoricians.', Poet: 'Aldus left the <i>Poetics</i> out of his Aristotle and printed it in 1508, among the Greek rhetoricians.' };

  const nav = (on) => `<header class="d-nav">
      <a class="d-brand" href="#" data-go="home">Aristotle <span>Reader</span></a>
      <nav class="d-links" aria-label="Site">
        ${[['home', 'Works'], ['search', 'Search'], ['lexicon', 'Lexicon'], ['phrases', 'Phrases'], ['support', 'Support']].map(([k, l]) => `<a href="#" ${k === 'phrases' || k === 'support' ? 'data-noop' : `data-go="${k}"`} class="${on === k ? 'on' : ''}${k === 'phrases' || k === 'support' ? ' d-x-s' : ''}">${l}</a>`).join('')}
        <button type="button" class="d-ib" data-act="theme" aria-label="Dark or light">${ICON.moon}</button>
      </nav>
    </header>`;
  const foot = () => `<footer class="d-foot">
      <p>Also <a href="#" data-noop>The Plato Reader</a> <a href="#" data-noop>The Homer Reader</a> <a href="#" data-noop>The Greek Drama Reader</a> <a href="#" data-noop>Grammata</a></p>
      <p><a href="#" data-noop>Texts &amp; licences</a> <a href="#" data-noop>The Aldine pages</a> <a href="#" data-noop>Support</a> <a href="#" data-noop>Desktop app</a> <a href="#" data-noop>Report an error</a> <a href="#" data-noop>Play a game</a> <span>Site by John H. Boyer</span></p>
    </footer>`;

  // ── Home ─────────────────────────────────────────────────────────────────
  Dd.home = () => {
    const divs = U.divisions();
    return `<div class="d-page">${nav('home')}
      <section class="d-hero">
        <div class="d-hero-t">
          <h1 class="d-h1">The complete works of Aristotle in Greek and English</h1>
          <p class="d-lead">Click any Greek word to parse it and read its dictionary entry. Search every work in Greek or English.</p>
          <div class="d-search">${ICON.search}<input data-search placeholder="φύσις, justice, ἀρετή …" aria-label="Search the corpus" autocomplete="off" spellcheck="false"><button type="button" data-go="search">Search</button></div>
          <p class="d-cont"><a href="#" data-go="reader:${U.RESUME.cite}"><span>Continue reading</span><span><i>Nicomachean Ethics</i>, Book I, chapter 7</span></a></p>
        </div>
        <figure class="d-hero-f">${page('Cat', 'The first page of the Categories in the Aldine edition, with a woodcut headpiece and initial')}<figcaption>Aristotle’s works were first printed in Greek by Aldus Manutius at Venice, in five volumes, 1495–98. The first page of the <i>Categories</i>, 1495.</figcaption></figure>
      </section>
      ${divs.map((d) => {
        const ws = d.groups.flatMap((g) => g.works);
        const pk = d.appendix ? 'Mech' : PLATE[d.title];
        return `<section class="d-div${pk ? '' : ' np'}">
          ${pk ? `<figure class="d-div-f"><a href="#" data-go="work:${pk}">${det(pk)}</a><figcaption>${esc(U.work(pk).title)}, first printed ${A(pk).year}</figcaption></figure>` : '<div class="d-div-f d-div-note"><p>Not in the Aldine Aristotle. Aldus printed the <i>Rhetoric</i> and the <i>Poetics</i> in 1508, among the Greek rhetoricians.</p></div>'}
          <div class="d-div-t">
            <header class="d-dh"><h2>${d.appendix ? 'Doubted and spurious works' : esc(DIV[d.title] || d.title)}</h2><span>${ws.length} work${ws.length === 1 ? '' : 's'}</span></header>
            ${d.groups.map((g) => `${g.label ? `<h3 class="d-sub">${esc(g.label)}</h3>` : ''}<ul class="d-works">${g.works.map((w) => `<li><a href="#" data-go="work:${w.id}"><span class="d-wt">${esc(w.title)}${tag(w)}</span><span class="d-wg" lang="grc">${esc(w.greekTitle)}</span></a></li>`).join('')}</ul>`).join('')}
          </div>
        </section>`;
      }).join('')}
      ${foot()}</div>`;
  };

  // ── A work ───────────────────────────────────────────────────────────────
  Dd.work = (S) => {
    const w = U.work(S.workId) || U.work('EN');
    const en = w.id === 'EN';
    const d = U.divisionOf(w.id);
    const trs = w.translations.map((t) => ({ ...t, ...U.transParts(t) }));
    const books = U.workBooks(w.id);
    const fr = U.further(w.id);
    const kinds = { translation: 'Translation', commentary: 'Commentary', collection: 'In print' };
    const isa = U.work('Isa');
    const many = books.length > 1;
    const a = A(w.id);
    const fig = a
      ? `<figure class="d-wk-f">${page(w.id, `The first page of the ${w.title} in the Aldine edition`)}<figcaption><b>The first printing.</b> ${esc(src(w.id))}. <a href="#" data-noop>The whole volume at the Internet Archive ↗</a></figcaption></figure>`
      : `<figure class="d-wk-f none">${page('TITLE', 'Verses on the Organon from the first leaves of the Aldine edition')}<figcaption>${NOT[w.id] || 'The mockup has no Aldine page for this work.'} Shown instead: the verses that open the first volume, 1495.</figcaption></figure>`;
    return `<div class="d-page">${nav('')}
      <section class="d-wk">
        <div class="d-wk-t">
          <p class="d-crumb"><a href="#" data-go="home">Works</a> · ${d ? esc(d.appendix ? 'Doubted and spurious works' : DIV[d.title] || d.title) : 'Commentary'}</p>
          <p class="d-wk-gt" lang="grc">${esc(w.greekTitle)}</p>
          <h1 class="d-wk-h1">${esc(w.title)}${tag(w)}</h1>
          <p class="d-wk-blurb">${esc(w.blurb)}</p>
          <div class="d-ctas">
            <a href="#" class="d-btn pri" data-go="reader">Start reading</a>
            ${en ? `<a href="#" class="d-btn" data-go="reader:${U.RESUME.cite}">Resume at Book I, chapter 7</a>` : ''}
            <a href="#" class="d-btn" data-go="reader:greek">Greek only</a>
            ${trs.length > 1 ? '<a href="#" class="d-btn" data-go="reader:compare">Compare translations</a>' : ''}
          </div>
          ${en ? '' : '<p class="d-mock">In this mockup the reader opens the <i>Ethics</i>.</p>'}
          <dl class="d-facts">
            <dt>Greek</dt><dd>${esc(w.greekSource.full)}</dd>
            <dt>English</dt><dd>${trs.map((t) => `${esc(t.who)} <span>${esc(t.pub)}, ${esc(t.year)}</span>`).join('<br>')}</dd>
            <dt>Length</dt><dd>${esc(U.extent(w))}</dd>
          </dl>
          <section class="d-sec">
            <h2 class="d-h2">${many ? 'Books and chapters' : 'Chapters'}</h2>${en ? '<p class="d-small">Chapter titles are Ostwald’s.</p>' : ''}
            <div class="d-books">
              ${books.map((b) => `<section class="d-bk">
                ${many ? `<h3><span>Book ${esc(b.label)}</span><small>${b.chapters.length} chapters</small></h3>` : ''}
                <ol class="d-chs">${b.chapters.map((c) => `<li><a href="#" data-go="${en && b.n === 1 ? `reader:${c.bekker.split('–')[0]}` : 'reader'}"><span class="d-cn">${esc(c.ch)}</span><span class="d-ct">${esc(c.title || `Chapter ${c.ch}`)}</span><span class="d-cb">${esc(c.bekker)}</span></a></li>`).join('')}</ol>
              </section>`).join('')}
            </div>
          </section>
          <section class="d-sec"><h2 class="d-h2">Translations</h2>
            <ul class="d-trs">${trs.map((t) => `<li><a href="#" data-go="reader:${t.id}"><span>${esc(t.who)}</span><small>${esc(t.pub)}${t.year ? `, ${esc(t.year)}` : ''}${(w.defaultTranslation || trs[0].id) === t.id ? ' · opens first' : ''}</small></a></li>`).join('')}</ul></section>
          ${w.commentaries ? `<section class="d-sec"><h2 class="d-h2">Commentary</h2><ul class="d-trs"><li><a href="#" data-go="work:Isa"><span>Porphyry, <i>Isagoge</i></span><small>${esc(isa.blurb)}</small></a></li></ul></section>` : ''}
          ${fr.length ? `<section class="d-sec"><h2 class="d-h2">In print</h2><ul class="d-print">${fr.map((r) => `<li><small>${kinds[r.kind] || r.kind}</small> ${r.cite}</li>`).join('')}</ul></section>` : ''}
          <section class="d-sec"><p class="d-small">Sources and licences: <a href="#" data-noop>Texts &amp; licences</a></p></section>
        </div>
        ${fig}
      </section>
      ${foot()}</div>`;
  };

  // ── The reader ───────────────────────────────────────────────────────────
  Dd.reader = (S) => `<div class="d-rd" data-body>
      <header class="d-rh" data-sticky>
        <button type="button" class="d-ib" data-act="panel:toc" aria-label="Contents">${ICON.menu}</button>
        <a class="d-rh-w" href="#" data-go="work:EN"><span class="full">Nicomachean Ethics</span><span class="short">Ethics</span></a>
        <button type="button" class="d-rh-b" data-act="panel:book" data-keep>Book I ${ICON.caret}</button>
        <span class="d-rh-ch"><span>Chapter <b data-here-ch>1</b></span><i data-here-title></i></span>
        <span class="d-msg" data-jump-msg></span>
        <span class="d-sp"></span>
        <span class="d-seg hide-s" role="group" aria-label="Reading view">${['greek', 'both', 'english'].map((v) => `<button type="button" data-act="view:${v}" aria-pressed="${S.view === v}">${v[0].toUpperCase() + v.slice(1)}</button>`).join('')}</span>
        <button type="button" class="d-rh-b hide-s" data-act="panel:picker" data-keep data-hp="tr"></button>
        <button type="button" class="d-ib hide-s" data-go="search" aria-label="Search">${ICON.search}</button>
        <button type="button" class="d-ib d-aab" data-act="panel:aa" data-keep aria-label="Text and view settings">Aa</button>
        <button type="button" class="d-ib" data-act="theme" aria-label="Dark or light">${ICON.moon}</button>
      </header>
      <main class="d-text" data-text></main>
    </div>`;

  Dd.hp = { tr: (S) => `${esc(U.trans(S.trans).short)}${S.cmp ? ` and ${esc(U.trans(S.cmp).short)}` : ''} ${ICON.caret}` };

  Dd.text = (S) => {
    const tr = U.readerTrans(S);
    const cols = S.view === 'greek' ? ['g'] : S.view === 'english' ? tr : ['g', ...tr];
    let lastSi = -1;
    let html = `<div class="d-bookh"><div><p class="d-bk-gt" lang="grc">Ἠθικὰ Νικομάχεια, Α</p><p class="d-bk-t">Nicomachean Ethics, Book I</p><p class="d-bk-s">Greek: Bywater, 1894${S.view === 'greek' ? '' : ` · English: ${tr.map((t) => `${esc(U.trans(t).who)}, ${esc(U.trans(t).year)}`).join(' and ')}`}</p></div><figure>${det('EN', 'The opening of the Nicomachean Ethics in the Aldine edition of 1498')}<figcaption>The same opening, first printed: Venice, 1498</figcaption></figure></div>`;
    for (const bk of U.BLOCKS) {
      const segStart = bk.si !== lastSi;
      lastSi = bk.si;
      if (bk.start) html += `<div class="d-chh"><span class="d-chn">${esc(bk.chapter)}</span><div><p class="d-cht">${esc(U.TITLES[bk.chapter] || '')}</p><p class="d-chb">Chapter ${esc(bk.chapter)} · ${esc(bk.bekker)}</p></div></div>`;
      html += `<div class="d-row" style="--n:${cols.length}">${cols.map((c) => {
        if (c === 'g') {
          return `<div class="d-gc" lang="grc">${bk.lines.map((L, i) => {
            const first = segStart && i === 0 && !L.cont;
            const num = L.cont ? '' : first || L.n === 1 ? `${bk.col}${L.n === 1 ? '' : L.n}` : U.showNum(L.n) ? L.n : '';
            return `<div class="d-gl${L.cont ? ' cont' : ''}"${L.cont ? '' : ` data-cite="${bk.col}${L.n}"`}><span class="d-ln${typeof num === 'string' && num ? ' col' : ''}">${num}</span><span class="d-lt">${U.lineHTML(bk, L)}</span></div>`;
          }).join('')}</div>`;
        }
        return `<div class="d-ec" data-t="${c}">${U.engHTML(bk, c)}</div>`;
      }).join('')}</div>`;
    }
    return html;
  };

  Dd.side = (S) => {
    if (!S.word) return '';
    const cards = U.cards(S.word.k);
    const bk = U.blockOfCite(S.word.cite);
    return `<aside class="d-side" role="dialog" aria-label="Word: ${esc(S.word.t)}">
      <div class="d-side-h"><p class="d-w" lang="grc">${esc(S.word.t)}</p><p class="d-loc">Book I, chapter ${esc(bk ? bk.chapter : '1')} · ${esc(S.word.cite)}</p><button type="button" class="d-x" data-act="close:word" aria-label="Close">${ICON.close}</button></div>
      <div class="d-side-b">
        ${cards.length ? cards.map((c) => `<section class="d-card">
          <p class="d-lem" lang="grc">${esc(c.head)}${c.hom ? `<small>${esc(c.hom)}</small>` : ''}</p>
          ${c.gloss ? `<p class="d-gls">${esc(c.gloss)}</p>` : ''}
          <ul class="d-prs">${c.rows.map((r) => `<li>${esc(U.longParse(r.text))}${r.dialect ? ` <em>${esc(r.dialect)}</em>` : ''}</li>`).join('')}</ul>
          <p class="d-card-f">${c.lsj ? `<button type="button" data-act="card:${esc(c.id)}" aria-expanded="${S.card === c.id}">${S.card === c.id ? 'Hide' : 'Show'} the LSJ entry</button>` : ''}${c.ref ? `<a href="#" data-go="lexicon:${esc(c.ref.slug)}">${fmt(c.ref.count)} times in Aristotle</a>` : ''}</p>
          ${S.card === c.id ? U.t8(c.lsj) : ''}
        </section>`).join('') : '<p class="d-none">No analysis for this form.</p>'}
        <p class="d-keys"><button type="button" data-act="step:-1">← Previous word</button><button type="button" data-act="step:1">Next word →</button></p>
      </div>
    </aside>`;
  };

  Dd.note = (S, P) => {
    if (!P.ui.fn) return '';
    const at = P.ui.fnAt || { x: 600, y: 300 };
    const wpx = P.kind === 'phone' ? 340 : 380;
    const x = Math.max(12, Math.min(at.x - 20, P.W0 - wpx - 12));
    return `<div class="d-note" style="left:${x}px;top:${at.y + 6}px;width:${wpx}px" role="note"><p class="d-note-k">Ostwald’s note ${esc(P.ui.fn.split('.')[1])}</p><p>${U.footnote(P.ui.fn)}</p><button type="button" class="d-x" data-act="close:fn" aria-label="Close">${ICON.close}</button></div>`;
  };

  const views = (S) => `<div class="d-seg wide" role="group" aria-label="Reading view">${['greek', 'both', 'english'].map((v) => `<button type="button" data-act="view:${v}" aria-pressed="${S.view === v}">${v[0].toUpperCase() + v.slice(1)}</button>`).join('')}</div>`;
  const transList = (S) => `<ul class="d-pick">${U.EN_TRANS.map((t) => `<li><button type="button" data-act="trans:${t.id}" aria-pressed="${S.trans === t.id}"><span>${esc(t.who)}</span><small>${esc(t.pub)}, ${esc(t.year)}</small></button></li>`).join('')}</ul>
      <p class="d-mk">Beside it</p>
      <p class="d-cmps">${U.EN_TRANS.filter((t) => t.id !== S.trans).map((t) => `<button type="button" data-act="cmp:${t.id}" aria-pressed="${S.cmp === t.id}">${esc(t.short)}</button>`).join('')}<button type="button" data-act="cmp:off" aria-pressed="${!S.cmp}">None</button></p>`;
  Dd.panel = (S, P) => {
    const at = P.ui.panelAt || { x: 20, y: 60, r: 20 };
    const phone = P.kind === 'phone';
    if (P.ui.panel === 'toc') {
      return `<aside class="d-toc" aria-label="Contents">
        <div class="d-toc-h"><a href="#" data-go="home">All works</a><button type="button" class="d-x" data-act="close:panel" aria-label="Close">${ICON.close}</button></div>
        <p class="d-toc-w">Nicomachean Ethics</p>
        <div class="d-toc-go" data-jump-host><label for="d-go-${P.kind}">Go to a Bekker line</label><input id="d-go-${P.kind}" data-jump placeholder="1097a15" autocomplete="off" spellcheck="false"><p class="d-msg" data-jump-msg></p></div>
        <ol class="d-toc-b">${U.bookList().map((b) => `<li><p class="d-toc-bh">Book ${ROMAN[b.b]}<small>${b.n} chapters</small></p>
          ${b.b === 1 ? `<ol class="d-toc-c">${U.chapterList().map((c) => `<li><a href="#" data-act="ch:${c.ch}" data-ch-link="${c.ch}"><span>${c.ch}</span>${esc(c.title)}</a></li>`).join('')}</ol>` : ''}</li>`).join('')}</ol>
      </aside>`;
    }
    if (P.ui.panel === 'book') return `<div class="d-menu" style="left:${phone ? 12 : at.x}px;top:${at.y + 8}px"><ul class="d-bm">${U.bookList().map((b) => `<li><a href="#" ${b.b === 1 ? 'data-act="ch:1" aria-current="true"' : 'data-act="msg:book"'}><span>Book ${ROMAN[b.b]}</span><small>${b.n} chapters</small></a></li>`).join('')}</ul></div>`;
    if (P.ui.panel === 'picker') return `<div class="d-menu d-pk" style="right:${at.r}px;top:${at.y + 8}px"><p class="d-mk">Translation</p>${transList(S)}<p class="d-note2">Each translation keeps its own Bekker numbers in the margin.</p></div>`;
    if (P.ui.panel === 'aa') {
      const sl = (k, label, min, max) => `<label class="d-sl"><span>${label}</span><output>${Math.round(S[k] * 100)}%</output><input type="range" min="${min}" max="${max}" step="0.05" value="${S[k]}" data-range="${k}"></label>`;
      return `<div class="d-menu d-aa" style="${phone ? 'left:12px;right:12px' : `right:${at.r}px`};top:${at.y + 8}px">
        ${views(S)}${phone ? `<p class="d-mk">Translation</p>${transList(S)}` : ''}
        ${sl('fs', 'Text size', 0.8, 1.4)}${sl('lh', 'Line spacing', 0.85, 1.4)}${phone ? '' : sl('cw', 'Column width', 0.75, 1.3)}
        <label class="d-chk"><input type="checkbox" checked> <span>Add the citation when I copy Greek</span></label>
        <p class="d-aa-f"><button type="button" data-noop>Print</button><button type="button" data-act="reset">Reset</button></p>
      </div>`;
    }
    return '';
  };

  // ── Search ───────────────────────────────────────────────────────────────
  Dd.search = () => {
    const R = U.search;
    const en = R.groups.find((g) => g.work === 'EN');
    const b1 = en.books.find((b) => b.book === 1);
    return `<div class="d-page">${nav('search')}
      <section class="d-sq">
        <div class="d-sq-f">${ICON.search}<input value="${esc(R.q)}" lang="grc" aria-label="Search" data-search><button type="button" class="d-btn pri" data-go="search">Search</button></div>
        <p class="d-sq-o"><span class="d-seg" role="group" aria-label="Language"><button type="button" aria-pressed="true">Greek</button><button type="button">English</button><button type="button">Both</button></span><span>any form · accents ignored · all works</span><a href="#" data-noop>More options</a><a href="#" data-noop>How search works</a></p>
      </section>
      <section class="d-sr">
        <p class="d-sr-n"><b>${fmt(R.count)}</b> places in ${R.works.length} works for <span lang="grc">${esc(R.head)}</span>, ${esc(R.gloss)}. <a href="#" data-go="lexicon:arete">Lexicon</a> <a href="#" data-noop>Export as CSV</a></p>
        <p class="d-sr-w">${R.works.map((x, i) => `<a href="#" data-noop class="${i === 0 ? 'on' : ''}">${esc(x.title)} <span>${x.count}</span></a>`).join('')}</p>
        <section class="d-sg"><h2>Nicomachean Ethics <span>${en.count} places, Book I shown</span></h2>
          ${b1.chapters.map((c) => `<div class="d-sch"><h3><b>${esc(c.chapter)}</b> ${esc(U.TITLES[c.chapter] || '')}</h3>
            ${(() => { let last = ''; return c.hits.map((h) => { const win = U.hitWindow(h.cite, h.form); const e = U.engAt(h.cite, 'ross'); const same = e === last; last = e; return `<div class="d-hit"><a href="#" class="d-hr" data-go="reader:${h.cite}">${h.cite}</a><div class="d-hg" lang="grc">${win ? win.filter((l) => l.here).map((l) => l.html).join(' ') : esc(h.form)}</div>${same ? '' : `<p class="d-he">${esc(e)} <span>Ross</span></p>`}</div>`; }).join(''); })()}</div>`).join('')}
        </section>
        ${R.groups.filter((g) => g.work !== 'EN').slice(0, 5).map((g) => `<section class="d-sg closed"><h2>${esc(g.title)} <span>${g.count} place${g.count === 1 ? '' : 's'}</span></h2></section>`).join('')}
      </section>
      ${foot()}</div>`;
  };

  // ── Lexicon ──────────────────────────────────────────────────────────────
  Dd.lexicon = (S) => {
    const L = U.lemmaPage(S.lex) || U.lemmaPage('arete');
    const dz = L.distinctiveness;
    return `<div class="d-page">${nav('lexicon')}
      <section class="d-lx">
        <p class="d-lx-w" lang="grc">${esc(L.head)}</p>
        <p class="d-lx-gl">${esc((L.glosses || []).join('; '))}</p>
        <p class="d-lx-n"><b>${fmt(L.count)}</b> times in Aristotle, in ${L.byWork.length} works${dz ? `; <b>${fmt(dz.before_aristotle)}</b> in the authors before him, <b>${fmt(dz.contemporary)}</b> in his contemporaries` : ''}.</p>
      </section>
      <section class="d-sec2"><h2 class="d-h2">By work</h2><ol class="d-bw">${L.byWork.map((x) => `<li><a href="#" data-go="work:${x.work}"><span>${esc(x.title)}</span><b>${x.count}</b></a></li>`).join('')}</ol></section>
      <section class="d-sec2 d-two"><div><h2 class="d-h2">LSJ</h2>${U.t8(L.key)}</div>
        <div><h2 class="d-h2">Key passages</h2><p class="d-p">Bonitz’s <i>Index Aristotelicus</i> sorts the places by sense and marks the ones that decide each meaning. They will appear here once the transcription reaches this word.</p>
        <h2 class="d-h2">Nearby</h2><p class="d-near">${U.ALPHA.slice(0, 18).map((x) => `<a href="#" data-noop${x[1] === L.slug ? ' class="on"' : ''} lang="grc">${esc(x[0])}</a>`).join('')}</p></div></section>
      ${foot()}</div>`;
  };
})();
