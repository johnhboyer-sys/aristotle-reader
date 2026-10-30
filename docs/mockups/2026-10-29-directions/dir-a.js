/* Direction A · Bekker. The Plato redesign's sibling: one reading face, the
   interface in spaced capitals, rules instead of boxes, one pigment. Where
   Plato is built on an inscription, this is built on Bekker's one numbered
   line, 1a1 to 1462b19. */
(function () {
  'use strict';
  const U = window.U;
  const { esc, fmt, ROMAN, caps } = U;
  const A = (window.T.a = {});

  const X0 = 1;
  const X1 = 1463;
  const pct = (x) => `${(((x - X0) / (X1 - X0)) * 100).toFixed(3)}%`;
  const wpct = (a, b) => `${Math.max(0.12, ((b - a) / (X1 - X0)) * 100).toFixed(3)}%`;
  const SHORT = { 'Logic (Organon)': 'Logic', 'Natural Philosophy': 'Natural philosophy', Metaphysics: 'Metaphysics', 'Moral and Political Philosophy': 'Ethics and politics', 'Rhetoric and Poetics': 'Rhetoric and poetics' };
  const ICON = {
    close: '<svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><path d="M3.5 3.5l9 9M12.5 3.5l-9 9" stroke="currentColor" stroke-width="1.3"/></svg>',
    moon: '<svg viewBox="0 0 16 16" width="15" height="15" aria-hidden="true"><path d="M13.2 10.1A5.6 5.6 0 0 1 5.9 2.8a5.6 5.6 0 1 0 7.3 7.3z" fill="none" stroke="currentColor" stroke-width="1.2"/></svg>',
    search: '<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><circle cx="6.8" cy="6.8" r="4.6" fill="none" stroke="currentColor" stroke-width="1.2"/><path d="M10.4 10.4 14 14" stroke="currentColor" stroke-width="1.2"/></svg>',
    menu: '<svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><path d="M2 4h12M2 8h12M2 12h12" stroke="currentColor" stroke-width="1.2"/></svg>',
    caret: '<svg viewBox="0 0 10 6" width="8" height="5" aria-hidden="true"><path d="M1 1l4 4 4-4" fill="none" stroke="currentColor" stroke-width="1.2"/></svg>',
  };
  A.ICON = ICON;

  // ── Pieces ───────────────────────────────────────────────────────────────
  const nav = (on) => `<header class="a-nav">
      <a class="a-brand" href="#" data-go="home"><span lang="grc">ΑΡΙΣΤΟΤΕΛΗΣ</span><span class="a-dot">·</span>Aristotle Reader</a>
      <nav class="a-links" aria-label="Site">
        ${[['home', 'Works'], ['search', 'Search'], ['lexicon', 'Lexicon'], ['phrases', 'Phrases'], ['support', 'Support']].map(([k, l]) => `<a href="#" ${k === 'phrases' || k === 'support' ? 'data-noop' : `data-go="${k}"`} class="${on === k ? 'on' : ''}">${l}</a>`).join('')}
        <button type="button" class="a-ico" data-act="theme" aria-label="Dark or light">${ICON.moon}</button>
      </nav>
    </header>`;
  const foot = () => `<footer class="a-foot">
      <p class="a-foot-also"><span>Also:</span> <a href="#" data-noop>The Plato Reader ↗</a> <a href="#" data-noop>The Homer Reader ↗</a> <a href="#" data-noop>The Greek Drama Reader ↗</a> <a href="#" data-noop>Grammata ↗</a></p>
      <p class="a-foot-site"><a href="#" data-noop>Texts &amp; licences</a> <a href="#" data-noop>Support</a> <a href="#" data-noop>Desktop app</a> <a href="#" data-noop>Request a feature · report an error</a> <a href="#" data-noop>Play a game</a><span class="a-by">Site by John H. Boyer</span></p>
    </footer>`;

  // The corpus on Bekker's line. Every work is a bar from its first column to
  // its last; the gaps are works the site does not carry (Problemata, Magna
  // Moralia, Rhetoric to Alexander and others).
  function corpusLine(opts = {}) {
    const works = U.W.filter((w) => U.isBekker(w) && U.workSpan(w));
    const divs = U.divisions().filter((d) => !d.appendix).map((d, i) => {
      const ws = d.groups.flatMap((g) => g.works).filter((w) => U.workSpan(w));
      const a = Math.min(...ws.map((w) => U.citeX(U.workSpan(w).first)));
      const b = Math.max(...ws.map((w) => U.citeX(U.workSpan(w).last)));
      return { n: d.numeral, t: SHORT[d.title] || d.title, a, b, row: i % 2 };
    });
    const ticks = [];
    for (let p = 100; p <= 1400; p += 100) ticks.push(`<span class="a-tk" style="left:${pct(p)}"><i></i><b>${p}</b></span>`);
    for (let p = 50; p <= 1450; p += 100) ticks.push(`<span class="a-tk s" style="left:${pct(p)}"><i></i></span>`);
    const hits = (opts.hits || []).map((c) => `<i class="a-hit" style="left:${pct(U.citeX(c))}"></i>`).join('');
    const here = opts.here ? `<i class="a-here" style="left:${pct(U.citeX(opts.here))}"></i>` : '';
    return `<div class="a-line${opts.hits ? ' with-hits' : ''}${opts.small ? ' small' : ''}">
      ${opts.ends === false ? '' : '<span class="a-end">1a1</span>'}
      <div class="a-strip" data-strip>
        <div class="a-divs">${divs.map((d) => d.a > 1300 ? `<span class="a-dv rt r${d.row}" style="right:${(100 - parseFloat(pct(d.b))).toFixed(3)}%"><b>${d.n}</b> ${esc(d.t)}</span>` : `<span class="a-dv r${d.row}" style="left:${pct(d.a)}"><b>${d.n}</b> ${esc(d.t)}</span>`).join('')}</div>
        <div class="a-bars">${works.map((w) => { const s = U.workSpan(w); const a = U.citeX(s.first); const b = U.citeX(s.last); return `<a href="#" class="a-bar${w.authenticity !== 'genuine' ? ' sp' : ''}" data-go="work:${w.id}" style="left:${pct(a)};width:${wpct(a, b)}" aria-label="${esc(w.title)}, ${esc(U.spanText(w))}">${!opts.small && b - a >= 34 && w.authenticity === 'genuine' ? `<em>${esc(w.abbr.replace(/\.$/, ''))}</em>` : ''}</a>`; }).join('')}${hits}${here}</div>
        <div class="a-axis">${ticks.join('')}</div>
        <div class="a-read" data-read hidden></div>
      </div>
      ${opts.ends === false ? '' : '<span class="a-end">1462b19</span>'}
    </div>`;
  }
  A.corpusLine = corpusLine;

  // Hovering the line reads out the page and the work there.
  A.move = (S, e) => {
    const view = document.getElementById('view');
    const strip = e && e.target.closest && e.target.closest('[data-strip]');
    U.$$('[data-read]', view).forEach((r) => { if (!strip || !strip.contains(r)) r.hidden = true; });
    if (!strip) return;
    const r = strip.getBoundingClientRect();
    const f = (e.clientX - r.left) / r.width;
    const x = X0 + f * (X1 - X0);
    const page = Math.floor(x);
    const side = x - page >= 0.5 ? 'b' : 'a';
    const hit = U.workForCite(`${page}${side}20`);
    const out = U.$('[data-read]', strip);
    out.hidden = false;
    out.style.left = `${(f * 100).toFixed(2)}%`;
    out.innerHTML = `<b>${page}${side}</b>${hit ? ` ${esc(hit.w.title)}${hit.w.books > 1 ? ` ${ROMAN[hit.book]}` : ''}` : ' <i>not carried</i>'}`;
  };

  const capsTitle = (w) => caps(w.greekTitle || w.title);
  const tag = (w) => (w.authenticity && w.authenticity !== 'genuine' ? `<span class="a-tag">${w.authenticity}</span>` : '');

  // ── Home ─────────────────────────────────────────────────────────────────
  A.home = () => {
    const divs = U.divisions();
    return `<div class="a-page">${nav('home')}
      <section class="a-hero">
        <div class="a-hero-top">
          <h1 class="a-h1">The complete works of Aristotle in Greek and English</h1>
          <div class="a-tools">
            <div class="a-field a-go" data-jump-host>
              <label class="a-cap" for="a-go">Go to</label>
              <input id="a-go" data-jump placeholder="1094a1" autocomplete="off" spellcheck="false">
              <button type="button" class="a-cap" data-act="jumpgo">Go</button>
              <p class="a-msg" data-jump-msg></p>
            </div>
            <div class="a-field a-q">
              <span class="a-qi">${ICON.search}</span>
              <input id="a-q" data-search placeholder="φύσις, justice, ἀρετή …" autocomplete="off">
              <button type="button" class="a-cap" data-go="search">Search</button>
            </div>
          </div>
        </div>
        ${corpusLine()}
        <p class="a-line-cap">Every passage of Aristotle has one address on Bekker’s line, from 1a1 to 1462b19. Point at the line to read it; the gaps are works this site does not carry.</p>
      </section>
      <section class="a-begin"><span class="a-cap">Begin with</span>${U.START.map((id) => `<a href="#" data-go="work:${id}">${esc(U.work(id).title)}</a>`).join('')}
        <a href="#" class="a-resume" data-go="reader:${U.RESUME.cite}"><span class="a-cap">Continue</span> Nicomachean Ethics I.7 · ${U.RESUME.cite}</a></section>
      ${divs.map((d) => {
        const ws = d.groups.flatMap((g) => g.works);
        const sp = ws.filter((w) => U.workSpan(w));
        const a = d.appendix ? '' : U.parseCite(U.workSpan(sp[0]).first).col;
        const b = d.appendix ? '' : U.parseCite(U.workSpan(sp[sp.length - 1]).last).col;
        return `<section class="a-div${d.appendix ? ' app' : ''}">
          <header class="a-div-h"><span class="a-num">${d.numeral || ''}</span><h2>${d.appendix ? 'Works of doubted or spurious authorship' : esc(d.title)}</h2>${a ? `<span class="a-span">${a}–${b}</span>` : ''}</header>
          ${d.groups.map((g) => `${g.label ? `<h3 class="a-sub"><span>${esc(g.ref)}</span> ${esc(g.label)}</h3>` : ''}
            <ul class="a-works">${g.works.map((w) => `<li><a href="#" data-go="work:${w.id}"><span class="a-gk" lang="grc">${esc(capsTitle(w))}</span><span class="a-en">${esc(w.title)}</span><span class="a-sp">${esc(U.spanText(w))}${tag(w)}</span></a></li>`).join('')}</ul>`).join('')}
        </section>`;
      }).join('')}
      ${foot()}</div>`;
  };

  // ── A work ───────────────────────────────────────────────────────────────
  function workRuler(w) {
    const spans = w.spans || {};
    const books = Object.keys(spans).map(Number).sort((x, y) => x - y);
    if (!books.length || !U.isBekker(w)) return '';
    const a = U.citeX(spans[books[0]][0]);
    const b = U.citeX(spans[books[books.length - 1]][1]);
    const p = (x) => `${(((x - a) / (b - a)) * 100).toFixed(3)}%`;
    const chs = U.chapters(w.id);
    return `<div class="a-ruler">
      <span class="a-end">${U.parseCite(spans[books[0]][0]).col}</span>
      <div class="a-rs">
        ${books.map((n) => { const s = spans[n]; const x0 = U.citeX(s[0]); const x1 = U.citeX(s[1]); return `<a href="#" class="a-rb${n === 1 ? ' one' : ''}" data-go="${w.id === 'EN' && n === 1 ? 'reader' : `work:${w.id}`}" style="left:${p(x0)};width:${(((x1 - x0) / (b - a)) * 100).toFixed(3)}%"><b>${w.books > 1 ? esc(w.bookLabels[n - 1]) : ''}</b><span>${(chs[n] || []).map((c) => `<i style="left:${(((U.citeX(c[1].split('–')[0]) - x0) / Math.max(0.01, x1 - x0)) * 100).toFixed(2)}%"></i>`).join('')}</span></a>`; }).join('')}
      </div>
      <span class="a-end">${U.parseCite(spans[books[books.length - 1]][1]).col}</span>
    </div>`;
  }

  A.work = (S) => {
    const w = U.work(S.workId) || U.work('EN');
    const en = w.id === 'EN';
    const d = U.divisionOf(w.id);
    const trs = w.translations.map((t) => ({ ...t, ...U.transParts(t) }));
    const chs = U.chapters(w.id);
    const nCh = U.chapterCount(w.id);
    const books = Object.keys(chs).map(Number).sort((x, y) => x - y);
    const opening = en ? U.BLOCKS[0].lines.slice(0, 4) : [];
    const fr = U.further(w.id);
    const kinds = { translation: 'Translation', commentary: 'Commentary', collection: 'In print' };
    const isa = U.work('Isa');
    return `<div class="a-page">${nav('')}
      <section class="a-wk">
        <div class="a-wk-l">
          ${en ? `<p class="a-open" lang="grc">${opening.slice(0, 2).map((L) => U.lineHTML(U.BLOCKS[0], L)).join(' ').replace(/(δοκεῖ<\/span>·).*$/s, '$1')}</p><p class="a-ref">EN 1094a1–2</p>`
            : `<p class="a-bigspan">${U.isBekker(w) ? esc(U.spanText(w)).replace('–', '<br>–') : 'Busse<br>1–22'}</p><p class="a-ref">${U.isBekker(w) ? `${U.pages(w)} Bekker pages` : 'cited by Busse’s page'}</p>`}
        </div>
        <div class="a-wk-r">
          <p class="a-eyebrow">${d ? `${d.numeral ? `${d.numeral} · ` : ''}${esc(d.appendix ? 'Doubted or spurious' : d.title)}` : 'Porphyry'}${tag(w)}</p>
          <p class="a-gtitle" lang="grc">${esc(capsTitle(w))}</p>
          <h1 class="a-etitle">${esc(w.title)}</h1>
          <p class="a-lede">${esc(w.blurb)}</p>
          <dl class="a-facts">
            <dt>Greek</dt><dd>${esc(w.greekSource.full)}</dd>
            <dt>English</dt><dd>${trs.map((t) => esc(t.name)).join('; ')}</dd>
            <dt>${U.isBekker(w) ? 'Bekker' : 'Pages'}</dt><dd>${esc(U.spanText(w))}${w.books > 1 ? ` · ${w.books} books` : ''} · ${nCh} chapter${nCh === 1 ? '' : 's'}</dd>
            ${en ? '<dt>Glossary</dt><dd>Ostwald’s glossary of technical terms</dd>' : ''}
          </dl>
          <div class="a-ctas">
            <a href="#" class="a-btn pri" data-go="${en ? 'reader' : 'reader'}">Start reading</a>
            ${en ? `<a href="#" class="a-btn" data-go="reader:${U.RESUME.cite}">Resume · I.7 <span class="a-lc">${U.RESUME.cite}</span></a>` : ''}
            <a href="#" class="a-btn" data-go="reader:greek">Greek only</a>
            ${trs.length > 1 ? '<a href="#" class="a-btn" data-go="reader:compare">Compare translations</a>' : ''}
          </div>
          ${en ? '' : '<p class="a-mock-note">In this mockup the reader opens the <i>Ethics</i>.</p>'}
        </div>
      </section>
      ${U.isBekker(w) ? `<section class="a-sec"><h2 class="a-h">On Bekker’s line</h2>${workRuler(w)}<div class="a-mini">${corpusLine({ small: true, ends: false, here: U.workSpan(w).first })}</div></section>` : ''}
      ${w.books > 1 ? `<section class="a-sec"><h2 class="a-h">Books</h2><ul class="a-books">${books.map((n) => { const c = chs[n]; return `<li><a href="#" data-go="${en && n === 1 ? 'reader' : `work:${w.id}`}"><span class="a-bn">${esc(w.bookLabels[n - 1])}</span><span class="a-br">Book ${esc(w.bookLabels[n - 1])}<small>${c.length} chapter${c.length === 1 ? '' : 's'} · ${esc(c[0][1].split('–')[0])}–${esc(c[c.length - 1][1].split('–').pop())}</small></span></a></li>`; }).join('')}</ul></section>`
        : `<section class="a-sec"><h2 class="a-h">Chapters</h2><ul class="a-books">${(chs[1] || []).map((c) => `<li><a href="#" data-go="work:${w.id}"><span class="a-bn">${esc(c[0])}</span><span class="a-br">Chapter ${esc(c[0])}<small>${esc(c[1])}</small></span></a></li>`).join('')}</ul></section>`}
      <section class="a-sec"><h2 class="a-h">Read this work</h2><ul class="a-eds">${trs.map((t) => `<li><a href="#" data-go="reader:${t.id}"><span class="a-edn">${esc(t.short)}</span><span class="a-edk">Greek &amp; English · ${esc(t.name)}${(w.defaultTranslation || trs[0].id) === t.id ? ' · opens first' : ''}</span></a></li>`).join('')}</ul></section>
      ${w.commentaries ? `<section class="a-sec"><h2 class="a-h">Commentary</h2><ul class="a-eds"><li><a href="#" data-go="work:Isa"><span class="a-edn">Porphyry, Isagoge <span lang="grc">· ${esc(isa.greekTitle)}</span></span><span class="a-edk">${esc(isa.blurb)}</span></a></li></ul></section>` : ''}
      <section class="a-sec"><h2 class="a-h">Greek text &amp; translations</h2><p class="a-credits"><b>Greek:</b> ${esc(w.greekSource.full)}<br><b>${trs.length > 1 ? 'Translations' : 'Translation'}:</b> ${trs.map((t) => esc(t.name)).join('; ')}.<br>Full source and licence details are on the <a href="#" data-noop>Texts &amp; Licences</a> page.</p></section>
      ${fr.length ? `<section class="a-sec"><h2 class="a-h">In print</h2><ul class="a-print">${fr.map((r) => `<li><span class="a-cap">${kinds[r.kind] || r.kind}</span><span>${r.cite}</span> <a href="#" data-noop>Find in print →</a></li>`).join('')}</ul></section>` : ''}
      ${foot()}</div>`;
  };

  // ── The reader ───────────────────────────────────────────────────────────
  A.reader = (S) => {
    const w = U.work('EN');
    const t = U.trans(S.trans);
    const books = U.bookList();
    const first = U.citeX(books[0].first);
    const last = U.citeX(books[books.length - 1].last);
    return `<div class="a-rd" data-body>
      <header class="a-rh" data-sticky>
        <div class="a-rh-row">
          <button type="button" class="a-hb" data-act="panel:toc" aria-label="Contents">${ICON.menu}</button>
          <span class="a-crumb"><a href="#" data-go="home">Works</a> › <a href="#" data-go="work:EN" class="a-crumb-w"><span class="a-full">Nicomachean Ethics</span><span class="a-short">Nic. Eth.</span></a></span>
          <button type="button" class="a-hb a-book" data-act="panel:book" data-keep>Book I ${ICON.caret}</button>
          <span class="a-goto" data-jump-host data-keep><label class="a-hide-s" for="a-here">Go to</label><input id="a-here" data-jump data-here value="1094a1" autocomplete="off" spellcheck="false"><span class="a-msg" data-jump-msg></span></span>
          <span class="a-sp1"></span>
          <span class="a-views a-hide-s" role="group" aria-label="Reading view">${['greek', 'both', 'english'].map((v) => `<button type="button" class="a-hb" data-act="view:${v}" aria-pressed="${S.view === v}">${v}</button>`).join('')}</span>
          <button type="button" class="a-hb a-tr a-hide-s" data-act="panel:picker" data-keep data-hp="tr"></button>
          <button type="button" class="a-hb a-hide-s" data-go="search" title="Search (⌘K)">${ICON.search}Search</button>
          <button type="button" class="a-hb a-hide-s" data-go="lexicon">Lexicon</button>
          <button type="button" class="a-hb" data-act="panel:aa" data-keep aria-label="Text settings">Aa</button>
          <button type="button" class="a-hb a-ico" data-act="theme" aria-label="Dark or light">${ICON.moon}</button>
        </div>
        <div class="a-strip2" data-prog style="--p:0">
          ${books.map((b) => `<a href="#" class="a-sb${b.b === 1 ? ' cur' : ''}" style="flex:${(U.citeX(b.last) - U.citeX(b.first)).toFixed(2)}" ${b.b === 1 ? 'data-act="ch:1"' : 'data-act="msg:book"'} title="Book ${ROMAN[b.b]} · ${b.first}–${b.last}"><b>${ROMAN[b.b]}</b></a>`).join('')}
          <i class="a-pos" style="left:calc(var(--p) * ${(((U.citeX(books[0].last) - first) / (last - first)) * 100).toFixed(3)}%)"></i>
        </div>
        <div class="a-cite">
          <span class="a-cite-l" data-hp="cite"></span>
          <span class="a-cite-r">Chapter <span data-here-ch>1</span> · <span data-here>1094a1</span></span>
        </div>
      </header>
      <main class="a-text" data-text></main>
    </div>`;
  };

  const surname = (t) => t.who.split(' ').pop();
  A.hp = {
    tr: (S) => `${esc(U.trans(S.trans).short)}${S.cmp ? ` + ${esc(U.trans(S.cmp).short)}` : ''} ${ICON.caret}`,
    cite: (S) => `Nicomachean Ethics · Bywater (OCT, 1894)${S.view === 'greek' ? '' : ` · ${esc(surname(U.trans(S.trans)))} (${esc(U.trans(S.trans).year)})${S.cmp ? ` · ${esc(surname(U.trans(S.cmp)))} (${esc(U.trans(S.cmp).year)})` : ''}`}`,
  };

  A.text = (S) => {
    const tr = U.readerTrans(S);
    const cols = S.view === 'greek' ? ['g'] : S.view === 'english' ? tr : ['g', ...tr];
    let html = '';
    let lastSi = -1;
    for (const bk of U.BLOCKS) {
      const segStart = bk.si !== lastSi;
      lastSi = bk.si;
      if (bk.start) {
        html += `<div class="a-row a-chh" style="--n:${cols.length}">${cols.map((c, i) => {
          if (c === 'g' || (i === 0)) return `<div class="a-chl"><span>Chapter ${esc(bk.chapter)}</span><span class="a-chb">${esc(bk.bekker)}</span>${c !== 'g' && c === 'ostwald' && U.TITLES[bk.chapter] ? `<span class="a-ott">${esc(U.TITLES[bk.chapter])}</span>` : ''}</div>`;
          return `<div class="a-chl e">${c === 'ostwald' && U.TITLES[bk.chapter] ? `<span class="a-ott">${esc(U.TITLES[bk.chapter])}</span>` : ''}</div>`;
        }).join('')}</div>`;
      }
      const named = tr.length > 1 && S.view !== 'greek';
      if (segStart) html += `<div class="a-row a-cref" style="--n:${cols.length}">${cols.map((c) => `<span>${bk.col}${c !== 'g' && named ? ` <b>${esc(U.trans(c).short)} ${esc(U.trans(c).year)}</b>` : ''}</span>`).join('')}</div>`;
      html += `<div class="a-row" style="--n:${cols.length}">${cols.map((c) => {
        if (c === 'g') {
          return `<div class="a-gc" lang="grc">${bk.lines.map((L) => `<div class="a-gl${L.cont ? ' cont' : ''}"${L.cont ? '' : ` data-cite="${bk.col}${L.n}"`}><span class="a-ln">${!L.cont && U.showNum(L.n) ? L.n : ''}</span><span class="a-lt">${U.lineHTML(bk, L)}</span></div>`).join('')}</div>`;
        }
        return `<div class="a-ec" data-t="${c}">${U.engHTML(bk, c)}</div>`;
      }).join('')}</div>`;
    }
    return html;
  };

  // In English-only view the Bekker line still has to be findable.
  A.after = (S) => {
    if (S.page !== 'reader') return;
  };

  A.act = (S, a, v) => {
    if (a === 'msg' && v === 'book') {
      const m = U.$('#view [data-jump-msg]');
      if (m) m.textContent = 'This mockup carries Book I.';
    }
  };

  // The word sidebar.
  A.side = (S) => {
    if (!S.word) return '';
    const cards = U.cards(S.word.k);
    return `<aside class="a-side" role="dialog" aria-label="Word: ${esc(S.word.t)}">
      <div class="a-side-h"><span class="a-w" lang="grc">${esc(S.word.t)}</span><span class="a-loc">${esc(S.word.cite)}</span><button type="button" class="a-x" data-act="close:word" aria-label="Close">${ICON.close}</button></div>
      <div class="a-side-b">
        ${cards.length ? cards.map((c) => `<section class="a-card">
          <p class="a-lem" lang="grc">${esc(c.head)}${c.hom ? `<small>${esc(c.hom)}</small>` : ''}</p>
          ${c.gloss ? `<p class="a-gls">${esc(c.gloss)}</p>` : ''}
          ${c.rows.map((r) => `<p class="a-pr">${esc(r.text)}${r.dialect ? ` <em>${esc(r.dialect)}</em>` : ''}</p>`).join('')}
          ${c.lsj ? `<button type="button" class="a-lsj" data-act="card:${esc(c.id)}" aria-expanded="${S.card === c.id}">${S.card === c.id ? '▾ Hide' : '▸ Show'} LSJ entry</button>` : ''}
          ${c.ref ? `<a href="#" class="a-occ" data-go="lexicon:${esc(c.ref.slug)}">Appears ${fmt(c.ref.count)}× in Aristotle →</a>` : ''}
          ${S.card === c.id ? U.t8(c.lsj) : ''}
        </section>`).join('') : '<p class="a-none">No analysis for this form.</p>'}
        <p class="a-keys"><button type="button" data-act="step:-1">← Previous word</button><button type="button" data-act="step:1">Next word →</button></p>
      </div>
    </aside>`;
  };

  A.note = (S) => {
    if (!S.fn) return '';
    const at = S.fnAt || { x: 600, y: 300 };
    const x = Math.min(at.x - 20, (U.$('#frame').offsetWidth || 1440) - 380);
    return `<div class="a-note" style="left:${Math.max(12, x)}px;top:${at.y + 6}px" role="note"><p class="a-cap">Ostwald’s note ${esc(S.fn.split('.')[1])}</p><p>${U.footnote(S.fn)}</p><button type="button" class="a-x" data-act="close:fn" aria-label="Close">${ICON.close}</button></div>`;
  };

  A.panel = (S) => {
    const at = S.panelAt || { x: 20, y: 60, r: 20 };
    if (S.panel === 'toc') {
      return `<aside class="a-toc" aria-label="Contents">
        <div class="a-toc-h"><a href="#" data-go="home">‹ All works</a><button type="button" class="a-x" data-act="close:panel" aria-label="Close">${ICON.close}</button></div>
        <p class="a-toc-w">Nicomachean Ethics</p>
        <div class="a-toc-go" data-jump-host><label class="a-cap" for="a-toc-go">Go to</label><input id="a-toc-go" data-jump placeholder="1097a15"><p class="a-msg" data-jump-msg></p></div>
        <ol class="a-toc-b">${U.bookList().map((b) => `<li class="${b.b === 1 ? 'open' : ''}"><p class="a-toc-bh"><b>${ROMAN[b.b]}</b> Book ${ROMAN[b.b]}<small>${b.n} ch.</small></p>
          ${b.b === 1 ? `<ol class="a-toc-c">${U.chapterList().map((c) => `<li><a href="#" data-act="ch:${c.ch}" data-ch-link="${c.ch}"><span class="a-tn">${c.ch}</span><span class="a-tt">${esc(c.title)}<small>${esc(c.bekker)}</small></span></a></li>`).join('')}</ol>` : ''}</li>`).join('')}</ol>
        <p class="a-toc-f"><a href="#" data-go="search">Search</a><a href="#" data-go="lexicon">Lexicon</a><a href="#" data-noop>Texts &amp; licences</a></p>
      </aside>`;
    }
    if (S.panel === 'book') {
      return `<div class="a-menu" style="left:${at.x}px;top:${at.y + 8}px"><ul class="a-bm">${U.bookList().map((b) => `<li><a href="#" ${b.b === 1 ? 'data-act="ch:1" aria-current="true"' : 'data-act="msg:book"'}><b>${ROMAN[b.b]}</b><span>Book ${ROMAN[b.b]}</span><small>${b.first}–${b.last}</small></a></li>`).join('')}</ul></div>`;
    }
    if (S.panel === 'picker') {
      return `<div class="a-menu a-pick" style="right:${at.r}px;top:${at.y + 8}px">
        <p class="a-cap">Translation</p>
        <ul>${U.EN_TRANS.map((t) => `<li><button type="button" data-act="trans:${t.id}" aria-pressed="${S.trans === t.id}"><span class="a-pn">${esc(t.short)}</span><span class="a-pk">${esc(t.pub)} · ${esc(t.year)}</span></button></li>`).join('')}</ul>
        <p class="a-cap">Compare with</p>
        <p class="a-cmps">${U.EN_TRANS.filter((t) => t.id !== S.trans).map((t) => `<button type="button" data-act="cmp:${t.id}" aria-pressed="${S.cmp === t.id}">${esc(t.short)}</button>`).join('')}<button type="button" data-act="cmp:off" aria-pressed="${!S.cmp}">Off</button></p>
        <p class="a-pick-n">Each translation keeps its own Bekker numbers. Upright numbers are fixed; italic ones are estimated.</p>
      </div>`;
    }
    if (S.panel === 'aa') {
      const sl = (k, label, min, max) => `<label class="a-sl"><span>${label}</span><output>${Math.round(S[k] * 100)}%</output><input type="range" min="${min}" max="${max}" step="0.05" value="${S[k]}" data-range="${k}"></label>`;
      return `<div class="a-menu a-aa" style="right:${at.r}px;top:${at.y + 8}px">
        <div class="a-aa-views" role="group" aria-label="Reading view">${['greek', 'both', 'english'].map((v) => `<button type="button" data-act="view:${v}" aria-pressed="${S.view === v}">${v}</button>`).join('')}</div>
        ${sl('fs', 'Text size', 0.8, 1.4)}${sl('lh', 'Line spacing', 0.85, 1.4)}${sl('cw', 'Column width', 0.75, 1.3)}
        <label class="a-chk"><input type="checkbox" checked> <span>Add the citation when I copy Greek</span></label>
        <p class="a-aa-f"><button type="button" class="a-cap" data-noop>Print</button><button type="button" class="a-cap" data-act="reset">Reset</button></p>
      </div>`;
    }
    return '';
  };

  // ── Search ───────────────────────────────────────────────────────────────
  A.search = (S) => {
    const R = U.search;
    const allHits = R.groups.flatMap((g) => g.books.flatMap((b) => b.chapters.flatMap((c) => c.hits.map((h) => h.cite))));
    const en = R.groups.find((g) => g.work === 'EN');
    const b1 = en.books.find((b) => b.book === 1);
    return `<div class="a-page">${nav('search')}
      <section class="a-sq">
        <div class="a-sq-top">
          <div class="a-sq-field">${ICON.search}<input value="${esc(R.q)}" lang="grc" aria-label="Search" data-search></div>
          <span class="a-sq-lang" role="group" aria-label="Language"><button type="button" class="on">Greek</button><button type="button">English</button><button type="button">Both</button><button type="button">β Beta Code</button></span>
        </div>
        <p class="a-sq-opts"><span>Match <u>all words</u></span><span>Form <u>any form</u></span><span>Accents <u>ignored</u></span><span>In <u>all works</u></span><a href="#" data-noop class="a-adv">Advanced ▾</a><button type="button" class="a-btn pri">Search</button></p>
        <p class="a-sq-help">* any letters inside or at the end of a word · ? one letter · Greek or Beta Code (<i>texnh</i> = τέχνη) · <a href="#" data-noop>How search works</a></p>
      </section>
      <section class="a-sr">
        <p class="a-sr-n"><b>${fmt(R.count)}</b> places in <b>${R.works.length}</b> works <a href="#" data-noop class="a-cap">Export as CSV</a></p>
        <div class="a-sr-line"><p class="a-h">Where it falls</p>${corpusLine({ hits: allHits })}</div>
        <p class="a-sr-works"><span class="a-cap">Works</span>${R.works.map((x, i) => `<a href="#" data-noop class="${i === 0 ? 'on' : ''}">${esc(x.title)} <small>${x.count}</small></a>`).join('')}</p>
        <section class="a-sg"><h2><span>Nicomachean Ethics</span><small>${en.count} places · Book I shown</small></h2>
          ${b1.chapters.map((c) => `<div class="a-sch"><p class="a-sch-h"><span class="a-cap">Book I · Chapter ${esc(c.chapter)}</span><span>${esc(c.bekker)}</span><small>${c.hits.length} place${c.hits.length === 1 ? '' : 's'}</small></p>
            ${(() => { let last = ''; return c.hits.map((h) => { const win = U.hitWindow(h.cite, h.form); const e = U.engAt(h.cite, 'ross'); const same = e === last; last = e; return `<div class="a-hitrow"><a href="#" class="a-hr" data-go="reader:${h.cite}">${h.cite}</a><div class="a-hg" lang="grc">${win ? win.filter((l) => l.here).map((l) => l.html).join(' ') : esc(h.form)}</div>${same ? '' : `<p class="a-he">${esc(e)} <span class="a-cap">Ross</span></p>`}</div>`; }).join(''); })()}</div>`).join('')}
        </section>
        ${R.groups.filter((g) => g.work !== 'EN').slice(0, 6).map((g) => `<section class="a-sg closed"><h2><span>${esc(g.title)}</span><small>${g.count} place${g.count === 1 ? '' : 's'}</small></h2><p class="a-refs">${g.books.flatMap((b) => b.chapters.flatMap((c) => c.hits)).slice(0, 14).map((h) => `<span>${h.cite}</span>`).join('')}${g.count > 14 ? '<span>…</span>' : ''}</p></section>`).join('')}
      </section>
      ${foot()}</div>`;
  };

  // ── Lexicon ──────────────────────────────────────────────────────────────
  A.lexicon = (S) => {
    const L = U.lemmaPage(S.lex) || U.lemmaPage('arete');
    const all = L.instancesByWork.flatMap((g) => g.books.flatMap((b) => b.chapters.flatMap((c) => c.instances.map((i) => `${i[0]}${i[1]}`))));
    const max = Math.max(...L.byWork.map((x) => x.count));
    const dz = L.distinctiveness;
    return `<div class="a-page">${nav('lexicon')}
      <section class="a-lx">
        <div class="a-lx-l">
          <p class="a-lx-w" lang="grc">${esc(L.head)}</p>
          <p class="a-cap">${esc(L.slug)}</p>
          <p class="a-lx-g">${esc((L.glosses || []).join('; '))}</p>
        </div>
        <dl class="a-lx-f">
          <div><dt>In Aristotle</dt><dd>${fmt(L.count)}</dd></div>
          ${dz ? `<div><dt>Before him</dt><dd>${fmt(dz.before_aristotle)}</dd></div><div><dt>His contemporaries</dt><dd>${fmt(dz.contemporary)}</dd></div>` : ''}
          <div><dt>Works</dt><dd>${L.byWork.length}</dd></div>
        </dl>
      </section>
      <section class="a-sec"><h2 class="a-h">Where it falls</h2>${corpusLine({ hits: all })}</section>
      <section class="a-sec"><h2 class="a-h">By work</h2><ul class="a-bw">${L.byWork.map((x) => `<li><a href="#" data-go="work:${x.work}"><span class="a-bw-t">${esc(x.title)}</span><span class="a-bw-bar"><i style="width:${((x.count / max) * 100).toFixed(1)}%"></i></span><span class="a-bw-n">${x.count}</span></a></li>`).join('')}</ul></section>
      <section class="a-sec a-lx-two"><div><h2 class="a-h">Dictionary · LSJ</h2>${U.t8(L.key)}</div>
        <div><h2 class="a-h">Key passages · Bonitz</h2><p class="a-credits">Bonitz’s <i>Index Aristotelicus</i> sorts the places by sense and marks the ones that decide each meaning. It will appear here once the transcription reaches this word.</p>
        <h2 class="a-h">Nearby in the lexicon</h2><p class="a-near">${U.ALPHA.slice(0, 18).map((x) => `<a href="#" data-noop${x[1] === L.slug ? ' class="on"' : ''} lang="grc">${esc(x[0])}</a>`).join('')}</p></div></section>
      ${foot()}</div>`;
  };

  A.filter = () => {};
})();
