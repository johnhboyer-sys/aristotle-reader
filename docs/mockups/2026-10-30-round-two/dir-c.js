/* Direction C · Diagram. Aristotle as the old diagrams drew him. The home
   page is a division of the sciences that names every work; each work page
   carries a diagram of its doctrine; contents, search results and counts are
   drawn as divisions too. Indigo ink and ochre on white. */
(function () {
  'use strict';
  const U = window.U;
  const G = window.DIAGRAMS;
  const { esc, fmt, ROMAN } = U;
  const C = (window.T.c = {});
  C.keepPanelOnTrans = true;

  const ICON = {
    close: '<svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><path d="M3.5 3.5l9 9M12.5 3.5l-9 9" stroke="currentColor" stroke-width="1.3"/></svg>',
    moon: '<svg viewBox="0 0 16 16" width="15" height="15" aria-hidden="true"><path d="M13.2 10.1A5.6 5.6 0 0 1 5.9 2.8a5.6 5.6 0 1 0 7.3 7.3z" fill="none" stroke="currentColor" stroke-width="1.2"/></svg>',
    search: '<svg viewBox="0 0 16 16" width="15" height="15" aria-hidden="true"><circle cx="6.8" cy="6.8" r="4.6" fill="none" stroke="currentColor" stroke-width="1.2"/><path d="M10.4 10.4 14 14" stroke="currentColor" stroke-width="1.2"/></svg>',
    menu: '<svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><circle cx="3" cy="8" r="1.6" fill="currentColor"/><path d="M4.6 8H8M8 3.5v9M8 3.5h6M8 8h6M8 12.5h6" stroke="currentColor" stroke-width="1.1" fill="none"/></svg>',
    caret: '<svg viewBox="0 0 10 6" width="9" height="6" aria-hidden="true"><path d="M1 1l4 4 4-4" fill="none" stroke="currentColor" stroke-width="1.2"/></svg>',
  };
  const tag = (w) => (w.authenticity && w.authenticity !== 'genuine' ? `<span class="c-tag">${esc(w.authenticity)}</span>` : '');
  const byTitle = (t) => U.divisions().find((d) => d.title === t);

  // The division of the works: Aristotle's own three kinds of science
  // (Metaphysics E.1), with logic apart as their instrument.
  function division() {
    const g = (t) => byTitle(t);
    const nat = g('Natural Philosophy');
    const ws = (d) => d.groups.flatMap((x) => x.works);
    return [
      { k: 'Instrument', gk: 'ὄργανον', note: 'logic', kids: [{ k: 'Logic', kids: [{ k: '', works: ws(g('Logic (Organon)')) }] }] },
      { k: 'Theoretical', gk: 'θεωρητική', kids: [
        { k: 'Natural philosophy', kids: nat.groups.map((x) => ({ k: x.label.replace(' (Parva Naturalia)', ''), works: x.works })) },
        { k: 'First philosophy', kids: [{ k: '', works: ws(g('Metaphysics')) }] },
      ] },
      { k: 'Practical', gk: 'πρακτική', kids: [{ k: 'Ethics and politics', kids: [{ k: '', works: ws(g('Moral and Political Philosophy')) }] }] },
      { k: 'Productive', gk: 'ποιητική', kids: [{ k: 'Rhetoric and poetics', kids: [{ k: '', works: ws(g('Rhetoric and Poetics')) }] }] },
    ];
  }
  const leaf = (w, on) => `<li><a href="#" class="c-leaf${on ? ' on' : ''}" data-go="work:${w.id}"><span class="c-lt">${esc(w.title)}${tag(w)}</span><span class="c-lg" lang="grc">${esc(w.greekTitle)}</span>${G.has(w.id) ? '<i class="c-hasd" title="Has a diagram"></i>' : ''}</a></li>`;
  function tree(opts = {}) {
    const on = opts.on;
    const path = (w) => !on || w.id === on;
    const L1 = division().map((a) => {
      const L2 = a.kids.map((b) => {
        const L3 = b.kids.map((c) => {
          const works = c.works.filter(path);
          if (!works.length) return '';
          return `<li><span class="c-n n3${c.k ? '' : ' pass'}">${esc(c.k)}</span><ul class="c-u">${works.map((w) => leaf(w, w.id === on)).join('')}</ul></li>`;
        }).filter(Boolean);
        if (!L3.length) return '';
        return `<li><span class="c-n n2">${esc(b.k)}</span><ul class="c-u">${L3.join('')}</ul></li>`;
      }).filter(Boolean);
      if (!L2.length) return '';
      return `<li><span class="c-n n1"><b>${esc(a.k)}</b><i lang="grc">${esc(a.gk)}</i></span><ul class="c-u">${L2.join('')}</ul></li>`;
    }).filter(Boolean);
    return `<div class="c-tree${opts.small ? ' small' : ''}"><div class="c-root"><span class="c-n n0"><b>${opts.small ? 'The works' : 'Aristotle'}</b></span><ul class="c-u">${L1.join('')}</ul></div></div>`;
  }
  C.tree = tree;

  const nav = (on) => `<header class="c-nav">
      <a class="c-brand" href="#" data-go="home"><i class="c-brand-d"></i>Aristotle Reader</a>
      <nav class="c-links" aria-label="Site">
        ${[['home', 'Works'], ['search', 'Search'], ['lexicon', 'Lexicon'], ['phrases', 'Phrases'], ['support', 'Support']].map(([k, l]) => `<a href="#" ${k === 'phrases' || k === 'support' ? 'data-noop' : `data-go="${k}"`} class="${on === k ? 'on' : ''}${k === 'phrases' || k === 'support' ? ' c-x-s' : ''}">${l}</a>`).join('')}
        <button type="button" class="c-ib" data-act="theme" aria-label="Dark or light">${ICON.moon}</button>
      </nav>
    </header>`;
  const foot = () => `<footer class="c-foot">
      <p>Also: <a href="#" data-noop>The Plato Reader</a> <a href="#" data-noop>The Homer Reader</a> <a href="#" data-noop>The Greek Drama Reader</a> <a href="#" data-noop>Grammata</a></p>
      <p><a href="#" data-noop>Texts &amp; licences</a> <a href="#" data-noop>Support</a> <a href="#" data-noop>Desktop app</a> <a href="#" data-noop>Report an error</a> <a href="#" data-noop>Play a game</a> <span>Site by John H. Boyer</span></p>
    </footer>`;

  // ── Home ─────────────────────────────────────────────────────────────────
  C.home = () => {
    const app = U.divisions().find((d) => d.appendix);
    const aw = app ? app.groups.flatMap((g) => g.works) : [];
    return `<div class="c-page">${nav('home')}
      <section class="c-hero">
        <h1 class="c-h1">The complete works of Aristotle in Greek and English</h1>
        <div class="c-hero-r">
          <p class="c-lead">Click any Greek word to parse it and read its dictionary entry. Search every work in Greek or English.</p>
          <div class="c-search">${ICON.search}<input data-search placeholder="φύσις, justice, ἀρετή …" aria-label="Search the corpus" autocomplete="off" spellcheck="false"><button type="button" data-go="search">Search</button></div>
          <p class="c-cont"><a href="#" data-go="reader:${U.RESUME.cite}"><i class="c-dot"></i>Continue reading <span><i>Nicomachean Ethics</i>, Book I, chapter 7</span></a></p>
        </div>
      </section>
      <section class="c-div">
        <header class="c-dh"><h2>The works, divided</h2><p>“Every science is either practical or productive or theoretical” (<i>Metaphysics</i> E.1, 1025b25). Logic stands apart as the instrument of all three. A dot marks a work with a diagram.</p></header>
        ${tree()}
      </section>
      <section class="c-div">
        <header class="c-dh"><h2>Doubted and spurious works</h2></header>
        <div class="c-app"><span class="c-n n0 app">Attributed</span><ul class="c-u c-cols">${aw.map((w) => leaf(w)).join('')}</ul></div>
      </section>
      ${foot()}</div>`;
  };

  // ── A work ───────────────────────────────────────────────────────────────
  C.work = (S) => {
    const w = U.work(S.workId) || U.work('EN');
    const en = w.id === 'EN';
    const trs = w.translations.map((t) => ({ ...t, ...U.transParts(t) }));
    const books = U.workBooks(w.id);
    const fr = U.further(w.id);
    const kinds = { translation: 'Translation', commentary: 'Commentary', collection: 'In print' };
    const isa = U.work('Isa');
    const many = books.length > 1;
    const app = U.divisions().find((d) => d.appendix);
    const doubted = app && app.groups.some((g) => g.works.some((x) => x.id === w.id));
    const fig = G.has(w.id)
      ? `<figure class="c-fig">${G[w.id]()}<figcaption>${G[w.id].cap}</figcaption></figure>`
      : `<figure class="c-fig c-where"><p class="c-wh">Where it stands</p>${w.id === 'Isa' ? '<p class="c-p">Porphyry’s introduction to the <i>Categories</i>, read with the logical works.</p>' : doubted ? `<div class="c-app"><span class="c-n n0 app">Attributed</span><ul class="c-u">${leaf(w, true)}</ul></div>` : tree({ on: w.id, small: true })}</figure>`;
    return `<div class="c-page">${nav('')}
      <section class="c-wk">
        ${fig}
        <div class="c-wk-t">
          <p class="c-crumb"><a href="#" data-go="home">Works</a></p>
          <p class="c-wk-gt" lang="grc">${esc(w.greekTitle)}</p>
          <h1 class="c-wk-h1">${esc(w.title)}${tag(w)}</h1>
          <p class="c-wk-blurb">${esc(w.blurb)}</p>
          <div class="c-ctas">
            <a href="#" class="c-btn pri" data-go="reader">Start reading</a>
            ${en ? `<a href="#" class="c-btn" data-go="reader:${U.RESUME.cite}">Resume at Book I, chapter 7</a>` : ''}
            <a href="#" class="c-btn" data-go="reader:greek">Greek only</a>
            ${trs.length > 1 ? '<a href="#" class="c-btn" data-go="reader:compare">Compare translations</a>' : ''}
          </div>
          ${en ? '' : '<p class="c-mock">In this mockup the reader opens the <i>Ethics</i>.</p>'}
          <dl class="c-facts">
            <dt>Greek</dt><dd>${esc(w.greekSource.short || w.greekSource.full)}</dd>
            <dt>English</dt><dd>${trs.map((t) => `${esc(t.who)}, ${esc(t.year)}`).join('<br>')}</dd>
            <dt>Length</dt><dd>${esc(U.extent(w))}</dd>
          </dl>
        </div>
      </section>
      <section class="c-sec">
        <header class="c-sh"><h2>${many ? 'Books and chapters' : 'Chapters'}</h2>${en ? '<p>Chapter titles are Ostwald’s.</p>' : ''}</header>
        <div class="c-books${many ? '' : ' one'}">
          ${books.map((b) => `<section class="c-bk">
            ${many ? `<h3><i class="c-node"></i>Book ${esc(b.label)}<small>${b.chapters.length} chapters</small></h3>` : ''}
            <ol class="c-chs">${b.chapters.map((c) => `<li><a href="#" data-go="${en && b.n === 1 ? `reader:${c.bekker.split('–')[0]}` : 'reader'}"><span class="c-cn">${esc(c.ch)}</span><span class="c-ct">${esc(c.title || `Chapter ${c.ch}`)}</span><span class="c-cb">${esc(c.bekker)}</span></a></li>`).join('')}</ol>
          </section>`).join('')}
        </div>
      </section>
      <section class="c-sec c-two">
        <div><header class="c-sh"><h2>Translations</h2></header>
          <ul class="c-trs">${trs.map((t) => `<li><a href="#" data-go="reader:${t.id}"><span>${esc(t.who)}</span><small>${esc(t.pub)}${t.year ? `, ${esc(t.year)}` : ''}${(w.defaultTranslation || trs[0].id) === t.id ? ' · opens first' : ''}</small></a></li>`).join('')}</ul>
          ${w.commentaries ? `<header class="c-sh"><h2>Commentary</h2></header><ul class="c-trs"><li><a href="#" data-go="work:Isa"><span>Porphyry, <i>Isagoge</i></span><small>${esc(isa.blurb)}</small></a></li></ul>` : ''}</div>
        <div>${fr.length ? `<header class="c-sh"><h2>In print</h2></header><ul class="c-print">${fr.map((r) => `<li><small>${kinds[r.kind] || r.kind}</small><span>${r.cite}</span></li>`).join('')}</ul>` : ''}
          <header class="c-sh"><h2>Sources</h2></header><p class="c-cred"><b>Greek</b> ${esc(w.greekSource.full)}<br><b>English</b> ${trs.map((t) => esc(t.name)).join('; ')}<br><a href="#" data-noop>Texts &amp; licences</a></p></div>
      </section>
      ${foot()}</div>`;
  };

  // ── The reader ───────────────────────────────────────────────────────────
  C.reader = (S) => `<div class="c-rd" data-body>
      <header class="c-rh" data-sticky>
        <button type="button" class="c-ib" data-act="panel:toc" aria-label="Contents">${ICON.menu}</button>
        <a class="c-rh-w" href="#" data-go="work:EN"><span class="full">Nicomachean Ethics</span><span class="short">Ethics</span></a>
        <button type="button" class="c-rh-b" data-act="panel:book" data-keep>Book I ${ICON.caret}</button>
        <span class="c-rh-ch"><i class="c-node"></i><span>Chapter <b data-here-ch>1</b></span><em data-here-title></em></span>
        <span class="c-msg" data-jump-msg></span>
        <span class="c-sp"></span>
        <span class="c-seg hide-s" role="group" aria-label="Reading view">${['greek', 'both', 'english'].map((v) => `<button type="button" data-act="view:${v}" aria-pressed="${S.view === v}">${v[0].toUpperCase() + v.slice(1)}</button>`).join('')}</span>
        <button type="button" class="c-rh-b hide-s" data-act="panel:picker" data-keep data-hp="tr"></button>
        <button type="button" class="c-ib hide-s" data-go="search" aria-label="Search">${ICON.search}</button>
        <button type="button" class="c-ib c-aab" data-act="panel:aa" data-keep aria-label="Text and view settings">Aa</button>
        <button type="button" class="c-ib" data-act="theme" aria-label="Dark or light">${ICON.moon}</button>
      </header>
      <main class="c-text" data-text></main>
    </div>`;

  C.hp = { tr: (S) => `${esc(U.trans(S.trans).short)}${S.cmp ? ` and ${esc(U.trans(S.cmp).short)}` : ''} ${ICON.caret}` };

  C.text = (S) => {
    const tr = U.readerTrans(S);
    const cols = S.view === 'greek' ? ['g'] : S.view === 'english' ? tr : ['g', ...tr];
    let lastSi = -1;
    let html = `<div class="c-bookh"><p class="c-bk-gt" lang="grc">Ἠθικὰ Νικομάχεια Α</p><p class="c-bk-t">Nicomachean Ethics, Book I</p><p class="c-bk-s">Greek: Bywater, 1894${S.view === 'greek' ? '' : ` · English: ${tr.map((t) => `${esc(U.trans(t).who)}, ${esc(U.trans(t).year)}`).join(' and ')}`}</p></div>`;
    for (const bk of U.BLOCKS) {
      const segStart = bk.si !== lastSi;
      lastSi = bk.si;
      if (bk.start) html += `<div class="c-chh"><span class="c-chn">${esc(bk.chapter)}</span><i class="c-chl"></i><div><p class="c-cht">${esc(U.TITLES[bk.chapter] || '')}</p><p class="c-chb">Chapter ${esc(bk.chapter)} · ${esc(bk.bekker)}</p></div></div>`;
      html += `<div class="c-row" style="--n:${cols.length}">${cols.map((c) => {
        if (c === 'g') {
          return `<div class="c-gc" lang="grc">${bk.lines.map((L, i) => {
            const first = segStart && i === 0 && !L.cont;
            const num = L.cont ? '' : first || L.n === 1 ? `${bk.col}${L.n === 1 ? '' : L.n}` : U.showNum(L.n) ? L.n : '';
            return `<div class="c-gl${L.cont ? ' cont' : ''}"${L.cont ? '' : ` data-cite="${bk.col}${L.n}"`}><span class="c-ln${typeof num === 'string' && num ? ' col' : ''}">${num}</span><span class="c-lt">${U.lineHTML(bk, L)}</span></div>`;
          }).join('')}</div>`;
        }
        return `<div class="c-ec" data-t="${c}">${U.engHTML(bk, c)}</div>`;
      }).join('')}</div>`;
    }
    return html;
  };

  // The word sidebar: the word divided into its readings.
  C.side = (S) => {
    if (!S.word) return '';
    const cards = U.cards(S.word.k);
    const bk = U.blockOfCite(S.word.cite);
    return `<aside class="c-side" role="dialog" aria-label="Word: ${esc(S.word.t)}">
      <div class="c-side-h"><p class="c-w" lang="grc">${esc(S.word.t)}</p><p class="c-loc">Book I, chapter ${esc(bk ? bk.chapter : '1')} · ${esc(S.word.cite)}</p><button type="button" class="c-x" data-act="close:word" aria-label="Close">${ICON.close}</button></div>
      <div class="c-side-b">
        ${cards.length ? `<ul class="c-cards">${cards.map((c) => `<li class="c-card">
          <p class="c-lem"><i class="c-node"></i><span lang="grc">${esc(c.head)}</span>${c.hom ? `<small>${esc(c.hom)}</small>` : ''}</p>
          ${c.gloss ? `<p class="c-gls">${esc(c.gloss)}</p>` : ''}
          <ul class="c-prs">${c.rows.map((r) => `<li>${esc(U.longParse(r.text))}${r.dialect ? ` <em>${esc(r.dialect)}</em>` : ''}</li>`).join('')}</ul>
          <p class="c-card-f">${c.lsj ? `<button type="button" data-act="card:${esc(c.id)}" aria-expanded="${S.card === c.id}">${S.card === c.id ? 'Hide' : 'Show'} the LSJ entry</button>` : ''}${c.ref ? `<a href="#" data-go="lexicon:${esc(c.ref.slug)}">${fmt(c.ref.count)} times in Aristotle</a>` : ''}</p>
          ${S.card === c.id ? U.t8(c.lsj) : ''}
        </li>`).join('')}</ul>` : '<p class="c-none">No analysis for this form.</p>'}
        <p class="c-keys"><button type="button" data-act="step:-1">← Previous word</button><button type="button" data-act="step:1">Next word →</button></p>
      </div>
    </aside>`;
  };

  C.note = (S, P) => {
    if (!P.ui.fn) return '';
    const at = P.ui.fnAt || { x: 600, y: 300 };
    const wpx = P.kind === 'phone' ? 340 : 380;
    const x = Math.max(12, Math.min(at.x - 20, P.W0 - wpx - 12));
    return `<div class="c-note" style="left:${x}px;top:${at.y + 6}px;width:${wpx}px" role="note"><p class="c-note-k">Ostwald’s note ${esc(P.ui.fn.split('.')[1])}</p><p>${U.footnote(P.ui.fn)}</p><button type="button" class="c-x" data-act="close:fn" aria-label="Close">${ICON.close}</button></div>`;
  };

  const views = (S) => `<div class="c-seg wide" role="group" aria-label="Reading view">${['greek', 'both', 'english'].map((v) => `<button type="button" data-act="view:${v}" aria-pressed="${S.view === v}">${v[0].toUpperCase() + v.slice(1)}</button>`).join('')}</div>`;
  const transList = (S) => `<ul class="c-pick">${U.EN_TRANS.map((t) => `<li><button type="button" data-act="trans:${t.id}" aria-pressed="${S.trans === t.id}"><span>${esc(t.who)}</span><small>${esc(t.pub)}, ${esc(t.year)}</small></button></li>`).join('')}</ul>
      <p class="c-mk">Beside it</p>
      <p class="c-cmps">${U.EN_TRANS.filter((t) => t.id !== S.trans).map((t) => `<button type="button" data-act="cmp:${t.id}" aria-pressed="${S.cmp === t.id}">${esc(t.short)}</button>`).join('')}<button type="button" data-act="cmp:off" aria-pressed="${!S.cmp}">None</button></p>`;
  C.panel = (S, P) => {
    const at = P.ui.panelAt || { x: 20, y: 60, r: 20 };
    const phone = P.kind === 'phone';
    if (P.ui.panel === 'toc') {
      return `<aside class="c-toc" aria-label="Contents">
        <div class="c-toc-h"><a href="#" data-go="home">All works</a><button type="button" class="c-x" data-act="close:panel" aria-label="Close">${ICON.close}</button></div>
        <p class="c-toc-w">Nicomachean Ethics</p>
        <div class="c-toc-go" data-jump-host><label for="c-go-${P.kind}">Go to a Bekker line</label><input id="c-go-${P.kind}" data-jump placeholder="1097a15" autocomplete="off" spellcheck="false"><p class="c-msg" data-jump-msg></p></div>
        <ol class="c-toc-b">${U.bookList().map((b) => `<li${b.b === 1 ? ' class="open"' : ''}><p class="c-toc-bh"><i class="c-node"></i>Book ${ROMAN[b.b]}<small>${b.n} chapters</small></p>
          ${b.b === 1 ? `<ol class="c-toc-c">${U.chapterList().map((c) => `<li><a href="#" data-act="ch:${c.ch}" data-ch-link="${c.ch}"><span>${c.ch}</span>${esc(c.title)}</a></li>`).join('')}</ol>` : ''}</li>`).join('')}</ol>
      </aside>`;
    }
    if (P.ui.panel === 'book') return `<div class="c-menu" style="left:${phone ? 12 : at.x}px;top:${at.y + 8}px"><ul class="c-bm">${U.bookList().map((b) => `<li><a href="#" ${b.b === 1 ? 'data-act="ch:1" aria-current="true"' : 'data-act="msg:book"'}><span>Book ${ROMAN[b.b]}</span><small>${b.n} chapters</small></a></li>`).join('')}</ul></div>`;
    if (P.ui.panel === 'picker') return `<div class="c-menu c-pk" style="right:${at.r}px;top:${at.y + 8}px"><p class="c-mk">Translation</p>${transList(S)}<p class="c-note2">Each translation keeps its own Bekker numbers in the margin.</p></div>`;
    if (P.ui.panel === 'aa') {
      const sl = (k, label, min, max) => `<label class="c-sl"><span>${label}</span><output>${Math.round(S[k] * 100)}%</output><input type="range" min="${min}" max="${max}" step="0.05" value="${S[k]}" data-range="${k}"></label>`;
      return `<div class="c-menu c-aa" style="${phone ? 'left:12px;right:12px' : `right:${at.r}px`};top:${at.y + 8}px">
        ${views(S)}${phone ? `<p class="c-mk">Translation</p>${transList(S)}` : ''}
        ${sl('fs', 'Text size', 0.8, 1.4)}${sl('lh', 'Line spacing', 0.85, 1.4)}${phone ? '' : sl('cw', 'Column width', 0.75, 1.3)}
        <label class="c-chk"><input type="checkbox" checked> <span>Add the citation when I copy Greek</span></label>
        <p class="c-aa-f"><button type="button" data-noop>Print</button><button type="button" data-act="reset">Reset</button></p>
      </div>`;
    }
    return '';
  };

  // ── Search: results drawn as a division (work, chapter, place) ──────────
  C.search = () => {
    const R = U.search;
    const en = R.groups.find((g) => g.work === 'EN');
    const b1 = en.books.find((b) => b.book === 1);
    return `<div class="c-page">${nav('search')}
      <section class="c-sq">
        <div class="c-sq-f">${ICON.search}<input value="${esc(R.q)}" lang="grc" aria-label="Search" data-search><button type="button" class="c-btn pri" data-go="search">Search</button></div>
        <p class="c-sq-o"><span class="c-seg" role="group" aria-label="Language"><button type="button" aria-pressed="true">Greek</button><button type="button">English</button><button type="button">Both</button></span><span>any form · accents ignored · all works</span><a href="#" data-noop>More options</a><a href="#" data-noop>How search works</a></p>
      </section>
      <section class="c-sr">
        <p class="c-sr-n"><b>${fmt(R.count)}</b> places in ${R.works.length} works for <span lang="grc">${esc(R.head)}</span>, ${esc(R.gloss)}. <a href="#" data-go="lexicon:arete">Lexicon</a> <a href="#" data-noop>Export as CSV</a></p>
        <div class="c-res">
          <p class="c-res-w"><i class="c-node"></i>Nicomachean Ethics <small>${en.count} places · Book I shown</small></p>
          <ul class="c-res-ch">${b1.chapters.map((c) => `<li><p class="c-res-c">Chapter ${esc(c.chapter)} <i>${esc(U.TITLES[c.chapter] || '')}</i></p>
            <ul class="c-res-h">${(() => { let last = ''; return c.hits.map((h) => { const win = U.hitWindow(h.cite, h.form); const e = U.engAt(h.cite, 'ross'); const same = e === last; last = e; return `<li><a href="#" class="c-hr" data-go="reader:${h.cite}">${h.cite}</a><div class="c-hg" lang="grc">${win ? win.filter((l) => l.here).map((l) => l.html).join(' ') : esc(h.form)}</div>${same ? '' : `<p class="c-he">${esc(e)} <span>Ross</span></p>`}</li>`; }).join(''); })()}</ul></li>`).join('')}</ul>
        </div>
        ${R.groups.filter((g) => g.work !== 'EN').slice(0, 5).map((g) => `<p class="c-res-w closed"><i class="c-node o"></i>${esc(g.title)} <small>${g.count} place${g.count === 1 ? '' : 's'}</small></p>`).join('')}
      </section>
      ${foot()}</div>`;
  };

  // ── Lexicon: where the word falls, as a division with counts ────────────
  C.lexicon = (S) => {
    const L = U.lemmaPage(S.lex) || U.lemmaPage('arete');
    const dz = L.distinctiveness;
    const count = Object.fromEntries(L.byWork.map((x) => [x.work, x.count]));
    const branches = division().map((a) => {
      const ws = a.kids.flatMap((b) => b.kids.flatMap((c) => c.works)).filter((w) => count[w.id]);
      return ws.length ? { a, ws, n: ws.reduce((s, w) => s + count[w.id], 0) } : null;
    }).filter(Boolean);
    const app = U.divisions().find((d) => d.appendix);
    const aw = (app ? app.groups.flatMap((g) => g.works) : []).filter((w) => count[w.id]);
    if (aw.length) branches.push({ a: { k: 'Doubted', gk: '' }, ws: aw, n: aw.reduce((s, w) => s + count[w.id], 0) });
    return `<div class="c-page">${nav('lexicon')}
      <section class="c-lx">
        <p class="c-lx-w" lang="grc">${esc(L.head)}</p>
        <p class="c-lx-gl">${esc((L.glosses || []).join('; '))}</p>
        <dl class="c-lx-n">
          <div><dt>in Aristotle</dt><dd>${fmt(L.count)}</dd></div>
          ${dz ? `<div><dt>in authors before him</dt><dd>${fmt(dz.before_aristotle)}</dd></div><div><dt>in his contemporaries</dt><dd>${fmt(dz.contemporary)}</dd></div>` : ''}
          <div><dt>works</dt><dd>${L.byWork.length}</dd></div>
        </dl>
      </section>
      <section class="c-sec"><header class="c-sh"><h2>Where it falls</h2><p>Places in each work</p></header>
        <div class="c-tree lex"><div class="c-root"><span class="c-n n0"><b lang="grc">${esc(L.head)}</b><i>${fmt(L.count)}</i></span><ul class="c-u">${branches.map(({ a, ws, n }) => `<li><span class="c-n n1"><b>${esc(a.k)}</b><i>${n}</i></span><ul class="c-u">${ws.sort((x, y) => count[y.id] - count[x.id]).map((w) => `<li><a href="#" class="c-leaf" data-go="work:${w.id}"><span class="c-lt">${esc(w.title)}</span><b class="c-ln2">${count[w.id]}</b></a></li>`).join('')}</ul></li>`).join('')}</ul></div></div>
      </section>
      <section class="c-sec c-two"><div><header class="c-sh"><h2>LSJ</h2></header>${U.t8(L.key)}</div>
        <div><header class="c-sh"><h2>Key passages</h2></header><p class="c-p">Bonitz’s <i>Index Aristotelicus</i> sorts the places by sense and marks the ones that decide each meaning. They will appear here once the transcription reaches this word.</p>
        <header class="c-sh"><h2>Nearby</h2></header><p class="c-near">${U.ALPHA.slice(0, 18).map((x) => `<a href="#" data-noop${x[1] === L.slug ? ' class="on"' : ''} lang="grc">${esc(x[0])}</a>`).join('')}</p></div></section>
      ${foot()}</div>`;
  };
})();
