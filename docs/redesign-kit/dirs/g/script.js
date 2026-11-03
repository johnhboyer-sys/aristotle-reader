/* Direction G · Type. Type alone, no pictures: Noto Serif Display for
   titles, the works list and numerals; Libertinus Serif for reading. Two
   inks: black and vermilion. (Round six first opened each page on a large
   glossed sentence; John took it out of the home, work and reader pages.) */
(function () {
  'use strict';
  const U = window.U;
  const { esc, fmt, ROMAN } = U;
  const G = (window.T.g = {});
  G.keepPanelOnTrans = true;

  const ICON = {
    close: '<svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><path d="M3.5 3.5l9 9M12.5 3.5l-9 9" stroke="currentColor" stroke-width="1.3"/></svg>',
    moon: '<svg viewBox="0 0 16 16" width="15" height="15" aria-hidden="true"><path d="M13.2 10.1A5.6 5.6 0 0 1 5.9 2.8a5.6 5.6 0 1 0 7.3 7.3z" fill="none" stroke="currentColor" stroke-width="1.2"/></svg>',
    search: '<svg viewBox="0 0 16 16" width="15" height="15" aria-hidden="true"><circle cx="6.8" cy="6.8" r="4.6" fill="none" stroke="currentColor" stroke-width="1.3"/><path d="M10.4 10.4 14 14" stroke="currentColor" stroke-width="1.3"/></svg>',
    menu: '<svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><path d="M2 4.5h12M2 8h12M2 11.5h8" stroke="currentColor" stroke-width="1.3"/></svg>',
    caret: '<svg viewBox="0 0 10 6" width="9" height="6" aria-hidden="true"><path d="M1 1l4 4 4-4" fill="none" stroke="currentColor" stroke-width="1.2"/></svg>',
  };

  // A title as large as the column and its data-fmax allow, on at most
  // data-lines lines.
  function fitTitle(el) {
    const W = el.clientWidth;
    if (!W) return;
    const lines = +el.dataset.lines || 2;
    let lo = +el.dataset.fmin || 28;
    let hi2 = +el.dataset.fmax || 120;
    let best = lo;
    for (let i = 0; i < 9; i++) {
      const f = (lo + hi2) / 2;
      el.style.fontSize = `${f}px`;
      const lh = parseFloat(getComputedStyle(el).lineHeight) || f;
      if (el.scrollHeight <= lh * lines + 2 && el.scrollWidth <= W + 1) { best = f; lo = f; } else hi2 = f;
    }
    el.style.fontSize = `${Math.floor(best)}px`;
    el.dataset.w = String(W);
  }
  const refit = (el) => fitTitle(el);
  const RO = new ResizeObserver((entries) => {
    for (const e of entries) {
      const el = e.target;
      if (!el.isConnected) { RO.unobserve(el); continue; }
      if (String(el.clientWidth) !== el.dataset.w) refit(el);
    }
  });
  function fitAll(P) {
    for (const el of P.view.querySelectorAll('[data-fit]')) { refit(el); RO.observe(el); }
  }
  G.after = (S, P) => fitAll(P);
  G.fitText = fitAll;
  Promise.all([
    document.fonts.load('400 100px "Noto Serif Display"', 'ἀβγ abc'),
    document.fonts.load('italic 400 100px "Noto Serif Display"', 'abc'),
    document.fonts.load('400 20px "Libertinus Serif"', 'ἀβγ abc'),
    document.fonts.load('italic 400 20px "Libertinus Serif"', 'abc'),
  ]).catch(() => []).then(() => U.shown().forEach(fitAll));

  // ── Frame: masthead and foot ──────────────────────────────────────────────
  const nav = (on) => `<header class="g-nav">
      <a class="g-brand" href="#" data-go="home">Aristotle <i>Reader</i></a>
      <nav class="g-links" aria-label="Site">
        ${[['home', 'Works'], ['search', 'Search'], ['lexicon', 'Lexicon'], ['phrases', 'Phrases'], ['support', 'Support']].map(([k, l]) => {
          const live = k !== 'phrases' && k !== 'support';
          return `<a href="#" ${live ? `data-go="${k}"` : 'data-noop'} class="${on === k ? 'on' : ''}${live ? '' : ' g-x-s'}"${on === k ? ' aria-current="page"' : ''}>${l}</a>`;
        }).join('')}
        <button type="button" class="g-ib" data-act="theme" aria-label="Dark or light">${ICON.moon}</button>
      </nav>
    </header>`;
  const foot = () => `<footer class="g-foot">
      <p class="g-foot-a"><span class="g-sc">Also</span> <a href="#" data-noop>The Plato Reader</a> <a href="#" data-noop>The Homer Reader</a> <a href="#" data-noop>The Greek Drama Reader</a> <a href="#" data-noop>Grammata</a></p>
      <p class="g-foot-b"><a href="#" data-noop>Texts &amp; licences</a> <a href="#" data-noop>Support</a> <a href="#" data-noop>Desktop app</a> <a href="#" data-noop>Report an error</a> <a href="#" data-noop>Play a game</a> <span>Site by John H. Boyer</span></p>
    </footer>`;
  const DIV = { 'Logic (Organon)': 'Logic', 'Natural Philosophy': 'Nature', Metaphysics: 'Metaphysics', 'Moral and Political Philosophy': 'Ethics and politics', 'Rhetoric and Poetics': 'Rhetoric and poetics' };
  const divName = (d) => (d.appendix ? 'Doubted and spurious' : DIV[d.title] || d.title);
  const tag = (w) => (w.authenticity && w.authenticity !== 'genuine' ? `<span class="g-tag">${esc(w.authenticity)}</span>` : '');

  // Porphyry's Isagoge is not in the registry's divisions; it stands after the logic.
  const withIsa = (divs) => { const isa = U.work('Isa'); return divs.map((d) => (d.numeral === 'I' && isa ? { ...d, groups: [...d.groups, { ref: '', label: 'With it, a commentary', works: [{ ...isa, title: 'Porphyry, Isagoge' }] }] } : d)); };
  // ── Home ─────────────────────────────────────────────────────────────────
  G.home = (S, P) => {
    const divs = withIsa(U.divisions());
    return `<div class="g-page">${nav('home')}
      <section class="g-intro g-intro-top">
        <p class="g-lead">The complete works of Aristotle in Greek, with English beside it. Click a Greek word to see what it is and read its dictionary entry; search every work in either language.</p>
        <div class="g-intro-r">
          <div class="g-search">${ICON.search}<input data-search placeholder="φύσις, justice, ἀρετή" aria-label="Search the works" autocomplete="off" spellcheck="false"><button type="button" data-go="search">Search</button></div>
          <p class="g-cont"><a href="#" data-go="reader:${U.RESUME.cite}">Go on with the <i>Nicomachean Ethics</i>, Book I, chapter 7</a></p>
        </div>
      </section>
      <section class="g-cat" aria-label="The works">
        <h2 class="g-cat-h"><span>The works</span> <small>forty-one, by subject</small></h2>
        ${divs.map((d, n) => `<div class="g-div">
            <h3 class="g-dh"><span class="g-dn">${d.appendix ? '' : esc(d.numeral)}</span>${esc(divName(d))}</h3>
            <div class="g-dw">${d.groups.map((g) => `<p class="g-wl">${g.label ? `<span class="g-sub">${esc(g.label.replace(/\s*\(.*\)/, ''))}</span> ` : ''}${g.works.map((x) => `<a href="#" class="g-w" data-go="work:${x.id}"><span class="g-wt${x.title.length <= 26 ? ' g-nw' : ''}">${esc(x.title)}</span>${d.appendix ? '' : tag(x)} <span class="g-wg${x.greekTitle.length <= 24 ? ' g-nw' : ''}" lang="grc">${esc(x.greekTitle)}</span></a>`).join('<span class="g-sep" aria-hidden="true">&nbsp;· </span>')}</p>`).join('')}</div>
          </div>`).join('')}
      </section>
      ${foot()}</div>`;
  };

  // ── A work ───────────────────────────────────────────────────────────────
  const books = (w) => {
    const en = w.id === 'EN';
    const bs = U.workBooks(w.id);
    const go = (b, c) => (en && b.n === 1 ? `reader:${c.bekker.split('–')[0]}` : 'reader');
    const row = (b, c) => `<li><a href="#" data-go="${go(b, c)}"><span class="g-cn">${esc(c.ch)}</span><span class="g-ct">${esc(c.title || `Chapter ${c.ch}`)}</span><span class="g-cb">${esc(c.bekker)}</span></a></li>`;
    if (bs.length < 2) return `<ol class="g-chs g-chs-one">${(bs[0] ? bs[0].chapters : []).map((c) => row(bs[0], c)).join('')}</ol>`;
    const span = (b) => { const s = U.bookSpan(w, b.n); return s ? `${s[0]}–${s[1]}` : ''; };
    return `<p class="g-bkall"><button type="button" data-act="books:open">Open all</button><button type="button" data-act="books:close">Close all</button></p>
      <div class="g-bks">${bs.map((b) => `<details class="g-bk" data-book="${b.n}"><summary>
          <span class="g-bkn" lang="${/[α-ωΑ-Ω]/.test(b.label) ? 'grc' : 'en'}"><span class="g-vh">Book </span>${esc(b.label)}</span>
          ${b.chapters[0] && b.chapters[0].title ? `<span class="g-bkf">${esc(b.chapters[0].title)}</span>` : LETTER[b.label] ? `<span class="g-bkf">${LETTER[b.label]}</span>` : `<span class="g-bkf g-bkf-n">${esc(span(b))}</span>`}
          <span class="g-bkc">${b.chapters.length} chapter${b.chapters.length === 1 ? '' : 's'}${b.chapters[0] && b.chapters[0].title || LETTER[b.label] ? `<span class="g-bks2"> · ${esc(span(b))}</span>` : ''}</span>
        </summary><ol class="g-chs">${b.chapters.map((c) => row(b, c)).join('')}</ol></details>`).join('')}</div>`;
  };
  // The Metaphysics names its books by Greek letters; say them.
  const LETTER = { 'Α': 'Alpha', 'α': 'Little alpha', 'Β': 'Beta', 'Γ': 'Gamma', 'Δ': 'Delta', 'Ε': 'Epsilon', 'Ζ': 'Zeta', 'Η': 'Eta', 'Θ': 'Theta', 'Ι': 'Iota', 'Κ': 'Kappa', 'Λ': 'Lambda', 'Μ': 'Mu', 'Ν': 'Nu' };
  const LEN = (n) => ['', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen'][n] || String(n);

  G.work = (S, P) => {
    const w = U.work(S.workId) || U.work('EN');
    const en = w.id === 'EN';
    const d = U.divisionOf(w.id);
    const phone = P.kind === 'phone';
    const trs = w.translations.map((t) => ({ ...t, ...U.transParts(t) }));
    const many = U.workBooks(w.id).length > 1;
    const fr = U.further(w.id);
    const kinds = { translation: 'Translation', commentary: 'Commentary', collection: 'In print' };
    const isa = U.work('Isa');
    const nch = U.chapterCount(w.id);
    const tl = w.title.length;
    const fmax = phone ? (tl > 30 ? 42 : tl > 16 ? 56 : 68) : (tl > 30 ? 84 : tl > 16 ? 120 : 150);
    return `<div class="g-page">${nav('home')}
      <p class="g-crumb"><a href="#" data-go="home">Works</a> <span aria-hidden="true">/</span> ${d ? esc(divName(d)) : 'Commentary'}</p>
      <header class="g-wh">
        <h1 class="g-wt1" data-fit="title" data-fmax="${fmax}" data-fmin="${phone ? 30 : 48}" data-lines="${phone ? 3 : 2}">${esc(w.title)}</h1>
        <p class="g-wmeta"><span class="g-wgt" lang="grc">${esc(w.greekTitle)}</span><span>${many ? `${LEN(w.books)} books, ` : ''}${nch} chapter${nch === 1 ? '' : 's'}</span>${tag(w)}</p>
      </header>
      <section class="g-wa">
        <p class="g-blurb">${esc(w.blurb)}</p>
        <div class="g-ctas">
          <a href="#" class="g-btn pri" data-go="reader">Start reading</a>
          ${en ? `<a href="#" class="g-btn" data-go="reader:${U.RESUME.cite}">Go on at Book I, chapter 7</a>` : ''}
          <a href="#" class="g-btn" data-go="reader:greek">Greek only</a>
          ${trs.length > 1 ? '<a href="#" class="g-btn" data-go="reader:compare">Compare translations</a>' : ''}
        </div>
        ${en ? '' : '<p class="g-mock">In this mockup the reader opens the <i>Nicomachean Ethics</i>.</p>'}
      </section>
      <section class="g-sec g-facts-s">
        <dl class="g-facts">
          <div><dt>Greek</dt><dd>${esc(w.greekSource.full)}</dd></div>
          <div><dt>English</dt><dd>${trs.map((t) => `<a href="#" data-go="reader:${t.id}">${esc(t.who)}</a>, ${esc(t.pub)}${t.year ? `, ${esc(t.year)}` : ''}${trs.length > 1 && (w.defaultTranslation || trs[0].id) === t.id ? ' <small>opens first</small>' : ''}`).join('<br>')}</dd></div>
          <div><dt>Length</dt><dd>${esc(U.extent(w))}${U.spanText(w) ? `, ${esc(U.spanText(w))}` : ''}</dd></div>
        </dl>
      </section>
      <section class="g-sec">
        <h2 class="g-h2">${many ? 'Books and chapters' : 'Chapters'}</h2>${en ? '<p class="g-note3">Chapter titles are Ostwald’s.</p>' : ''}
        ${books(w)}
      </section>
      <section class="g-sec g-two">
        ${fr.length ? `<div><h2 class="g-h2">In print</h2><ul class="g-print">${fr.map((r) => `<li><small>${kinds[r.kind] || r.kind}</small><span>${r.cite}</span></li>`).join('')}</ul></div>` : ''}
        <div>${w.commentaries ? `<h2 class="g-h2">Commentary</h2><ul class="g-trs"><li><a href="#" data-go="work:Isa"><span>Porphyry, <i>Isagoge</i></span><small>${esc(isa.blurb)}</small></a></li></ul>` : ''}
          <h2 class="g-h2">Sources</h2><p class="g-cred"><a href="#" data-noop>Texts &amp; licences</a></p></div>
      </section>
      ${foot()}</div>`;
  };

  // ── The reader ───────────────────────────────────────────────────────────
  G.reader = (S) => `<div class="g-rd" data-body>
      <header class="g-rh" data-sticky>
        <button type="button" class="g-ib g-rh-toc" data-act="panel:toc" aria-label="Contents">${ICON.menu}</button>
        <a class="g-rh-w" href="#" data-go="work:EN"><span class="full">Nicomachean Ethics</span><span class="short">Ethics</span></a>
        <button type="button" class="g-rh-b" data-act="panel:book" data-keep>Book I ${ICON.caret}</button>
        <span class="g-rh-ch"><b data-here-ch>1</b><i data-here-title></i></span>
        <span class="g-msg" data-jump-msg></span>
        <span class="g-sp"></span>
        <span class="g-seg hide-s" role="group" aria-label="Reading view">${['greek', 'both', 'english'].map((v) => `<button type="button" data-act="view:${v}" aria-pressed="${S.view === v}">${v[0].toUpperCase() + v.slice(1)}</button>`).join('')}</span>
        <button type="button" class="g-rh-b hide-s" data-act="panel:picker" data-keep data-hp="tr"></button>
        <button type="button" class="g-ib hide-s" data-go="search" aria-label="Search">${ICON.search}</button>
        <button type="button" class="g-ib g-aab" data-act="panel:aa" data-keep aria-label="Text and view settings">Aa</button>
        <button type="button" class="g-ib" data-act="theme" aria-label="Dark or light">${ICON.moon}</button>
      </header>
      <main class="g-text" data-text></main>
    </div>`;

  G.hp = { tr: (S) => `${esc(U.trans(S.trans).short)}${S.cmp ? ` and ${esc(U.trans(S.cmp).short)}` : ''} ${ICON.caret}` };

  G.text = (S) => {
    const tr = U.readerTrans(S);
    const cols = S.view === 'greek' ? ['g'] : S.view === 'english' ? tr : ['g', ...tr];
    let lastSi = -1;
    let html = `<header class="g-open">
        <p class="g-open-k"><span>Nicomachean Ethics</span></p>
        <h2 class="g-open-t">Book I</h2>
        <p class="g-open-s"><span lang="grc">Ἠθικὰ Νικομάχεια Α</span><span>Greek: Bywater, 1894</span>${S.view === 'greek' ? '' : `<span>English: ${tr.map((t) => `${esc(U.trans(t).who)}, ${esc(U.trans(t).year)}`).join(' and ')}</span>`}</p>
      </header>`;
    for (const bk of U.BLOCKS) {
      const segStart = bk.si !== lastSi;
      lastSi = bk.si;
      if (bk.start) html += `<div class="g-chh"><span class="g-chn">${esc(bk.chapter)}</span><div class="g-chx"><p class="g-cht">${esc(U.TITLES[bk.chapter] || '')}</p><p class="g-chb">Chapter ${esc(bk.chapter)} · ${esc(bk.bekker)}</p></div></div>`;
      html += `<div class="g-row" style="--n:${cols.length}">${cols.map((c) => {
        if (c === 'g') {
          return `<div class="g-gc" lang="grc">${bk.lines.map((L, i) => {
            const first = segStart && i === 0 && !L.cont;
            const num = L.cont ? '' : first || L.n === 1 ? `${bk.col}${L.n === 1 ? '' : L.n}` : U.showNum(L.n) ? L.n : '';
            return `<div class="g-gl${L.cont ? ' cont' : ''}"${L.cont ? '' : ` data-cite="${bk.col}${L.n}"`}><span class="g-lt">${U.lineHTML(bk, L)}</span><span class="g-ln${typeof num === 'string' && num ? ' col' : ''}" aria-hidden="${num === '' ? 'true' : 'false'}">${num}</span></div>`;
          }).join('')}</div>`;
        }
        return `<div class="g-ec" data-t="${c}">${U.engHTML(bk, c)}</div>`;
      }).join('')}</div>`;
    }
    return html;
  };

  G.side = (S) => {
    if (!S.word) return '';
    const cards = U.cards(S.word.k);
    const bk = U.blockOfCite(S.word.cite);
    return `<aside class="g-side" role="dialog" aria-label="Word: ${esc(S.word.t)}">
      <div class="g-side-h"><p class="g-w" lang="grc">${esc(S.word.t)}</p><p class="g-loc">Book I, chapter ${esc(bk ? bk.chapter : '1')} · ${esc(S.word.cite)}</p><button type="button" class="g-x" data-act="close:word" aria-label="Close">${ICON.close}</button></div>
      <div class="g-side-b">
        ${cards.length ? cards.map((c) => `<section class="g-card">
          <p class="g-lem" lang="grc">${esc(c.head)}${c.hom ? `<small>${esc(c.hom)}</small>` : ''}</p>
          ${c.gloss ? `<p class="g-gls">${esc(c.gloss)}</p>` : ''}
          <ul class="g-prs">${c.rows.map((r) => `<li>${esc(U.longParse(r.text))}${r.dialect ? ` <em>${esc(r.dialect)}</em>` : ''}</li>`).join('')}</ul>
          <p class="g-card-f">${c.lsj ? `<button type="button" data-act="card:${esc(c.id)}" aria-expanded="${S.card === c.id}">${S.card === c.id ? 'Hide' : 'Show'} the LSJ entry</button>` : ''}${c.ref ? `<a href="#" data-go="lexicon:${esc(c.ref.slug)}">${fmt(c.ref.count)} times in Aristotle</a>` : ''}</p>
          ${S.card === c.id ? U.t8(c.lsj) : ''}
        </section>`).join('') : '<p class="g-none">No analysis for this form.</p>'}
        <p class="g-keys"><button type="button" data-act="step:-1">← Previous word</button><button type="button" data-act="step:1">Next word →</button></p>
      </div>
    </aside>`;
  };

  G.note = (S, P) => {
    if (!P.ui.fn) return '';
    const at = P.ui.fnAt || { x: 600, y: 300 };
    const wpx = P.kind === 'phone' ? 340 : 380;
    const x = Math.max(12, Math.min(at.x - 20, P.W0 - wpx - 12));
    return `<div class="g-note" style="left:${x}px;top:${at.y + 6}px;width:${wpx}px" role="note"><p class="g-note-k">Ostwald’s note ${esc(P.ui.fn.split('.')[1])}</p><p>${U.footnote(P.ui.fn)}</p><button type="button" class="g-x" data-act="close:fn" aria-label="Close">${ICON.close}</button></div>`;
  };

  const views = (S) => `<div class="g-seg wide" role="group" aria-label="Reading view">${['greek', 'both', 'english'].map((v) => `<button type="button" data-act="view:${v}" aria-pressed="${S.view === v}">${v[0].toUpperCase() + v.slice(1)}</button>`).join('')}</div>`;
  const transList = (S) => `<ul class="g-pick">${U.EN_TRANS.map((t) => `<li><button type="button" data-act="trans:${t.id}" aria-pressed="${S.trans === t.id}"><span>${esc(t.who)}</span><small>${esc(t.pub)}, ${esc(t.year)}</small></button></li>`).join('')}</ul>
      <p class="g-mk">Beside it, to compare</p>
      <p class="g-cmps">${U.EN_TRANS.filter((t) => t.id !== S.trans).map((t) => `<button type="button" data-act="cmp:${t.id}" aria-pressed="${S.cmp === t.id}">${esc(t.short)}</button>`).join('')}<button type="button" data-act="cmp:off" aria-pressed="${!S.cmp}">None</button></p>`;
  G.panel = (S, P) => {
    const at = P.ui.panelAt || { x: 20, y: 60, r: 20 };
    const phone = P.kind === 'phone';
    if (P.ui.panel === 'toc') {
      return `<aside class="g-toc" aria-label="Contents">
        <div class="g-toc-h"><a href="#" data-go="home">All works</a><button type="button" class="g-x" data-act="close:panel" aria-label="Close">${ICON.close}</button></div>
        <p class="g-toc-w">Nicomachean Ethics</p>
        <p class="g-toc-g" lang="grc">Ἠθικὰ Νικομάχεια</p>
        <div class="g-toc-go" data-jump-host><label for="g-go-${P.kind}">Go to a Bekker line</label><input id="g-go-${P.kind}" data-jump placeholder="1097a15" autocomplete="off" spellcheck="false"><p class="g-msg" data-jump-msg></p></div>
        <ol class="g-toc-b">${U.bookList().map((b) => `<li${b.b === 1 ? ' class="now"' : ''}><p class="g-toc-bh"><span><b>${ROMAN[b.b]}</b>Book ${ROMAN[b.b]}</span><small>${b.n} chapters</small></p>
          ${b.b === 1 ? `<ol class="g-toc-c">${U.chapterList().map((c) => `<li><a href="#" data-act="ch:${c.ch}" data-ch-link="${c.ch}"${c.ch === (P.ui.hereCh || S.hereCh || '1') ? ' class="now" aria-current="true"' : ''}><span>${c.ch}</span>${esc(c.title)}</a></li>`).join('')}</ol>` : ''}</li>`).join('')}</ol>
      </aside>`;
    }
    if (P.ui.panel === 'book') return `<div class="g-menu g-bmenu" style="left:${phone ? 12 : at.x}px;top:${at.y + 8}px"><ul class="g-bm">${U.bookList().map((b) => `<li><a href="#" ${b.b === 1 ? 'data-act="ch:1" aria-current="true"' : 'data-act="msg:book"'}><span><b>${ROMAN[b.b]}</b> Book ${ROMAN[b.b]}</span><small>${b.n} chapters</small></a></li>`).join('')}</ul></div>`;
    if (P.ui.panel === 'picker') return `<div class="g-menu g-pk" style="right:${at.r}px;top:${at.y + 8}px"><p class="g-mk">Translation</p>${transList(S)}<p class="g-note2">Each translation keeps its own Bekker numbers in its margin.</p></div>`;
    if (P.ui.panel === 'aa') {
      const sl = (k, label, min, max) => `<label class="g-sl"><span>${label}</span><output>${Math.round(S[k] * 100)}%</output><input type="range" min="${min}" max="${max}" step="0.05" value="${S[k]}" data-range="${k}"></label>`;
      return `<div class="g-menu g-aa" style="${phone ? 'left:12px;right:12px' : `right:${at.r}px`};top:${at.y + 8}px">
        ${views(S)}${phone ? `<p class="g-mk">Translation</p>${transList(S)}` : ''}
        ${sl('fs', 'Text size', 0.8, 1.4)}${sl('lh', 'Line spacing', 0.85, 1.4)}${phone ? '' : sl('cw', 'Column width', 0.75, 1.3)}
        <label class="g-chk"><input type="checkbox" checked> <span>Add the citation when I copy Greek</span></label>
        <p class="g-aa-f"><button type="button" data-noop>Print</button><button type="button" data-act="reset">Reset</button>${phone ? '<button type="button" class="g-aa-x" data-act="close:panel">Close</button>' : ''}</p>
      </div>`;
    }
    return '';
  };

  // ── Search ───────────────────────────────────────────────────────────────
  // The hits as a concordance: each place on one line, its form in a red
  // column down the page, the words before it set flush right against it.
  const kwic = (h) => {
    const win = U.hitWindow(h.cite, h.form);
    if (!win) return { l: '', k: esc(h.form), r: '' };
    const at = win.findIndex((x) => x.here);
    const here = win[at].html;
    const i = here.indexOf('<span class="tok hit"');
    if (i < 0) return { l: win.slice(0, at).map((x) => x.html).join(' '), k: esc(h.form), r: here + ' ' + win.slice(at + 1).map((x) => x.html).join(' ') };
    const j = here.indexOf('</span>', i) + 7;
    return {
      l: [...win.slice(0, at).map((x) => x.html), here.slice(0, i)].join(' '),
      k: here.slice(i, j),
      r: [here.slice(j), ...win.slice(at + 1).map((x) => x.html)].join(' '),
    };
  };
  G.search = () => {
    const R = U.search;
    const en = R.groups.find((g) => g.work === 'EN');
    const b1 = en.books.find((b) => b.book === 1);
    return `<div class="g-page">${nav('search')}
      <section class="g-sq">
        <div class="g-sq-f"><input value="${esc(R.q)}" lang="grc" aria-label="Search" data-search><button type="button" class="g-btn pri" data-go="search">Search</button></div>
        <p class="g-sq-o"><span class="g-seg" role="group" aria-label="Language"><button type="button" aria-pressed="true">Greek</button><button type="button" aria-pressed="false">English</button><button type="button" aria-pressed="false">Both</button></span><span>Any form, accents ignored, all works</span><a href="#" data-noop>More options</a><a href="#" data-noop>How search works</a></p>
      </section>
      <section class="g-sr">
        <p class="g-sr-sum"><span class="g-sr-big">${fmt(R.count)}</span> <span class="g-sr-t">places in ${R.works.length} works for <b lang="grc">${esc(R.head)}</b>, ${esc(R.gloss)}.</span></p>
        <p class="g-sr-l"><a href="#" data-go="lexicon:arete">The word in the lexicon</a><a href="#" data-noop>Export as CSV</a></p>
        <p class="g-sr-w">${R.works.map((x, i) => `<a href="#" data-noop class="${i === 0 ? 'on' : ''}"${i === 0 ? ' aria-current="true"' : ''}>${esc(x.title)} <span>${x.count}</span></a>`).join('')}</p>
        <section class="g-sg"><h2>Nicomachean Ethics <span>${en.count} places, Book I shown</span></h2>
          ${b1.chapters.map((c) => `<div class="g-sch"><h3><b>${esc(c.chapter)}</b> ${esc(U.TITLES[c.chapter] || '')}</h3>
            ${(() => { let last = ''; return c.hits.map((h) => { const x = kwic(h); const e = U.engAt(h.cite, 'ross'); const same = e === last; last = e; return `<div class="g-hit"><a href="#" class="g-hr" data-go="reader:${h.cite}">${h.cite}</a><div class="g-hl" lang="grc"><span dir="ltr">${x.l}</span></div><div class="g-hk" lang="grc">${x.k}${x.r}</div>${same ? '' : `<p class="g-he">${esc(e)} <span>Ross</span></p>`}</div>`; }).join(''); })()}</div>`).join('')}
        </section>
        ${R.groups.filter((g) => g.work !== 'EN').slice(0, 6).map((g) => `<section class="g-sg closed"><h2>${esc(g.title)} <span>${g.count} place${g.count === 1 ? '' : 's'}</span></h2></section>`).join('')}
      </section>
      ${foot()}</div>`;
  };

  // ── Lexicon ──────────────────────────────────────────────────────────────
  // The headword, then the sentence that defines the human good, the word
  // picked out in red inside it.
  const DEF = { g: [['τὸ ἀνθρώπινον', 'the human'], ['ἀγαθὸν', 'good'], ['ψυχῆς', 'of soul'], ['ἐνέργεια', 'activity'], ['γίνεται', 'turns out'], ['κατ’ ἀρετήν', 'by virtue']] };
  G.lexicon = (S, P) => {
    const L = U.lemmaPage(S.lex) || U.lemmaPage('arete');
    const dz = L.distinctiveness;
    const phone = P.kind === 'phone';
    const forms = {};
    for (const g of L.instancesByWork) for (const b of g.books) for (const c of b.chapters) for (const i of c.instances) { const f = i[2].normalize('NFD').replace(/̀/g, '́').normalize('NFC'); forms[f] = (forms[f] || 0) + 1; }
    return `<div class="g-page">${nav('lexicon')}
      <section class="g-lx">
        <p class="g-lx-k"><a href="#" data-noop>Lexicon</a> <span aria-hidden="true">/</span> ${fmt(U.LEMMA_TOTAL)} words</p>
        <h1 class="g-lx-h"><span class="g-lx-w" lang="grc">${esc(L.head)}</span><span class="g-lx-a" lang="grc">ἡ</span></h1>
        <p class="g-lx-gl">${esc((L.glosses || []).join('; '))}</p>
        <p class="g-lx-n"><b>${fmt(L.count)}</b> times in Aristotle, in ${L.byWork.length} works${dz ? `; <b>${fmt(dz.before_aristotle)}</b> in the authors before him, <b>${fmt(dz.contemporary)}</b> in those of his time` : ''}.</p>
        <p class="g-lx-f"><span class="g-sc">Forms</span> ${Object.entries(forms).sort((a, b) => b[1] - a[1]).map(([f, n]) => `<span><i lang="grc">${esc(f)}</i> ${n}</span>`).join('')}</p>
      </section>
      <section class="g-lx-q">
        <p class="g-lx-qk"><span class="g-sc">In a sentence</span></p>
        <blockquote class="g-q">
          <p class="g-lx-ex" lang="grc">${DEF.g.map(([g]) => (/ἀρετ/.test(g) ? `<b>${esc(g)}</b>` : esc(g))).join(' ')}</p>
          <p class="g-en g-en-l">human good turns out to be activity of soul in accordance with virtue</p>
        </blockquote>
        <p class="g-src"><span><a href="#" data-go="work:EN"><i>Nicomachean Ethics</i></a>, Book I, chapter 7, <a href="#" class="g-nb" data-go="reader:1098a16">1098a16–17</a></span><span>Translated by W. D. Ross</span></p>
      </section>
      <section class="g-sec g-lx-cols">
        <div><h2 class="g-h2">By work</h2><ol class="g-bw">${L.byWork.map((x) => `<li><a href="#" data-go="work:${x.work}"><span>${esc(x.title)}</span><b>${x.count}</b></a></li>`).join('')}</ol></div>
        <div><h2 class="g-h2">LSJ</h2>${U.t8(L.key)}</div>
      </section>
      <section class="g-sec g-two">
        <div><h2 class="g-h2">Key passages</h2><p class="g-p">Bonitz’s <i>Index Aristotelicus</i> sorts the places by sense and marks the ones that settle each meaning. They will appear here once the transcription reaches this word.</p></div>
        <div><h2 class="g-h2">Nearby</h2><p class="g-near">${(() => { const i = Math.max(0, U.ALPHA.findIndex((x) => x[1] === L.slug)); return U.ALPHA.slice(Math.max(0, i - 11), i + 12); })().map((x) => `<a href="#" data-noop${x[1] === L.slug ? ' class="on" aria-current="true"' : ''} lang="grc">${esc(x[0])}</a>`).join('')}</p></div>
      </section>
      ${foot()}</div>`;
  };
})();
