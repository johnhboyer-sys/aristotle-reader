/* Direction A · Capitals. The Plato redesign's sibling: one reading face,
   rules and room instead of boxes, one pigment. Where Plato sets a single
   inscription, here every work is announced by its key word in Greek
   capitals, and all the words sit on one letter grid. */
(function () {
  'use strict';
  const U = window.U;
  const { esc, fmt, ROMAN } = U;
  const A = (window.T.a = {});
  A.keepPanelOnTrans = true;

  const ICON = {
    close: '<svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><path d="M3.5 3.5l9 9M12.5 3.5l-9 9" stroke="currentColor" stroke-width="1.3"/></svg>',
    moon: '<svg viewBox="0 0 16 16" width="15" height="15" aria-hidden="true"><path d="M13.2 10.1A5.6 5.6 0 0 1 5.9 2.8a5.6 5.6 0 1 0 7.3 7.3z" fill="none" stroke="currentColor" stroke-width="1.2"/></svg>',
    search: '<svg viewBox="0 0 16 16" width="15" height="15" aria-hidden="true"><circle cx="6.8" cy="6.8" r="4.6" fill="none" stroke="currentColor" stroke-width="1.2"/><path d="M10.4 10.4 14 14" stroke="currentColor" stroke-width="1.2"/></svg>',
    menu: '<svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><path d="M2 4h12M2 8h12M2 12h12" stroke="currentColor" stroke-width="1.2"/></svg>',
    caret: '<svg viewBox="0 0 10 6" width="9" height="6" aria-hidden="true"><path d="M1 1l4 4 4-4" fill="none" stroke="currentColor" stroke-width="1.2"/></svg>',
  };
  const DIV = { 'Logic (Organon)': 'Logic', 'Natural Philosophy': 'Natural philosophy', Metaphysics: 'Metaphysics', 'Moral and Political Philosophy': 'Ethics and politics', 'Rhetoric and Poetics': 'Rhetoric and poetics' };
  const tag = (w) => (w.authenticity && w.authenticity !== 'genuine' ? `<span class="a-tag">${esc(w.authenticity)}</span>` : '');
  const blk = (id, cls = '') => U.block(U.KEY[id] || '', cls);

  const nav = (on) => `<header class="a-nav">
      <a class="a-brand" href="#" data-go="home">Aristotle Reader</a>
      <nav class="a-links" aria-label="Site">
        ${[['home', 'Works'], ['search', 'Search'], ['lexicon', 'Lexicon'], ['phrases', 'Phrases'], ['support', 'Support']].map(([k, l]) => `<a href="#" ${k === 'phrases' || k === 'support' ? 'data-noop' : `data-go="${k}"`} class="${on === k ? 'on' : ''}${k === 'phrases' || k === 'support' ? ' a-x-s' : ''}">${l}</a>`).join('')}
        <button type="button" class="a-ib" data-act="theme" aria-label="Dark or light">${ICON.moon}</button>
      </nav>
    </header>`;
  const foot = () => `<footer class="a-foot">
      <div class="a-foot-in">
        <p class="a-foot-also">${U.block('ΚΑΙ', 'xs')}<a href="#" data-noop>The Plato Reader</a><a href="#" data-noop>The Homer Reader</a><a href="#" data-noop>The Greek Drama Reader</a><a href="#" data-noop>Grammata</a></p>
        <p class="a-foot-site"><a href="#" data-noop>Texts &amp; licences</a><a href="#" data-noop>Support</a><a href="#" data-noop>Desktop app</a><a href="#" data-noop>Report an error</a><a href="#" data-noop>Play a game</a><span>Site by John H. Boyer</span></p>
      </div>
    </footer>`;

  // ── Home ─────────────────────────────────────────────────────────────────
  const STACK = ['Cat', 'Phys', 'DA', 'Meta', 'EN', 'Pol', 'Poet'];
  A.home = () => {
    const divs = U.divisions();
    return `<div class="a-page">${nav('home')}
      <section class="a-hero">
        <div class="a-hero-t">
          <h1 class="a-h1">The complete works of Aristotle in Greek and English</h1>
          <p class="a-lead">Click any Greek word to parse it and read its dictionary entry. Search every work in Greek or English.</p>
          <div class="a-search" data-jump-host>
            ${ICON.search}<input data-search placeholder="φύσις, justice, ἀρετή …" aria-label="Search the corpus" autocomplete="off" spellcheck="false">
            <button type="button" data-go="search">Search</button>
          </div>
          <a class="a-cont" href="#" data-go="reader:${U.RESUME.cite}">Continue reading <span><i>Nicomachean Ethics</i>, Book I, chapter 7</span></a>
        </div>
        <div class="a-stack" aria-label="Seven works to begin with">
          ${STACK.map((id) => { const w = U.work(id); return `<a href="#" class="a-st${id === 'EN' ? ' cur' : ''}" data-go="work:${id}" title="${esc(U.KEY_EN[id])}">${blk(id)}<span class="a-st-l"><span>${esc(w.title)}</span><small>${esc(U.KEY_EN[id])}</small></span></a>`; }).join('')}
        </div>
      </section>
      <div class="a-reg">
      ${divs.map((d) => {
        const ws = d.groups.flatMap((g) => g.works);
        return `<section class="a-div${d.appendix ? ' app' : ''}">
          <header class="a-dh"><span class="a-dn">${d.numeral || ''}</span><h2>${d.appendix ? 'Doubted and spurious works' : esc(DIV[d.title] || d.title)}</h2><span class="a-dc">${ws.length} work${ws.length === 1 ? '' : 's'}</span></header>
          ${d.groups.map((g) => `${g.label ? `<h3 class="a-sub">${esc(g.label)}</h3>` : ''}
            <ul class="a-works">${g.works.map((w) => `<li><a href="#" data-go="work:${w.id}">${blk(w.id, 'sm')}<span class="a-wt"><span class="a-en">${esc(w.title)}${tag(w)}</span><span class="a-gk" lang="grc">${esc(w.greekTitle)}</span></span><span class="a-ex">${esc(U.extent(w))}</span></a></li>`).join('')}</ul>`).join('')}
        </section>`;
      }).join('')}
      </div>
      ${foot()}</div>`;
  };

  // ── A work ───────────────────────────────────────────────────────────────
  A.work = (S) => {
    const w = U.work(S.workId) || U.work('EN');
    const en = w.id === 'EN';
    const d = U.divisionOf(w.id);
    const trs = w.translations.map((t) => ({ ...t, ...U.transParts(t) }));
    const books = U.workBooks(w.id);
    const fr = U.further(w.id);
    const kinds = { translation: 'Translation', commentary: 'Commentary', collection: 'In print' };
    const isa = U.work('Isa');
    const many = books.length > 1;
    return `<div class="a-page">${nav('')}
      <section class="a-wk">
        <p class="a-crumb"><a href="#" data-go="home">Works</a><span>/</span>${d ? esc(d.appendix ? 'Doubted and spurious works' : DIV[d.title] || d.title) : 'Commentary'}</p>
        <div class="a-wk-word">${blk(w.id, 'xl')}<p class="a-wk-key"><span lang="grc">${esc(U.KEY_GR[w.id] || '')}</span>, ${esc(U.KEY_EN[w.id] || '')}</p></div>
        <div class="a-wk-grid">
          <div class="a-wk-main">
            <p class="a-wk-gt" lang="grc">${esc(w.greekTitle)}</p>
            <h1 class="a-wk-h1">${esc(w.title)}${tag(w)}</h1>
            <p class="a-wk-blurb">${esc(w.blurb)}</p>
            <div class="a-ctas">
              <a href="#" class="a-btn pri" data-go="reader">Start reading</a>
              ${en ? `<a href="#" class="a-btn" data-go="reader:${U.RESUME.cite}">Resume at Book I, chapter 7</a>` : ''}
              <a href="#" class="a-btn" data-go="reader:greek">Greek only</a>
              ${trs.length > 1 ? '<a href="#" class="a-btn" data-go="reader:compare">Compare translations</a>' : ''}
            </div>
            ${en ? '' : '<p class="a-mock">In this mockup the reader opens the <i>Ethics</i>.</p>'}
          </div>
          <dl class="a-facts">
            <dt>Greek</dt><dd>${esc(w.greekSource.full)}</dd>
            <dt>English</dt><dd>${trs.map((t) => `${esc(t.who)} <span>${esc(t.pub)}${t.year ? `, ${esc(t.year)}` : ''}</span>`).join('<br>')}</dd>
            <dt>Length</dt><dd>${esc(U.extent(w))}</dd>
          </dl>
        </div>
      </section>
      <section class="a-sec">
        <header class="a-sh"><h2>${many ? 'Books and chapters' : 'Chapters'}</h2>${en ? '<p>Chapter titles are Ostwald’s.</p>' : ''}</header>
        <div class="a-books${many ? '' : ' one'}">
          ${books.map((b) => `<section class="a-bk">
            ${many ? `<h3><span class="a-bkn">${esc(b.label)}</span>Book ${esc(b.label)}<small>${b.chapters.length} chapters</small></h3>` : ''}
            <ol class="a-chs">${b.chapters.map((c) => `<li><a href="#" data-go="${en && b.n === 1 ? `reader:${c.bekker.split('–')[0]}` : 'reader'}"><span class="a-cn">${esc(c.ch)}</span><span class="a-ct">${esc(c.title || `Chapter ${c.ch}`)}</span><span class="a-cb">${esc(c.bekker)}</span></a></li>`).join('')}</ol>
          </section>`).join('')}
        </div>
      </section>
      <section class="a-sec"><header class="a-sh"><h2>Translations</h2></header>
        <ul class="a-trs">${trs.map((t) => `<li><a href="#" data-go="reader:${t.id}"><span class="a-trn">${esc(t.who)}</span><span class="a-trk">${esc(t.pub)}${t.year ? `, ${esc(t.year)}` : ''}${(w.defaultTranslation || trs[0].id) === t.id ? ' · opens first' : ''}</span></a></li>`).join('')}</ul>
      </section>
      ${w.commentaries ? `<section class="a-sec"><header class="a-sh"><h2>Commentary</h2></header><ul class="a-trs"><li><a href="#" data-go="work:Isa"><span class="a-trn">Porphyry, <i>Isagoge</i> <span lang="grc">${esc(isa.greekTitle)}</span></span><span class="a-trk">${esc(isa.blurb)}</span></a></li></ul></section>` : ''}
      ${fr.length ? `<section class="a-sec"><header class="a-sh"><h2>In print</h2></header><ul class="a-print">${fr.map((r) => `<li><span class="a-pk">${kinds[r.kind] || r.kind}</span><span>${r.cite}</span><a href="#" data-noop>Find a copy</a></li>`).join('')}</ul></section>` : ''}
      <section class="a-sec a-cred"><p><b>Greek</b> ${esc(w.greekSource.full)}</p><p><b>${trs.length > 1 ? 'Translations' : 'Translation'}</b> ${trs.map((t) => esc(t.name)).join('; ')}</p><p>Sources and licences: <a href="#" data-noop>Texts &amp; licences</a></p></section>
      ${foot()}</div>`;
  };

  // ── The reader ───────────────────────────────────────────────────────────
  A.reader = (S) => `<div class="a-rd" data-body>
      <header class="a-rh" data-sticky>
        <button type="button" class="a-ib" data-act="panel:toc" aria-label="Contents">${ICON.menu}</button>
        <a class="a-rh-w" href="#" data-go="work:EN"><span class="full">Nicomachean Ethics</span><span class="short">Ethics</span></a>
        <button type="button" class="a-rh-b" data-act="panel:book" data-keep>Book I ${ICON.caret}</button>
        <span class="a-rh-ch"><span class="a-rh-cn">Chapter <b data-here-ch>1</b></span><span class="a-rh-ct" data-here-title></span></span>
        <span class="a-msg" data-jump-msg></span>
        <span class="a-sp"></span>
        <span class="a-seg hide-s" role="group" aria-label="Reading view">${['greek', 'both', 'english'].map((v) => `<button type="button" data-act="view:${v}" aria-pressed="${S.view === v}">${v[0].toUpperCase() + v.slice(1)}</button>`).join('')}</span>
        <button type="button" class="a-rh-tr hide-s" data-act="panel:picker" data-keep data-hp="tr"></button>
        <button type="button" class="a-ib hide-s" data-go="search" aria-label="Search">${ICON.search}</button>
        <button type="button" class="a-ib a-aab" data-act="panel:aa" data-keep aria-label="Text and view settings">Aa</button>
        <button type="button" class="a-ib" data-act="theme" aria-label="Dark or light">${ICON.moon}</button>
      </header>
      <main class="a-text" data-text></main>
    </div>`;

  A.hp = {
    tr: (S) => `${esc(U.trans(S.trans).short)}${S.cmp ? ` and ${esc(U.trans(S.cmp).short)}` : ''} ${ICON.caret}`,
  };

  A.text = (S) => {
    const tr = U.readerTrans(S);
    const cols = S.view === 'greek' ? ['g'] : S.view === 'english' ? tr : ['g', ...tr];
    let html = '';
    let lastSi = -1;
    html += `<div class="a-bookh"><p class="a-bk-gt">${U.block('ΗΘΙΚΩΝ ΝΙΚΟΜΑΧΕΙΩΝ Α', 'xs')}</p><p class="a-bk-t">Nicomachean Ethics, Book I</p><p class="a-bk-s">Greek: Bywater, 1894${S.view === 'greek' ? '' : ` · English: ${tr.map((t) => `${esc(U.trans(t).who)}, ${esc(U.trans(t).year)}`).join(' and ')}`}</p></div>`;
    for (const bk of U.BLOCKS) {
      const segStart = bk.si !== lastSi;
      lastSi = bk.si;
      if (bk.start) {
        html += `<div class="a-chh" data-ch="${esc(bk.chapter)}"><span class="a-chn">${U.block(bk.chapter, 'ch')}</span><div class="a-chm"><p class="a-cht">${esc(U.TITLES[bk.chapter] || '')}</p><p class="a-chb">Chapter ${esc(bk.chapter)} · ${esc(bk.bekker)}</p></div></div>`;
      }
      html += `<div class="a-row" style="--n:${cols.length}">${cols.map((c) => {
        if (c === 'g') {
          return `<div class="a-gc" lang="grc">${bk.lines.map((L, i) => {
            const first = segStart && i === 0 && !L.cont;
            const num = L.cont ? '' : first || L.n === 1 ? `${bk.col}${L.n === 1 ? '' : L.n}` : U.showNum(L.n) ? L.n : '';
            return `<div class="a-gl${L.cont ? ' cont' : ''}"${L.cont ? '' : ` data-cite="${bk.col}${L.n}"`}><span class="a-ln${typeof num === 'string' && num ? ' col' : ''}">${num}</span><span class="a-lt">${U.lineHTML(bk, L)}</span></div>`;
          }).join('')}</div>`;
        }
        return `<div class="a-ec" data-t="${c}">${U.engHTML(bk, c)}</div>`;
      }).join('')}</div>`;
    }
    return html;
  };

  // The word sidebar: on a phone, a sheet from the bottom.
  A.side = (S) => {
    if (!S.word) return '';
    const cards = U.cards(S.word.k);
    const bk = U.blockOfCite(S.word.cite);
    return `<aside class="a-side" role="dialog" aria-label="Word: ${esc(S.word.t)}">
      <div class="a-side-h"><p class="a-w" lang="grc">${esc(S.word.t)}</p><p class="a-loc">Book I, chapter ${esc(bk ? bk.chapter : '1')} · ${esc(S.word.cite)}</p><button type="button" class="a-x" data-act="close:word" aria-label="Close">${ICON.close}</button></div>
      <div class="a-side-b">
        ${cards.length ? cards.map((c) => `<section class="a-card">
          <p class="a-lem"><span lang="grc">${esc(c.head)}</span>${c.hom ? `<small>${esc(c.hom)}</small>` : ''}</p>
          ${c.gloss ? `<p class="a-gls">${esc(c.gloss)}</p>` : ''}
          <ul class="a-prs">${c.rows.map((r) => `<li>${esc(U.longParse(r.text))}${r.dialect ? ` <em>${esc(r.dialect)}</em>` : ''}</li>`).join('')}</ul>
          <p class="a-card-f">${c.lsj ? `<button type="button" class="a-lsj" data-act="card:${esc(c.id)}" aria-expanded="${S.card === c.id}">${S.card === c.id ? 'Hide' : 'Show'} the LSJ entry</button>` : ''}${c.ref ? `<a href="#" class="a-occ" data-go="lexicon:${esc(c.ref.slug)}">${fmt(c.ref.count)} times in Aristotle</a>` : ''}</p>
          ${S.card === c.id ? U.t8(c.lsj) : ''}
        </section>`).join('') : '<p class="a-none">No analysis for this form.</p>'}
        <p class="a-keys"><button type="button" data-act="step:-1">← Previous word</button><button type="button" data-act="step:1">Next word →</button></p>
      </div>
    </aside>`;
  };

  A.note = (S, P) => {
    if (!P.ui.fn) return '';
    const at = P.ui.fnAt || { x: 600, y: 300 };
    const wpx = P.kind === 'phone' ? 340 : 380;
    const x = Math.max(12, Math.min(at.x - 20, P.W0 - wpx - 12));
    return `<div class="a-note" style="left:${x}px;top:${at.y + 6}px;width:${wpx}px" role="note"><p class="a-note-k">Ostwald’s note ${esc(P.ui.fn.split('.')[1])}</p><p>${U.footnote(P.ui.fn)}</p><button type="button" class="a-x" data-act="close:fn" aria-label="Close">${ICON.close}</button></div>`;
  };

  const views = (S) => `<div class="a-seg wide" role="group" aria-label="Reading view">${['greek', 'both', 'english'].map((v) => `<button type="button" data-act="view:${v}" aria-pressed="${S.view === v}">${v[0].toUpperCase() + v.slice(1)}</button>`).join('')}</div>`;
  const transList = (S) => `<ul class="a-pick">${U.EN_TRANS.map((t) => `<li><button type="button" data-act="trans:${t.id}" aria-pressed="${S.trans === t.id}"><span>${esc(t.who)}</span><small>${esc(t.pub)}, ${esc(t.year)}</small></button></li>`).join('')}</ul>
      <p class="a-mk">Beside it</p>
      <p class="a-cmps">${U.EN_TRANS.filter((t) => t.id !== S.trans).map((t) => `<button type="button" data-act="cmp:${t.id}" aria-pressed="${S.cmp === t.id}">${esc(t.short)}</button>`).join('')}<button type="button" data-act="cmp:off" aria-pressed="${!S.cmp}">None</button></p>`;
  A.panel = (S, P) => {
    const at = P.ui.panelAt || { x: 20, y: 60, r: 20 };
    const phone = P.kind === 'phone';
    if (P.ui.panel === 'toc') {
      return `<aside class="a-toc" aria-label="Contents">
        <div class="a-toc-h"><a href="#" data-go="home">All works</a><button type="button" class="a-x" data-act="close:panel" aria-label="Close">${ICON.close}</button></div>
        <div class="a-toc-w">${blk('EN', 'sm')}<p>Nicomachean Ethics</p></div>
        <div class="a-toc-go" data-jump-host><label for="a-go-${P.kind}">Go to a Bekker line</label><input id="a-go-${P.kind}" data-jump placeholder="1097a15" autocomplete="off" spellcheck="false"><p class="a-msg" data-jump-msg></p></div>
        <ol class="a-toc-b">${U.bookList().map((b) => `<li class="${b.b === 1 ? 'open' : ''}"><p class="a-toc-bh">Book ${ROMAN[b.b]}<small>${b.n} chapters</small></p>
          ${b.b === 1 ? `<ol class="a-toc-c">${U.chapterList().map((c) => `<li><a href="#" data-act="ch:${c.ch}" data-ch-link="${c.ch}"><span class="a-tn">${c.ch}</span><span class="a-tt">${esc(c.title)}</span></a></li>`).join('')}</ol>` : ''}</li>`).join('')}</ol>
      </aside>`;
    }
    if (P.ui.panel === 'book') {
      const left = phone ? 12 : at.x;
      return `<div class="a-menu" style="left:${left}px;top:${at.y + 8}px"><ul class="a-bm">${U.bookList().map((b) => `<li><a href="#" ${b.b === 1 ? 'data-act="ch:1" aria-current="true"' : 'data-act="msg:book"'}><b>${ROMAN[b.b]}</b><span>Book ${ROMAN[b.b]}</span><small>${b.n} chapters</small></a></li>`).join('')}</ul></div>`;
    }
    if (P.ui.panel === 'picker') {
      return `<div class="a-menu a-pk" style="right:${at.r}px;top:${at.y + 8}px"><p class="a-mk">Translation</p>${transList(S)}<p class="a-note2">Each translation keeps its own Bekker numbers in the margin.</p></div>`;
    }
    if (P.ui.panel === 'aa') {
      const sl = (k, label, min, max) => `<label class="a-sl"><span>${label}</span><output>${Math.round(S[k] * 100)}%</output><input type="range" min="${min}" max="${max}" step="0.05" value="${S[k]}" data-range="${k}"></label>`;
      return `<div class="a-menu a-aa" style="${phone ? 'left:12px;right:12px' : `right:${at.r}px`};top:${at.y + 8}px">
        ${views(S)}
        ${phone ? `<p class="a-mk">Translation</p>${transList(S)}` : ''}
        ${sl('fs', 'Text size', 0.8, 1.4)}${sl('lh', 'Line spacing', 0.85, 1.4)}${phone ? '' : sl('cw', 'Column width', 0.75, 1.3)}
        <label class="a-chk"><input type="checkbox" checked> <span>Add the citation when I copy Greek</span></label>
        <p class="a-aa-f"><button type="button" data-noop>Print</button><button type="button" data-act="reset">Reset</button></p>
      </div>`;
    }
    return '';
  };

  // ── Search ───────────────────────────────────────────────────────────────
  A.search = () => {
    const R = U.search;
    const en = R.groups.find((g) => g.work === 'EN');
    const b1 = en.books.find((b) => b.book === 1);
    return `<div class="a-page">${nav('search')}
      <section class="a-sq">
        <div class="a-sq-f">${ICON.search}<input value="${esc(R.q)}" lang="grc" aria-label="Search" data-search><button type="button" class="a-btn pri" data-go="search">Search</button></div>
        <p class="a-sq-o"><span class="a-seg" role="group" aria-label="Language"><button type="button" aria-pressed="true">Greek</button><button type="button">English</button><button type="button">Both</button></span>
          <span class="a-sq-x">any form · accents ignored · all works</span><a href="#" data-noop>More options</a><a href="#" data-noop>How search works</a></p>
      </section>
      <section class="a-sr">
        <p class="a-sr-n"><b>${fmt(R.count)}</b> places in <b>${R.works.length}</b> works for <span lang="grc">${esc(R.head)}</span>, ${esc(R.gloss)}. <a href="#" data-go="lexicon:arete">Lexicon entry</a> <a href="#" data-noop>Export as CSV</a></p>
        <p class="a-sr-w">${R.works.map((x, i) => `<a href="#" data-noop class="${i === 0 ? 'on' : ''}">${esc(x.title)} <span>${x.count}</span></a>`).join('')}</p>
        <section class="a-sg"><h2>Nicomachean Ethics <span>${en.count} places, Book I shown</span></h2>
          ${b1.chapters.map((c) => `<div class="a-sch"><h3>Book I, chapter ${esc(c.chapter)} <span>${esc(U.TITLES[c.chapter] || '')}</span></h3>
            ${(() => { let last = ''; return c.hits.map((h) => { const win = U.hitWindow(h.cite, h.form); const e = U.engAt(h.cite, 'ross'); const same = e === last; last = e; return `<div class="a-hit"><a href="#" class="a-hr" data-go="reader:${h.cite}">${h.cite}</a><div class="a-hg" lang="grc">${win ? win.filter((l) => l.here).map((l) => l.html).join(' ') : esc(h.form)}</div>${same ? '' : `<p class="a-he">${esc(e)} <span>Ross</span></p>`}</div>`; }).join(''); })()}</div>`).join('')}
        </section>
        ${R.groups.filter((g) => g.work !== 'EN').slice(0, 5).map((g) => `<section class="a-sg closed"><h2>${esc(g.title)} <span>${g.count} place${g.count === 1 ? '' : 's'}</span></h2><p class="a-refs">${g.books.flatMap((b) => b.chapters.map((c) => `${U.work(g.work).books > 1 ? `${ROMAN[b.book] || b.book}.` : ''}${c.chapter}`)).slice(0, 16).map((x) => `<span>${x}</span>`).join('')}</p></section>`).join('')}
      </section>
      ${foot()}</div>`;
  };

  // ── Lexicon ──────────────────────────────────────────────────────────────
  A.lexicon = (S) => {
    const L = U.lemmaPage(S.lex) || U.lemmaPage('arete');
    const dz = L.distinctiveness;
    return `<div class="a-page">${nav('lexicon')}
      <section class="a-lx">
        ${U.block(U.caps(L.head), 'xl')}
        <div class="a-lx-g"><p class="a-lx-w" lang="grc">${esc(L.head)}</p><p class="a-lx-gl">${esc((L.glosses || []).join('; '))}</p></div>
        <dl class="a-lx-n">
          <div><dt>in Aristotle</dt><dd>${fmt(L.count)}</dd></div>
          ${dz ? `<div><dt>in authors before him</dt><dd>${fmt(dz.before_aristotle)}</dd></div><div><dt>in his contemporaries</dt><dd>${fmt(dz.contemporary)}</dd></div>` : ''}
          <div><dt>works</dt><dd>${L.byWork.length}</dd></div>
        </dl>
      </section>
      <section class="a-sec"><header class="a-sh"><h2>By work</h2></header><ol class="a-bw">${L.byWork.map((x) => `<li><a href="#" data-go="work:${x.work}"><span>${esc(x.title)}</span><b>${x.count}</b></a></li>`).join('')}</ol></section>
      <section class="a-sec a-lx-two"><div><header class="a-sh"><h2>LSJ</h2></header>${U.t8(L.key)}</div>
        <div><header class="a-sh"><h2>Key passages</h2></header><p class="a-p">Bonitz’s <i>Index Aristotelicus</i> sorts the places by sense and marks the ones that decide each meaning. They will appear here once the transcription reaches this word.</p>
        <header class="a-sh"><h2>Nearby</h2></header><p class="a-near">${U.ALPHA.slice(0, 18).map((x) => `<a href="#" data-noop${x[1] === L.slug ? ' class="on"' : ''} lang="grc">${esc(x[0])}</a>`).join('')}</p></div></section>
      ${foot()}</div>`;
  };
})();
