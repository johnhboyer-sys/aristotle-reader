/* Direction E · Spectrum, round six. Colour is the binding. Every work has
   its own colour, and the colours run in the order of the corpus, so the
   works on one shelf make a spectrum: logic in reds, natural philosophy from
   orange through yellow to green, the Metaphysics in teal, ethics and
   politics in blues, rhetoric and poetics in violet, and the doubted works in
   greys that run through the same spectrum again with the colour drained
   out. A work page is that book's cover. The reader stays white: the book's
   colour shows only at its edges. No photographs. */
(function () {
  'use strict';
  const U = window.U;
  const { esc, fmt, ROMAN } = U;
  const E = (window.T.e = {});
  E.keepPanelOnTrans = true;

  // ── Colour ───────────────────────────────────────────────────────────────
  // Each colour is set in OKLCH (lightness, chroma, hue), so that steps along
  // the shelf are even to the eye, and turned into sRGB here, with its chroma
  // reduced until it fits the screen's gamut.
  const RAD = Math.PI / 180;
  function linear(L, C, h) {
    const a = C * Math.cos(h * RAD);
    const b = C * Math.sin(h * RAD);
    const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
    const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
    const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
    return [4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s, -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s, -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s];
  }
  function hex(L, C, h) {
    let c = Math.max(0, C);
    let rgb = linear(L, c, h);
    while (c > 0 && rgb.some((x) => x < -0.0005 || x > 1.0005)) { c -= 0.002; rgb = linear(L, Math.max(0, c), h); }
    const g = (x) => { x = Math.min(1, Math.max(0, x)); return x <= 0.0031308 ? 12.92 * x : 1.055 * x ** (1 / 2.4) - 0.055; };
    return '#' + rgb.map((x) => Math.round(g(x) * 255).toString(16).padStart(2, '0')).join('');
  }
  const lum = (hx) => {
    const v = [1, 3, 5].map((i) => parseInt(hx.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
    return 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2];
  };
  const contrast = (a, b) => { const x = lum(a); const y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };

  // The forty-one colours, in the order of the corpus: [lightness, chroma, hue].
  const PAL = {
    // I · Logic: reds, oxblood to coral.
    Cat: [0.40, 0.14, 15], Int: [0.48, 0.175, 22], APr: [0.55, 0.195, 27], APo: [0.61, 0.19, 33], Top: [0.665, 0.17, 40], SE: [0.73, 0.13, 34],
    // Porphyry's introduction, bound as a pale companion to the Categories.
    Isa: [0.86, 0.05, 12],
    // II · Natural philosophy: oranges for the major works, yellows for the
    // short works on nature, greens for the biology.
    Phys: [0.70, 0.165, 52], Cael: [0.77, 0.135, 62], GC: [0.64, 0.15, 55], Mete: [0.80, 0.15, 72], DA: [0.735, 0.145, 80],
    Sens: [0.81, 0.14, 85], Mem: [0.745, 0.125, 91], Somn: [0.905, 0.095, 98], Insomn: [0.865, 0.14, 100], DivSomn: [0.79, 0.125, 96], Long: [0.895, 0.125, 108], Juv: [0.845, 0.125, 116],
    HA: [0.785, 0.145, 126], PA: [0.70, 0.15, 135], MA: [0.62, 0.14, 143], IA: [0.545, 0.12, 152], GA: [0.455, 0.095, 160],
    // III · Metaphysics: teal.
    Meta: [0.50, 0.085, 205],
    // IV · Ethics and politics: cobalt, ultramarine, indigo.
    EN: [0.48, 0.16, 254], EE: [0.43, 0.18, 266], Pol: [0.355, 0.145, 278],
    // V · Rhetoric and poetics: violet and magenta.
    Rhet: [0.47, 0.155, 306], Poet: [0.56, 0.175, 346],
    // Doubted and spurious: the spectrum again, greyed.
    DM: [0.70, 0.03, 20], MXG: [0.62, 0.028, 50], Mech: [0.76, 0.03, 78], Col: [0.66, 0.028, 100], Aud: [0.74, 0.03, 125], Phgn: [0.60, 0.03, 150], Mirab: [0.70, 0.028, 195], Lin: [0.78, 0.025, 235], Vent: [0.56, 0.03, 255], VV: [0.68, 0.03, 295], Oec: [0.60, 0.03, 330],
  };
  const PAPER = { light: '#fafaf8', dark: '#161615' };
  // Darkening a yellow makes olive; turn it toward ochre and umber instead.
  // Greens darken toward blue-green.
  const deep = (h) => (h >= 70 && h <= 118 ? h - 30 : h >= 45 && h < 70 ? h - 14 : h > 118 && h < 175 ? h + 12 : h);
  // One colour as a field, with its inks: `ci` for small type on the field
  // (the darker or lighter ink, whichever reads better), `ct` for a large
  // title on it (the same hue, lighter or deeper), `cp` for the colour used
  // as type on paper.
  function make(L, C, h, dark) {
    if (dark) { L = L > 0.8 ? L - 0.1 : L - 0.06; C *= 0.9; }
    let c = hex(L, C, h);
    const dk = hex(0.21, Math.min(C * 0.4, 0.05), deep(h));
    const lt = hex(0.99, 0.01, h);
    const light = contrast(c, lt) > contrast(c, dk);
    const ci = light ? lt : dk;
    // Small type on the field needs 4.5 to 1: where the ink falls short,
    // move the field a hair away from it.
    for (let i = 0; i < 12 && contrast(c, ci) < 4.5; i++) { L += light ? -0.01 : 0.01; c = hex(L, C, h); }
    const ct = light ? hex(Math.min(0.93, L + 0.31), C * 0.62, h) : hex(Math.max(0.22, L - 0.39), Math.min(C, 0.17), deep(h));
    const paper = dark ? PAPER.dark : PAPER.light;
    let cp = c;
    for (let i = 1; i <= 40 && contrast(cp, paper) < 4.6; i++) cp = hex(dark ? L + 0.02 * i : L - 0.02 * i, C, dark ? h : h + (deep(h) - h) * Math.min(1, i / 8));
    return { c, ci, ct, cp, light };
  }
  const MEMO = new Map();
  function colour(id, dark, k = 0, n = 1) {
    const key = `${id}:${dark ? 1 : 0}:${k}:${n}`;
    let v = MEMO.get(key);
    if (v) return v;
    const [L0, C, h] = PAL[id] || [0.6, 0.0, 0];
    // The books of a work: Book I in the work's own colour, each later book a
    // step away from it, darker under a light ink and lighter under a dark
    // one, so the whole set keeps one ink.
    const dir = n > 1 && make(L0, C, h, dark).light ? -1 : 1;
    const L = n > 1 ? Math.min(0.93, Math.max(0.26, L0 + (dir * 0.17 * k) / (n - 1))) : L0;
    v = make(L, C, h, dark);
    MEMO.set(key, v);
    return v;
  }
  const vars = (x) => `--c:${x.c};--ci:${x.ci};--ct:${x.ct};--cp:${x.cp}`;
  const isDark = (S) => S.theme === 'dark';
  const wv = (id, S) => vars(colour(id, isDark(S)));
  const bv = (id, k, n, S) => vars(colour(id, isDark(S), k, n));
  E.colour = colour;

  // ── The corpus as a shelf ────────────────────────────────────────────────
  const DIVNAME = { 'Logic (Organon)': 'Logic', 'Natural Philosophy': 'Natural philosophy', Metaphysics: 'Metaphysics', 'Moral and Political Philosophy': 'Ethics and politics', 'Rhetoric and Poetics': 'Rhetoric and poetics' };
  const SUB = { 'Major Works on Nature': 'The major works on nature', 'Short Works on Nature (Parva Naturalia)': 'The short works on nature', 'Biological Works': 'The works on animals' };
  const divName = (d) => (d.appendix ? 'Doubted and spurious' : DIVNAME[d.title] || d.title);
  // Porphyry's Isagoge is not in the registry's divisions; it stands after the logic.
  const withIsa = (divs) => { const isa = U.work('Isa'); return divs.map((d) => (d.numeral === 'I' && isa ? { ...d, groups: [...d.groups, { ref: '', label: 'With it, a commentary', works: [{ ...isa, title: 'Porphyry, Isagoge' }] }] } : d)); };
  const shelf = () => withIsa(U.divisions()).map((d) => ({ n: d.numeral, name: divName(d), groups: d.groups, works: d.groups.flatMap((g) => g.works) }));
  const ORDER = shelf().flatMap((d) => d.works.map((w) => w.id));
  // Spine titles: the site's own, except one Greek title too long for a spine.
  const SPINE_GR = { Juv: 'Περὶ νεότητος καὶ γήρως' };
  const shelfOrder = (xs) => xs.slice().sort((a, b) => ORDER.indexOf(a.work) - ORDER.indexOf(b.work));
  const author = (w) => (w.id === 'Isa' ? 'Porphyry' : 'Aristotle');
  const tag = (w) => (w.authenticity && w.authenticity !== 'genuine' ? `<span class="e-tag">${esc(w.authenticity)}</span>` : '');

  const ICON = {
    close: '<svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><path d="M3.5 3.5l9 9M12.5 3.5l-9 9" stroke="currentColor" stroke-width="1.4"/></svg>',
    moon: '<svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><path d="M13.2 10.1A5.6 5.6 0 0 1 5.9 2.8a5.6 5.6 0 1 0 7.3 7.3z" fill="none" stroke="currentColor" stroke-width="1.3"/></svg>',
    search: '<svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><circle cx="6.8" cy="6.8" r="4.6" fill="none" stroke="currentColor" stroke-width="1.4"/><path d="M10.4 10.4 14 14" stroke="currentColor" stroke-width="1.4"/></svg>',
    menu: '<svg viewBox="0 0 16 16" width="17" height="17" aria-hidden="true"><path d="M2 4.5h12M2 8h12M2 11.5h12" stroke="currentColor" stroke-width="1.4"/></svg>',
    caret: '<svg viewBox="0 0 10 6" width="9" height="6" aria-hidden="true"><path d="M1 1l4 4 4-4" fill="none" stroke="currentColor" stroke-width="1.3"/></svg>',
  };

  const nav = (on) => `<header class="e-nav">
      <a class="e-brand" href="#" data-go="home"><span>Aristotle</span> <i>Reader</i></a>
      <nav class="e-links" aria-label="Site">
        ${[['home', 'Works'], ['search', 'Search'], ['lexicon', 'Lexicon'], ['phrases', 'Phrases'], ['support', 'Support']].map(([k, l]) => {
          const live = k !== 'phrases' && k !== 'support';
          return `<a href="#" ${live ? `data-go="${k}"` : 'data-noop'} class="${on === k ? 'on' : ''}${live ? '' : ' e-wide'}"${on === k ? ' aria-current="page"' : ''}>${l}</a>`;
        }).join('')}
        <button type="button" class="e-ib" data-act="theme" aria-label="Dark or light">${ICON.moon}</button>
      </nav>
    </header>`;
  const foot = () => `<footer class="e-foot">
      <p>Also <a href="#" data-noop>The Plato Reader</a> <a href="#" data-noop>The Homer Reader</a> <a href="#" data-noop>The Greek Drama Reader</a> <a href="#" data-noop>Grammata</a></p>
      <p><a href="#" data-noop>Texts &amp; licences</a> <a href="#" data-noop>Support</a> <a href="#" data-noop>Desktop app</a> <a href="#" data-noop>Report an error</a> <a href="#" data-noop>Play a game</a> <span>Site by John H. Boyer</span></p>
    </footer>`;

  // ── Home: the shelf ──────────────────────────────────────────────────────
  // On a desktop the books stand on one shelf, spines out: the title runs
  // down the spine, the Greek title stands at its foot, and a narrow divider
  // names each division, as on a library shelf. On a phone the same books
  // lie flat in a stack.
  const spine = (w, S) => `<li><a class="e-sp" href="#" data-go="work:${w.id}" style="${wv(w.id, S)}">
      <span class="e-sp-t">${esc(w.title)}</span>
      <span class="e-sp-g" lang="grc">${esc(SPINE_GR[w.id] || w.greekTitle)}</span>
      <span class="e-sp-e">${w.books > 1 ? `${w.books} books` : esc(U.extent(w))}</span>
    </a></li>`;
  E.home = (S) => {
    const en = U.work('EN');
    return `<div class="e-page e-home">${nav('home')}
      <section class="e-shelf" aria-label="The works of Aristotle, in the order of the corpus">
        ${shelf().map((d) => `<div class="e-div">
          <h2 class="e-dv"><span>${d.n ? `${d.n} · ` : ''}${esc(d.name)}</span></h2>
          ${d.groups.map((g) => `${g.label ? `<p class="e-sub">${esc(SUB[g.label] || g.label)}</p>` : ''}<ul class="e-sps">${g.works.map((w) => spine(w, S)).join('')}</ul>`).join('')}
        </div>`).join('')}
      </section>
      <p class="e-key">The forty works in the order of the corpus, each in its own colour: the logic in reds, natural philosophy from orange through yellow to green, the <i>Metaphysics</i> in teal, ethics and politics in blues, rhetoric and poetics in violet. The doubted works run through the same colours again, in grey. Porphyry’s <i>Isagoge</i>, an introduction to the <i>Categories</i>, stands after the logic.</p>
      <section class="e-intro">
        <p class="e-lead">Aristotle in Greek and English, side by side. Click any Greek word to parse it and read its entry in the dictionary; search every work in either language.</p>
        <div class="e-intro-r">
          <div class="e-search">${ICON.search}<input data-search placeholder="φύσις, justice, ἀρετή …" aria-label="Search the works" autocomplete="off" spellcheck="false"><button type="button" data-go="search">Search</button></div>
          <a class="e-cont" href="#" data-go="reader:${U.RESUME.cite}" style="${wv('EN', S)}"><span class="e-chip" aria-hidden="true"></span><span>Continue reading <i>${esc(en.title)}</i>, Book I, chapter 7</span></a>
        </div>
      </section>
      ${foot()}</div>`;
  };

  // ── Setting a cover title ────────────────────────────────────────────────
  // A title is set as large as its box allows, whole words only, flush left,
  // in Libertinus Serif Display. Every way of breaking it into lines (up to
  // four) is tried; the one that sets it largest wins, and a line may not end
  // on a small word (of, and, on) unless nothing else fits.
  const cv = document.createElement('canvas').getContext('2d');
  let dispIn = false;
  const WID = new Map();
  const w100 = (s) => {
    if (!dispIn) return s.length * 46;
    let v = WID.get(s);
    if (v === undefined) { cv.font = '400 100px "Libertinus Serif Display"'; v = cv.measureText(s).width; WID.set(s, v); }
    return v;
  };
  const SMALL = new Set(['of', 'and', 'on', 'the', 'in', 'et', 'de', 'a', 'old']);
  function setTitle(text, W, H, opt = {}) {
    const words = String(text).split(/\s+/).filter(Boolean);
    const n = words.length;
    const lh = opt.lh || 0.96;
    const max = Math.min(opt.lines || 4, n);
    let best = null;
    for (let mask = 0; mask < 1 << (n - 1); mask++) {
      const lines = [];
      let cur = [words[0]];
      for (let i = 1; i < n; i++) {
        if (mask & (1 << (i - 1))) { lines.push(cur.join(' ')); cur = [words[i]]; } else cur.push(words[i]);
      }
      lines.push(cur.join(' '));
      if (lines.length > max) continue;
      const f = Math.min((W * 100) / Math.max(...lines.map(w100)), H / (lines.length * lh), opt.fmax || 400);
      let pen = 0;
      lines.forEach((l, i) => { if (i < lines.length - 1 && SMALL.has(l.split(' ').pop().replace(/,$/, '').toLowerCase())) pen += 0.16; });
      const score = f * (1 - pen) - lines.length;
      if (!best || score > best.score) best = { score, f, lines };
    }
    return best;
  }
  // The room a title has: its box's height less everything else in the box.
  function room(el) {
    const box = el.parentElement;
    const cs = getComputedStyle(box);
    let h = box.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom);
    const kids = [...box.children];
    for (const k of kids) if (k !== el) h -= k.getBoundingClientRect().height / (U.scale || 1);
    h -= (parseFloat(cs.rowGap) || 0) * (kids.length - 1);
    return h;
  }
  function fitTitle(el) {
    const W = el.clientWidth;
    if (!W) return;
    const H = Math.min(+el.dataset.h || 300, room(el) * 0.94);
    const r = setTitle(el.dataset.title, W, H, { fmax: +el.dataset.fmax || 300, lines: +el.dataset.lines || 4 });
    if (!r) return;
    el.style.fontSize = `${Math.floor(r.f * 10) / 10}px`;
    el.innerHTML = r.lines.map((l) => `<span class="ln">${esc(l)}</span>`).join('');
    el.dataset.w = String(W);
  }
  // A headword: as wide as its column allows, accents kept.
  const cvG = document.createElement('canvas').getContext('2d');
  function fitWord(el) {
    const W = el.clientWidth;
    if (!W) return;
    cvG.font = '400 100px "Libertinus Serif Display"';
    const w = dispIn ? cvG.measureText(el.dataset.title).width : 52 * [...el.dataset.title].length;
    el.style.fontSize = `${Math.max(40, Math.min(+el.dataset.fmax || 260, (W / w) * 100 * 0.97)).toFixed(1)}px`;
    el.dataset.w = String(W);
  }
  const refit = (el) => (el.dataset.fit === 'word' ? fitWord(el) : fitTitle(el));
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
  E.after = (S, P) => fitAll(P);
  E.fitText = fitAll;
  if (document.fonts && document.fonts.load) {
    document.fonts.load('400 100px "Libertinus Serif Display"', 'Nicomachean Ethics ἀρετή').catch(() => []).then(() => {
      dispIn = true;
      WID.clear();
      U.shown().forEach(fitAll);
    });
  }

  // ── A work: its cover ────────────────────────────────────────────────────
  const books = (w, S) => {
    const en = w.id === 'EN';
    const bs = U.workBooks(w.id);
    const n = bs.length;
    const row = (b, c) => `<li${c.title ? '' : ' class="nt"'}><a href="#" data-go="${en && b.n === 1 ? `reader:${c.bekker.split('–')[0]}` : 'reader'}"><span class="e-cn">${esc(c.ch)}</span><span class="e-ct">${esc(c.title || `Chapter ${c.ch}`)}</span><span class="e-cb">${esc(c.bekker)}</span></a></li>`;
    if (n < 2) return `<ol class="e-chs e-chs1">${(bs[0] ? bs[0].chapters : []).map((c) => row(bs[0], c)).join('')}</ol>`;
    const span = (b) => { const s = U.bookSpan(w, b.n); return s ? `${s[0]}–${s[1]}` : ''; };
    return `<p class="e-bkall"><button type="button" data-act="books:open">Open all books</button><button type="button" data-act="books:close">Close all</button></p>
      <div class="e-bks">${bs.map((b, k) => `<details class="e-bk" data-book="${b.n}" style="${bv(w.id, k, n, S)}"><summary>
          <span class="e-vol" lang="${/[α-ωΑ-Ω]/.test(b.label) ? 'grc' : 'en'}"><span class="e-sro">Book </span>${esc(b.label)}</span>
          <span class="e-bkf">${b.chapters[0] && b.chapters[0].title ? esc(b.chapters[0].title) : `<span class="e-bks2">${esc(span(b))}</span>`}</span>
          <span class="e-bkc">${b.chapters.length} chapter${b.chapters.length === 1 ? '' : 's'}</span>
        </summary><ol class="e-chs">${b.chapters.map((c) => row(b, c)).join('')}</ol></details>`).join('')}</div>`;
  };

  E.work = (S, P) => {
    const w = U.work(S.workId) || U.work('EN');
    const en = w.id === 'EN';
    const d = U.divisionOf(w.id);
    const trs = w.translations.map((t) => ({ ...t, ...U.transParts(t) }));
    const many = U.workBooks(w.id).length > 1;
    const fr = U.further(w.id);
    const kinds = { translation: 'Translation', commentary: 'Commentary', collection: 'In print' };
    const isa = U.work('Isa');
    const phone = P.kind === 'phone';
    const div = d ? `${d.numeral ? `${d.numeral} · ` : ''}${divName(d)}` : 'An introduction to the Categories';
    // Its neighbours on the shelf.
    const at = ORDER.indexOf(w.id);
    const prev = at > 0 ? U.work(ORDER[at - 1]) : w.id === 'Isa' ? U.work('Cat') : null;
    const next = at >= 0 && at < ORDER.length - 1 ? U.work(ORDER[at + 1]) : w.id === 'Isa' ? U.work('Int') : null;
    return `<div class="e-page e-work" style="${wv(w.id, S)}">${nav('home')}
      <section class="e-cover">
        <p class="e-cv-k"><span>${esc(author(w))}</span><span>${esc(div)}</span></p>
        <h1 class="e-cv-t" data-fit="title" data-title="${esc(w.title)}" data-h="${phone ? 300 : 430}" data-fmax="${phone ? 110 : 250}">${esc(w.title)}</h1>
        <p class="e-cv-b"><span class="e-cv-g${w.greekTitle.length > 34 ? ' long' : ''}" lang="grc">${esc(w.greekTitle)}</span><span class="e-cv-e">${esc(U.extent(w))}</span></p>
      </section>
      <section class="e-wk">
        <div class="e-wk-l">
          <p class="e-blurb">${esc(w.blurb)}${tag(w)}</p>
          <div class="e-ctas">
            <a href="#" class="e-btn pri" data-go="reader">Start reading</a>
            ${en ? `<a href="#" class="e-btn" data-go="reader:${U.RESUME.cite}">Resume at Book I, chapter 7</a>` : ''}
            <a href="#" class="e-btn" data-go="reader:greek">Greek only</a>
            ${trs.length > 1 ? '<a href="#" class="e-btn" data-go="reader:compare">Compare translations</a>' : ''}
          </div>
          ${en ? '' : '<p class="e-mock">In this mockup the reader opens the <i>Ethics</i>.</p>'}
        </div>
        <dl class="e-facts">
          <dt>Greek</dt><dd>${esc(w.greekSource.full)}</dd>
          <dt>English</dt><dd>${trs.map((t) => `<a href="#" data-go="reader:${t.id}">${esc(t.who)}</a>, ${esc(t.pub)}${t.year ? `, ${esc(t.year)}` : ''}${trs.length > 1 && (w.defaultTranslation || trs[0].id) === t.id ? ' <small>opens first</small>' : ''}`).join('<br>')}</dd>
        </dl>
      </section>
      <section class="e-sec">
        <h2 class="e-h2">${many ? 'Books and chapters' : 'Chapters'}</h2>${en ? '<p class="e-note">Chapter titles are Ostwald’s.</p>' : ''}
        ${books(w, S)}
      </section>
      <section class="e-sec e-two">
        ${fr.length ? `<div><h2 class="e-h2">In print</h2><ul class="e-print">${fr.map((r) => `<li><small>${kinds[r.kind] || r.kind}</small><span>${r.cite}</span></li>`).join('')}</ul></div>` : ''}
        <div>${w.commentaries ? `<h2 class="e-h2">Commentary</h2><p class="e-com"><a href="#" data-go="work:Isa" style="${wv('Isa', S)}"><span class="e-chip" aria-hidden="true"></span><span>Porphyry, <i>Isagoge</i></span></a><small>${esc(isa.blurb)}</small></p>` : ''}
          ${w.related ? `<h2 class="e-h2">With it</h2><p class="e-com">${w.related.map((r) => `<a href="#" data-go="work:${r.id}" style="${wv(r.id, S)}"><span class="e-chip" aria-hidden="true"></span><span>${esc(r.label)}</span></a>`).join('')}</p>` : ''}
          <h2 class="e-h2">Sources</h2><p class="e-cred"><a href="#" data-noop>Texts &amp; licences</a></p></div>
      </section>
      <nav class="e-near" aria-label="On the shelf">
        ${prev ? `<a href="#" data-go="work:${prev.id}" style="${wv(prev.id, S)}"><small>Before it on the shelf</small><span>${esc(prev.title)}</span></a>` : '<span></span>'}
        ${next ? `<a href="#" class="nx" data-go="work:${next.id}" style="${wv(next.id, S)}"><small>Next on the shelf</small><span>${esc(next.title)}</span></a>` : '<span></span>'}
      </nav>
      ${foot()}</div>`;
  };

  // ── The reader ───────────────────────────────────────────────────────────
  // White paper and black type. Book I's colour shows at the head of the
  // page, in the book button, in the chapter numbers and on the word you
  // click; never on the text.
  const BOOKS_EN = U.workBooks('EN').length;
  const b1 = (S) => bv('EN', 0, BOOKS_EN, S);
  E.reader = (S) => `<div class="e-rd" data-body style="${b1(S)}">
      <header class="e-rh" data-sticky>
        <button type="button" class="e-ib" data-act="panel:toc" aria-label="Contents">${ICON.menu}</button>
        <a class="e-rh-w" href="#" data-go="work:EN"><span class="full">Nicomachean Ethics</span><span class="short">Ethics</span></a>
        <button type="button" class="e-rh-bk" data-act="panel:book" data-keep aria-label="Book I. Choose a book"><span class="e-vol">I</span><span class="e-rh-bkw">Book I</span>${ICON.caret}</button>
        <span class="e-rh-ch"><span>Chapter <b data-here-ch>1</b></span><i data-here-title></i></span>
        <span class="e-msg" data-jump-msg></span>
        <span class="e-sp1"></span>
        <span class="e-seg hide-s" role="group" aria-label="Reading view">${['greek', 'both', 'english'].map((v) => `<button type="button" data-act="view:${v}" aria-pressed="${S.view === v}">${v[0].toUpperCase() + v.slice(1)}</button>`).join('')}</span>
        <button type="button" class="e-rh-b hide-s" data-act="panel:picker" data-keep data-hp="tr"></button>
        <button type="button" class="e-ib hide-s" data-go="search" aria-label="Search">${ICON.search}</button>
        <button type="button" class="e-ib e-aab" data-act="panel:aa" data-keep aria-label="Text and view settings">Aa</button>
        <button type="button" class="e-ib" data-act="theme" aria-label="Dark or light">${ICON.moon}</button>
      </header>
      <main class="e-text" data-text></main>
    </div>`;

  E.hp = { tr: (S) => `${esc(U.trans(S.trans).short)}${S.cmp ? ` and ${esc(U.trans(S.cmp).short)}` : ''} ${ICON.caret}` };

  E.text = (S) => {
    const tr = U.readerTrans(S);
    const cols = S.view === 'greek' ? ['g'] : S.view === 'english' ? tr : ['g', ...tr];
    const n = U.chapterList().length;
    let lastSi = -1;
    let html = `<header class="e-open">
        <p class="e-open-k">Nicomachean Ethics</p>
        <p class="e-open-b">Book I</p>
        <p class="e-open-g" lang="grc">Ἠθικὰ Νικομάχεια Α</p>
        <p class="e-open-s">${n} chapters · Greek: Bywater, 1894${S.view === 'greek' ? '' : ` · English: ${tr.map((t) => `${esc(U.trans(t).who)}, ${esc(U.trans(t).year)}`).join(' and ')}`}</p>
      </header>`;
    for (const bk of U.BLOCKS) {
      const segStart = bk.si !== lastSi;
      lastSi = bk.si;
      if (bk.start) html += `<div class="e-chh"><span class="e-chn">${esc(bk.chapter)}</span><div><p class="e-cht">${esc(U.TITLES[bk.chapter] || '')}</p><p class="e-chb">Chapter ${esc(bk.chapter)} · ${esc(bk.bekker)}</p></div></div>`;
      html += `<div class="e-row" style="--n:${cols.length}">${cols.map((c) => {
        if (c === 'g') {
          return `<div class="e-gc" lang="grc">${bk.lines.map((L, i) => {
            const first = segStart && i === 0 && !L.cont;
            const num = L.cont ? '' : first || L.n === 1 ? `${bk.col}${L.n === 1 ? '' : L.n}` : U.showNum(L.n) ? L.n : '';
            return `<div class="e-gl${L.cont ? ' cont' : ''}"${L.cont ? '' : ` data-cite="${bk.col}${L.n}"`}><span class="e-ln${typeof num === 'string' && num ? ' col' : ''}">${num}</span><span class="e-lt">${U.lineHTML(bk, L)}</span></div>`;
          }).join('')}</div>`;
        }
        return `<div class="e-ec" data-t="${c}" data-tn="${esc(U.trans(c).short)}">${U.engHTML(bk, c)}</div>`;
      }).join('')}</div>`;
    }
    return html;
  };

  E.side = (S) => {
    if (!S.word) return '';
    const cards = U.cards(S.word.k);
    const bk = U.blockOfCite(S.word.cite);
    return `<aside class="e-side" role="dialog" aria-label="Word: ${esc(S.word.t)}" style="${b1(S)}">
      <div class="e-side-h"><p class="e-w" lang="grc">${esc(S.word.t)}</p><p class="e-loc">Book I, chapter ${esc(bk ? bk.chapter : '1')} · ${esc(S.word.cite)}</p><button type="button" class="e-x" data-act="close:word" aria-label="Close">${ICON.close}</button></div>
      <div class="e-side-b">
        ${cards.length ? cards.map((c) => `<section class="e-card">
          <p class="e-lem" lang="grc">${esc(c.head)}${c.hom ? `<small>${esc(c.hom)}</small>` : ''}</p>
          ${c.gloss ? `<p class="e-gls">${esc(c.gloss)}</p>` : ''}
          <ul class="e-prs">${c.rows.map((r) => `<li>${esc(U.longParse(r.text))}${r.dialect ? ` <em>${esc(r.dialect)}</em>` : ''}</li>`).join('')}</ul>
          <p class="e-card-f">${c.lsj ? `<button type="button" data-act="card:${esc(c.id)}" aria-expanded="${S.card === c.id}">${S.card === c.id ? 'Hide' : 'Show'} the LSJ entry</button>` : ''}${c.ref ? `<a href="#" data-go="lexicon:${esc(c.ref.slug)}">${fmt(c.ref.count)} times in Aristotle</a>` : ''}</p>
          ${S.card === c.id ? U.t8(c.lsj) : ''}
        </section>`).join('') : '<p class="e-none">No analysis for this form.</p>'}
        <p class="e-keys"><button type="button" data-act="step:-1">← Previous word</button><button type="button" data-act="step:1">Next word →</button></p>
      </div>
    </aside>`;
  };

  E.note = (S, P) => {
    if (!P.ui.fn) return '';
    const at = P.ui.fnAt || { x: 600, y: 300 };
    const wpx = P.kind === 'phone' ? 340 : 380;
    const x = Math.max(12, Math.min(at.x - 20, P.W0 - wpx - 12));
    return `<div class="e-fn" style="left:${x}px;top:${at.y + 6}px;width:${wpx}px;${b1(S)}" role="note"><p class="e-fn-k">Ostwald’s note ${esc(P.ui.fn.split('.')[1])}</p><p>${U.footnote(P.ui.fn)}</p><button type="button" class="e-x" data-act="close:fn" aria-label="Close">${ICON.close}</button></div>`;
  };

  const views = (S) => `<div class="e-seg wide" role="group" aria-label="Reading view">${['greek', 'both', 'english'].map((v) => `<button type="button" data-act="view:${v}" aria-pressed="${S.view === v}">${v[0].toUpperCase() + v.slice(1)}</button>`).join('')}</div>`;
  const transList = (S) => `<ul class="e-pick">${U.EN_TRANS.map((t) => `<li><button type="button" data-act="trans:${t.id}" aria-pressed="${S.trans === t.id}"><span>${esc(t.who)}</span><small>${esc(t.pub)}, ${esc(t.year)}</small></button></li>`).join('')}</ul>
      <p class="e-mk">Beside it, to compare</p>
      <p class="e-cmps">${U.EN_TRANS.filter((t) => t.id !== S.trans).map((t) => `<button type="button" data-act="cmp:${t.id}" aria-pressed="${S.cmp === t.id}">${esc(t.short)}</button>`).join('')}<button type="button" data-act="cmp:off" aria-pressed="${!S.cmp}">None</button></p>`;
  const bookMenu = (S) => {
    const bs = U.bookList();
    return `<ul class="e-bm">${bs.map((b, k) => `<li style="${bv('EN', k, bs.length, S)}"><a href="#" ${b.b === 1 ? 'data-act="ch:1" aria-current="true"' : 'data-act="msg:book"'}><span class="e-vol">${ROMAN[b.b]}</span><span>Book ${ROMAN[b.b]}</span><small>${b.n} chapters</small></a></li>`).join('')}</ul>`;
  };
  E.panel = (S, P) => {
    const at = P.ui.panelAt || { x: 20, y: 60, r: 20 };
    const phone = P.kind === 'phone';
    if (P.ui.panel === 'toc') {
      const bs = U.bookList();
      return `<aside class="e-toc" aria-label="Contents" style="${b1(S)}">
        <div class="e-toc-h"><a href="#" data-go="home">All works</a><button type="button" class="e-x" data-act="close:panel" aria-label="Close">${ICON.close}</button></div>
        <p class="e-toc-w"><a href="#" data-go="work:EN">Nicomachean Ethics</a></p>
        <div class="e-toc-go" data-jump-host><label for="e-go-${P.kind}">Go to a Bekker line</label><input id="e-go-${P.kind}" data-jump placeholder="1094a1" autocomplete="off" spellcheck="false"><p class="e-msg" data-jump-msg></p></div>
        <ol class="e-toc-b">${bs.map((b, k) => `<li style="${bv('EN', k, bs.length, S)}"><p class="e-toc-bh${b.b === 1 ? ' now' : ''}"><span class="e-vol">${ROMAN[b.b]}</span><span>Book ${ROMAN[b.b]}</span><small>${b.n} chapters</small></p>
          ${b.b === 1 ? `<ol class="e-toc-c">${U.chapterList().map((c) => `<li><a href="#" data-act="ch:${c.ch}" data-ch-link="${c.ch}"${c.ch === (P.ui.hereCh || '1') ? ' class="now"' : ''}><span>${c.ch}</span>${esc(c.title)}</a></li>`).join('')}</ol>` : ''}</li>`).join('')}</ol>
      </aside>`;
    }
    if (P.ui.panel === 'book') return `<div class="e-menu e-bkm" style="left:${phone ? 12 : at.x}px;top:${at.y + 8}px;${b1(S)}">${bookMenu(S)}</div>`;
    if (P.ui.panel === 'picker') return `<div class="e-menu e-pk" style="right:${at.r}px;top:${at.y + 8}px;${b1(S)}"><p class="e-mk">Translation</p>${transList(S)}<p class="e-note2">Each translation keeps its own Bekker numbers in its margin.</p></div>`;
    if (P.ui.panel === 'aa') {
      const sl = (k, label, min, max) => `<label class="e-sl"><span>${label}</span><output>${Math.round(S[k] * 100)}%</output><input type="range" min="${min}" max="${max}" step="0.05" value="${S[k]}" data-range="${k}"></label>`;
      return `<div class="e-menu e-aa" style="${phone ? 'left:12px;right:12px' : `right:${at.r}px`};top:${at.y + 8}px;${b1(S)}">
        ${views(S)}${phone ? `<p class="e-mk">Translation</p>${transList(S)}` : ''}
        ${sl('fs', 'Text size', 0.8, 1.4)}${sl('lh', 'Line spacing', 0.85, 1.4)}${phone ? '' : sl('cw', 'Column width', 0.75, 1.3)}
        <label class="e-chk"><input type="checkbox" checked> <span>Add the citation when I copy Greek</span></label>
        <p class="e-aa-f"><button type="button" data-noop>Print</button><button type="button" data-act="reset">Reset</button></p>
      </div>`;
    }
    return '';
  };

  // ── Search ───────────────────────────────────────────────────────────────
  // Hits come grouped by work, and each group sits under a band of its
  // work's colour, so the colour tells you where a hit is from.
  E.search = (S) => {
    const R = U.search;
    const en = R.groups.find((g) => g.work === 'EN');
    const book1 = en.books.find((b) => b.book === 1);
    return `<div class="e-page e-srch">${nav('search')}
      <section class="e-sq">
        <div class="e-sq-f"><input value="${esc(R.q)}" lang="grc" aria-label="Search" data-search><button type="button" class="e-btn ink" data-go="search">Search</button></div>
        <p class="e-sq-o"><span class="e-seg" role="group" aria-label="Language"><button type="button" aria-pressed="true">Greek</button><button type="button" aria-pressed="false">English</button><button type="button" aria-pressed="false">Both</button></span><span>Any form · accents ignored · all works</span><a href="#" data-noop>More options</a><a href="#" data-noop>How search works</a></p>
      </section>
      <section class="e-sr">
        <p class="e-sr-t"><b>${fmt(R.count)}</b> places in ${R.works.length} works for <span lang="grc">${esc(R.head)}</span>, ${esc(R.gloss)}. <a href="#" data-go="lexicon:arete">Lexicon</a> <a href="#" data-noop>Export as CSV</a></p>
        <ul class="e-sr-w" aria-label="Works with hits, in the order of the shelf">${shelfOrder(R.works).map((x) => `<li><a href="#" data-noop class="${x.work === 'EN' ? 'on' : ''}" style="${wv(x.work, S)}"${x.work === 'EN' ? ' aria-current="true"' : ''}><span>${esc(x.title)}</span><b>${x.count}</b></a></li>`).join('')}</ul>
        <section class="e-sg" style="${wv('EN', S)}"><h2 class="e-sg-h"><span>Nicomachean Ethics</span><small>${en.count} places · Book I shown</small></h2>
          ${book1.chapters.map((c) => `<div class="e-sch"><h3><b>${esc(c.chapter)}</b> ${esc(U.TITLES[c.chapter] || '')}</h3>
            ${(() => { let last = ''; return c.hits.map((h) => { const win = U.hitWindow(h.cite, h.form); const e = U.engAt(h.cite, 'ross'); const same = e === last; last = e; return `<div class="e-hit"><a href="#" class="e-hr" data-go="reader:${h.cite}">${h.cite}</a><div class="e-hg" lang="grc">${win ? win.filter((l) => l.here).map((l) => l.html).join(' ') : esc(h.form)}</div>${same ? '' : `<p class="e-he">${esc(e)} <span>Ross</span></p>`}</div>`; }).join(''); })()}</div>`).join('')}
        </section>
        ${R.groups.filter((g) => g.work !== 'EN').slice(0, 6).map((g) => `<section class="e-sg closed" style="${wv(g.work, S)}"><h2 class="e-sg-h"><span>${esc(g.title)}</span><small>${g.count} place${g.count === 1 ? '' : 's'}</small></h2></section>`).join('')}
      </section>
      ${foot()}</div>`;
  };

  // ── Lexicon ──────────────────────────────────────────────────────────────
  // The word large, as the lexicon prints it. Under it, the works it appears
  // in, each in its own colour, in the order of the shelf.
  E.lexicon = (S) => {
    const L = U.lemmaPage(S.lex) || U.lemmaPage('arete');
    const dz = L.distinctiveness;
    const byWork = shelfOrder(L.byWork);
    return `<div class="e-page e-lex">${nav('lexicon')}
      <section class="e-lx">
        <h1 class="e-wp" data-fit="word" data-title="${esc(L.head)}" data-fmax="280" lang="grc">${esc(L.head)}</h1>
        <p class="e-lx-gl">${esc((L.glosses || []).join('; '))}</p>
        <dl class="e-lx-n">
          <div><dt>in Aristotle</dt><dd>${fmt(L.count)}</dd></div>
          ${dz ? `<div><dt>in authors before him</dt><dd>${fmt(dz.before_aristotle)}</dd></div><div><dt>in his contemporaries</dt><dd>${fmt(dz.contemporary)}</dd></div>` : ''}
          <div><dt>works</dt><dd>${L.byWork.length}</dd></div>
        </dl>
      </section>
      <section class="e-sec"><h2 class="e-h2">On the shelf</h2><p class="e-note">The ${byWork.length} works it appears in, in the order of the corpus, with the number of times in each.</p>
        <ol class="e-bw">${byWork.map((x) => `<li><a class="e-sp" href="#" data-go="work:${x.work}" style="${wv(x.work, S)}"><span class="e-sp-t">${esc(x.title)}</span><b class="e-sp-n">${x.count}</b></a></li>`).join('')}</ol>
      </section>
      <section class="e-sec e-two"><div><h2 class="e-h2">LSJ</h2>${U.t8(L.key)}</div>
        <div><h2 class="e-h2">Key passages</h2><p class="e-p">Bonitz’s <i>Index Aristotelicus</i> sorts the places by sense and marks the ones that decide each meaning. They will appear here once the transcription reaches this word.</p>
        <h2 class="e-h2">Nearby</h2><p class="e-near-w">${U.ALPHA.slice(0, 18).map((x) => `<a href="#" data-noop${x[1] === L.slug ? ' class="on" aria-current="true"' : ''} lang="grc">${esc(x[0])}</a>`).join('')}</p></div></section>
      ${foot()}</div>`;
  };
})();
