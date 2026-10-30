/* Direction B · Poster. One early photograph on the home page and one on
   each work page, with the title set over it in large red capitals that let
   the photograph show through. Everything else is type: no pictures in the
   reader, in search or in the lexicon. */
(function () {
  'use strict';
  const U = window.U;
  const { esc, fmt, ROMAN } = U;
  const B = (window.T.b = {});
  B.keepPanelOnTrans = true;

  const ICON = {
    close: '<svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><path d="M3.5 3.5l9 9M12.5 3.5l-9 9" stroke="currentColor" stroke-width="1.3"/></svg>',
    moon: '<svg viewBox="0 0 16 16" width="15" height="15" aria-hidden="true"><path d="M13.2 10.1A5.6 5.6 0 0 1 5.9 2.8a5.6 5.6 0 1 0 7.3 7.3z" fill="none" stroke="currentColor" stroke-width="1.3"/></svg>',
    search: '<svg viewBox="0 0 16 16" width="15" height="15" aria-hidden="true"><circle cx="6.8" cy="6.8" r="4.6" fill="none" stroke="currentColor" stroke-width="1.4"/><path d="M10.4 10.4 14 14" stroke="currentColor" stroke-width="1.4"/></svg>',
    menu: '<svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><path d="M2 4.5h12M2 8h12M2 11.5h12" stroke="currentColor" stroke-width="1.4"/></svg>',
    caret: '<svg viewBox="0 0 10 6" width="9" height="6" aria-hidden="true"><path d="M1 1l4 4 4-4" fill="none" stroke="currentColor" stroke-width="1.3"/></svg>',
  };
  const DIV = { 'Logic (Organon)': 'Logic', 'Natural Philosophy': 'Natural philosophy', Metaphysics: 'Metaphysics', 'Moral and Political Philosophy': 'Ethics and politics', 'Rhetoric and Poetics': 'Rhetoric and poetics' };
  const tag = (w) => (w.authenticity && w.authenticity !== 'genuine' ? `<span class="b-tag">${esc(w.authenticity)}</span>` : '');
  const ph = (id) => U.PH[id];

  // The poster: a photograph with the title over it. The type is sized so the
  // longest word fits the width and the whole title fits the height.
  const SIZE = {
    desktop: { hero: { w: 1296, h: 600, max: 176 }, work: { w: 1296, h: 620, max: 230 } },
    phone: { hero: { w: 354, h: 430, max: 64 }, work: { w: 354, h: 430, max: 66 } },
  };
  // Widths of Sofia Sans SemiBold capitals as a share of the type size,
  // measured in the browser; the title takes the largest size at which the
  // longest word fits the width and the wrapped lines fit the height.
  const CAPW = { A: 0.579, B: 0.568, C: 0.62, D: 0.633, E: 0.524, F: 0.497, G: 0.644, H: 0.652, I: 0.249, J: 0.252, K: 0.585, L: 0.469, M: 0.764, N: 0.653, O: 0.634, P: 0.539, Q: 0.634, R: 0.596, S: 0.54, T: 0.532, U: 0.635, V: 0.584, W: 0.848, X: 0.565, Y: 0.544, Z: 0.538, ',': 0.234, '.': 0.235, '’': 0.234 };
  const wordW = (x, f) => [...x].reduce((n, ch) => n + (CAPW[ch] || 0.62), 0) * f * 1.02;
  function lines(words, f, w) {
    let n = 1;
    let line = 0;
    for (const x of words) {
      const ww = wordW(x, f);
      if (line && line + 0.2 * f + ww > w) { n++; line = ww; } else line += (line ? 0.2 * f : 0) + ww;
    }
    return n;
  }
  function fz(title, box, share) {
    const words = title.toUpperCase().split(/\s+/);
    let f = box.max;
    while (f > 18 && (Math.max(...words.map((x) => wordW(x, f))) > box.w || lines(words, f, box.w) * 0.9 * f > box.h * share)) f -= 2;
    return f;
  }
  function poster(id, title, kind, P, opts = {}) {
    const p = ph(id);
    const box = SIZE[P.kind][kind];
    const ar = p ? p.w / p.h : 1.5;
    const tall = ar < 1.35;
    const img = p ? `<img src="${U.img(id, 'w1600')}" alt="${esc(p.title)}" width="${p.w}" height="${p.h}" decoding="async">` : '';
    // A tall photograph leaves room beside it on a desktop: the work's
    // details sit there, under the title.
    const side = opts.info && tall && P.kind === 'desktop' ? `<div class="b-po-info" style="width:${Math.max(380, Math.round(1296 - box.h * ar - 56))}px">${opts.info}</div>` : '';
    // Beside a tall photograph the details take the lower part of the column.
    const share = side ? 0.5 : kind === 'hero' ? 0.82 : 0.72;
    return `<section class="b-po ${kind} ${tall ? 'tall' : 'wide'}" style="--ar:${ar.toFixed(3)};--fz:${fz(title, box, share)}px">
      ${opts.link ? `<a href="#" class="b-po-a" data-go="${opts.link}" aria-hidden="true" tabindex="-1">${img}</a>` : img}
      <${opts.tag || 'h1'} class="b-po-t">${esc(title)}</${opts.tag || 'h1'}>
      ${side}
    </section>${opts.info && !side ? `<div class="b-po-below">${opts.info}</div>` : ''}`;
  }
  const credit = (id, full) => {
    const p = ph(id);
    if (!p) return '';
    return `<p class="b-cr"><span class="b-cr-c">${p.cap}</span> <span class="b-cr-m"><i>${esc(p.title)}</i>, ${esc(p.maker)}, ${esc(p.date)}.${full ? ` J. Paul Getty Museum, ${esc(p.acc)} (CC0). <a href="#" data-noop>Object record</a>` : ' J. Paul Getty Museum.'}</span></p>`;
  };

  const nav = (on) => `<header class="b-nav">
      <a class="b-brand" href="#" data-go="home">Aristotle Reader</a>
      <nav class="b-links" aria-label="Site">
        ${[['home', 'Works'], ['search', 'Search'], ['lexicon', 'Lexicon'], ['phrases', 'Phrases'], ['support', 'Support']].map(([k, l]) => `<a href="#" ${k === 'phrases' || k === 'support' ? 'data-noop' : `data-go="${k}"`} class="${on === k ? 'on' : ''}${k === 'phrases' || k === 'support' ? ' b-x-s' : ''}">${l}</a>`).join('')}
        <button type="button" class="b-ib" data-act="theme" aria-label="Dark or light">${ICON.moon}</button>
      </nav>
    </header>`;
  const foot = () => `<footer class="b-foot">
      <p>Also <a href="#" data-noop>The Plato Reader</a> <a href="#" data-noop>The Homer Reader</a> <a href="#" data-noop>The Greek Drama Reader</a> <a href="#" data-noop>Grammata</a></p>
      <p><a href="#" data-noop>Texts &amp; licences</a> <a href="#" data-noop>Picture credits</a> <a href="#" data-noop>Support</a> <a href="#" data-noop>Desktop app</a> <a href="#" data-noop>Report an error</a> <a href="#" data-noop>Play a game</a> <span>Site by John H. Boyer</span></p>
    </footer>`;

  // ── Home ─────────────────────────────────────────────────────────────────
  B.home = (S, P) => {
    const id = U.HERO[S.hero % U.HERO.length];
    const w = U.work(id);
    const divs = U.divisions();
    return `<div class="b-page">${nav('home')}
      ${poster(id, 'The complete works of Aristotle', 'hero', P, { link: `work:${id}` })}
      <p class="b-hero-cr"><span>${ph(id).cap}</span> <span class="b-cr-m">Photograph for <a href="#" data-go="work:${id}"><i>${esc(w.title)}</i></a>: <i>${esc(ph(id).title)}</i>, ${esc(ph(id).maker)}, ${esc(ph(id).date)}.</span> <button type="button" class="b-next" data-act="hero">Next photograph</button></p>
      <section class="b-intro">
        <p class="b-lead">Greek and English, side by side. Click any Greek word to parse it and read its dictionary entry; search every work in either language.</p>
        <div class="b-intro-r">
          <div class="b-search">${ICON.search}<input data-search placeholder="φύσις, justice, ἀρετή …" aria-label="Search the corpus" autocomplete="off" spellcheck="false"><button type="button" data-go="search">Search</button></div>
          <p class="b-cont"><a href="#" data-go="reader:${U.RESUME.cite}">Continue reading <i>Nicomachean Ethics</i>, Book I, chapter 7</a></p>
        </div>
      </section>
      ${divs.map((d) => {
        const ws = d.groups.flatMap((g) => g.works);
        return `<section class="b-div">
          <h2 class="b-dh">${esc(d.appendix ? 'Doubted and spurious works' : DIV[d.title] || d.title)}</h2>
          <div class="b-dw">${d.groups.map((g) => `${g.label ? `<h3 class="b-sub">${esc(g.label)}</h3>` : ''}<ul class="b-works">${g.works.map((x) => `<li><a href="#" data-go="work:${x.id}"><span class="b-wt">${esc(x.title)}${tag(x)}</span><span class="b-wg" lang="grc">${esc(x.greekTitle)}</span><span class="b-we">${esc(U.extent(x))}</span></a></li>`).join('')}</ul>`).join('')}</div>
        </section>`;
      }).join('')}
      ${foot()}</div>`;
  };

  // ── A work ───────────────────────────────────────────────────────────────
  B.work = (S, P) => {
    const w = U.work(S.workId) || U.work('EN');
    const en = w.id === 'EN';
    const d = U.divisionOf(w.id);
    const trs = w.translations.map((t) => ({ ...t, ...U.transParts(t) }));
    const many = U.workBooks(w.id).length > 1;
    const fr = U.further(w.id);
    const kinds = { translation: 'Translation', commentary: 'Commentary', collection: 'In print' };
    const isa = U.work('Isa');
    return `<div class="b-page">${nav('')}
      <p class="b-crumb"><a href="#" data-go="home">Works</a> / ${d ? esc(d.appendix ? 'Doubted and spurious works' : DIV[d.title] || d.title) : 'Commentary'}</p>
      ${poster(w.id, w.title, 'work', P, { info: `
          <p class="b-wk-gt" lang="grc">${esc(w.greekTitle)}</p>
          <p class="b-wk-blurb">${esc(w.blurb)}${tag(w)}</p>
          <div class="b-ctas">
            <a href="#" class="b-btn pri" data-go="reader">Start reading</a>
            ${en ? `<a href="#" class="b-btn" data-go="reader:${U.RESUME.cite}">Resume at Book I, chapter 7</a>` : ''}
            <a href="#" class="b-btn" data-go="reader:greek">Greek only</a>
            ${trs.length > 1 ? '<a href="#" class="b-btn" data-go="reader:compare">Compare translations</a>' : ''}
          </div>
          ${en ? '' : '<p class="b-mock">In this mockup the reader opens the <i>Ethics</i>.</p>'}` })}
      ${credit(w.id, true)}
      <section class="b-wk">
        <dl class="b-facts">
          <dt>Greek</dt><dd>${esc(w.greekSource.full)}</dd>
          <dt>English</dt><dd>${trs.map((t) => `${esc(t.who)}, ${esc(t.pub)}, ${esc(t.year)}`).join('<br>')}</dd>
          <dt>Length</dt><dd>${esc(U.extent(w))}</dd>
        </dl>
      </section>
      <section class="b-sec">
        <h2 class="b-h2">${many ? 'Books and chapters' : 'Chapters'}</h2>${en ? '<p class="b-note3">Chapter titles are Ostwald’s.</p>' : ''}
        ${U.bookList2(w, 'b', (w2, b, c) => `<li><a href="#" data-go="${en && b.n === 1 ? `reader:${c.bekker.split('–')[0]}` : 'reader'}"><span class="b-cn">${esc(c.ch)}</span><span class="b-ct">${esc(c.title || `Chapter ${c.ch}`)}</span><span class="b-cb">${esc(c.bekker)}</span></a></li>`)}
      </section>
      <section class="b-sec b-two">
        <div><h2 class="b-h2">Translations</h2>
          <ul class="b-trs">${trs.map((t) => `<li><a href="#" data-go="reader:${t.id}"><span>${esc(t.who)}</span><small>${esc(t.pub)}${t.year ? `, ${esc(t.year)}` : ''}${(w.defaultTranslation || trs[0].id) === t.id ? ' · opens first' : ''}</small></a></li>`).join('')}</ul>
          ${w.commentaries ? `<h2 class="b-h2">Commentary</h2><ul class="b-trs"><li><a href="#" data-go="work:Isa"><span>Porphyry, <i>Isagoge</i></span><small>${esc(isa.blurb)}</small></a></li></ul>` : ''}</div>
        <div>${fr.length ? `<h2 class="b-h2">In print</h2><ul class="b-print">${fr.map((r) => `<li><small>${kinds[r.kind] || r.kind}</small><span>${r.cite}</span></li>`).join('')}</ul>` : ''}
          <h2 class="b-h2">Sources</h2><p class="b-cred"><b>Greek</b> ${esc(w.greekSource.full)}<br><b>English</b> ${trs.map((t) => esc(t.name)).join('; ')}<br><a href="#" data-noop>Texts &amp; licences</a></p></div>
      </section>
      ${foot()}</div>`;
  };

  // ── The reader: no pictures ──────────────────────────────────────────────
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
    let html = `<div class="b-bookh"><p class="b-bk-t">Nicomachean Ethics <span>Book I</span></p><p class="b-bk-s"><span lang="grc">Ἠθικὰ Νικομάχεια Α</span> · Greek: Bywater, 1894${S.view === 'greek' ? '' : ` · English: ${tr.map((t) => `${esc(U.trans(t).who)}, ${esc(U.trans(t).year)}`).join(' and ')}`}</p></div>`;
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

  // ── Search: no pictures ──────────────────────────────────────────────────
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
        <p class="b-sr-n"><b>${fmt(R.count)}</b> places in ${R.works.length} works for <span lang="grc">${esc(R.head)}</span>, ${esc(R.gloss)}. <a href="#" data-go="lexicon:arete">Lexicon</a> <a href="#" data-noop>Export as CSV</a></p>
        <p class="b-sr-w">${R.works.map((x, i) => `<a href="#" data-noop class="${i === 0 ? 'on' : ''}">${esc(x.title)} <span>${x.count}</span></a>`).join('')}</p>
        <section class="b-sg"><h2>Nicomachean Ethics <span>${en.count} places · Book I shown</span></h2>
          ${b1.chapters.map((c) => `<div class="b-sch"><h3><b>${esc(c.chapter)}</b> ${esc(U.TITLES[c.chapter] || '')}</h3>
            ${(() => { let last = ''; return c.hits.map((h) => { const win = U.hitWindow(h.cite, h.form); const e = U.engAt(h.cite, 'ross'); const same = e === last; last = e; return `<div class="b-hit"><a href="#" class="b-hr" data-go="reader:${h.cite}">${h.cite}</a><div class="b-hg" lang="grc">${win ? win.filter((l) => l.here).map((l) => l.html).join(' ') : esc(h.form)}</div>${same ? '' : `<p class="b-he">${esc(e)} <span>Ross</span></p>`}</div>`; }).join(''); })()}</div>`).join('')}
        </section>
        ${R.groups.filter((g) => g.work !== 'EN').slice(0, 5).map((g) => `<section class="b-sg closed"><h2>${esc(g.title)} <span>${g.count} place${g.count === 1 ? '' : 's'}</span></h2></section>`).join('')}
      </section>
      ${foot()}</div>`;
  };

  // ── Lexicon: no pictures ─────────────────────────────────────────────────
  B.lexicon = (S) => {
    const L = U.lemmaPage(S.lex) || U.lemmaPage('arete');
    const dz = L.distinctiveness;
    return `<div class="b-page">${nav('lexicon')}
      <section class="b-lx">
        <p class="b-lx-w" lang="grc">${esc(L.head)}</p>
        <p class="b-lx-gl">${esc((L.glosses || []).join('; '))}</p>
        <dl class="b-lx-n">
          <div><dt>in Aristotle</dt><dd>${fmt(L.count)}</dd></div>
          ${dz ? `<div><dt>in authors before him</dt><dd>${fmt(dz.before_aristotle)}</dd></div><div><dt>in his contemporaries</dt><dd>${fmt(dz.contemporary)}</dd></div>` : ''}
          <div><dt>works</dt><dd>${L.byWork.length}</dd></div>
        </dl>
      </section>
      <section class="b-sec"><h2 class="b-h2">By work</h2><ol class="b-bw">${L.byWork.map((x) => `<li><a href="#" data-go="work:${x.work}"><span>${esc(x.title)}</span><b>${x.count}</b></a></li>`).join('')}</ol></section>
      <section class="b-sec b-two"><div><h2 class="b-h2">LSJ</h2>${U.t8(L.key)}</div>
        <div><h2 class="b-h2">Key passages</h2><p class="b-p">Bonitz’s <i>Index Aristotelicus</i> sorts the places by sense and marks the ones that decide each meaning. They will appear here once the transcription reaches this word.</p>
        <h2 class="b-h2">Nearby</h2><p class="b-near">${U.ALPHA.slice(0, 18).map((x) => `<a href="#" data-noop${x[1] === L.slug ? ' class="on"' : ''} lang="grc">${esc(x[0])}</a>`).join('')}</p></div></section>
      ${foot()}</div>`;
  };
})();
