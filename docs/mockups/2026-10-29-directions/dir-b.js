/* Direction B · Organon. Aristotle's logical works are the Organon, "the
   instrument". The reader as an instrument for close reading: outline, text
   and word inspector side by side, a status line, the keyboard throughout. */
(function () {
  'use strict';
  const U = window.U;
  const { esc, fmt, ROMAN } = U;
  const B = (window.T.b = {});
  B.sideInline = true;
  B.keepPanelOnTrans = false;

  const I = {
    search: '<svg viewBox="0 0 16 16" width="15" height="15" aria-hidden="true"><circle cx="6.8" cy="6.8" r="4.6" fill="none" stroke="currentColor" stroke-width="1.3"/><path d="M10.4 10.4 14 14" stroke="currentColor" stroke-width="1.3"/></svg>',
    book: '<svg viewBox="0 0 16 16" width="15" height="15" aria-hidden="true"><path d="M8 3.6C6.6 2.6 4.2 2.6 2.6 3.1v9C4.2 11.6 6.6 11.6 8 12.6M8 3.6C9.4 2.6 11.8 2.6 13.4 3.1v9C11.8 11.6 9.4 11.6 8 12.6M8 3.6v9" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/></svg>',
    phr: '<svg viewBox="0 0 16 16" width="15" height="15" aria-hidden="true"><path d="M2.5 4.5h11M2.5 8h7M2.5 11.5h9" stroke="currentColor" stroke-width="1.3"/></svg>',
    moon: '<svg viewBox="0 0 16 16" width="15" height="15" aria-hidden="true"><path d="M13.2 10.1A5.6 5.6 0 0 1 5.9 2.8a5.6 5.6 0 1 0 7.3 7.3z" fill="none" stroke="currentColor" stroke-width="1.3"/></svg>',
    side: '<svg viewBox="0 0 16 16" width="15" height="15" aria-hidden="true"><rect x="2" y="2.5" width="12" height="11" fill="none" stroke="currentColor" stroke-width="1.2"/><path d="M6 2.5v11" stroke="currentColor" stroke-width="1.2"/></svg>',
    split: '<svg viewBox="0 0 16 16" width="15" height="15" aria-hidden="true"><rect x="2" y="2.5" width="12" height="11" fill="none" stroke="currentColor" stroke-width="1.2"/><path d="M8 2.5v11" stroke="currentColor" stroke-width="1.2"/></svg>',
    caret: '<svg viewBox="0 0 10 6" width="9" height="6" aria-hidden="true"><path d="M1 1l4 4 4-4" fill="none" stroke="currentColor" stroke-width="1.3"/></svg>',
    x: '<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" stroke-width="1.3"/></svg>',
    help: '<svg viewBox="0 0 16 16" width="15" height="15" aria-hidden="true"><circle cx="8" cy="8" r="6" fill="none" stroke="currentColor" stroke-width="1.2"/><path d="M6.3 6.4a1.8 1.8 0 1 1 2.4 1.7c-.5.2-.7.6-.7 1.1v.4M8 11.3v.2" fill="none" stroke="currentColor" stroke-width="1.2"/></svg>',
  };

  // The title bar, on every page.
  const bar = (crumbs, S) => `<header class="b-bar">
      <a href="#" class="b-brand" data-go="home"><span class="b-mark" aria-hidden="true">Α</span>Aristotle Reader</a>
      <nav class="b-crumbs" aria-label="Where you are">${crumbs.map((c) => (c.go ? `<a href="#" data-go="${c.go}">${esc(c.t)}</a>` : `<span>${esc(c.t)}</span>`)).join('<i>/</i>')}</nav>
      <div class="b-cmd" data-jump-host>${I.search}<input data-jump placeholder="Go to 1094a1, a work, or a Greek word" aria-label="Go to" autocomplete="off" spellcheck="false"><kbd>⌘K</kbd><span class="b-msg" data-jump-msg></span></div>
      <div class="b-tools">
        <a href="#" class="b-ib" data-go="search" title="Search" aria-label="Search">${I.search}</a>
        <a href="#" class="b-ib" data-go="lexicon" title="Lexicon" aria-label="Lexicon">${I.book}</a>
        <a href="#" class="b-ib" data-noop title="Phrases" aria-label="Phrases">${I.phr}</a>
        <button type="button" class="b-ib" data-act="theme" title="Dark or light" aria-label="Dark or light">${I.moon}</button>
        <a href="#" class="b-ib" data-noop title="Help" aria-label="Help">${I.help}</a>
        <a href="#" class="b-sup" data-noop>Support</a>
      </div>
    </header>`;
  const foot = () => `<footer class="b-foot"><span>The Aristotle Reader · Greek from the TLG · public-domain translations</span><span><a href="#" data-noop>Texts and licences</a><a href="#" data-noop>Desktop app</a><a href="#" data-noop>Report an error</a><a href="#" data-noop>Plato</a><a href="#" data-noop>Homer</a><a href="#" data-noop>Greek Drama</a><a href="#" data-noop>Grammata</a></span></footer>`;

  // ── Home: a command field, then the corpus as an index ───────────────────
  const GROUPS = [
    ['all', 'All'], ['I', 'Logic'], ['II.a', 'Nature'], ['II.b', 'Parva naturalia'], ['II.c', 'Biology'], ['III', 'Metaphysics'], ['IV', 'Ethics and politics'], ['V', 'Rhetoric and poetics'], ['app', 'Doubted'],
  ];
  function rowsOf() {
    const out = [];
    U.divisions().forEach((d) => d.groups.forEach((g) => g.works.forEach((w) => out.push({ w, key: d.appendix ? 'app' : g.ref || d.numeral, div: d, grp: g }))));
    return out;
  }
  B.homeState = { f: 'all', sort: 'bekker', q: '' };
  function corpusTable(S) {
    const st = B.homeState;
    let rows = rowsOf().filter((r) => st.f === 'all' || r.key === st.f || (st.f === 'II' && r.key.startsWith('II')));
    if (st.q) {
      const q = U.fold(st.q);
      rows = rows.filter((r) => U.fold(r.w.title).includes(q) || U.fold(r.w.greekTitle || '').includes(q) || r.w.abbr.toLowerCase().includes(q.replace(/\./g, '')) || r.w.id.toLowerCase().includes(q));
    }
    if (st.sort === 'az') rows.sort((a, b) => a.w.title.localeCompare(b.w.title));
    if (st.sort === 'len') rows.sort((a, b) => U.pages(b.w) - U.pages(a.w));
    const maxP = Math.max(...U.W.map((w) => U.pages(w)));
    let lastKey = '';
    const body = rows.map((r) => {
      let head = '';
      if (st.sort === 'bekker' && r.key !== lastKey) {
        lastKey = r.key;
        const label = r.div.appendix ? 'Works of doubted or spurious authorship' : r.grp.label ? `${r.div.title} · ${r.grp.label}` : r.div.title;
        head = `<tr class="b-gr"><th colspan="6"><span>${esc(r.div.numeral ? (r.grp.ref || r.div.numeral) : '—')}</span>${esc(label)}</th></tr>`;
      }
      const w = r.w;
      const pg = U.pages(w);
      return `${head}<tr><td><a href="#" data-go="work:${w.id}"><span class="b-t">${esc(w.title)}</span><span class="b-g" lang="grc">${esc(w.greekTitle || '')}</span></a></td>
        <td class="b-m">${esc(U.spanText(w))}</td><td class="b-n">${w.books}</td><td class="b-n">${U.chapterCount(w.id)}</td>
        <td class="b-len"><span><i style="width:${pg ? ((pg / maxP) * 100).toFixed(1) : 0}%"></i></span><b>${pg || '—'}</b></td>
        <td class="b-tr">${w.translations.map((t) => esc(t.short)).join(', ')}${w.authenticity !== 'genuine' ? ' <em>doubted</em>' : ''}</td></tr>`;
    }).join('');
    return `<table class="b-table"><thead><tr><th>Work</th><th>Bekker</th><th class="b-n">Books</th><th class="b-n">Ch.</th><th>Pages</th><th>Translations</th></tr></thead><tbody>${body || '<tr><td colspan="6" class="b-empty">No work matches.</td></tr>'}</tbody></table>`;
  }
  B.home = (S) => `<div class="b-app b-doc">${bar([{ t: 'Corpus' }], S)}
    <div class="b-scroll" data-scroll>
      <div class="b-home">
        <section class="b-home-main">
          <div class="b-go" data-jump-host>
            <label for="b-go-big">Go to a passage, a work or a word</label>
            <div class="b-go-f">${I.search}<input id="b-go-big" data-jump placeholder="1094a1 · De Anima · ψυχή" autocomplete="off" spellcheck="false"><button type="button" data-act="jumpgo">Go</button></div>
            <p class="b-go-try">Try <a href="#" data-act="try:1097a15">1097a15</a> <a href="#" data-act="try:430a10">430a10</a> <a href="#" data-go="work:DA">De Anima</a> <a href="#" data-go="lexicon:arete" lang="grc">ἀρετή</a></p>
            <p class="b-msg" data-jump-msg></p>
          </div>
          <a href="#" class="b-cont" data-go="reader:${U.RESUME.cite}"><span class="b-cont-k">Continue</span><span class="b-cont-t">Nicomachean Ethics · Book I · Chapter 7</span><span class="b-mono">${U.RESUME.cite}</span><span class="b-cont-p"><i style="width:7%"></i></span><span class="b-cont-o">Ostwald</span></a>
          <div class="b-idx-h">
            <h1>The corpus <small>${U.W.filter((w) => w.id !== 'Isa').length} works and Porphyry’s Isagoge · ${fmt(U.corpusPages())} of Bekker’s 1,462 pages</small></h1>
            <div class="b-idx-ctl">
              <input class="b-filter" data-filter placeholder="Filter works" aria-label="Filter works" autocomplete="off">
              <span class="b-seg" role="group" aria-label="Sort">${[['bekker', 'Bekker order'], ['az', 'A–Z'], ['len', 'Length']].map(([k, l]) => `<button type="button" data-act="sort:${k}" aria-pressed="${B.homeState.sort === k}">${l}</button>`).join('')}</span>
            </div>
            <p class="b-chips" role="group" aria-label="Division">${GROUPS.map(([k, l]) => `<button type="button" data-act="grp:${k}" aria-pressed="${B.homeState.f === k}">${l}</button>`).join('')}</p>
          </div>
          <div class="b-idx" data-idx>${corpusTable(S)}</div>
        </section>
        <aside class="b-home-side">
          <h2>Tools</h2>
          <ul class="b-tl">
            <li><a href="#" data-go="search">${I.search}<span><b>Search</b>Greek and English, every translation</span></a></li>
            <li><a href="#" data-go="lexicon">${I.book}<span><b>Lexicon</b>${fmt(U.LEMMA_TOTAL)} words, counts and every place</span></a></li>
            <li><a href="#" data-noop>${I.phr}<span><b>Phrases</b>173,884 recurring phrases</span></a></li>
            <li><a href="#" data-noop>${I.help}<span><b>Search guide</b>Wildcards, lemmas, grammar, words near each other</span></a></li>
          </ul>
          <h2>Keys</h2>
          <dl class="b-keys"><dt><kbd>⌘K</kbd></dt><dd>Go to a passage, work or word</dd><dt><kbd>/</kbd></dt><dd>Search</dd><dt><kbd>[</kbd> <kbd>]</kbd></dt><dd>Previous and next book</dd><dt><kbd>←</kbd> <kbd>→</kbd></dt><dd>Previous and next word, once one is open</dd><dt><kbd>G</kbd> <kbd>B</kbd> <kbd>E</kbd></dt><dd>Greek, both, English</dd></dl>
          <h2>Support</h2>
          <p class="b-p">The reader is free. A gift pays for the work that keeps it so.</p>
          <a href="#" class="b-btn" data-noop>Make a gift</a>
        </aside>
      </div>
      ${foot()}
    </div>
  </div>`;
  B.act = (S, a, v) => {
    if (a === 'grp') { B.homeState.f = v; refreshIdx(); }
    if (a === 'sort') { B.homeState.sort = v; refreshIdx(); }
    if (a === 'try') { const i = U.$('#view [data-jump]'); if (i) { i.value = v; U.jump(v, i); } }
    if (a === 'hit') { B.hit = v; const p = U.$('#view [data-prev]'); if (p) p.innerHTML = preview(v); U.$$('#view .b-hit').forEach((n) => n.classList.toggle('on', n.dataset.act === `hit:${v}`)); }
    if (a === 'msg' && v === 'book') { const m = U.$('#view .b-st-msg'); if (m) m.textContent = 'This mockup carries Book I.'; }
    if (a === 'insp') { B.inspOff = !B.inspOff; U.$('#view .b-reader').classList.toggle('no-insp', B.inspOff); }
    if (a === 'outl') { B.outOff = !B.outOff; U.$('#view .b-reader').classList.toggle('no-out', B.outOff); }
    if (a === 'lexsort') { B.lexSort = v; U.render(true); }
  };
  function refreshIdx() {
    const el = U.$('#view [data-idx]');
    if (el) el.innerHTML = corpusTable(U.S);
    U.$$('#view [data-act^="grp:"]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.act === `grp:${B.homeState.f}`)));
    U.$$('#view [data-act^="sort:"]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.act === `sort:${B.homeState.sort}`)));
  }
  B.filter = (S, v) => { B.homeState.q = v; refreshIdx(); };

  // ── A work ───────────────────────────────────────────────────────────────
  B.work = (S) => {
    const w = U.work(S.workId) || U.work('EN');
    const en = w.id === 'EN';
    const chs = U.chapters(w.id);
    const books = Object.keys(chs).map(Number).sort((a, b) => a - b);
    const trs = w.translations.map((t) => ({ ...t, ...U.transParts(t) }));
    const maxLen = Math.max(...books.map((n) => { const sp = U.bookSpan(w, n); return sp ? U.citeX(sp[1]) - U.citeX(sp[0]) : 0; }));
    const ticks = { rackham: 'Mixed: fixed at section breaks, estimated between', ross: 'Fixed throughout', ostwald: 'Fixed throughout; his own chapter titles and notes', peters: 'Estimated throughout' };
    const d = U.divisionOf(w.id);
    return `<div class="b-app b-doc">${bar([{ t: 'Corpus', go: 'home' }, { t: w.title }], S)}
      <div class="b-split">
        <nav class="b-rail" aria-label="Corpus">${U.divisions().map((dv) => `<p class="b-rail-h">${esc(dv.appendix ? 'Doubted' : dv.title)}</p><ul>${dv.groups.flatMap((g) => g.works).map((x) => `<li><a href="#" data-go="work:${x.id}"${x.id === w.id ? ' aria-current="page"' : ''}>${esc(x.title)}<small>${esc(x.abbr)}</small></a></li>`).join('')}</ul>`).join('')}</nav>
        <div class="b-scroll" data-scroll><article class="b-wk">
          <p class="b-kick">${d ? esc(d.appendix ? 'Doubted or spurious' : d.title) : 'Commentary'} · ${esc(w.author)}${w.authenticity !== 'genuine' ? ' · <em>doubted</em>' : ''}</p>
          <h1>${esc(w.title)}</h1>
          <p class="b-gt" lang="grc">${esc(w.greekTitle || '')}</p>
          <p class="b-lede">${esc(w.blurb)}</p>
          <p class="b-acts"><a href="#" class="b-btn pri" data-go="reader">Read</a>${en ? `<a href="#" class="b-btn" data-go="reader:${U.RESUME.cite}">Resume at <span class="b-mono">${U.RESUME.cite}</span></a>` : ''}<a href="#" class="b-btn" data-go="reader:greek">Greek only</a>${trs.length > 1 ? '<a href="#" class="b-btn" data-go="reader:compare">Compare two translations</a>' : ''}</p>
          ${en ? '' : '<p class="b-note">In this mockup the reader opens the <i>Ethics</i>.</p>'}
          <dl class="b-meta">
            <div><dt>Greek text</dt><dd>${esc(w.greekSource.short)}</dd></div>
            <div><dt>${U.isBekker(w) ? 'Bekker' : 'Busse'}</dt><dd class="b-mono">${esc(U.spanText(w))}</dd></div>
            <div><dt>Books</dt><dd>${w.books}</dd></div>
            <div><dt>Chapters</dt><dd>${U.chapterCount(w.id)}</dd></div>
            <div><dt>Bekker pages</dt><dd>${U.pages(w) || '—'}</dd></div>
            <div><dt>Translations</dt><dd>${trs.length}</dd></div>
          </dl>
          <h2>Books</h2>
          <table class="b-table b-bk"><thead><tr><th>Book</th><th>Bekker</th><th class="b-n">Chapters</th><th>Length</th><th></th></tr></thead><tbody>
            ${books.map((n) => { const sp = U.bookSpan(w, n); const len = sp ? U.citeX(sp[1]) - U.citeX(sp[0]) : 0; const open = en && n === 1; return `<tr${open ? ' class="open"' : ''}><td><b>${esc(w.bookLabels[n - 1])}</b></td><td class="b-m">${sp ? `${esc(sp[0])}–${esc(sp[1])}` : ''}</td><td class="b-n">${chs[n].length}</td><td class="b-len"><span><i style="width:${((len / maxLen) * 100).toFixed(1)}%"></i></span></td><td><a href="#" class="b-open" data-go="${open ? 'reader' : `work:${w.id}`}">Open</a></td></tr>
              ${open ? `<tr class="b-chs"><td></td><td colspan="4"><ol>${U.chapterList().map((c) => `<li><a href="#" data-go="reader:${c.bekker.split('–')[0]}"><span class="b-n">${c.ch}</span><span>${esc(c.title)}</span><span class="b-m">${esc(c.bekker)}</span></a></li>`).join('')}</ol></td></tr>` : ''}`; }).join('')}
          </tbody></table>
          <h2>Translations</h2>
          <table class="b-table b-tt"><thead><tr><th>Translator</th><th>Published</th><th>Bekker numbers</th><th></th></tr></thead><tbody>
            ${trs.map((t) => `<tr><td><b>${esc(t.who)}</b>${(w.defaultTranslation || trs[0].id) === t.id ? ' <em>opens first</em>' : ''}</td><td>${esc(t.pub)} ${esc(t.year)}</td><td>${en ? esc(ticks[t.id] || '') : ''}</td><td><a href="#" class="b-open" data-go="reader:${t.id}">Read</a></td></tr>`).join('')}
          </tbody></table>
          ${w.commentaries ? `<h2>Commentary</h2><p class="b-p"><a href="#" data-go="work:Isa">Porphyry, <i>Isagoge</i></a>: ${esc(U.work('Isa').blurb)}</p>` : ''}
          ${U.further(w.id).length ? `<h2>In print</h2><ul class="b-print">${U.further(w.id).map((r) => `<li><span class="b-k">${esc(r.kind)}</span><span>${r.cite}</span></li>`).join('')}</ul>` : ''}
          <h2>Sources</h2><p class="b-p">Greek: ${esc(w.greekSource.full)} Translations: ${trs.map((t) => esc(t.name)).join('; ')}. <a href="#" data-noop>Texts and licences</a></p>
        </article>${foot()}</div>
      </div>
    </div>`;
  };

  // ── The reader: outline, text, inspector, status line ───────────────────
  B.reader = (S) => `<div class="b-app b-reader${B.inspOff ? ' no-insp' : ''}${B.outOff ? ' no-out' : ''}" data-body>
      ${bar([{ t: 'Corpus', go: 'home' }, { t: 'Nicomachean Ethics', go: 'work:EN' }, { t: 'Book I' }], S)}
      <div class="b-ws">
        <nav class="b-rail b-out" aria-label="Contents">
          <p class="b-rail-h">Nicomachean Ethics</p>
          <ol class="b-ol">${U.bookList().map((b) => `<li class="${b.b === 1 ? 'open' : ''}"><a href="#" ${b.b === 1 ? 'data-act="ch:1"' : 'data-act="msg:book"'} class="b-ob"><b>${ROMAN[b.b]}</b>Book ${ROMAN[b.b]}<small>${b.n}</small></a>
            ${b.b === 1 ? `<ol>${U.chapterList().map((c) => `<li><a href="#" data-act="ch:${c.ch}" data-ch-link="${c.ch}"><span class="b-n">${c.ch}</span><span class="b-ot">${esc(c.title)}<small class="b-m">${esc(c.bekker)}</small></span></a></li>`).join('')}</ol>` : ''}</li>`).join('')}</ol>
        </nav>
        <section class="b-center">
          <div class="b-tbar">
            <button type="button" class="b-tb b-ib2" data-act="outl" title="Show or hide the outline" aria-label="Outline">${I.side}</button>
            <span class="b-seg" role="group" aria-label="Reading view">${[['greek', 'Greek'], ['both', 'Both'], ['english', 'English']].map(([v, l]) => `<button type="button" data-act="view:${v}" aria-pressed="${S.view === v}">${l}</button>`).join('')}</span>
            <span class="b-tsp"></span>
            <button type="button" class="b-tb" data-act="cmp:toggle" aria-pressed="${!!S.cmp}" title="Two translations side by side">${I.split} Split</button>
            <button type="button" class="b-tb" data-act="panel:aa" data-keep>Aa</button>
            <button type="button" class="b-tb" data-noop title="Print">Print</button>
            <button type="button" class="b-tb b-ib2" data-act="insp" title="Show or hide the inspector" aria-label="Inspector">${I.side}</button>
          </div>
          <div class="b-text" data-scroll><div class="b-cols" data-text></div></div>
        </section>
        <aside class="b-insp" data-side aria-label="Inspector"></aside>
      </div>
      <footer class="b-status">
        <span class="b-mono" data-here>1094a1</span><span>Chapter <span data-here-ch>1</span> of 13</span><span data-hp="st"></span><span class="b-st-msg"></span>
        <span class="b-st-keys"><kbd>⌘K</kbd> go to <kbd>[</kbd><kbd>]</kbd> book <kbd>←</kbd><kbd>→</kbd> word</span>
      </footer>
    </div>`;
  B.hp = {
    st: (S) => `${S.view === 'greek' ? 'Greek' : S.view === 'english' ? 'English' : 'Greek and English'}${S.view === 'greek' ? '' : ` · ${esc(U.trans(S.trans).short)} ${esc(U.trans(S.trans).year)}${S.cmp ? ` and ${esc(U.trans(S.cmp).short)} ${esc(U.trans(S.cmp).year)}` : ''}`}`,
  };

  // Column heads stick to the top of the text pane; each English head is its
  // own translation picker.
  const transHead = (S, side) => {
    const id = side === 'L' ? S.trans : S.cmp;
    const t = U.trans(id);
    return `<div class="b-ch"><button type="button" class="b-pick" data-act="panel:pick${side}" data-keep><span class="b-k">English</span>${esc(t.short)} <span class="b-y">${esc(t.year)}</span>${I.caret}</button>${side === 'R' ? `<button type="button" class="b-chx" data-act="cmp:off" aria-label="Close the second translation">${I.x}</button>` : ''}</div>`;
  };
  B.text = (S) => {
    const tr = U.readerTrans(S);
    const cols = S.view === 'greek' ? ['g'] : S.view === 'english' ? tr : ['g', ...tr];
    const heads = cols.map((c, i) => (c === 'g' ? '<div class="b-ch"><span class="b-k">Greek</span>Bywater <span class="b-y">1894</span></div>' : transHead(S, c === S.trans ? 'L' : 'R'))).join('');
    let html = `<div class="b-heads" data-sticky style="--n:${cols.length}">${heads}</div>`;
    let lastSi = -1;
    for (const bk of U.BLOCKS) {
      const segStart = bk.si !== lastSi;
      lastSi = bk.si;
      if (bk.start) {
        html += `<div class="b-row b-chh" style="--n:${cols.length}">${cols.map((c, i) => `<div>${i === 0 ? `<span class="b-chn">${esc(bk.chapter)}</span><span class="b-m">${esc(bk.bekker)}</span>` : ''}${c === 'ostwald' && U.TITLES[bk.chapter] ? `<span class="b-ott">${esc(U.TITLES[bk.chapter])}</span>` : ''}</div>`).join('')}</div>`;
      }
      if (segStart) html += `<div class="b-row b-cref" style="--n:${cols.length}">${cols.map(() => `<span class="b-m">${bk.col}</span>`).join('')}</div>`;
      html += `<div class="b-row" style="--n:${cols.length}">${cols.map((c) => (c === 'g'
        ? `<div class="b-gc" lang="grc">${bk.lines.map((L) => `<div class="b-gl${L.cont ? ' cont' : ''}"${L.cont ? '' : ` data-cite="${bk.col}${L.n}"`}><span class="b-ln">${!L.cont && U.showNum(L.n) ? L.n : ''}</span><span class="b-lt">${U.lineHTML(bk, L)}</span></div>`).join('')}</div>`
        : `<div class="b-ec">${U.engHTML(bk, c)}</div>`)).join('')}</div>`;
    }
    return html;
  };
  B.tick = (S) => {
    const a = U.$(`#view .b-out [data-ch-link="${S.hereCh}"]`);
    if (a && a.scrollIntoViewIfNeeded) a.scrollIntoViewIfNeeded(false);
  };

  // The inspector: always docked, so the text never moves when you click.
  B.side = (S) => {
    if (!S.word) {
      return `<div class="b-ins-h"><span class="b-k">Inspector</span></div>
        <div class="b-empty"><p>Click any Greek word to see its parse, its dictionary entry and how often Aristotle uses it.</p><p>Once a word is open, <kbd>←</kbd> <kbd>→</kbd> move to the next word without leaving the keyboard.</p></div>`;
    }
    const cards = U.cards(S.word.k);
    const wi = S.word.wi + 1;
    return `<div class="b-ins-h"><span class="b-k">Inspector</span><span class="b-mono">${esc(S.word.cite)} · word ${wi}</span><button type="button" class="b-chx" data-act="close:word" aria-label="Clear">${I.x}</button></div>
      <div class="b-ins-b">
        <p class="b-form" lang="grc">${esc(S.word.t)}</p>
        <p class="b-step"><button type="button" data-act="step:-1">← Previous</button><button type="button" data-act="step:1">Next →</button></p>
        <h3>Analyses <small>${cards.length}</small></h3>
        ${cards.map((c) => { const f = U.features(c.rows[0] ? c.rows[0].text : ''); return `<section class="b-an">
          <p class="b-lem"><span lang="grc">${esc(c.head)}</span>${c.hom ? `<small>${esc(c.hom)}</small>` : ''}${c.ref ? `<a href="#" data-go="lexicon:${esc(c.ref.slug)}" class="b-cnt">${fmt(c.ref.count)} in Aristotle</a>` : ''}</p>
          ${c.gloss ? `<p class="b-gls">${esc(c.gloss)}</p>` : ''}
          <table class="b-ft">${c.rows.map((r) => { const ff = U.features(r.text); const keys = Object.keys(ff); return `<tr><td>${keys.length ? keys.map((k) => `<span><i>${k}</i>${esc(ff[k])}</span>`).join('') : `<span>${esc(U.longParse(r.text))}</span>`}${r.dialect ? `<span class="b-dial">${esc(r.dialect)}</span>` : ''}</td></tr>`; }).join('')}</table>
          ${c.lsj ? `<button type="button" class="b-lsjb" data-act="card:${esc(c.id)}" aria-expanded="${S.card === c.id}">${S.card === c.id ? 'Hide' : 'Show'} the LSJ entry</button>` : ''}
          ${S.card === c.id ? U.t8(c.lsj) : ''}
        </section>`; }).join('') || '<p class="b-p">No analysis for this form.</p>'}
      </div>`;
  };

  B.note = (S) => {
    if (!S.fn) return '';
    const at = S.fnAt || { x: 600, y: 300 };
    return `<div class="b-pop" style="left:${Math.max(12, Math.min(at.x - 30, 1440 - 420))}px;top:${at.y + 6}px" role="note"><p class="b-k">Ostwald’s note ${esc(S.fn.split('.')[1])}</p><p>${U.footnote(S.fn)}</p><button type="button" class="b-chx" data-act="close:fn" aria-label="Close">${I.x}</button></div>`;
  };

  B.panel = (S) => {
    const at = S.panelAt || { x: 300, y: 100, r: 300 };
    if (S.panel === 'pickL' || S.panel === 'pickR') {
      const side = S.panel === 'pickL' ? 'trans' : 'cmp';
      const cur = side === 'trans' ? S.trans : S.cmp;
      const other = side === 'trans' ? S.cmp : S.trans;
      return `<div class="b-menu" style="left:${at.x}px;top:${at.y + 4}px"><ul>${U.EN_TRANS.map((t) => `<li><button type="button" data-act="${side}:${t.id}" aria-pressed="${cur === t.id}"${other === t.id ? ' disabled' : ''}><b>${esc(t.short)}</b><span>${esc(t.pub)} ${esc(t.year)}</span></button></li>`).join('')}</ul></div>`;
    }
    if (S.panel === 'aa') {
      const sl = (k, label, min, max) => `<label class="b-sl"><span>${label}</span><output>${Math.round(S[k] * 100)}%</output><input type="range" min="${min}" max="${max}" step="0.05" value="${S[k]}" data-range="${k}"></label>`;
      return `<div class="b-menu b-aa" style="right:${at.r - 10}px;top:${at.y + 4}px">${sl('fs', 'Text size', 0.8, 1.4)}${sl('lh', 'Line spacing', 0.85, 1.4)}${sl('cw', 'Column width', 0.75, 1.3)}<label class="b-chk"><input type="checkbox" checked> Add the citation when I copy Greek</label><button type="button" class="b-tb" data-act="reset">Reset</button></div>`;
    }
    return '';
  };

  // ── Search: form, results, preview ───────────────────────────────────────
  B.hit = '1095b30';
  function preview(cite) {
    const enG = U.search.groups.find((g) => g.work === 'EN');
    const win = U.hitWindow(cite, (enG.books[0].chapters.flatMap((c) => c.hits).find((h) => h.cite === cite) || {}).form || 'ἀρετή');
    const eng = U.engAt(cite, 'ross', 520);
    return `<div class="b-prev-h"><span class="b-mono">EN ${cite}</span><a href="#" class="b-btn pri" data-go="reader:${cite}">Open in the reader</a></div>
      <div class="b-prev-g" lang="grc">${win ? win.map((l) => `<p class="${l.here ? 'here' : ''}"><span class="b-ln">${l.cont ? '' : l.n}</span><span>${l.html}</span></p>`).join('') : ''}</div>
      <p class="b-k">Ross 1908, at this point</p><p class="b-prev-e">${esc(eng)}</p>`;
  }
  B.search = (S) => {
    const R = U.search;
    const max = Math.max(...R.works.map((x) => x.count));
    const en = R.groups.find((g) => g.work === 'EN');
    return `<div class="b-app b-doc">${bar([{ t: 'Search' }], S)}
      <div class="b-srch">
        <form class="b-q" onsubmit="return false">
          <label class="b-k" for="b-qg">Greek</label>
          <div class="b-qf"><input id="b-qg" value="${esc(R.q)}" lang="grc"><button type="button" class="b-tb">β</button></div>
          <div class="b-qo"><label>Match<select><option>all words</option><option>any word</option><option>the exact phrase</option></select></label><label>Form<select><option>any form of the word</option><option>only as typed</option></select></label><label>Accents<select><option>ignored</option><option>matched</option></select></label></div>
          <label class="b-k" for="b-qe">English</label>
          <div class="b-qf"><input id="b-qe" placeholder="virtue, excellence"></div>
          <div class="b-qo"><label>In<select><option>every translation</option><option>Ross</option><option>Ostwald</option></select></label><label>Combine<select><option>both must match</option><option>either</option></select></label></div>
          <details class="b-adv" open><summary>Which word you mean</summary>
            <p class="b-p">ἀρετή could be more than one dictionary word. Search the ones you mean:</p>
            <label class="b-chk"><input type="checkbox" checked> <span lang="grc">ἀρετή</span> goodness, excellence</label>
            <label class="b-chk"><input type="checkbox"> <span lang="grc">ἀρετάω</span> be fit, thrive</label>
          </details>
          <details class="b-adv"><summary>Wildcards, grammar and nearness</summary><p class="b-p"><code>*</code> any letters, <code>?</code> one letter; a grammatical shape such as aorist participle; a second word within ten words.</p></details>
          <label class="b-k">Works</label><p class="b-p">All 41 works <a href="#" data-noop>Choose</a></p>
          <button type="button" class="b-btn pri b-go-btn">Search</button>
        </form>
        <section class="b-res">
          <div class="b-res-h"><p><b>${fmt(R.count)}</b> places in <b>${R.works.length}</b> works</p><a href="#" data-noop>Export CSV</a></div>
          <ul class="b-dist">${R.works.map((x) => `<li title="${esc(x.title)}: ${x.count}"><span>${esc(U.work(x.work) ? U.work(x.work).abbr : x.work)}</span><i style="height:${Math.max(3, (x.count / max) * 46).toFixed(0)}px"></i><b>${x.count}</b></li>`).join('')}</ul>
          <div class="b-res-l" data-scroll>
            <p class="b-res-g"><b>Nicomachean Ethics</b><span>${en.count}</span></p>
            ${en.books[0].chapters.map((c) => `<p class="b-res-c">Book I · ${esc(c.chapter)} <span class="b-m">${esc(c.bekker)}</span></p>${c.hits.map((h) => { const w = U.hitWindow(h.cite, h.form); const line = w ? w.find((l) => l.here) : null; return `<button type="button" class="b-hit${h.cite === B.hit ? ' on' : ''}" data-act="hit:${h.cite}"><span class="b-mono">${h.cite}</span><span lang="grc">${line ? line.html : esc(h.form)}</span></button>`; }).join('')}`).join('')}
            <p class="b-res-more">Books II–X: ${en.count - en.books[0].chapters.reduce((n, c) => n + c.hits.length, 0)} more</p>
            ${R.groups.filter((g) => g.work !== 'EN').map((g) => `<p class="b-res-g closed"><b>${esc(g.title)}</b><span>${g.count}</span></p>`).join('')}
          </div>
        </section>
        <section class="b-prev" data-prev>${preview(B.hit)}</section>
      </div>
    </div>`;
  };

  // ── Lexicon: index and entry ─────────────────────────────────────────────
  B.lexSort = 'freq';
  B.lexicon = (S) => {
    const L = U.lemmaPage(S.lex) || U.lemmaPage('arete');
    const list = B.lexSort === 'freq' ? U.TOP : U.ALPHA;
    const max = Math.max(...L.byWork.map((x) => x.count));
    const dz = L.distinctiveness;
    const known = ['arete', 'eudaimonia', 'agathos', 'techne'];
    return `<div class="b-app b-doc">${bar([{ t: 'Lexicon' }, { t: L.head }], S)}
      <div class="b-split b-lex">
        <nav class="b-rail b-lex-l" aria-label="Lexicon">
          <input class="b-filter" placeholder="Filter: Greek or Beta Code" aria-label="Filter the lexicon">
          <span class="b-seg" role="group" aria-label="Order"><button type="button" data-act="lexsort:freq" aria-pressed="${B.lexSort === 'freq'}">Most used</button><button type="button" data-act="lexsort:az" aria-pressed="${B.lexSort === 'az'}">A–Z</button></span>
          <ul class="b-lx">${known.map((k) => U.lemmaPage(k)).map((p) => `<li><a href="#" data-go="lexicon:${p.slug}"${p.slug === L.slug ? ' aria-current="page"' : ''}><span lang="grc">${esc(p.head)}</span><b>${fmt(p.count)}</b></a></li>`).join('')}
            <li class="b-lx-sep">${B.lexSort === 'freq' ? 'Most used' : 'Near ἀρετή'}</li>
            ${list.slice(0, 40).map((x) => `<li><a href="#" data-noop><span lang="grc">${esc(x[0])}</span><b>${fmt(x[2])}</b></a></li>`).join('')}</ul>
          <p class="b-rail-f">${fmt(U.LEMMA_TOTAL)} words</p>
        </nav>
        <div class="b-scroll" data-scroll><article class="b-wk b-lx-d">
          <p class="b-kick">Lexicon · <span class="b-mono">${esc(L.key)}</span></p>
          <h1 lang="grc" class="b-lx-w">${esc(L.head)}</h1>
          <p class="b-lede">${esc((L.glosses || []).join('; '))}</p>
          <dl class="b-meta">
            <div><dt>In Aristotle</dt><dd>${fmt(L.count)}</dd></div>
            ${dz ? `<div><dt>Before him</dt><dd>${fmt(dz.before_aristotle)}</dd></div><div><dt>His contemporaries</dt><dd>${fmt(dz.contemporary)}</dd></div><div><dt>Fragments</dt><dd>${fmt(dz.fragments)}</dd></div>` : ''}
            <div><dt>Works</dt><dd>${L.byWork.length}</dd></div>
          </dl>
          <h2>By work</h2>
          <table class="b-table"><tbody>${L.byWork.map((x) => `<tr><td><a href="#" data-go="work:${x.work}">${esc(x.title)}</a></td><td class="b-len wide"><span><i style="width:${((x.count / max) * 100).toFixed(1)}%"></i></span></td><td class="b-n">${x.count}</td></tr>`).join('')}</tbody></table>
          <h2>Places</h2>
          ${L.instancesByWork.slice(0, 3).map((g) => `<details class="b-pl"${g.work === 'EN' ? ' open' : ''}><summary><b>${esc(g.title)}</b> <span>${g.count}</span></summary>${g.books.slice(0, g.work === 'EN' ? 2 : 1).map((bk) => bk.chapters.map((c) => `<p><span class="b-k">Book ${bk.book} · ${esc(c.chapter)}</span>${c.instances.map((i) => `<a href="#" class="b-mono" ${g.work === 'EN' && bk.book === 1 ? `data-go="reader:${i[0]}${i[1]}"` : 'data-noop'}>${i[0]}${i[1]}</a>`).join(' ')}</p>`).join('')).join('')}</details>`).join('')}
          <h2>Dictionary</h2>${U.t8(L.key)}
          <h2>Bonitz</h2><p class="b-p">The <i>Index Aristotelicus</i> entry, with the places Bonitz singles out for each sense, appears here once the transcription reaches this word.</p>
        </article>${foot()}</div>
      </div>
    </div>`;
  };
})();
