/* Direction P · Plato's look. The Aristotle Reader in the Plato Reader's
   current design (plato.johnhboyer.com): Gentium Book Plus for Greek and
   English, Geologica for capitals and controls, spaced capitals on an even
   letter grid for the masthead and for each work's first words, the same
   spacing, rules and components. Where Plato's site breaks a rule John set
   for Aristotle, his rule wins: Greek and English side by side on a phone,
   every chapter on the work page (books folded), each language's own Bekker
   numbers in its own margin, the word's parse in a sidebar, the current page
   marked in the menu, translations listed once. The palette is Aristotle's
   own: green (the default) or red, in style.css. */
(function () {
  'use strict';
  const U = window.U;
  const { esc, fmt, ROMAN } = U;
  const T = (window.T.p = {});
  T.keepPanelOnTrans = true;

  // ── Plato's icons (24-unit strokes at 1.6) ──────────────────────────────
  const sv = (w, body) => `<svg width="${w}" height="${w}" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;
  const ICON = {
    search: sv(18, '<circle cx="11" cy="11" r="6.5"/><path d="M20 20l-4.2-4.2"/>'),
    searchS: sv(16, '<circle cx="11" cy="11" r="6.5"/><path d="M20 20l-4.2-4.2"/>'),
    menu: sv(18, '<path d="M4 7h16M4 12h16M4 17h16"/>'),
    moon: `<span class="p-moon">${sv(17, '<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>')}</span>`,
    sun: `<span class="p-sun">${sv(17, '<circle cx="12" cy="12" r="4.2"/><path d="M12 2.5v2.2M12 19.3v2.2M4.4 4.4l1.6 1.6M18 18l1.6 1.6M2.5 12h2.2M19.3 12h2.2M4.4 19.6l1.6-1.6M18 6l1.6-1.6"/>')}</span>`,
    book: sv(17, '<path d="M4 5.5A1.5 1.5 0 0 1 5.5 4H20v14H5.5A1.5 1.5 0 0 0 4 19.5z"/><path d="M4 19.5A1.5 1.5 0 0 0 5.5 21H20"/>'),
    sliders: sv(18, '<path d="M4 7h10M18 7h2M4 17h4M12 17h8"/><circle cx="16" cy="7" r="2"/><circle cx="10" cy="17" r="2"/>'),
    print: sv(17, '<path d="M7 9V3h10v6"/><rect x="4" y="9" width="16" height="8"/><path d="M7 14h10v7H7z"/>'),
    close: sv(16, '<path d="M6 6l12 12M18 6L6 18"/>'),
    caret: '<svg class="p-caret" width="8" height="5" viewBox="0 0 10 6" aria-hidden="true" fill="currentColor"><path d="M0 0l5 6 5-6z"/></svg>',
  };
  const theme = () => `${ICON.moon}${ICON.sun}`;
  // Greek numerals, as Plato numbers his groups and books: Α Β Γ … Ϛ.
  const GN = ['', 'Α', 'Β', 'Γ', 'Δ', 'Ε', 'Ϛ', 'Ζ', 'Η', 'Θ', 'Ι', 'ΙΑ', 'ΙΒ', 'ΙΓ', 'ΙΔ'];
  // Bekker numbers keep their small column letter inside capitals (1094a1,
  // not 1094A1); Plato's Stephanus letters go up with the rest.
  const bk = (s) => `<span class="p-lc">${esc(s)}</span>`;

  // ── The first words of every work ──────────────────────────────────────
  // From the repository's Greek TEI files (sources.md lists each file and
  // line). 's' marks Greek taken from the site's own text where the TEI's
  // older edition opens differently; 't' a title shown because the work's
  // Greek is not in sources/.
  const OPEN = {
    Cat: ['Ὁμώνυμα λέγεται ὧν ὄνομα μόνον κοινόν, ὁ δὲ κατὰ τοὔνομα λόγος τῆς οὐσίας ἕτερος', '1a1', 's'],
    Int: ['Πρῶτον δεῖ θέσθαι τί ὄνομα καὶ τί ῥῆμα, ἔπειτα τί ἐστιν ἀπόφασις καὶ κατάφασις', '16a1', 's'],
    APr: ['ΠΡΩΤΟΝ εἰπεῖν περὶ τί καὶ τίνος ἐστὶν ἡ σκέψις, ὅτι περὶ ἀπόδειξιν', '24a10'],
    APo: ['ΠΑΣΑ διδασκαλία καὶ πᾶσα μάθησις διανοητικὴ ἐκ προϋπαρχούσης γίνεται', '71a1'],
    Top: ['Ἡ ΜΕΝ πρόθεσις τῆς πραγματείας μέθοδον εὑρεῖν, ἀφ᾿ ἧς δυνησόμεθα συλλογίζεσθαι', '100a18'],
    SE: ['ΠΕΡΙ δὲ τῶν σοφιστικῶν ἐλέγχων καὶ τῶν φαινομένων μὲν ἐλέγχων ὄντων', '164a20'],
    Isa: ['Ὄντος ἀναγκαίου, Χρυσαόριε, καὶ εἰς τὴν τῶν παρὰ Ἀριστοτέλει κατηγοριῶν', '1.3', 's'],
    Phys: ['Ἐπειδὴ τὸ εἰδέναι καὶ τὸ ἐπίστασθαι συμβαίνει περὶ πάσας τὰς μεθόδους,', '184a10'],
    Cael: ['Ἡ περὶ φύσεως ἐπιστήμη σχεδὸν ἡ πλείστη φαίνεται περί τε σώματα καὶ', '268a1'],
    GC: ['Περὶ δὲ γενέσεως καὶ φθορᾶς τῶν φύσει γινομένων καὶ φθειρομένων,', '314a1'],
    Mete: ['ΠΕΡΙ μὲν οὖν τῶν πρώτων αἰτίων τῆς φύσεως καὶ περὶ πάσης κινήσεως', '338a20'],
    DA: ['ΤΩΝ καλῶν καὶ τιμίων τὴν εἴδησιν ὑπολαμβάνοντες, μᾶλλον δ’ ἑτέραν', '402a1'],
    Sens: ['ἘΠΕΙ δὲ περὶ ψυχῆς καθ’ αὑτὴν διώρισται καὶ περὶ τῶν δυνάμεων ἑκάστης', '436a1'],
    Mem: ['Περὶ μνήμης καὶ τοῦ μνημονεύειν λεκτέον τί ἐστι καὶ διὰ τίν’ αἰτίαν', '449b4', 's'],
    Somn: ['Περὶ δὲ ὕπνου καὶ ἐγρηγόρσεως σκεπτέον, τίνα τε τυγχάνει ὄντα, καὶ', '453b11'],
    Insomn: ['Μετὰ δὲ ταῦτα περὶ ἐνυπνίου ἐπιζητητέον, καὶ πρῶτον τίνι τῶν τῆς ψυχῆς', '458a33', 's'],
    DivSomn: ['Περὶ δὲ τῆς μαντικῆς τῆς ἐν τοῖς ὕπνοις γινομένης καὶ λεγομένης συμβαίνειν', '462b12'],
    Long: ['Περὶ δὲ τοῦ τὰ μὲν εἶναι μακρόβια τῶν ζῴων τὰ δὲ βραχύβια, καὶ περὶ ζωῆς', '464b19'],
    Juv: ['Περὶ δὲ νεότητος καὶ γήρως καὶ περὶ ζωῆς καὶ θανάτου λεκτέον νῦν· ἅμα', '467b10'],
    HA: ['ΤΩΝ ἐν τοῖς ζῴοις μορίων τὰ μέν ἐστιν ἀσύνθετα, ὅσα διαιρεῖται εἰς', '486a5'],
    PA: ['Περὶ πᾶσαν θεωρίαν τε καὶ μέθοδον, ὁμοίως ταπεινοτέραν τε καὶ τιμιωτέραν,', '639a1'],
    MA: ['Περὶ δὲ κινήσεως τῆς τῶν ζῴων, ὅσα μὲν αὐτῶν περὶ ἕκαστον ὑπάρχει γένος,', '698a1'],
    IA: ['Περὶ δὲ τῶν χρησίμων μορίων τοῖς ζῴοις πρὸς τὴν κίνησιν τὴν κατὰ τόπον', '704a4'],
    GA: ['Ἐπεὶ δὲ περὶ τῶν ἄλλων μορίων εἴρηται τῶν ἐν τοῖς ζῴοις καὶ κοινῇ καὶ', '715a1'],
    Meta: ['πάντες ἄνθρωποι τοῦ εἰδέναι ὀρέγονται φύσει. σημεῖον δ’ ἡ τῶν αἰσθήσεων', '980a21'],
    EN: ['πᾶσα τέχνη καὶ πᾶσα μέθοδος, ὁμοίως δὲ πρᾶξίς τε καὶ προαίρεσις, ἀγαθοῦ', '1094a1'],
    EE: ['ὁ μὲν ἐν Δήλῳ παρὰ τῷ θεῷ τὴν αὑτοῦ γνώμην ἀποφηνάμενος συνέγραψεν', '1214a1'],
    Pol: ['ἐπειδὴ πᾶσαν πόλιν ὁρῶμεν κοινωνίαν τινὰ οὖσαν καὶ πᾶσαν κοινωνίαν', '1252a1'],
    Rhet: ['ἡ ῥητορική ἐστιν ἀντίστροφος τῇ διαλεκτικῇ· ἀμφότεραι γὰρ περὶ τοιούτων', '1354a1'],
    Poet: ['περὶ ποιητικῆς αὐτῆς τε καὶ τῶν εἰδῶν αὐτῆς, ἥν τινα δύναμιν ἕκαστον', '1447a8'],
    DM: ['ΠΟΛΛΑΚΙΣ μὲν ἔμοιγε θεῖόν τι καὶ δαιμόνιον ὄντως χρῆμα ὦ Ἀλέξανδρε', '391a1'],
    MXG: ['Ἀίδιον εἶναί φησιν εἴ τί ἐστιν, εἴπερ μὴ ἐνδέχεται γενέσθαι μηδὲν', '974a1'],
    Mech: ['ΘΑΥΜΑΖΕΤΑΙ τῶν μὲν κατὰ φύσιν συμβαινόντων, ὅσων ἀγνοεῖται τὸ αἴτιον,', '847a11'],
    Col: ['ΑΠΛΑ τῶν χρωμάτων ἐστὶν ὅσα τοῖς στοιχείοις συνακολουθεῖ, οἷον πυρὶ', '791a1'],
    Aud: ['Τὰς δὲ φωνὰς ἁπάσας συμβαίνει γίγνεσθαι καὶ τοὺς ψόφους ἢ τῶν σωμάτων', '800a1'],
    Phgn: ['Ὅτι αἱ διάνοιαι ἕπονται τοῖς σώμασι, καὶ οὐκ εἰσὶν αὐταὶ καθ’ ἑαυτὰς', '805a1'],
    Mirab: ['Ἐν τῇ Παιονίᾳ φασὶν ἐν τῷ ὄρει τῷ Ἠσαίνῳ καλουμένῳ, ὃ τὴν Παιονικὴν', '830a5'],
    Lin: ['ἎΡΑ γ’ εἰσὶν ἄτομοι γραμμαί, καὶ ὅλως ἐν ἅπασι τοῖς ποσοῖς ἐστί τι ἀμερές,', '968a1'],
    Vent: ['ΒΟΡΡΑΣ. Οὗτος ἐν μὲν Μαλλῷ Παγρεύς· πνεῖ γὰρ ἀπὸ κρημνῶν μεγάλων καὶ', '973a1'],
    VV: ['ἐπαινετὰ μέν ἐστι τὰ καλά, ψεκτὰ δὲ τὰ αἰσχρά. καὶ τῶν μὲν καλῶν ἡγοῦνται', '1249a26'],
    Oec: ['ἡ οἰκονομικὴ καὶ πολιτικὴ διαφέρει οὐ μόνον τοσοῦτον ὅσον οἰκία', '1343a1'],
  };
  T.OPEN = OPEN;

  // Inscription capitals: no accents, breathings or iota subscripts, final
  // sigma as Σ, no punctuation or spaces. Plato's site writes the iota beside
  // the vowel (ΤΗΙ ΗΜΕΡΑΙ), as Attic stones do; the brief drops it, and
  // ADSCRIPT = true would follow Plato.
  const ADSCRIPT = true;
  const inscr = (s) => {
    let out = '';
    for (const ch of String(s).normalize('NFD')) {
      if (ch === 'ͅ') { if (ADSCRIPT) out += 'Ι'; continue; }
      if (/\p{M}/u.test(ch)) continue;
      const u = ch === 'ς' ? 'Σ' : ch.toUpperCase();
      if (u >= 'Α' && u <= 'Ω') out += u;
    }
    return out;
  };
  T.inscr = inscr;
  // A title in spaced capitals keeps its word spaces; its elision mark is a
  // plain apostrophe, which the capitals' face has.
  const capsTitle = (s) => U.caps(s).replace(/[᾽᾿’']/g, '’');

  // ── The letter grid ─────────────────────────────────────────────────────
  // Every letter in its own cell of an even grid, as on a stoichedon stone.
  // `rows` are arrays of [letters, class]; each row starts on a new line.
  const grid = (rows, cols, cls = '') => {
    let cells = '';
    rows.forEach((row, r) => {
      let c = 1;
      for (const [w, k] of row) for (const ch of w) { cells += `<span${k ? ` class="${k}"` : ''} style="grid-area:${r + 1}/${c}">${ch}</span>`; c++; }
    });
    return `<div class="p-stoi ${cls}" style="--cols:${cols}" aria-hidden="true">${cells}</div>`;
  };
  // The masthead: three rows of eleven, whole words, so the grid is a full
  // rectangle as Plato's is (John: "Maybe something else so we don't have
  // uneven rows?"). ΑΡΙΣΤΟΤΕΛΗΣ ΣΤΑΓΕΙΡΙΤΗΣ, Aristotle the Stagirite, and
  // ΤΑ ΣΩΙΖΟΜΕΝΑ, the surviving works, with the iota written beside its
  // vowel as on the work pages' blocks; the article in grey, as Plato's ΤΑ.
  const masthead = () => grid([[['ΑΡΙΣΤΟΤΕΛΗΣ', 'acc']], [['ΣΤΑΓΕΙΡΙΤΗΣ', '']], [['ΤΑ', 'mut'], ['ΣΩΙΖΟΜΕΝΑ', '']]], 11, 'p-mast');

  // A work's first words: twelve letters a row, four rows, cut where the
  // forty-eighth letter falls (as Plato's are), the last rows fading.
  const COLS = 12;
  const ROWS = 4;
  const opening = (w) => {
    const o = OPEN[w.id] || [w.greekTitle, '', 't'];
    const title = o[2] === 't';
    let rows;
    if (title) {
      // A title: one word a row, so it reads as a heading and does not fade.
      rows = String(o[0]).split(/\s+/).map((x) => [[inscr(x), '']]);
    } else {
      const L = inscr(o[0]).slice(0, COLS * ROWS);
      rows = [];
      for (let i = 0; i < L.length; i += COLS) rows.push([[L.slice(i, i + COLS), '']]);
    }
    const cite = w.id === 'Isa' ? `${esc(w.abbr)} ${esc(o[1])}` : `${esc(w.abbr)} ${bk(o[1])}`;
    return `<div class="p-inscr">
        ${grid(rows, COLS, title ? 'p-stoi-t' : 'p-fade')}
        <p class="p-ref">${cite}</p>
        ${title ? `<p class="p-ref-note">The title stands in here: this mockup has no Greek for the work’s first words.</p>` : `<p class="sr" lang="grc">${esc(o[0])} …</p>`}
      </div>`;
  };

  // ── Site chrome ─────────────────────────────────────────────────────────
  const LINKS = [['home', 'Works'], ['search', 'Search'], ['lexicon', 'Lexicon'], ['phrases', 'Phrases'], ['support', 'Support']];
  const link = (k, l, on, inner) => `<a href="#" ${k === 'phrases' || k === 'support' ? 'data-noop' : `data-go="${k}"`}${on === k ? ' aria-current="page"' : ''}>${inner ? `<span>${l}</span>` : l}</a>`;
  const nav = (on) => `<header class="p-nav">
      <a class="p-brand" href="#" data-go="home"><span lang="grc">ΑΡΙΣΤΟΤΕΛΗΣ</span><span class="p-brand-en"> · Aristotle Reader</span></a>
      <nav class="p-links" aria-label="Site">${LINKS.map(([k, l]) => link(k, l, on)).join('')}</nav>
      <a class="p-ib p-only-s" href="#" data-go="search" aria-label="Search">${ICON.search}</a>
      <details class="p-menu p-only-s"><summary aria-label="Menu">${ICON.menu}</summary><nav class="p-menu-panel" aria-label="Site">${LINKS.map(([k, l]) => link(k, l, on, true)).join('')}</nav></details>
      <button type="button" class="p-ib p-theme" data-act="theme" aria-label="Night or day">${theme()}</button>
    </header>`;
  const foot = () => `<footer class="p-foot">
      <div class="p-foot-sis"><a href="#" data-noop>Also: The Plato Reader ↗</a><a href="#" data-noop>The Homer Reader ↗</a><a href="#" data-noop>The Greek Drama Reader ↗</a></div>
      <a href="#" data-noop>Texts &amp; Licences</a><a href="#" data-noop>Support</a><a href="#" data-noop>Request a feature · Report an error</a><a class="p-foot-by" href="#" data-noop>Site by John H. Boyer</a>
    </footer>`;

  // ── Home ────────────────────────────────────────────────────────────────
  const range = (w) => (w.id === 'Isa' ? 'Busse 1–22' : U.spanText(w, true));
  const nm = (w, tag) => `<li><a class="p-nm" href="#" data-go="work:${w.id}"><span class="p-nm-gr" lang="grc">${esc(capsTitle(w.greekTitle))}</span><span class="p-nm-en">${esc(w.title)}</span><span class="p-nm-pp">${bk(range(w))}${tag ? `<span class="p-nm-tag">${tag}</span>` : ''}</span></a></li>`;
  // Porphyry's Isagoge is not in the divisions: it closes the logic.
  const cat = (d, i) => `<section class="p-cat">
      <h3 class="p-cat-head"><span class="p-cat-num">${GN[i + 1]}</span>${esc(d.title)}</h3>
      <div class="p-cat-body">${d.groups.map((g) => `${g.label ? `<p class="p-sub">${esc(g.label)}</p>` : ''}<ul class="p-names">${g.works.map((w) => nm(w)).join('')}${i === 0 ? nm(U.work('Isa'), 'Porphyry') : ''}</ul>`).join('')}</div>
    </section>`;

  T.home = () => `<div class="p-page">${nav('home')}
    <main class="p-corpus">
      <section class="p-hero">
        <div class="p-hero-grid">${masthead()}</div>
        <div class="p-hero-text">
          <h1>The Complete Works of Aristotle in Greek and English</h1>
          <p class="p-lead">Parallel Greek-English editions of Aristotle. <span class="p-say-click">Click</span><span class="p-say-tap">Tap</span> any Greek word to parse it and see its definition. Search the corpus in Greek and English.</p>
          <div class="p-hsearch" role="search">${ICON.search}<input data-search placeholder="φύσις, justice, ἀρετή …" aria-label="Search the corpus, in Greek or English" autocomplete="off" spellcheck="false"><button type="button" data-go="search">Search</button></div>
          <p class="p-resume">Continue reading <a href="#" data-go="reader:${U.RESUME.cite}"><i>Nicomachean Ethics</i>, Book I, chapter 7</a></p>
        </div>
      </section>
      <nav class="p-begin" aria-label="Begin with"><span class="p-begin-l">Begin with</span>${U.START.map((id) => `<a href="#" data-go="work:${id}">${esc(U.work(id).title)}</a>`).join('')}</nav>
      <section class="p-register"><h2 class="sr">All works, by division</h2>
        ${U.divisions().map(cat).join('')}
      </section>
    </main>${foot()}</div>`;

  // ── A work ──────────────────────────────────────────────────────────────
  const divOf = (id) => {
    const ds = U.divisions();
    if (id === 'Isa') return { i: 0, d: ds[0] };
    const i = ds.findIndex((d) => d.groups.some((g) => g.works.some((x) => x.id === id)));
    return { i, d: ds[i] };
  };
  const bookNum = (b) => (/[α-ωΑ-Ω]/.test(b.label) ? b.label : GN[b.n] || String(b.n));
  const busse = (s) => String(s).replace(/(\d+)a(\d+)/g, '$1.$2');
  const span2 = (w, s) => (w.id === 'Isa' ? busse(s) : s);
  // Books fold, closed at first; each opens on its chapters. A one-book work
  // shows its chapters at once. Chapter titles where the site has them (the
  // Ethics, Ostwald's); otherwise the number and its Bekker lines.
  const books = (w) => {
    const bs = U.workBooks(w.id);
    const en = w.id === 'EN';
    const titled = bs.some((b) => b.chapters.some((c) => c.title));
    const row = (b, c) => `<li><a href="#" data-go="${en && b.n === 1 ? `reader:${c.bekker.split('–')[0]}` : 'reader'}"><span class="p-chn">${esc(c.ch)}</span>${titled ? `<span class="p-cht">${esc(c.title || `Chapter ${c.ch}`)}</span>` : ''}<span class="p-chb">${bk(span2(w, c.bekker))}</span></a></li>`;
    const list = (b) => `<ol class="p-chs${titled ? ' titled' : ''}">${b.chapters.map((c) => row(b, c)).join('')}</ol>`;
    if (bs.length < 2) return bs[0] ? list(bs[0]) : '';
    const span = (b) => { const s = U.bookSpan(w, b.n); return s ? `${s[0]}–${s[1]}` : ''; };
    return `<p class="p-bkall"><button type="button" data-act="books:open">Open all books</button><button type="button" data-act="books:close">Close all</button></p>
      <div class="p-bks">${bs.map((b) => `<details class="p-bk" data-book="${b.n}"><summary>
          <span class="p-bk-n" lang="grc" aria-hidden="true">${esc(bookNum(b))}</span>
          <span class="p-bk-r">Book ${ROMAN[b.n] || b.n}<small>${bk(span(b))}</small></span>
          <span class="p-bk-c">${b.chapters.length} chapter${b.chapters.length === 1 ? '' : 's'}</span>
          <span class="p-chev" aria-hidden="true"></span>
        </summary>${list(b)}</details>`).join('')}</div>`;
  };

  T.work = (S) => {
    const w = U.work(S.workId) || U.work('EN');
    const en = w.id === 'EN';
    const { i, d } = divOf(w.id);
    const trs = w.translations.map((t) => ({ ...t, ...U.transParts(t) }));
    const many = U.workBooks(w.id).length > 1;
    const span = U.workSpan(w);
    const fr = U.further(w.id);
    const kinds = { translation: 'Translation', commentary: 'Commentary', collection: 'In print' };
    const isa = U.work('Isa');
    const first = w.defaultTranslation || trs[0].id;
    const extent = U.extent(w).replace(', ', ' · ');
    return `<div class="p-page">${nav('home')}
      <main class="p-lp">
        <section class="p-lp-head">
          ${opening(w)}
          <div class="p-lp-intro">
            <p class="p-eyebrow">${GN[i + 1]} · ${esc(d.title)}${w.id === 'Isa' ? ' · <span class="p-dub">Porphyry</span>' : ''}</p>
            <p class="p-lp-gr" lang="grc" data-fit-gr>${esc(capsTitle(w.greekTitle))}</p>
            <h1 class="p-lp-en">${esc(w.title)}</h1>
            <p class="p-lede">${esc(w.blurb)}</p>
            <dl class="p-facts">
              <dt>Greek</dt><dd>${esc(w.greekSource.full)}</dd>
              ${w.id === 'Isa' ? `<dt>Busse</dt><dd>Pages 1–22 · ${esc(extent)}</dd>` : `<dt>Bekker</dt><dd>${span ? `${bk(span.first)}–${bk(span.last)} · ` : ''}${esc(extent)}</dd>`}
              ${w.authenticity === 'spurious' ? '<dt>Author</dt><dd>Not Aristotle; it came down with his works.</dd>' : ''}
              ${w.id === 'Isa' ? '<dt>Author</dt><dd>Porphyry of Tyre, an introduction to the <i>Categories</i>.</dd>' : ''}
            </dl>
            <div class="p-cta">
              <a class="p-btn pri" href="#" data-go="reader">Start reading</a>
              <a class="p-btn" href="#" data-go="reader:greek">Greek only</a>
              ${trs.length > 1 ? '<a class="p-btn" href="#" data-go="reader:compare">Compare translations</a>' : ''}
            </div>
            ${en ? '' : '<p class="p-lp-note">In this mockup every reader link opens Book I of the <i>Nicomachean Ethics</i>.</p>'}
          </div>
        </section>
        <section class="p-sec"><h2 class="p-h">${many ? 'Books and chapters' : 'Chapters'}</h2>${en ? '<p class="p-sec-note">Chapter titles are Ostwald’s.</p>' : ''}${books(w)}</section>
        <section class="p-sec"><h2 class="p-h">Read this work</h2>
          <ul class="p-ed">${trs.map((t) => `<li><a href="#" data-go="reader:${esc(t.id)}"><span class="p-ed-name">${esc(t.short)}</span><span class="p-ed-kind">Greek &amp; English · ${esc(t.who)} (${esc(t.pub)}${t.year ? `, ${esc(t.year)}` : ''})${trs.length > 1 && first === t.id ? ' · <b>opens first</b>' : ''}</span></a></li>`).join('')}</ul>
        </section>
        ${w.commentaries ? `<section class="p-sec"><h2 class="p-h">Commentary</h2>
          <a class="p-comm" href="#" data-go="work:Isa"><span class="p-comm-t">Porphyry, <i>Isagoge</i> <span lang="grc">${esc(isa.greekTitle)}</span></span><span class="p-comm-b">${esc(isa.blurb)}</span><span class="p-comm-c">Open the Isagoge ›</span></a></section>` : ''}
        ${fr.length ? `<section class="p-sec"><h2 class="p-h">Further reading</h2><ul class="p-read">${fr.map((r) => `<li><span class="p-rk">${esc(kinds[r.kind] || r.kind)}</span>${r.cite}</li>`).join('')}</ul></section>` : ''}
        <section class="p-sec"><h2 class="p-h">Greek text &amp; translations</h2><p class="p-credits">Full source and licence details for the Greek and each translation are on the <a href="#" data-noop>Texts &amp; Licences</a> page.</p></section>
      </main>${foot()}</div>`;
  };

  // The Greek title in spaced capitals, as large as Plato's (58 px; 34 on a
  // phone) when it fits; a long one steps down until it sets in three lines
  // (four on a phone), each word whole.
  const cvs = document.createElement('canvas').getContext('2d');
  let geoIn = false;
  const AVG = 0.7;
  function fitGreekTitle(el, P) {
    const W = el.clientWidth;
    if (!W) return;
    const phone = P.kind === 'phone';
    const max = phone ? 34 : 58;
    const ls = phone ? 0.18 : 0.2;
    const lines = phone ? 4 : 3;
    const words = el.textContent.trim().split(/\s+/);
    const wordW = (s, f) => {
      if (!geoIn) return s.length * f * (AVG + ls);
      cvs.font = `300 ${f}px Geologica`;
      return cvs.measureText(s).width + s.length * f * ls;
    };
    let f = max;
    for (; f > 18; f -= 1) {
      const sp = wordW(' ', f);
      let n = 1;
      let x = 0;
      let ok = true;
      for (const wd of words) {
        const ww = wordW(wd, f);
        if (ww > W) { ok = false; break; }
        if (x && x + sp + ww > W) { n++; x = ww; } else x += (x ? sp : 0) + ww;
      }
      if (ok && n <= lines) break;
    }
    el.style.fontSize = f < max ? `${f}px` : '';
    el.dataset.w = String(W);
  }
  const fitAll = (P) => { for (const el of P.view.querySelectorAll('[data-fit-gr]')) fitGreekTitle(el, P); };
  T.after = (S, P) => fitAll(P);
  document.fonts.load('300 40px Geologica', 'ΑΒΓΔ').catch(() => null).then(() => { geoIn = true; U.shown().forEach(fitAll); });

  // ── The reader ──────────────────────────────────────────────────────────
  // Plato's head bar: small spaced capitals in one row, the reading view on
  // the right. On a phone it keeps its icons and the view moves to Settings.
  T.reader = (S) => `<div class="p-rd" data-body>
      <header class="p-rh" data-sticky>
        <button type="button" class="p-rb p-ib" data-act="panel:toc" aria-label="Contents">${ICON.menu}</button>
        <div class="p-rh-title"><a class="p-rh-home" href="#" data-go="home">Works</a><span class="p-rh-sep" aria-hidden="true">›</span><a class="p-rh-work" href="#" data-go="work:EN"><span class="full">Nicomachean Ethics</span><span class="short">Ethics</span></a></div>
        <button type="button" class="p-rb p-rh-book" data-act="panel:book" data-keep><span class="full">Book I</span><span class="short">I</span>${ICON.caret}</button>
        <button type="button" class="p-rb hide-s" data-act="panel:go" data-keep>Go to</button>
        <button type="button" class="p-rb p-rh-ch" data-act="panel:chap" data-keep><span class="full">Chapter</span><span class="short">Ch.</span> <span data-here-ch>1</span>${ICON.caret}</button>
        <span class="p-msg" data-jump-msg></span>
        <span class="p-sp"></span>
        <div class="p-views hide-s" role="group" aria-label="Reading view">${['greek', 'both', 'english'].map((v) => `<button type="button" class="p-rb" data-act="view:${v}" aria-pressed="${S.view === v}">${v}</button>`).join('')}</div>
        <a class="p-rb" href="#" data-go="search" aria-label="Search"><span class="p-ico-d">${ICON.searchS}</span><span class="p-ico-s">${ICON.search}</span><span class="hide-s">Search</span></a>
        <a class="p-rb" href="#" data-go="lexicon" aria-label="Lexicon"><span class="p-ico-s">${ICON.book}</span><span class="hide-s">Lexicon</span></a>
        <button type="button" class="p-rb" data-act="panel:aa" data-keep aria-label="Settings"><span class="p-ico-s">${ICON.sliders}</span><span class="hide-s">Settings</span></button>
        <button type="button" class="p-rb p-ib hide-s" data-noop aria-label="Print">${ICON.print}</button>
        <button type="button" class="p-rb p-ib p-theme" data-act="theme" aria-label="Night or day">${theme()}</button>
      </header>
      <main class="p-text" data-text></main>
    </div>`;
  T.hp = {};

  const trLong = (t) => `${t.who} (${t.pub}, ${t.year})`;
  // The line above the text: the book and its editions on the left, the
  // translation on the right, as Plato's reader has them.
  const controls = (S, tr) => {
    const t = U.trans(S.trans);
    const c = S.cmp ? U.trans(S.cmp) : null;
    return `<div class="p-rc">
      <p class="p-rc-cite"><span class="p-rc-work"><span class="full">Nicomachean Ethics</span><span class="short">Ethics</span> I</span><span class="p-rc-pair"> · Bywater (OCT, 1894)${S.view === 'greek' ? '' : ` · ${tr.map((x) => `${esc(U.trans(x).short)} (${esc(String(U.trans(x).year).slice(0, 4))})`).join(' · ')}`}</span></p>
      <button type="button" class="p-rc-tr" data-act="panel:picker" data-keep><span class="full">${esc(trLong(t))}${c ? ` and ${esc(c.short)}` : ''}</span><span class="short">${esc(t.short)}${c ? ` · ${esc(c.short)}` : ''}</span>${ICON.caret}</button>
    </div>${c && S.view !== 'greek' ? `<div class="p-colnames" style="--n:${S.view === 'english' ? 2 : 3}">${S.view === 'english' ? '' : '<span>Greek · Bywater</span>'}<span>${esc(t.short)}</span><span>${esc(c.short)}</span></div>` : ''}`;
  };

  T.text = (S) => {
    const tr = U.readerTrans(S);
    const cols = S.view === 'greek' ? ['g'] : S.view === 'english' ? tr : ['g', ...tr];
    let html = controls(S, tr);
    let lastSi = -1;
    for (const b of U.BLOCKS) {
      const segStart = b.si !== lastSi;
      lastSi = b.si;
      if (b.start) {
        html += `<div class="p-chh"><h2 class="p-chh-t"><span class="n">${esc(b.chapter)}</span>${esc(U.TITLES[b.chapter] || `Chapter ${b.chapter}`)}</h2><p class="p-chh-b">Book I, chapter ${esc(b.chapter)} · ${bk(b.bekker)}</p></div>`;
      }
      html += `<div class="p-row" style="--n:${cols.length}">${cols.map((c) => {
        if (c === 'g') {
          return `<div class="p-gc" lang="grc">${b.lines.map((L, i) => {
            const first = segStart && i === 0 && !L.cont;
            const isCol = !L.cont && (first || L.n === 1);
            // A column's label carries its line when a chapter starts inside
            // it (1094a18); a phone shows the column alone.
            const num = L.cont ? '' : isCol ? `${b.col}${L.n === 1 ? '' : `<span class="p-ln-n">${L.n}</span>`}` : U.showNum(L.n) ? String(L.n) : '';
            return `<span class="p-gl${L.cont ? ' cont' : ''}"${L.cont ? '' : ` data-cite="${b.col}${L.n}"`}><span class="p-ln${isCol ? ' col' : ''}">${num}</span>${U.lineHTML(b, L)}</span>`;
          }).join(' ')}</div>`;
        }
        return `<div class="p-ec" data-t="${c}">${U.engHTML(b, c)}</div>`;
      }).join('')}</div>`;
    }
    return html;
  };

  // Plato prints the parse in short capitals (MASC ACC SG); two Morpheus
  // codes read better spelt out. The long form is in the title.
  const shortParse = (t) => String(t || '').replace(/\bindeclform\b/g, 'indeclinable').replace(/\badverbial\b/g, 'adverb');

  // The word: Plato's sidebar on the right, under the head bar; on a phone
  // it comes up from the bottom. LSJ is Grammata's entry, as it is.
  T.side = (S) => {
    if (!S.word) return '';
    const cards = U.cards(S.word.k);
    const blk = U.blockOfCite(S.word.cite);
    return `<aside class="p-side" role="dialog" aria-label="Word: ${esc(S.word.t)}">
      <div class="p-side-h"><p class="p-side-w" lang="grc">${esc(S.word.t)}</p><button type="button" class="p-x" data-act="close:word" aria-label="Close">${ICON.close}</button></div>
      <p class="p-side-loc">Ethics I.${esc(blk ? blk.chapter : '1')} · ${bk(S.word.cite)}</p>
      <div class="p-side-b">
        ${cards.length ? cards.map((c) => `<section class="p-card">
          <p class="p-lem" lang="grc">${esc(c.head)}${c.hom ? ` <small>${esc(c.hom)}</small>` : ''}</p>
          ${c.gloss ? `<p class="p-gls">${esc(c.gloss)}</p>` : ''}
          <dl class="p-prs">${c.rows.map((r) => `<dt title="${esc(U.longParse(r.text))}">${esc(shortParse(r.text))}</dt><dd>${r.dialect ? esc(r.dialect) : ''}</dd>`).join('')}</dl>
          ${c.lsj ? `<button type="button" class="p-lnk" data-act="card:${esc(c.id)}" aria-expanded="${S.card === c.id}"><span class="p-arr" aria-hidden="true">${S.card === c.id ? '▾' : '▸'}</span><span class="p-u">${S.card === c.id ? 'Hide' : 'Show'} LSJ definition</span></button>` : ''}
          ${S.card === c.id ? `<div class="p-entry">${U.t8(c.lsj)}</div>` : ''}
          ${c.ref ? `<a class="p-lnk" href="#" data-go="lexicon:${esc(c.ref.slug)}"><span class="p-u">Appears ${fmt(c.ref.count)}× across Aristotle</span> <span aria-hidden="true">→</span></a>` : ''}
        </section>`).join('') : '<p class="p-none">No analysis for this form.</p>'}
        <p class="p-steps"><button type="button" data-act="step:-1">‹ Previous word</button><button type="button" data-act="step:1">Next word ›</button></p>
      </div>
    </aside>`;
  };

  T.note = (S, P) => {
    if (!P.ui.fn) return '';
    const at = P.ui.fnAt || { x: 600, y: 300 };
    const wpx = P.kind === 'phone' ? 350 : 440;
    const x = Math.max(12, Math.min(at.x - 24, P.W0 - wpx - 12));
    return `<div class="p-note" style="left:${x}px;top:${at.y + 8}px;width:${wpx}px" role="note"><p class="p-note-k">Ostwald’s note ${esc(P.ui.fn.split('.')[1])}</p><p class="p-note-t">${U.footnote(P.ui.fn)}</p><button type="button" class="p-x" data-act="close:fn" aria-label="Close">${ICON.close}</button></div>`;
  };

  // Menus and drawers, in Plato's settings: page ground, a hairline of ink,
  // small capitals for labels, a square accent mark for the chosen item.
  const viewSeg = (S) => `<div class="p-views" role="group" aria-label="Reading view">${['greek', 'both', 'english'].map((v) => `<button type="button" class="p-rb" data-act="view:${v}" aria-pressed="${S.view === v}">${v}</button>`).join('')}</div>`;
  const transRows = (S) => U.EN_TRANS.map((t) => `<button type="button" class="p-mode" data-act="trans:${t.id}" aria-pressed="${S.trans === t.id}"><span class="p-box" aria-hidden="true"></span><span>${esc(t.who)} <small>${esc(t.pub)}, ${esc(t.year)}</small></span></button>`).join('');
  const cmpRow = (S) => `<div class="p-cmps">${U.EN_TRANS.filter((t) => t.id !== S.trans).map((t) => `<button type="button" data-act="cmp:${t.id}" aria-pressed="${S.cmp === t.id}">${esc(t.short)}</button>`).join('')}<button type="button" data-act="cmp:off" aria-pressed="${!S.cmp}">None</button></div>`;
  const slider = (S, k, label, min, max) => `<label class="p-sl"><span class="p-sl-row"><span class="p-sl-n">${label}</span><output>${Math.round(S[k] * 100)}%</output></span><input type="range" min="${min}" max="${max}" step="0.05" value="${S[k]}" data-range="${k}"></label>`;
  const scrim = () => '<div class="p-scrim" data-act="close:panel" aria-hidden="true"></div>';

  T.panel = (S, P) => {
    const at = P.ui.panelAt || { x: 20, y: 60, r: 20 };
    const phone = P.kind === 'phone';
    const left = (w) => Math.max(10, Math.min(at.x, P.W0 - w - 10));
    const now = (ch) => (ch === (P.ui.hereCh || S.hereCh || '1') ? ' class="now" aria-current="true"' : '');
    switch (P.ui.panel) {
      case 'toc': return `${scrim()}<aside class="p-toc" aria-label="Contents">
          <div class="p-toc-h"><a class="p-toc-home" href="#" data-go="home">‹ All works</a><button type="button" class="p-x" data-act="close:panel" aria-label="Close">${ICON.close}</button></div>
          <p class="p-toc-w">Nicomachean Ethics</p>
          <div class="p-toc-go" data-jump-host><label for="p-go-${P.kind}">Go to a Bekker line</label><div class="p-field"><input id="p-go-${P.kind}" data-jump placeholder="1097b22" autocomplete="off" spellcheck="false"><button type="button" data-act="jumpgo">Go</button></div><p class="p-msg2" data-jump-msg></p></div>
          <div class="p-toc-b">${U.bookList().map((b) => `<div class="p-toc-bk${b.b === 1 ? ' open' : ''}"><p class="p-toc-bh">${b.b === 1 ? '<span class="p-tri" aria-hidden="true">▾</span>' : `<a href="#" data-act="msg:book" class="p-tri" aria-hidden="true">▸</a>`}<span class="p-toc-bl">Book ${ROMAN[b.b]}</span><span class="p-toc-bc">${b.n} ch.</span></p>
            ${b.b === 1 ? `<ol class="p-toc-c">${U.chapterList().map((c) => `<li><a href="#" data-act="ch:${c.ch}" data-ch-link="${c.ch}"${now(c.ch)}><span class="p-toc-n">${c.ch}</span><span class="p-toc-cb"><span class="p-toc-ct">${esc(c.title)}</span><span class="p-toc-cc">${bk(c.bekker)}</span></span></a></li>`).join('')}</ol>` : ''}</div>`).join('')}</div>
          <div class="p-toc-f"><a href="#" data-noop>Texts &amp; Licences</a></div>
        </aside>`;
      case 'book': return `<div class="p-menu-p" style="left:${left(304)}px;top:${at.y + 9}px;width:304px"><ul class="p-bm">${U.bookList().map((b) => `<li><a href="#" ${b.b === 1 ? 'data-act="ch:1" aria-current="true"' : 'data-act="msg:book"'}><span class="p-bm-n" lang="grc">${GN[b.b]}</span><span class="p-bm-name">Book ${ROMAN[b.b]}</span><span class="p-bm-s">${bk(b.first)}</span></a></li>`).join('')}</ul></div>`;
      case 'chap': return `<div class="p-menu-p" style="left:${left(phone ? 370 : 460)}px;top:${at.y + 9}px;width:${phone ? 370 : 460}px"><ul class="p-bm p-cm">${U.chapterList().map((c) => `<li><a href="#" data-act="ch:${c.ch}" data-ch-link="${c.ch}"${now(c.ch)}><span class="p-bm-n">${c.ch}</span><span class="p-bm-name">${esc(c.title)}</span><span class="p-bm-s">${bk(c.bekker.split('–')[0])}</span></a></li>`).join('')}</ul></div>`;
      case 'go': return `<div class="p-menu-p p-gop" style="left:${left(320)}px;top:${at.y + 9}px;width:320px" data-jump-host><label class="p-lab" for="p-go2-${P.kind}">Go to a Bekker line</label><div class="p-field"><input id="p-go2-${P.kind}" data-jump placeholder="1097b22" autocomplete="off" spellcheck="false"><button type="button" data-act="jumpgo">Go</button></div><p class="p-hint">Book I runs from <span class="p-lc">1094a1</span> to <span class="p-lc">1103a10</span>.</p><p class="p-msg2" data-jump-msg></p></div>`;
      case 'picker': {
        const w = phone ? 350 : 380;
        const x = Math.max(10, P.W0 - at.r - w);
        return `<div class="p-menu-p p-pk" style="left:${x}px;top:${at.y + 9}px;width:${w}px">
          <p class="p-lab">Translation</p>${transRows(S)}
          <p class="p-lab">Beside it</p>${cmpRow(S)}
          <p class="p-hint">Each translation keeps its own Bekker numbers in its margin.</p></div>`;
      }
      case 'aa': return `${scrim()}<aside class="p-set" aria-label="Settings">
          <div class="p-set-h"><span>Settings</span><button type="button" class="p-x" data-act="close:panel" aria-label="Close">${ICON.close}</button></div>
          <div class="p-set-b">
            ${phone ? `<section class="p-set-s"><p class="p-lab">Reading view</p>${viewSeg(S)}</section>
            <section class="p-set-s"><p class="p-lab">Translation</p>${transRows(S)}<p class="p-lab p-lab2">Beside it</p>${cmpRow(S)}</section>` : ''}
            <section class="p-set-s"><p class="p-lab">Text</p>${slider(S, 'fs', 'Text size', 0.8, 1.4)}${slider(S, 'lh', 'Line spacing', 0.85, 1.4)}${phone ? '' : slider(S, 'cw', 'Column width', 0.75, 1.3)}</section>
            <section class="p-set-s"><p class="p-lab">Copying</p><label class="p-chk"><span><span class="p-chk-n">Add the citation when I copy Greek</span><span class="p-chk-h">Pastes as “EN 1097b22”.</span></span><span class="p-pill"><input type="checkbox" checked><span class="p-pill-t"></span><span class="p-pill-k"></span></span></label></section>
            <section class="p-set-s"><button type="button" class="p-reset" data-act="reset">Reset</button> <button type="button" class="p-reset" data-noop>Print</button></section>
          </div>
        </aside>`;
      default: return '';
    }
  };

  // ── Search ──────────────────────────────────────────────────────────────
  // A hit's Greek: the line with the word and the line on its side of it.
  const snippet = (h) => {
    const win = U.hitWindow(h.cite, h.form);
    if (!win) return esc(h.form);
    const at = win.findIndex((l) => l.here);
    const pos = win[at].html.indexOf('tok hit');
    const pick = pos > win[at].html.length / 2 ? win.slice(Math.max(0, at - 1), at + 1) : win.slice(at, at + 2);
    return `… ${pick.map((l) => l.html).join(' ')} …`;
  };
  // Two hits of one word in one line are one row (the window marks both).
  const rows = (hits) => {
    const out = [];
    for (const h of hits) {
      const last = out[out.length - 1];
      if (last && last.cite === h.cite && U.fold(last.form) === U.fold(h.form)) last.n++;
      else out.push({ ...h, n: 1 });
    }
    return out;
  };
  T.search = () => {
    const R = U.search;
    const en = R.groups.find((g) => g.work === 'EN');
    const b1 = en.books.find((b) => b.book === 1);
    const pages = Math.ceil(R.count / 36);
    const pager = (cls = '') => `<nav class="p-pager ${cls}" aria-label="Result pages"><button type="button" disabled>‹ Prev</button><span>Page 1 of ${pages}</span><button type="button" data-noop>Next ›</button></nav>`;
    return `<div class="p-page">${nav('search')}
      <main class="p-wrap p-sx">
        <div class="p-sq">
          <div class="p-sq-row">${ICON.search}<input class="p-sq-in" value="${esc(R.q)}" lang="grc" aria-label="Search" data-search autocomplete="off" spellcheck="false"></div>
          <div class="p-lang" role="group" aria-label="Search in"><button type="button" aria-pressed="true">Greek</button><button type="button" aria-pressed="false">English</button><button type="button" aria-pressed="false">Both</button><button type="button" class="p-tog" aria-pressed="false"><span lang="grc">β</span> Beta Code</button></div>
        </div>
        <div class="p-sopt">
          <span class="p-opt">Match <b>all words</b>${ICON.caret}</span><span class="p-opt">Form <b>any form</b>${ICON.caret}</span><span class="p-opt">Accents <b>ignored</b>${ICON.caret}</span><span class="p-opt">In <b>all works</b>${ICON.caret}</span>
          <button type="button" class="p-adv" data-noop>Advanced ▾</button><button type="button" class="p-sbtn" data-go="search">Search</button>
        </div>
        <p class="p-hint2">* any letters, inside or at the end of a word · ? one letter · Greek or <a href="#" data-noop>Beta Code</a> (<i>a)reth/</i> = ἀρετή) · <a href="#" data-noop class="p-quiet">How search works</a></p>
        <div class="p-rbar"><p class="p-rcount">${fmt(R.count)} instances · page 1 of ${pages}</p><button type="button" class="p-export" data-noop>Export results as CSV</button></div>
        <div class="p-sr-body">
        <nav class="p-sr-w" aria-label="Works with hits"><p class="p-k">Works</p>${R.works.map((x, i) => `<a href="#" data-noop class="${i === 0 ? 'on' : ''}"${i === 0 ? ' aria-current="true"' : ''}><span>${esc(x.title)}</span><small>${x.count}</small></a>`).join('')}</nav>
        <div class="p-sr-main">
        ${pager()}
        <section class="p-bsec">
          <h2 class="p-bhead"><span class="p-wname">Nicomachean Ethics</span><span class="p-bname">Book I</span></h2>
          ${b1.chapters.map((c) => `<div class="p-cg">
            <p class="p-gh"><span class="p-tri" aria-hidden="true">▾</span><span class="p-gl2">Chapter ${esc(c.chapter)}</span><span class="p-gt">${esc(U.TITLES[c.chapter] || '')}</span><span class="p-gb">${bk(c.bekker)}</span><span class="p-gc2">${c.hits.length} instance${c.hits.length === 1 ? '' : 's'}</span></p>
            <ul class="p-il">${rows(c.hits).map((h) => `<li class="p-inst"><a class="p-iref" href="#" data-go="reader:${h.cite}">${bk(h.cite)}${h.n > 1 ? `<small>×${h.n}</small>` : ''}</a><span class="p-snip" lang="grc">${snippet(h)}</span></li>`).join('')}</ul>
          </div>`).join('')}
        </section>
        ${pager('p-pager-b')}
        </div></div>
      </main>${foot()}</div>`;
  };

  // ── Lexicon ─────────────────────────────────────────────────────────────
  // Plato's entry page: the headword as an inscription beside it as printed,
  // then the dictionary, the word elsewhere in Greek and every place in
  // Aristotle by work and book. Plato's right column lists the works again
  // with their counts; here it lists the words beside this one instead, so
  // no list appears twice.
  T.lexicon = (S) => {
    const L = U.lemmaPage(S.lex) || U.lemmaPage('arete');
    const dz = L.distinctiveness;
    const head = inscr(L.head);
    const at = U.ALPHA.findIndex((x) => x[1] === L.slug);
    const near = at >= 0;
    // A capital converted from Beta Code comes with its breathing in front
    // of the letter (̓Αρχύτης); set it on the letter (Ἀρχύτης).
    const head0 = (g) => String(g).normalize('NFD').replace(/^([\u0300-\u036f]+)(\p{L})/u, '$2$1').normalize('NFC');
    const side = (near ? U.ALPHA.slice(Math.max(0, at - 8), at + 9) : (U.TOP || []).slice(0, 16)).map((x) => [head0(x[0]), x[1], x[2]]);
    // A place in Book I of the Ethics opens the reader there; any other
    // opens its work's page, since the mockup carries that book only.
    const cite = (w, b, c) => (w === 'EN' && b === 1 ? `data-go="reader:${c[0]}${c[1]}"` : `data-go="work:${w}"`);
    return `<div class="p-page">${nav('lexicon')}
      <main>
        <div class="p-xp-head">
          <div class="p-xp-word" style="--n:${head.length}">${grid([[[head, 'acc']]], head.length)}</div>
          <div class="p-xp-text">
            <p class="p-xp-label"><a href="#" data-noop>Lexicon</a> › ${esc(head[0])}</p>
            <h1 class="p-lm-hw" lang="grc">${esc(L.head)}</h1>
            <p class="p-lm-gl">${esc((L.glosses || []).join('; '))}</p>
            <p class="p-lm-facts"><span><b>${fmt(L.count)}</b> times</span><span>in <b>${L.byWork.length}</b> works</span></p>
          </div>
        </div>
        <div class="p-xp-body p-lm-grid">
          <div class="p-lm-main">
            <h2 class="p-xp-h2"><span class="n" aria-hidden="true">Α</span>Dictionary entry<span class="tag">LSJ</span></h2>
            <div class="p-lsj">${U.t8(L.key)}</div>
            ${dz ? `<h2 class="p-xp-h2"><span class="n" aria-hidden="true">Β</span>Elsewhere in Greek</h2>
            <dl class="p-dz"><div><dt>Authors before him</dt><dd>${fmt(dz.before_aristotle)}</dd></div><div><dt>His contemporaries</dt><dd>${fmt(dz.contemporary)}</dd></div><div><dt>His school</dt><dd>${fmt(dz.school)}</dd></div><div><dt>Fragments</dt><dd>${fmt(dz.fragments)}</dd></div></dl>` : ''}
            <h2 class="p-xp-h2"><span class="n" aria-hidden="true">${dz ? 'Γ' : 'Β'}</span>Every occurrence</h2>
            <p class="p-xp-note">Open a work to list every occurrence by book and chapter; each links into the reader.</p>
            <ul class="p-occ">${L.instancesByWork.map((g) => `<li><details class="p-occ-w"><summary><span class="p-occ-t">${esc(g.title)}</span><span class="p-occ-n">${g.count}</span>${ICON.caret}</summary>
              <div class="p-occ-b"><a class="p-occ-open" href="#" data-go="work:${g.work}">Open ${esc(g.title)} ›</a>
              ${g.books.map((b) => { const n = b.chapters.reduce((k, c) => k + c.instances.length, 0); return `<details class="p-occ-bk"><summary><span>Book ${ROMAN[b.book] || b.book}</span><span class="p-occ-n">${n}</span></summary><ul class="p-cites">${b.chapters.map((c) => c.instances.map((x) => `<li><a href="#" ${cite(g.work, b.book, x)}>${bk(`${x[0]}${x[1]}`)}</a></li>`).join('')).join('')}</ul></details>`; }).join('')}</div></details></li>`).join('')}</ul>
          </div>
          <aside class="p-lm-side">
            <h2 class="p-xp-h2"><span class="n" aria-hidden="true">${dz ? 'Δ' : 'Γ'}</span>${near ? 'Nearby' : 'Most common'}</h2>
            <ul class="p-bywork">${side.map((x) => `<li><a href="#" ${U.lemmaPage(x[1]) ? `data-go="lexicon:${x[1]}"` : 'data-noop'}${x[1] === L.slug ? ' aria-current="true"' : ''}><span lang="grc">${esc(x[0])}</span><span class="n">${fmt(x[2])}</span></a></li>`).join('')}</ul>
          </aside>
        </div>
        <p class="p-lm-back"><a href="#" data-noop>All lexicon entries ›</a></p>
      </main>${foot()}</div>`;
  };
})();
