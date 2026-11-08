/* Direction B · Poster, round five. Every page opens on one poster. On the
   home page and a work page it is a photograph with the title over it; in
   the reader and the lexicon, where there are no photographs, the type alone
   makes it, in the same capitals and the same red. The photographs are black
   and white and the titles red: two inks, as a poster printer would use. */
(function () {
  'use strict';
  const U = window.U;
  const { esc, fmt, ROMAN } = U;
  const B = (window.T.b = {});
  B.keepPanelOnTrans = true;

  const ICON = {
    close: '<svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><path d="M3.5 3.5l9 9M12.5 3.5l-9 9" stroke="currentColor" stroke-width="1.4"/></svg>',
    moon: '<svg viewBox="0 0 16 16" width="15" height="15" aria-hidden="true"><path d="M13.2 10.1A5.6 5.6 0 0 1 5.9 2.8a5.6 5.6 0 1 0 7.3 7.3z" fill="none" stroke="currentColor" stroke-width="1.3"/></svg>',
    search: '<svg viewBox="0 0 16 16" width="15" height="15" aria-hidden="true"><circle cx="6.8" cy="6.8" r="4.6" fill="none" stroke="currentColor" stroke-width="1.4"/><path d="M10.4 10.4 14 14" stroke="currentColor" stroke-width="1.4"/></svg>',
    menu: '<svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><path d="M2 4.5h12M2 8h12M2 11.5h12" stroke="currentColor" stroke-width="1.4"/></svg>',
    caret: '<svg viewBox="0 0 10 6" width="9" height="6" aria-hidden="true"><path d="M1 1l4 4 4-4" fill="none" stroke="currentColor" stroke-width="1.3"/></svg>',
  };
  const DIV = { 'Logic (Organon)': 'Logic', 'Natural Philosophy': 'Natural philosophy', Metaphysics: 'Metaphysics', 'Moral and Political Philosophy': 'Ethics and politics', 'Rhetoric and Poetics': 'Rhetoric and poetics' };
  const tag = (w) => (w.authenticity && w.authenticity !== 'genuine' ? `<span class="b-tag">${esc(w.authenticity)}</span>` : '');
  // Round seven, John: "For B, let's find some photographs of logic being
  // done on a chalkboard?" Where a logic work has one, it opens on that
  // blackboard; the mockup's "Logic works" switch brings back the Getty
  // photograph. Each is public domain or CC0. The home page keeps the Getty
  // set.
  const CHALK = {
    APr: {
      title: '[D.J.E. Schrek, teacher of mathematics, by the blackboard in his classroom, Stedelijk Gymnasium, Utrecht]', maker: 'Unknown photographer', date: 'between 1912 and 1951', medium: 'Photograph',
      holder: 'Het Utrechts Archief', rights: 'Public Domain Mark', url: 'https://hetutrechtsarchief.nl/beeld/7174FC2443A85281835A16AC9F4AE17D',
    },
    Int: {
      title: '[H. Bouwman, teacher of Dutch, at his desk before the class, Stedelijk Gymnasium, Utrecht]', maker: 'Unknown photographer', date: 'between 1921 and 1935', medium: 'Photograph',
      holder: 'Het Utrechts Archief', rights: 'Public Domain Mark', url: 'https://hetutrechtsarchief.nl/beeld/DC4176145B515BF08435018550A4F732',
    },
    Top: {
      title: '[Portrait of a male mathematics teacher with moustache seated at his classroom desk]', maker: 'Unknown maker, American', date: 'about 1900', medium: 'Gelatin silver print',
      holder: 'J. Paul Getty Museum', ref: '84.XD.879.104', rights: 'CC0', url: 'https://www.getty.edu/art/collection/object/d839395b-8962-4342-a085-e99ee7837884',
    },
  };
  // 4 November, John: "for de interp, something with sentences being
  // written on board. for posterior analytics, something invovling a
  // scientific demonstration. for topics, either keep the fencing or go with
  // two people discussing something deeply. for sophistical refutations, a
  // debate." No open collection had a classification tree on a board, so the
  // Categories keeps its Getty photograph; the Prior Analytics keeps the lunes.
  const FINDS = {
    Int: {
      title: '[Dutch lesson at Arlington House for English girls and women working in the offices of the Dutch government, London]', maker: 'Unknown photographer', date: '1943', medium: 'Photograph',
      holder: 'Nationaal Archief', ref: '935-2002', rights: 'CC0', url: 'http://proxy.handle.net/10648/ad97a2b0-d0b4-102d-bcf8-003048976d84',
    },
    APo: {
      title: '[A class of the Christian HBS, Nieuwegracht 36, Utrecht, probably during the physics lesson]', maker: 'Unknown photographer', date: '1935', medium: 'Photograph',
      holder: 'Het Utrechts Archief', rights: 'Public Domain Mark', url: 'https://hetutrechtsarchief.nl/beeld/B6D2EF10EB445AFA86972CCF65C32D7F',
    },
    Top: {
      title: 'Two men in conversation', maker: 'Willem van de Poll', date: '10 May 1932', medium: 'Photograph',
      holder: 'Nationaal Archief', ref: '254-5411', rights: 'CC0', url: 'http://proxy.handle.net/10648/aef0e004-d0b4-102d-bcf8-003048976d84',
    },
    SE: {
      title: '[Debate in the Eerste Kamer on the REM island; Mr De Wilde (VVD) speaking]', maker: 'Jac. de Nijs / Anefo', date: '1 December 1964', medium: 'Photograph',
      holder: 'Nationaal Archief', ref: '917-1881', rights: 'CC0', url: 'http://proxy.handle.net/10648/aa854046-d0b4-102d-bcf8-003048976d84',
    },
  };
  // Which logic photograph a work opens on, and the folder its cuts live in.
  const logic = (id, getty) => {
    if (getty) return null;
    const v = U.variant('b', 'logic');
    if (v === 'finds') return FINDS[id] ? [FINDS[id], 'logic2'] : id === 'APr' ? [CHALK.APr, 'chalk'] : null;
    if (v === 'chalk') return CHALK[id] ? [CHALK[id], 'chalk'] : null;
    return null;
  };
  const ph = (id, getty) => (logic(id, getty) || [U.PH[id]])[0];

  // ── Setting a title in a box ─────────────────────────────────────────────
  // John on round four: "I think title could to be bigger. It should fill
  // the picture. Not like the letters are so big they cover every inch, but
  // rather we bump up the pt a bit and space out the words and play with
  // kearning." Then: "Let a word break and wrap." On the titles page he
  // marked the settings with whole words "Good" and "Yes", and the ones that
  // broke words at any letter "Okay". So:
  //   · the title is as large as fits: every line within the width, the
  //     lines together within `share` of the height;
  //   · words stay whole where they can;
  //   · a long word breaks once, at the syllable nearest its middle, with
  //     three letters or more on each side, and only where whole words would
  //     hold the title under half its largest size and the break sets it a
  //     fifth larger or more: DE INTER / PRETATIONE, never PHY / SICS;
  //   · every line but the last runs to both edges: its word spaces open as
  //     far as they need to (as round four's home page, which he liked), and
  //     a line of one word takes letter spacing up to .1em.
  // Measured in Sofia Sans SemiBold once the font is in; Greek capitals the
  // same way, with the same syllable rule.
  const LET = /[^\p{L}]/gu;
  const letters = (s) => s.replace(LET, '').length;
  const VOW = 'AEIOUYΑΕΗΙΟΥΩ';
  const isV = (c) => VOW.includes(c);
  const isL = (c) => /\p{L}/u.test(c);
  const DIG = new Set(['CH', 'PH', 'TH', 'SH', 'GN', 'QU', 'CK', 'RH', 'GH']);
  // Consonant pairs that begin a syllable, so PRO|GRESSION, COM|PLETE.
  const ONSET = new Set(['PR', 'BR', 'TR', 'DR', 'CR', 'GR', 'FR', 'PL', 'BL', 'CL', 'FL', 'GL', 'ΠΡ', 'ΤΡ', 'ΚΡ', 'ΓΡ', 'ΒΡ', 'ΔΡ', 'ΦΡ', 'ΘΡ', 'ΧΡ', 'ΠΛ', 'ΚΛ', 'ΓΛ', 'ΒΛ', 'ΦΛ', 'ΧΛ']);
  // Where a word may break: before a consonant between vowels (META|PHYSICS
  // as META-PHY-SICS), between two consonants (ARIS|TOTLE), before a
  // consonant pair that can begin a syllable (INTER|PRETATIONE); never inside
  // CH, PH, TH and the like.
  // John, 5 Nov, on the phone posters: METEOR / OLOGY and MECH / ANICA, not
  // METEO / ROLOGY and MECHA / NICA. A word he has broken breaks where he did.
  const BRK = { METEOROLOGY: 6, MECHANICA: 4 };
  function sylBreaks(word) {
    if (BRK[word]) return [BRK[word]];
    const out = [];
    const n = word.length;
    for (let i = 1; i < n; i++) {
      const a = word[i - 1];
      const b = word[i];
      if (!isL(a) || !isL(b)) continue;
      let ok = false;
      if (isV(a) && !isV(b)) {
        if (i + 1 < n && isV(word[i + 1])) ok = true;
        else if (i + 2 < n && (DIG.has(word.slice(i, i + 2)) || ONSET.has(word.slice(i, i + 2))) && isV(word[i + 2])) ok = true;
      } else if (!isV(a) && !isV(b) && i >= 2 && isV(word[i - 2]) && !DIG.has(a + b) && !ONSET.has(a + b)) {
        if (i + 1 < n && isV(word[i + 1])) ok = true;
        else if (i + 2 < n && !isV(word[i + 1]) && isV(word[i + 2]) && !DIG.has(b + word[i + 1])) ok = true;
      }
      if (ok && letters(word.slice(0, i)) >= 3 && letters(word.slice(i)) >= 3) out.push(i);
    }
    // One break per word: the one nearest its middle.
    const mid = n / 2;
    return out.length ? [out.reduce((x, y) => (Math.abs(y - mid) < Math.abs(x - mid) ? y : x))] : [];
  }
  function solve(txt, box, w100, opt, breaks) {
    const { W, H } = box;
    const share = opt.share ?? 0.8;
    const base = opt.base ?? 0.01;
    const fmax = Math.floor(opt.fmax ?? 300);
    const fmin = opt.fmin ?? 14;
    const pts = [{ i: 0, sp: false }];
    let w0 = 0;
    for (let i = 0; i <= txt.length; i++) {
      if (i === txt.length || txt[i] === ' ') {
        if (breaks) for (const k of sylBreaks(txt.slice(w0, i))) pts.push({ i: w0 + k, sp: false });
        if (i < txt.length) pts.push({ i, sp: true });
        w0 = i + 1;
      }
    }
    pts.push({ i: txt.length, sp: false });
    const cut = (a, b) => txt.slice(pts[a].i + (pts[a].sp ? 1 : 0), pts[b].i);
    const natL = (line, f) => (w100(line) * f) / 100 + base * f * (line.length - 1);
    // The largest size that fits, unless a size up to 6% smaller sets the
    // lines more evenly (ON GENERATION / AND CORRUPTION, not ON GENERATION /
    // AND / CORRUPTION).
    let found = null;
    let f1 = 0;
    for (let f = fmax; f >= fmin; f -= 1) {
      if (f1 && f < f1 * 0.94) break;
      const best = pts.map(() => null);
      best[0] = { cost: 0, prev: -1, n: 0 };
      for (let b = 1; b < pts.length; b++) {
        for (let a = b - 1; a >= 0; a--) {
          if (!best[a]) continue;
          const line = cut(a, b);
          if (!line) continue;
          const w = natL(line, f);
          if (w > W) break;
          const last = b === pts.length - 1;
          const fill = w / W;
          // A line of several words, other than the last, must be at least
          // half full, so its word spaces never open into a hole. A line of
          // one word may be short.
          if (!last && fill < 0.5 && line.includes(' ')) continue;
          const mid = !last && !pts[b].sp;
          const cost = best[a].cost + (last ? 0.25 : 1) * 10 * (1 - fill) ** 2 + (mid ? 2 : 0) + 0.6;
          if (!best[b] || cost < best[b].cost) best[b] = { cost, prev: a, n: best[a].n + 1 };
        }
      }
      const end = best[pts.length - 1];
      if (!end || end.n * 0.88 * f > share * H) continue;
      if (!f1) f1 = f;
      const score = end.cost + 20 * (1 - f / f1);
      if (found && found.score <= score) continue;
      const out = [];
      for (let b = pts.length - 1; b > 0; b = best[b].prev) out.unshift(cut(best[b].prev, b));
      const lines = out.map((line, k) => {
        const extra = W - natL(line, f);
        const nsp = (line.match(/ /g) || []).length;
        const last = k === out.length - 1;
        const fill = 1 - extra / W;
        // The last line runs to the edges only if it nearly does already.
        if (last && (out.length === 1 ? fill < 0.9 : fill < 0.85)) return { text: line, f, L: base * f, S: 0 };
        if (nsp) return { text: line, f, L: base * f, S: extra / nsp };
        const dL = line.length > 1 ? extra / (line.length - 1) : 0;
        return dL <= 0.1 * f ? { text: line, f, L: base * f + dL, S: 0 } : { text: line, f, L: base * f, S: 0 };
      });
      found = { f, lines, score };
    }
    return found;
  }
  function block(title, box, w100, opt = {}) {
    const txt = String(title).toUpperCase().replace(/\s+/g, ' ').trim();
    const whole = solve(txt, box, w100, opt, false);
    const broken = solve(txt, box, w100, opt, true);
    const floor = (opt.floor ?? 0.5) * (opt.fmax ?? 300);
    const pick = broken && (!whole || (whole.f < floor && broken.f >= whole.f * (opt.gain ?? 1.2))) ? broken : whole;
    return pick ? pick.lines : [];
  }
  B.block = block;

  // Widths in Sofia Sans SemiBold at 100px. Until the font is in, an estimate
  // from measured capital widths, so the first paint is close.
  const CAPW = { A: 0.579, B: 0.568, C: 0.62, D: 0.633, E: 0.524, F: 0.497, G: 0.644, H: 0.652, I: 0.249, J: 0.252, K: 0.585, L: 0.469, M: 0.764, N: 0.653, O: 0.634, P: 0.539, Q: 0.634, R: 0.596, S: 0.54, T: 0.532, U: 0.635, V: 0.584, W: 0.848, X: 0.565, Y: 0.544, Z: 0.538, ',': 0.234, '.': 0.235, '’': 0.234, ' ': 0.2 };
  let fontIn = false;
  const cv = document.createElement('canvas').getContext('2d');
  const W100 = new Map();
  const w100 = (s) => {
    if (!fontIn) return [...s].reduce((n, ch) => n + (CAPW[ch] || 0.62), 0) * 102;
    let v = W100.get(s);
    if (v === undefined) { v = cv.measureText(s).width; W100.set(s, v); }
    return v;
  };

  // Round seven: the poster titles' face is on the mockup's switch (John:
  // "Bigger, thicker font. Let's try a few different fonts"). Each face is
  // heavier and narrower than round five's, so a title fits larger; each is
  // measured in its own face. Round five's Sofia Sans SemiBold stays on the
  // switch to compare. `est` scales the Sofia estimate until a face is in.
  const FACES = {
    xc: { fam: '"Sofia Sans Extra Condensed"', w: 800, est: 0.66 },
    anton: { fam: 'Anton', w: 400, est: 0.8 },
    oswald: { fam: 'Oswald', w: 700, est: 0.86 },
    bebas: { fam: '"Bebas Neue"', w: 400, est: 0.7 },
    shoulders: { fam: '"Big Shoulders Display"', w: 900, est: 0.68 },
    r5: { fam: '"Sofia Sans"', w: 600, est: 1 },
  };
  const faceId = () => (FACES[U.variant('b', 'font')] ? U.variant('b', 'font') : 'oswald');
  const cvP = document.createElement('canvas').getContext('2d');
  const PW = new Map();
  const facesIn = new Set();
  const pw100 = (s) => {
    const id = faceId();
    const F = FACES[id];
    if (!facesIn.has(id)) return [...s].reduce((n, ch) => n + (CAPW[ch] || 0.62), 0) * 102 * F.est;
    const key = `${id}|${s}`;
    let v = PW.get(key);
    if (v === undefined) { cvP.font = `${F.w} 100px ${F.fam}`; v = cvP.measureText(s).width; PW.set(key, v); }
    return v;
  };

  // The type posters set Greek capitals, which only the two Sofias have: round
  // five's Sofia Sans with its own face, Sofia Sans Extra Condensed with all
  // the new ones.
  const gw100 = (s) => {
    if (faceId() === 'r5') return w100(s);
    if (!facesIn.has('xcg')) return w100(s) * FACES.xc.est;
    const key = `xcg|${s}`;
    let v = PW.get(key);
    if (v === undefined) { cvP.font = `800 100px ${FACES.xc.fam}`; v = cvP.measureText(s).width; PW.set(key, v); }
    return v;
  };

  const lineHTML = (x, lh) => `<span class="ln" style="font-size:${x.f.toFixed(1)}px;line-height:${lh};letter-spacing:${x.L.toFixed(2)}px;word-spacing:${x.S.toFixed(2)}px;margin-right:${(-x.L).toFixed(2)}px">${esc(x.text)}</span>`;

  // A poster's title: the box is the poster less its margins. One line sits in
  // the middle of the photograph (John: "Center the text on the vertical
  // access", and "Could work if text was at center of photo"); a short one
  // is centred across it too. Two or more lines spread down the photograph,
  // never more than half a line apart (his note on De Interpretatione: "Too
  // much space between words"), and the group is centred.
  const POSTER = { desktop: { W: 1296, H: 544 }, phone: { W: 354, H: 454 } };
  // Where a plate's title stands (John, 5 Nov: "Need to work on title
  // placement", "Hard to read title over the veins/arteries"): over the whole
  // plate, as before; in its top or foot half; on the paper above the plate;
  // or, on a desktop, in a column beside it. The box is what the title fills.
  const TPBOX = { over: { W: 1296, H: 972 }, top: { W: 1296, H: 430 }, foot: { W: 1296, H: 430 }, band: { W: 1296, H: 330 }, side: { W: 470, H: 600 } };
  const TPBOXP = { top: { W: 354, H: 170 }, foot: { W: 354, H: 170 }, band: { W: 354, H: 210 }, side: { W: 354, H: 210 } };
  function fitPoster(el, P) {
    // A plate poster on a desktop is the plate's own shape at full width.
    const po = el.closest('.b-po');
    const tp = (po && po.dataset.tp) || 'over';
    // A size below Full, or "Whole words", keeps every word whole (John on
    // the Posterior Analytics phone poster: "Maybe shrink title a bit").
    const tsv = (po && po.dataset.ts) || '1';
    const ts = tsv === 'w' ? 1 : +tsv || 1;
    const whole = tsv !== '1';
    const b0 = P.kind === 'phone' && po && po.classList.contains('hp-p-side') ? { W: 168, H: 300 } : P.kind === 'desktop' && el.closest('.pl') ? (TPBOX[tp] || { W: 1296, H: 972 }) : P.kind === 'phone' && el.closest('.pl') && TPBOXP[tp] ? TPBOXP[tp] : POSTER[P.kind];
    const box = { W: b0.W * ts, H: b0.H * ts };
    const id = faceId();
    const F = FACES[id];
    el.style.fontFamily = `${F.fam}, "Sofia Sans", system-ui, sans-serif`;
    el.style.fontWeight = String(F.w);
    // Round five's rule in every face: a word breaks once, at a syllable,
    // where whole it would hold the title under half its largest size.
    const fmax = id === 'r5' ? (P.kind === 'phone' ? 110 : 300) : (P.kind === 'phone' ? 170 : 400);
    // Anywhere but over the plate the title sets ragged, in whole words: a
    // line spread to both edges opened holes there.
    const ragged = tp !== 'over';
    let lines = block(el.dataset.title, box, pw100, { share: ragged ? 0.92 : 0.8, base: 0.01, fmax, floor: ragged || whole ? 0 : undefined });
    if (!lines.length) return;
    if (ragged) lines = lines.map((x) => ({ ...x, L: 0.01 * x.f, S: 0 }));
    const lh = 0.88;
    const textH = lines.reduce((n, x) => n + x.f * lh, 0);
    const room = tp === 'over' ? 0.5 : 0.12;
    const gap = lines.length > 1 ? Math.max(0, Math.min((box.H - textH) / (lines.length - 1), room * Math.min(...lines.map((x) => x.f)))) : 0;
    el.innerHTML = lines.map((x) => lineHTML(x, lh)).join('');
    el.style.gap = `${gap.toFixed(1)}px`;
    el.style.alignItems = lines.length === 1 && pw100(lines[0].text) * lines[0].f / 100 < box.W * 0.9 && !lines[0].S && lines[0].L <= 0.011 * lines[0].f ? 'center' : '';
    el.dataset.set = lines.map((x) => Math.round(x.f)).join(',');
  }
  // A type poster: no photograph, the box is the column it stands in, as tall
  // as its `data-h`. Lines start at the top.
  function fitType(el) {
    const W = el.clientWidth;
    if (!W) return;
    const H = +el.dataset.h || 300;
    const lines = block(el.dataset.title, { W, H }, gw100, { share: 1, base: 0.01, fmax: +el.dataset.fmax || 260 });
    if (!lines.length) return;
    el.innerHTML = lines.map((x) => lineHTML(x, 0.86)).join('');
    el.dataset.w = String(W);
  }
  // A word poster: one word as the lexicon prints it, accents and all, in
  // the headword face (John, 8 Nov: "Smaller. Different font."), as large
  // as the column and `data-fmax` allow. Greek capitals would drop the
  // accents, and in a sans ΑΡΕΤΗ reads as Latin APETH.
  const HW = { gentium: '"Gentium Book Plus"', didot: '"GFS Didot"', literata: 'Literata' };
  const cvL = document.createElement('canvas').getContext('2d');
  let litIn = false;
  function fitWord(el) {
    const W = el.clientWidth;
    if (!W) return;
    cvL.font = `400 100px ${HW[el.dataset.hw] || 'Literata'}`;
    const w = litIn ? cvL.measureText(el.dataset.title).width : 55 * [...el.dataset.title].length;
    const f = Math.max(24, Math.min(W < 500 ? 80 : +el.dataset.fmax || 260, (W / w) * 100 * 0.98));  // a phone column caps at 80px
    el.style.fontSize = `${f.toFixed(1)}px`;
    el.dataset.w = String(W);
  }
  const refit = (el) => (el.dataset.fit === 'word' ? fitWord(el) : fitType(el));
  const RO = new ResizeObserver((entries) => {
    for (const e of entries) {
      const el = e.target;
      if (!el.isConnected) { RO.unobserve(el); continue; }
      if (String(el.clientWidth) !== el.dataset.w) refit(el);
    }
  });
  // Both, on a desktop: one Greek column width for the whole page, the
  // widest Greek line's, so the English starts at the same x in every
  // passage (John, 8 Nov: the column edge jumped from chapter to chapter).
  function evenGreek(P) {
    const body = P.view.querySelector('[data-body]');
    if (!body) return;
    body.dataset.gfont = U.S.gfont || 'literata';
    body.style.removeProperty('--gw');
    if (body.dataset.view !== 'both') return;
    // Measure the lines (nowrap), not the cells: a cell's width depends on
    // the grid at the moment of measuring and can read as the whole row.
    let w = 0;
    for (const g of body.querySelectorAll('.b-lt')) w = Math.max(w, g.offsetWidth);  // layout px: the mockup frame may be scaled, and getBoundingClientRect would shrink with it
    if (w) body.style.setProperty('--gw', `${Math.ceil(w)}px`);
  }
  // The reader's Greek face, the reader's own choice in Aa (John, 8 Nov).
  const GFONTS = [['literata', 'Literata', 'Literata'], ['gentium', 'Gentium', '"Gentium Book Plus"'], ['didot', 'GFS Didot', '"GFS Didot"']];
  const gfonts = (S) => `<p class="b-mk">Greek font</p><div class="b-seg wide b-gf" role="group" aria-label="Greek font">${GFONTS.map(([id, label, fam]) => `<button type="button" data-act="gfont:${id}" aria-pressed="${(S.gfont || 'literata') === id}" style="font-family:${fam.replace(/"/g, '&quot;')}" lang="grc">${label === 'GFS Didot' ? 'Didot' : label} <span>αβγ</span></button>`).join('')}</div>`;
  B.act = (S, a, v) => {
    if (a === 'gfont') { S.gfont = v; U.rerenderText(); U.fillPanel(); }
  };
  function fitAll(P) {
    evenGreek(P);
    for (const el of P.view.querySelectorAll('[data-fit="poster"]')) fitPoster(el, P);
    for (const el of P.view.querySelectorAll('[data-fit="type"], [data-fit="word"]')) { refit(el); RO.observe(el); }
  }
  B.after = (S, P) => fitAll(P);
  B.fitText = fitAll;
  // Measure again once Sofia Sans, Latin and Greek, is in.
  const SAMPLE = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ,.’ ΑΒΓΔΕΖΗΘΙΚΛΜΝΞΟΠΡΣΤΥΦΧΨΩ';
  Promise.all([document.fonts.load('600 100px "Sofia Sans"', SAMPLE), document.fonts.load('400 100px Literata', 'ἀρετή αβγ'), document.fonts.load('400 100px "Gentium Book Plus"', 'ἀρετή αβγ'), document.fonts.load('400 100px "GFS Didot"', 'ἀρετή αβγ')]).catch(() => []).then(() => {
    fontIn = true;
    litIn = true;
    cv.font = '600 100px "Sofia Sans"';
    W100.clear();
    U.shown().forEach(fitAll);
  });

  const LATIN = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ,.’';
  document.fonts.load(`800 100px ${'"Sofia Sans Extra Condensed"'}`, 'ΑΒΓΔΕΖΗΘΙΚΛΜΝΞΟΠΡΣΤΥΦΧΨΩ').catch(() => []).then(() => {
    facesIn.add('xcg');
    U.shown().forEach((P) => { if (P.frame.classList.contains('dir-b')) fitAll(P); });
  });
  Object.entries(FACES).forEach(([id, F]) => {
    document.fonts.load(`${F.w} 100px ${F.fam}`, LATIN).catch(() => []).then(() => {
      facesIn.add(id);
      for (const k of [...PW.keys()]) if (k.startsWith(`${id}|`)) PW.delete(k);
      if (U.variant('b', 'font') === id || (id === 'oswald' && !FACES[U.variant('b', 'font')])) U.shown().forEach((P) => { if (P.frame.classList.contains('dir-b')) fitAll(P); });
    });
  });

  // The photograph: black and white by default; the mockup's switch shows
  // the print as the Getty holds it. One colour photograph stays in colour in
  // both: Lumière's autochrome for the treatise On Colours.
  // Round seven: the mockup's variant switch picks black and white or the
  // print as the Getty holds it.
  const src = (id, cut, getty) => {
    const printed = U.variant('b') === 'printed';
    const l = logic(id, getty);
    if (l) return `img/b/${l[1]}/${printed ? 'printed' : 'bw'}/${cut}/${id}.jpg`;
    return printed ? `img/b/printed/${cut}/${id}.jpg` : `img/b/${cut}/${id}.jpg`;
  };
  const CUT = { desktop: ['desk', 1600, 667], phone: ['phone', 720, 900] };
  // ── The plates (prints of about 1700–1900) ───────────────────────────────
  // Moved here from direction H on 5 Nov, when B with plates went on alone.
  // Each shows what its work is about as a whole. who/what/when/how/where:
  // the print and its holder.
  const MET = 'The Metropolitan Museum of Art, New York';
  const RIJKS = 'Rijksmuseum, Amsterdam';
  const COMMONS = 'Wikimedia Commons';
  const IA = (lib) => `${lib}, via the Internet Archive`;
  const WEL = 'Wellcome Collection, London';
  const CMA = 'Cleveland Museum of Art';
  const LOC = 'Library of Congress, Washington';
  const ROUX = 'H. Roux the elder';
  const PL_LATER = {
    home: { side: 'r', alt: 'A marble bust of Aristotle, head in profile to the right, on a round stand.', who: 'François Huot', what: 'Aristoteles. Apud Fulvium Ursinum in marmore', when: 'France, about 1775', how: 'Etching and engraving', where: '© The Trustees of the British Museum', lic: 'CC BY-NC-SA 4.0', url: 'https://www.britishmuseum.org/collection/object/P_1901-1022-1576', left: true },
    // Logic
    Cat: { side: "r", alt: "A ladder of ringed words set in the crown of a leafy tree: Ens, Substantia, Corpus, Vivens, Animal, Homo down the trunk to Petrus Paulus, with the differences in subsistens, corpoream, animatum, sensitivum, rationale on the left and their opposites on the right, joined by bands lettered Dividitur, Constituit and Repugnat.", who: "Edme Pourchot (Purchotius), author; engraved by Fillœul ('Fillœul Sculp.' on the plate)", what: "'Arbor Porphyrii secundum doctrinam Aristotelis et Peripateticorum', Tab. 1, plate in Institutiones philosophicae ad faciliorem veterum et recentiorum philosophorum intelligentiam comparatae, fourth edition", when: "Lyon, Bruyset, 1733", how: "Engraving (the Deutsche Digitale Bibliothek record lists '33 Ill. (Kupferst.)'; the plate is signed 'Filloeul Sculp.')", where: "Staatsbibliothek Bamberg (Ph.q.88), digitised by the Bayerische Staatsbibliothek", lic: "No Copyright – Non-Commercial Use Only (rightsstatements.org NoC-NC 1.0, as the holder's manifest states)", url: "https://www.digitale-sammlungen.de/en/view/bsb11761492?page=833" },
    Int: { side: "r", alt: "Four boxed statements about a man running at the corners of a square, joined by bands marked Contrariae, Subalternae and Subcontrariae and crossed by two bands of Contradictoriae.", who: "Bernardo Sannig (author, as the holder gives it)", what: "Fig. I, square of opposition (Omnis homo currit, Nullus homo currit, Quidam homo currit, Quidam homo non currit; Contraria, Subalterna, Contradictoria, Subcontraria), in Schola philosophica scotistarum, seu Cursus philosophicus completus, ad mentem doctoris subtilis Joannis Duns Scoti, authore P.F. Bernardo Sannig, tomus 1 (the printed label 'Fig: I' and a foxing spot are blotted from the cut)", when: "Prague (Vetero-Pragae), typis Catharinae Czernochianae viduae, 1684", how: "Printed figure (the holder does not name the process)", where: "Staatsbibliothek Bamberg (Ph.f.39#1), via the Bavarian State Library's digital collections", lic: "No Copyright – Non-Commercial Use Only (NoC-NC 1.0), as the holder gives it", url: "https://www.digitale-sammlungen.de/en/view/bsb11759943?page=86" },
    Isa: { side: 'l', alt: 'A tree of linked circles, Substantia, Corpus, Vivens and Animal down the middle, with paired circles on each side joined by bands marked Dividitur, Constituit and Repugnat', who: 'Edmond Purchot', what: 'Arbor Porphyrii, from Institutiones philosophicae, volume 1', when: '1730', how: 'Engraving', where: COMMONS, lic: 'public domain', url: 'https://commons.wikimedia.org/wiki/File:Arbor_porphyrii_(from_Purchotius%27_Institutiones_philosophicae_I,_1730).png' },
    APr: { side: "l", alt: "Rows of overlapping circles lettered A, B and C, some marked with a star, numbered Fig. 1 to Fig. 22.", who: "Leonhard Euler; translated by Henry Hunter (engraver not named)", what: "Plate II, Second Series, in Letters of Euler on different subjects in physics and philosophy, volume 1", when: "London, Murray and Highley, 1802 (second edition)", how: "Engraving (engraver not named)", where: "Boston Public Library, via the Internet Archive", lic: "public domain", url: "https://archive.org/details/lettersofeuleron01eule/page/n491" },
    APo: { side: "r", alt: "Dense lines of Greek in abbreviated type giving the proof, ending in a small circle with a diameter and chords from a point on the rim, labelled with Greek letters.", who: "Euclid; edited by Simon Grynaeus (Basel edition, with Proclus on Book I)", what: "Elements Book III, Prop. 31 (λα), proof and figure, p. 42 (folio), in Ευκλείδου Στοιχείων βιβλ. ιε′ (Greek only)", when: "Basel, apud Ioan. Heruagium (Herwagen), 1533", how: "Printed type and figure (the holder does not name the process)", where: "National Central Library of Rome, via the Internet Archive (Google Books scan)", lic: "Public Domain Mark (the Internet Archive record states the Creative Commons Public Domain Mark 1.0)", url: "https://archive.org/details/bub_gb_NLFLZAoXkSoC/page/n49" },
    Top: { side: "r", alt: "Three men in wigs and gowns stand together in a columned room, two of them gesturing at each other and the third reading from a book.", who: "Unidentified engraver signing GWHWHNM; sold by John Bowles", what: "The Triple Plea (law, physic and divinity dispute which ranks highest)", when: "London, about 1720", how: "Engraving", where: "Wellcome Collection, London", lic: "public domain (PDM)", url: "https://wellcomecollection.org/works/sjyx4haz" },
    SE: { side: "r", alt: "Six men in caps and gowns sit and stand round a draped table, bent over an open book, one old man talking and pointing.", who: "Hans Burgkmair (I), named on the object", what: "Zes geleerden zitten rond een tafel (Six scholars sit round a table over a book), block first used in Liber theoricae nec non praticae Alsaharavii", when: "Augsburg, 1519 (block first used; the Rijksmuseum dates the print 1483-1519)", how: "Woodcut", where: "Rijksmuseum, Amsterdam (RP-P-OB-4365)", lic: "Public Domain Mark 1.0 (the Rijksmuseum also lists CC0)", url: "http://hdl.handle.net/10934/RM0001.COLLECT.30867" },
    // Nature
    Phys: { side: "r", alt: "Concentric rings with lettering: earth, water, air and fire at the centre, then the seven planetary spheres, the fixed stars, the Primum Mobile, the Crystalline sphere and the Empyrean.", who: "Peter Apian and Gemma Frisius (author and editor), printer Joannes Withagius", what: "Schema praedictae divisionis (diagram of the elemental region and the heavenly spheres, Empyreum at the rim), page 6 of the first part of Cosmographia, siue descriptio vniuersi orbis", when: "Antwerp, Joannes Withagius, 1584", how: "Printed figure (the holder does not name the process)", where: "John Carter Brown Library, via the Internet Archive", lic: "public domain", url: "https://archive.org/details/cosmographiasiue00apia/page/n25" },
    Cael: { side: 'r', alt: 'An armillary sphere on an ornate stand, a small earth at the centre of crossed rings and a band of zodiac signs', who: 'Bénard', what: 'Sphère armillaire, Encyclopédie, Astronomie, plate II', when: '1767', how: 'Engraving', where: COMMONS, lic: 'public domain', url: 'https://commons.wikimedia.org/wiki/File:Sph%C3%A8re_armillaire_de_l%27Encyclop%C3%A9die_de_Diderot.jpg' },
    GC: { side: "r", alt: "A round wheel with eight discs (four elements and four qualities) joined by bands marked Contraria, Conuenientes and Repugnantes, with a lettered ring around a central circle.", who: "Oronce Fine", what: "Figura elementarium primariumque qualitatum, tam conuenientium quam discordantium inuicem (wheel of the elements Ignis, Aer, Aqua, Terra and the qualities hot, cold, wet, dry), page 2 of Book I of Sphaera mundi", when: "Paris, Michel de Vascosan, 1552", how: "Printed figure (the holder does not name the process)", where: "John Carter Brown Library, via the Internet Archive", lic: "public domain", url: "https://archive.org/details/sphaeramundisiue00fine/page/n18" },
    Mete: { side: 'l', pos: true, alt: 'A great comet streams across a starry sky above dark fields and a river', q: 'Such is a comet—like a shooting-star that contains its beginning and end in itself.', c: 'Meteorology I.7, 344a32', t: 'Webster', who: 'Anonymous', what: 'The comet', when: 'London, 1860', how: 'Wood engraving', where: WEL, lic: 'public domain', url: 'https://wellcomecollection.org/works/drxb3h2a' },
    DA: { side: "r", alt: "A man's head in profile with a band across the skull divided into cells with Latin labels, lines running from the eye, nose, ear and mouth to the cells.", who: "Gregor Reisch", what: "Head with the inner senses (fantasia, sensus communis, imaginativa, cogitativa, aestimativa, memorativa) and the outer senses, from Margarita philosophica nova, Book X, tract 2", when: "Strasbourg, 1515", how: "Printed figure (the holder does not name the process)", where: "John Carter Brown Library, via the Internet Archive", lic: "public domain", url: "https://archive.org/details/margaritaphiloso00reis/page/n403" },
    Sens: { side: 'r', alt: 'A single human eye, engraved large, with its lashes and brow', who: 'Thomas Milton', what: 'Anatomy: organs of sense, the eye, plate I', when: 'London, 1809', how: 'Line engraving', where: WEL, lic: 'public domain', url: 'https://wellcomecollection.org/works/ujrhdw8w' },
    Mem: { side: 'r', alt: 'The wax impression of an engraved gem: a young ruler’s head in profile, with a headband and a cloak of scales', q: 'The process of movement (sensory stimulation) involved in the act of perception stamps in, as it were, a sort of impression of the percept, just as persons do who make an impression with a seal.', c: 'On Memory 1, 450a31', t: 'Beare', who: 'Rudolf Erich Raspe', what: 'A Descriptive Catalogue of Ancient and Modern Engraved Gems, cast by James Tassie, plate LV', when: 'London, 1791', how: 'Engraving', where: IA('Boston Public Library'), lic: 'public domain', url: 'https://archive.org/details/descriptivecatal02rasp' },
    Somn: { side: 'r', alt: 'A child asleep, its head of curls turned on the pillow, eyes closed', q: 'Extreme youth also has this effect; infants, for example, sleep a great deal.', c: 'On Sleep 3, 457a4', t: 'Beare', who: 'Dominique Vivant Denon', what: 'Head of a Sleeping Child', when: 'about 1765–1825', how: 'Etching', where: MET, lic: 'CC0', url: 'https://www.metmuseum.org/art/collection/search/639568' },
    Insomn: { side: "r", alt: "A man slumped asleep over a desk with owls, bats and a cat crowding behind him.", who: "Francisco de Goya", what: "Plate 43 from Los Caprichos: The sleep of reason produces monsters (El sueño de la razon produce monstruos)", when: "Spain, 1799", how: "Etching and aquatint", where: "The Metropolitan Museum of Art, New York", lic: "CC0", url: "https://www.metmuseum.org/art/collection/search/338473" },
    DivSomn: { side: "r", alt: "A woman asleep in a canopied bed; above her, in a cloud, a winged dragon hovers over a walled city and river.", who: "Anonymous printmaker, after a design by Jörg Breu the Younger; publisher Heinrich Steiner (as the Rijksmuseum gives it)", what: "Droom van Skanderbegs moeder (Dream of Skanderbeg's mother), illustration in Marinus Barletius, Scanderbeg", when: "Augsburg, Heinrich Steiner, 1533", how: "Woodcut", where: "Rijksmuseum, Amsterdam", lic: "public domain", url: "http://hdl.handle.net/10934/RM0001.COLLECT.47925" },
    Long: { side: 'l', alt: 'A very tall oak with a thick trunk in a park of old oaks, a horse standing at its foot', who: 'Jacob George Strutt', what: 'The Tall Oak at Fredville, from Sylva Britannica', when: 'London, 1826', how: 'Etching', where: COMMONS, lic: 'public domain', url: 'https://commons.wikimedia.org/wiki/File:Sylvabritannic_the_Tall_Oak_at_Fredvillet_(2).jpg' },
    Juv: { side: "l", alt: "Two front views of the lungs with the larynx and ringed windpipe above, the left with the heart's place between the lobes, the right with the lobes drawn aside from a central sac.", who: "Bartolomeo Eustachi (author); the holder names no engraver", what: "Tab. XV, six figures of the lungs with the larynx and trachea (figures I and IV used), in Tabulae anatomicae", when: "Rome, Francesco Gonzaga, 1714", how: "Printed figure (the holder does not name the process)", where: "Wellcome Library, via the Internet Archive", lic: "Public Domain Mark (the Internet Archive record states: 'available under the Creative Commons, Public Domain Mark')", url: "https://archive.org/details/b3045279x/page/n113" },
    // Animals
    HA: { side: "l", alt: "Eight sea animals on one sheet: an octopus, two cuttlefish, two squids, a sea hare, a small squid and a tiny cuttlefish, with a sprig of eggs.", who: "Johannes Jonston (author); engraver not named by the holder", what: "Tab. I, octopus (Polypus), cuttlefish (Sepia), squids (Loligo) and sepiola, in Historiae naturalis de exanguibus aquaticis libri IV", when: "Amsterdam, Johannes Jacobus Schipper, 1665", how: "Copper-plate figures (the title page says \"cum figuris Æneis\")", where: "Naturalis Biodiversity Center, via the Internet Archive", lic: "public domain", url: "https://archive.org/details/historiaenatura00jonsa/page/n64" },
    PA: { side: 'r', alt: 'A horse\'s heart lying open among the folds of the two lungs, windpipe and great vessels above.', who: 'J. Pass, after Harguinier', what: 'The Lungs and Heart (Farriery, plate IX), dissection of a horse\'s lungs and heart', when: 'London, 1805', how: 'Engraving with etching, coloured by hand', where: 'Wellcome Collection, London', lic: 'public domain', url: 'https://wellcomecollection.org/works/e33h7rrw' },
    IA: { side: 'r', alt: 'The skeleton of a horse stepping forward with one foreleg raised, and a human skeleton striding beside it', who: 'Benjamin Waterhouse Hawkins', what: 'Skeleton of a man, with the skeleton of a horse, in action, plate V of A Comparative View of the Human and Animal Frame', when: 'London, 1860', how: 'Lithograph', where: WEL, lic: 'public domain', url: 'https://wellcomecollection.org/works/w47vq6v9' },
    MA: { side: 'r', alt: 'A flayed male figure in a deep lunge, one arm swung back and one thrust forward, his muscles, ribs and hip bone drawn', who: 'Jean-Galbert Salvage', what: 'Plate 10 of Anatomie du gladiateur combattant', when: 'Paris, 1812', how: 'Engraving', where: MET, lic: 'CC0', url: 'https://www.metmuseum.org/art/collection/search/343455' },
    GA: { side: "r", alt: "A child at term with hands and feet drawn up, in the opened womb, the cord and membranes beside it.", who: "William Hunter (author); drawn by J. van Rymsdyk, engraved by R. Strange (plate signed \"delin.\" and \"sculp.\")", what: "Tab. XII (child at term in the opened uterus, seen from behind), in Anatomia uteri humani gravidi tabulis illustrata", when: "Birmingham, John Baskerville, 1774 (title page)", how: "Engraving (plate signed \"R. Strange sculp.\")", where: "Wellcome Library, via the Internet Archive", lic: "Public Domain Mark (the Internet Archive record states: 'available under the Creative Commons, Public Domain Mark')", url: "https://archive.org/details/b32882105/page/n48" },
    // Metaphysics, ethics
    Meta: { side: 'r', alt: 'Plato pointing upward and Aristotle with his palm held level walk side by side down the steps of a vaulted hall, other philosophers around them', who: 'Giovanni Volpato, after Raphael', what: 'The School of Athens', when: 'about 1781', how: 'Engraving and etching', where: MET, lic: 'CC0', url: 'https://www.metmuseum.org/art/collection/search/716834' },
    EN: { side: "l", alt: "A long Doric temple of heavy fluted columns, with trees on the entablature and three men and a horse in front.", who: "Giovanni Battista Piranesi", what: "View showing the remains of a large enclosure of columns, from Différentes vues de quelques Restes de trois grands Edifices ... de Pesto autrement Posidonia", when: "about 1748", how: "Etching", where: "The Metropolitan Museum of Art, New York", lic: "CC0 (Open Access; The Met lists the object as public domain)", url: "https://www.metmuseum.org/art/collection/search/363075" },
    EE: { side: "r", alt: "A woman balancing a sieve on her head stands on a ladder among people tending a sick man, gathering firewood, storing food and mending a house.", who: "Philips Galle, after Pieter Bruegel the Elder; published by Hieronymus Cock", what: "Prudence (Prudentia), from \"The Virtues\"", when: "about 1559–60", how: "Engraving", where: "The Metropolitan Museum of Art, New York", lic: "CC0", url: "https://www.metmuseum.org/art/collection/search/410924" },
    Pol: { side: "r", alt: "Solon sits writing on a tablet beside a column while two men, a helmeted soldier and three veiled women stand watching.", who: "Anonymous", what: "Solon writing laws for Athens, from Merry's Museum", when: "Boston, 1842", how: "Print (the volume does not name its technique)", where: "Prelinger Library, via the Internet Archive", lic: "public domain", url: "https://archive.org/details/merrysmuseum43roberich" },
    // Doubted works
    Oec: { side: 'l', alt: 'An old farmhouse with an outside stair: a woman on the stair scatters feed to ducks below, another sits by the door with a baby, and small children play in the yard', q: 'So, according to Hesiod, it would be necessary that there should be First and foremost a house, then a wife …', c: 'Oeconomica I.2, 1343a20', t: 'Forster', who: 'Charles Jacque', what: 'In Front of the House', when: '1845', how: 'Etching', where: MET, lic: 'CC0', url: 'https://www.metmuseum.org/art/collection/search/829471' },
    VV: { side: "r", alt: "A seated woman counts coins at a table under a ruined roof, around her hooded and fishlike figures hoard, steal and crawl among coins, bags and burning ruins.", who: "Pieter van der Heyden, after Pieter Bruegel the Elder; published by Hieronymus Cock", what: "Avarice (Avaritia), from \"The Seven Deadly Sins\"", when: "1558", how: "Engraving", where: "The Metropolitan Museum of Art, New York", lic: "CC0", url: "https://www.metmuseum.org/art/collection/search/338698" },
    DM: { side: 'r', alt: 'A globe at the centre of nested rings for the planets and a tilted band of zodiac signs inside a ring of latitude lines.', who: 'Andreas Cellarius, engraved by Jan van Loon', what: 'Scenographia systematis mundani Ptolemaici, plate 2 of Harmonia macrocosmica', when: 'Amsterdam, 1660', how: 'Engraving, coloured by hand (cut as black ink)', where: 'National Library of Australia (Rex Nan Kivell Collection, Map NK 10241)', lic: 'public domain', url: 'https://commons.wikimedia.org/wiki/File:Cellarius_ptolemaic_system.jpg' },
    Mech: { side: "r", alt: "A spoked wheel with a cord and a 6 lb weight on the axle and a 1 lb weight on the rim.", who: "James Reynolds", what: "Wheel and axle (figure 10 of five), Principles of science, Large series, No. 2, Mechanical powers", when: "London, James Reynolds, 1872", how: "Colored engraving (double plate)", where: "David Rumsey Map Collection, David Rumsey Map Center, Stanford Libraries, via the Internet Archive", lic: "CC BY-NC-SA 3.0", url: "https://archive.org/details/dr_wheel-and-axle-principles-of-science-large-series-no-2-mechanical-powe-14339004" },
    Col: { side: 'r', alt: 'Two concentric rainbows over a flat country of farm buildings and trees under a cloudy sky, small letters along the horizon.', who: 'Royce', what: 'Meteorology: a double rainbow over fields in the country', when: 'London, 1805', how: 'Engraving', where: 'Wellcome Collection, London', lic: 'public domain', url: 'https://wellcomecollection.org/works/wacgmp2q' },
    Phgn: { side: 'l', alt: 'A lion’s head seen from the front beside a bearded man’s head seen from the front, the brow and hair drawn alike', who: 'L. P. Baltard and A. Le Grand, after Charles Le Brun', what: 'Dissertation sur un traité de Charles Le Brun, concernant le rapport de la physionomie humaine avec celle des animaux', when: 'Paris, 1806', how: 'Engraving', where: IA('Wellcome Library'), lic: 'public domain', url: 'https://archive.org/details/b3354315x' },
    MXG: { side: 'l', alt: 'A round figure of concentric bands, a cloud ring, a dark ring, ringed bands and a sun with a face at the centre.', who: 'Robert Fludd; plates engraved by Johann Theodor de Bry and Matthäus Merian the elder', what: 'Concentric rings of cloud and light around a sun, from Utriusque cosmi historia, volume 1', when: '1617', how: 'Etching and engraving', where: 'Getty Research Institute, via the Internet Archive', lic: 'public domain', url: 'https://archive.org/details/utriusquecosmima01flud' },
    Aud: { side: 'l', alt: 'A head in profile, cut open to show the outer ear, the passage and drum, the small bones and the inner ear, with a probe in the ear', who: 'Thomas Buchanan', what: 'An External and Internal View of the Organ of Hearing in Situ, from An Engraved Representation of the Anatomy of the Human Ear', when: 'Hull, 1823', how: 'Engraving', where: WEL, lic: 'public domain', url: 'https://wellcomecollection.org/works/vhwdervz' },
    Lin: { side: 'r', pre: true, alt: 'Ancient bronze compasses and calipers above a long folding rule, shown open and half folded', note: 'Bronze compasses, calipers and a folding foot-rule found at Pompeii. Dots on the rule mark sixteen digits on one face and twelve inches on the other.', q: 'If we accept their definition of ‘commensurate’ lines as those which are measured by the same unit of measurement, … there will be some actual length, by which all of them will be measured.', c: 'On Indivisible Lines 968b4', t: 'Joachim', who: 'Unsigned', what: 'Real Museo Borbonico, volume VI, plate XV: bronze measures from Pompeii', when: 'Naples, 1824–30', how: 'Engraving', where: IA('Wellcome Library'), lic: 'public domain', url: 'https://archive.org/details/b33520859_0006' },
    Vent: { side: 'r', alt: 'A circle of twenty-four wind names in Latin set round a ring with a star-shaped diagram of lines inside.', who: 'Attributed to Peter Flötner and others, for Walther Ryff’s Vitruvius', what: 'Figur der vier und zwentzig Wind, p. 96 of Vitruuius ... zehen Buecher von der Architectur', when: 'Basel, 1614 (first Nuremberg, 1548)', how: 'Woodcut', where: 'Getty Research Institute, via the Internet Archive', lic: 'public domain', url: 'https://archive.org/details/vitruuiusdesalle00vitr' },
    Mirab: { side: "l", alt: "A horse with a long straight horn on its brow leaps over open ground.", who: "Jan Jonston (author); engraver not named", what: "Monoceros Unicornu Einhorn, upper figure of Tab. X, in Historiae naturalis de quadrupedibus libri", when: "apud Ioannem Iacobi fil. Schipper, 1657 (place not given in the holder's record)", how: "Copperplate figures (the title states \"cum aeneis figuris\")", where: "National Library of Naples, via the Internet Archive", lic: "Public Domain Mark 1.0", url: "https://archive.org/details/bub_gb_z9XqnOw2hRgC/page/n190" },
    // Rhetoric and poetics
    Rhet: { side: "r", alt: "A stout man in an eighteenth-century coat stands on a step with one arm stretched out and speaks to a crowded hall of deputies while a priest and others in the foreground look up at him.", who: "Anonymous (draughtsman-lithographer); printed by Veuve Gosselin, Paris", what: "Mirabeau à l'Assemblée des États Généraux (Carnavalet inventory G.27667BIS)", when: "Paris, Veuve Gosselin, about 1870", how: "Lithograph", where: "Musée Carnavalet, Histoire de Paris (Paris Musées)", lic: "CC0", url: "https://www.parismuseescollections.paris.fr/fr/musee-carnavalet/oeuvres/mirabeau-a-l-assemblee-des-etats-generaux" },
    Poet: { side: "r", alt: "Four mourning figures in long robes, three carrying jars, walk in a row with heads bowed.", who: "John Flaxman (designer); Thomas Piroli (engraver)", what: "Orestes, Electra and the Chorus of Trojan Dames bring oblations (Choephorae 1), plate 19 of Compositions from the Tragedies of Aeschylus", when: "London, 1795", how: "Engraving", where: "Internet Archive (scan from microfilm, Eighteenth Century Collections)", lic: "public domain", url: "https://archive.org/details/bim_eighteenth-century_compositions-from-the-tr_aeschylus_1795" },
    // New works, 7 Nov (John's picks on the new-works page)
    MM: { side: "r", alt: "Two engraved heads side by side: at left a head in a headcloth with raised brows and wide eyes, at right a young man with long curls and a calm, level gaze.", who: "Charles Le Brun, engraved by John Tinney", what: "Desire, and Joy with Tranquility, plate 4 of a set of Le Brun’s passions", when: "London, Robert Sayer, about 1760", how: "Line engraving and etching", where: "Wellcome Collection, London", lic: "public domain", url: "https://wellcomecollection.org/works/ykrtn27r" },
    Prob: { side: "r", alt: "In a study with jars, a hung crocodile and drawers of papers, an old man in a fur-edged coat sights a long telescope through a window of stars while a young man holds a book.", who: "Charles Grignion the Elder, after Samuel Wale, as the holder gives it (the plate is signed I. Taylor)", what: "Astronomy: an astronomer in his study, looking out of the window with a telescope", when: "Not dated by the holder (Wale, the designer, died in 1786)", how: "Print (the holder gives both engraving and woodcut)", where: "Wellcome Collection, London", lic: "public domain", url: "https://wellcomecollection.org/works/hxnmyvhq" },
    Plant: { side: "r", alt: "One strawberry plant shown whole, with its fibrous roots, a crown of stalks, large toothed leaves, flowers and ripe fruit.", who: "Basilius Besler", what: "Fraga fructu magno, with the white and red strawberries, Hortus Eystettensis", when: "1613", how: "Printed figure", where: "Wellcome Library, via the Internet Archive", lic: "public domain", url: "https://archive.org/details/b33545170_0001/page/n230" },
    Spir: { side: "r", alt: "Both lungs seen from behind, each in an upper and a lower lobe, with the windpipe's branches and the great vessels running between them, in shaded engraving.", who: "Benoît-Louis Prévost, after Albrecht von Haller", what: "Anatomie, second plate XVI, figure 2: the lungs and their vessels, Encyclopédie", when: "Paris, 1762", how: "Engraving", where: "Wellcome Collection, London", lic: "public domain", url: "https://wellcomecollection.org/works/pnzmbv6z" },
    RhetAl: { side: "r", alt: "A bearded old man in a hooded cloak holds a scroll while a curly-haired child sits on a cushioned chair with a hand at his brow; fluted columns stand behind them.", who: "Johann Sebastian Müller (?), after Johann Heinrich Ramberg", what: "Alexander und sein Lehrer Aristoteles", when: "about 1783–92", how: "Mezzotint", where: "The British Museum, 2015,7056.2.1", lic: "© The Trustees of the British Museum, CC BY-NC-SA 4.0", url: "https://www.britishmuseum.org/collection/object/P_2015-7056-2-1" },
    AthPol: { side: "r", alt: "A long Doric temple seen from a corner, with fourteen columns on its flank and a pediment, standing on a rise with a ruined tower behind and a few seated and mounted men in the foreground.", who: "Julien-David Le Roy, engraved by Le Bas", what: "Vue du Temple de Thésée, plate XI of Les ruines des plus beaux monuments de la Grèce", when: "Paris, 1758", how: "Engraving", where: "Getty Research Institute, via the Internet Archive", lic: "public domain", url: "https://archive.org/details/gri_33125009324597/page/n61" },
  };
  const plateCredit = (p) => p.cr ? esc(p.cr) : `${esc(p.who)}${p.what ? `, <i>${esc(p.what)}</i>` : ''}${p.when ? `, ${esc(p.when)}` : ''}. ${esc(p.how)}. ${esc(p.where)} (${esc(p.lic)}).`;
  // John, 5 Nov: "Could you do a variant of B with plates instead of
  // photos? Don't have the plate ink lines be blue." Then "B with plates":
  // Plates is the Pictures switch's default. The plates print in black ink
  // on B's paper, each whole, at its own shape; the red title runs across it
  // as over a photograph. The home page took Jesi's Aristotle; on 6 Nov John
  // picked Huot's bust for it, and new prints for APo, Col, DM, MXG, PA, Vent.
  // John, 6 Nov: "Remove photo options". B is plates only; the Pictures and
  // Logic works switches are gone, and the photograph code below is unused.
  const plates = () => true;
  // John, 7 Nov: "make sure round eight artifact doesn't show rejected plates."
  // These works' present prints are rejected on the plates page and have no
  // pick yet, so they stand as titles alone until he picks one.
  const REJECTED = new Set([]);
  const plateOf = (id) => (plates() && !REJECTED.has(id) ? PL_LATER[id] : null);
  const PCUT = { desktop: ['desk', 1280, 914], phone: ['phone', 640, 558] };
  function poster(id, title, kind, P, opts = {}) {
    const pid = opts.plate || id;
    const pl = plateOf(pid);
    const p = pl || plates() ? null : ph(id, opts.getty);
    const [cut, w, h] = (pl ? PCUT : CUT)[P.kind];
    const img = pl ? `<img src="img/b/plates/${cut}/${pid}.jpg" alt="${esc(pl.alt)}" width="${w}" height="${h}" decoding="async" style="-webkit-mask-image:url(img/b/plates/${cut}/mask/${pid}.png);mask-image:url(img/b/plates/${cut}/mask/${pid}.png)">`
      : p ? `<img src="${src(id, cut, opts.getty)}" alt="${esc(p.title)}" width="${w}" height="${h}" decoding="async">` : '';
    const t = opts.tag || 'h1';
    // The switches show each placement and size on every plate; "As set"
    // keeps each plate's own.
    const vp = U.variant('b', 'tpos');
    // John, 5 Nov: "I'm leaning towards the side of the plate placement. The
    // title on top of plate only works for some of these." Beside is the
    // default; a plate where over works says `tp: 'over'`.
    const tp = pl ? (vp === 'set' ? pl.tp || 'side' : vp) : '';
    const vs = U.variant('b', 'tsize');
    const ts = pl ? (vs === 'ts-set' ? pl.ts || '1' : vs) : '1';
    // John, 5 Nov, on dark mode: "Not loving these inverted versions." A plate
    // keeps its dark ink on a dimmed paper; the switch still shows light lines.
    // John, 8 Nov: "have the paper be just an outline around plates that don't take up full rectangle".
    // 'outline' keeps the paper only near the ink (a mask per plate, img/b/plates/<cut>/mask/<id>.png).
    const dpv = U.variant('b', 'dplate'); const dp = dpv === 'lines' ? 'lines' : dpv === 'outline' ? 'paper dp-outline' : 'paper';
    // John, 6 Nov: "beside the plate is how we will do desktop homepage.
    // Might want to still tweak mobile though." The Phone home switch sets
    // the home plate on a phone: title above (as now), below, or beside.
    const hp = opts.plate === 'home' ? ` hp-${U.variant('b', 'hphone')}` : '';
    const pa = pl ? ` dp-${dp} tp-${tp}${tp === 'side' && pl.left ? ' pl-l' : ''}${hp}" data-tp="${tp}" data-ts="${ts}` : '';
    // In plates mode a work with no plate keeps the title column it would have beside one.
    const bare = !pl && plates() ? ' pl tp-side no-pl" data-tp="side" data-ts="1' : '';
    return `<section class="b-po ${kind}${pl ? ' pl' : ''}${pa}${bare}">
      ${opts.link ? `<a href="#" class="b-po-a" data-go="${opts.link}" aria-hidden="true" tabindex="-1">${img}</a>` : img}
      <${t} class="b-po-t" data-fit="poster" data-title="${esc(title)}">${esc(title)}</${t}>
    </section>`;
  }
  // John, 4 Nov, on the captions: "cut them entirely and just include
  // details on attributions page." No photograph carries a caption; each
  // record is on the Picture credits page.
  const credit = (id, getty) => {
    const p = ph(id, getty);
    if (!p) return '';
    const holder = p.holder || 'J. Paul Getty Museum';
    const ref = p.holder ? p.ref : p.acc;
    const by = `${esc(holder)}${ref ? `, ${esc(ref)}` : ''} (${esc(p.rights || 'CC0')})`;
    const rec = holder === 'J. Paul Getty Museum' ? 'Object record' : 'Archive record';
    return `<i>${esc(p.title)}</i>, ${esc(p.maker)}, ${esc(p.date)}. ${esc(p.medium)}${U.variant('b') !== 'printed' && id !== 'Col' ? ', shown in black and white' : ''}. ${by}. <a href="#" data-noop>${rec}</a>`;
  };

  // On a phone the site links fold into a menu beside a search icon (John,
  // 4 Nov: "icon for search and menu icon that drops down").
  const SITE = [['home', 'Works'], ['search', 'Search'], ['lexicon', 'Lexicon'], ['phrases', 'Phrases'], ['support', 'Support']];
  const nav = (on) => `<header class="b-nav">
      <a class="b-brand" href="#" data-go="home">Aristotle Reader</a>
      <nav class="b-links" aria-label="Site">
        ${[['home', 'Works'], ['search', 'Search'], ['lexicon', 'Lexicon'], ['phrases', 'Phrases'], ['support', 'Support']].map(([k, l]) => `<a href="#" ${k === 'phrases' || k === 'support' ? 'data-noop' : `data-go="${k}"`} class="${on === k ? 'on' : ''}${k === 'phrases' || k === 'support' ? ' b-x-s' : ''}">${l}</a>`).join('')}
        <button type="button" class="b-ib" data-act="theme" aria-label="Dark or light">${ICON.moon}</button>
        <button type="button" class="b-ib b-only-s" data-go="search" aria-label="Search">${ICON.search}</button>
        <details class="b-sm b-only-s"><summary aria-label="Menu">${ICON.menu}</summary><div class="b-sm-p">${SITE.map(([k, l]) => `<a href="#" ${k === 'phrases' || k === 'support' ? 'data-noop' : `data-go="${k}"`}${on === k ? ' aria-current="page"' : ''}>${l}</a>`).join('')}</div></details>
      </nav>
    </header>`;
  const foot = () => `<footer class="b-foot">
      <p>Also <a href="#" data-noop>The Plato Reader</a> <a href="#" data-noop>The Homer Reader</a> <a href="#" data-noop>The Greek Drama Reader</a> <a href="#" data-noop>Grammata</a></p>
      <p><a href="#" data-noop>Texts &amp; licences</a> <a href="#" data-go="credits">Picture credits</a> <a href="#" data-noop>Support</a> <a href="#" data-noop>Desktop app</a> <a href="#" data-noop>Report an error</a> <a href="#" data-noop>Play a game</a> <span>Site by John H. Boyer</span></p>
    </footer>`;

  // ── Home ─────────────────────────────────────────────────────────────────
  // Porphyry's Isagoge is not in the registry's divisions; it stands after the logic.
  const withIsa = (divs) => { const isa = U.work('Isa'); return divs.map((d) => (d.numeral === 'I' && isa ? { ...d, groups: [...d.groups, { ref: '', label: 'With it, a commentary', works: [{ ...isa, title: 'Porphyry, Isagoge' }] }] } : d)); };
  // John, 6 Nov, on the home page's opening line: "Let's rewrite this copy."
  // Then: "This is either the slug line that sells the site OR the slug line
  // that tells the user what they can do. It's just awkward. What do we have
  // for Plato?" One line of each kind, and Plato's ported. {c} is Click on a
  // desktop and Tap on a phone, as the Plato reader does.
  const LEDE = {
    do: '{c} any Greek word to parse it and read its dictionary entry. Search every work, in Greek or English.',
    sell: 'Every work, in Aristotle’s Greek and in English, side by side.',
    plato: 'Parallel Greek–English editions of every work of Aristotle. {c} any Greek word to parse it and see its definition. Search the corpus in Greek and English.',
    none: '',
  };
  B.home = (S, P) => {
    const id = U.HERO[S.hero % U.HERO.length];
    // John, 6 Nov: "until we have other commentaries, Porphyry only lives on
    // the Categories work page." The home list leaves the Isagoge out.
    const divs = U.divisions();
    return `<div class="b-page">${nav('home')}
      ${plates() ? poster(id, 'The complete works of Aristotle', 'hero', P, { plate: 'home' }) : `${poster(id, 'The complete works of Aristotle', 'hero', P, { link: `work:${id}`, getty: true })}
      <p class="b-hero-cr"><button type="button" class="b-next" data-act="hero">Next photograph</button></p>`}
      <section class="b-intro">
        <p class="b-lead">${(LEDE[U.variant('b', 'lede')] ?? LEDE.do).replace('{c}', P.kind === 'phone' ? 'Tap' : 'Click')}</p>
        <div class="b-intro-r">
          <div class="b-search">${ICON.search}<input data-search placeholder="φύσις, justice, ἀρετή …" aria-label="Search the corpus" autocomplete="off" spellcheck="false"><button type="button" data-go="search">Search</button></div>
          <p class="b-cont"><a href="#" data-go="reader:${U.RESUME.cite}">Continue reading <i>Nicomachean Ethics</i>, Book I, chapter 7</a></p>
        </div>
      </section>
      ${divs.map((d) => `<section class="b-div">
          <h2 class="b-dh">${esc(d.appendix ? 'Doubted and spurious works' : DIV[d.title] || d.title)}</h2>
          <div class="b-dw">${d.groups.map((g) => `${g.label ? `<h3 class="b-sub sub-${U.variant('b', 'sub')}">${esc(g.label)}</h3>` : ''}<ul class="b-works">${g.works.map((x) => `<li><a href="#" data-go="work:${x.id}"><span class="b-wt">${esc(x.title)}${tag(x)}</span><span class="b-wg" lang="grc">${esc(x.greekTitle)}</span><span class="b-we">${esc(U.extent(x))}</span></a></li>`).join('')}</ul>`).join('')}</div>
        </section>`).join('')}
      ${foot()}</div>`;
  };

  // ── A work ───────────────────────────────────────────────────────────────
  // The books as a contents page: each book's number large in red (the
  // Metaphysics keeps its Greek letters), its first chapter's title where the
  // site has titles, else its Bekker span. Books close by default.
  const books = (w) => {
    const en = w.id === 'EN';
    const bs = U.workBooks(w.id);
    const row = (b, c) => `<li><a href="#" data-go="${en && b.n === 1 ? `reader:${c.bekker.split('–')[0]}` : 'reader'}"><span class="b-cn">${esc(c.ch)}</span><span class="b-ct">${esc(c.title || `Chapter ${c.ch}`)}</span><span class="b-cb">${esc(c.bekker)}</span></a></li>`;
    if (bs.length < 2) return `<ol class="b-chs">${(bs[0] ? bs[0].chapters : []).map((c) => row(bs[0], c)).join('')}</ol>`;
    const span = (b) => { const s = U.bookSpan(w, b.n); return s ? `${s[0]}–${s[1]}` : ''; };
    return `<p class="b-bkall"><button type="button" data-act="books:open">Open all books</button><button type="button" data-act="books:close">Close all</button></p>
      <div class="b-bks">${bs.map((b) => `<details class="b-bk" data-book="${b.n}"><summary>
          <span class="b-bkn" lang="${/[α-ωΑ-Ω]/.test(b.label) ? 'grc' : 'en'}"><span class="b-bkw">Book</span>${esc(b.label)}</span>
          <span class="b-bkf">${b.chapters[0] && b.chapters[0].title ? esc(b.chapters[0].title) : `<span class="b-bks2">${esc(span(b))}</span>`}</span>
          <span class="b-bkc">${b.chapters.length} chapter${b.chapters.length === 1 ? '' : 's'}</span>
        </summary><ol class="b-chs">${b.chapters.map((c) => row(b, c)).join('')}</ol></details>`).join('')}</div>`;
  };

  B.work = (S, P) => {
    const w = U.work(S.workId) || U.work('EN');
    const en = w.id === 'EN';
    const d = U.divisionOf(w.id);
    const trs = w.translations.map((t) => ({ ...t, ...U.transParts(t) }));
    const many = U.workBooks(w.id).length > 1;
    const fr = U.further(w.id);
    const kinds = { translation: 'Translation', commentary: 'Commentary', collection: 'In print' };
    const isa = U.work('Isa');
    return `<div class="b-page">${nav('home')}
      <p class="b-crumb"><a href="#" data-go="home">Works</a> / ${d ? esc(d.appendix ? 'Doubted and spurious works' : DIV[d.title] || d.title) : 'Commentary'}</p>
      ${poster(w.id, w.title, 'work', P)}
      <div class="b-po-below">
          <p class="b-wk-gt" lang="grc">${esc(w.greekTitle)}</p>
          <p class="b-wk-blurb">${esc(w.blurb)}${tag(w)}</p>
          <div class="b-ctas">
            <a href="#" class="b-btn pri" data-go="reader">Start reading</a>
            ${en ? `<a href="#" class="b-btn" data-go="reader:${U.RESUME.cite}">Resume at Book I, chapter 7</a>` : ''}
            <a href="#" class="b-btn" data-go="reader:greek">Greek only</a>
            ${trs.length > 1 ? '<a href="#" class="b-btn" data-go="reader:compare">Compare translations</a>' : ''}
          </div>
          ${en ? '' : '<p class="b-mock">In this mockup the reader opens the <i>Ethics</i>.</p>'}
      </div>
      <section class="b-wk">
        <dl class="b-facts">
          <dt>Greek</dt><dd>${esc(w.greekSource.full)}</dd>
          <dt>English</dt><dd>${trs.map((t) => `<a href="#" data-go="reader:${t.id}">${esc(t.who)}</a>, ${esc(t.pub)}${t.year ? `, ${esc(t.year)}` : ''}${trs.length > 1 && (w.defaultTranslation || trs[0].id) === t.id ? ' <small>opens first</small>' : ''}`).join('<br>')}</dd>
          <dt>Length</dt><dd>${esc(U.extent(w))}</dd>
        </dl>
      </section>
      <section class="b-sec">
        <h2 class="b-h2">${many ? 'Books and chapters' : 'Chapters'}</h2>${en ? '<p class="b-note3">Chapter titles are Ostwald’s.</p>' : ''}
        ${books(w)}
      </section>
      <section class="b-sec b-two">
        ${fr.length ? `<div><h2 class="b-h2">In print</h2><ul class="b-print">${fr.map((r) => `<li><small>${kinds[r.kind] || r.kind}</small><span>${r.cite}</span></li>`).join('')}</ul></div>` : ''}
        <div>${w.commentaries ? `<h2 class="b-h2">Commentary</h2><ul class="b-trs"><li><a href="#" data-go="work:Isa"><span>Porphyry, <i>Isagoge</i></span><small>${esc(isa.blurb)}</small></a></li></ul>` : ''}
          <h2 class="b-h2">Sources</h2><p class="b-cred"><a href="#" data-noop>Texts &amp; licences</a></p></div>
      </section>
      ${foot()}</div>`;
  };

  // ── The reader: no photographs ───────────────────────────────────────────
  // ── Picture credits ──────────────────────────────────────────────────────
  // Every photograph, as the current settings show it: each work's, then
  // the home page's.
  B.credits = () => {
    if (plates()) {
      const all = withIsa(U.divisions()).flatMap((d) => d.groups.flatMap((g) => g.works)).filter((w) => plateOf(w.id));
      const prow = (label, q) => `<li>${label}<span>${plateCredit(q)}${q.url ? ' <a href="#" data-noop>Record</a>' : ''}</span></li>`;
      return `<div class="b-page">${nav('')}
      <section class="b-pc">
        <h1 class="b-pc-h">Picture credits</h1>
        <h2 class="b-h2">The home page</h2><ul class="b-pc-l">${prow('<a href="#" data-go="home"><i>Aristotle</i></a>', plateOf('home'))}</ul>
        <h2 class="b-h2">The works</h2><ul class="b-pc-l">${all.map((w) => prow(`<a href="#" data-go="work:${w.id}"><i>${esc(w.title)}</i></a>`, plateOf(w.id))).join('')}</ul>
      </section>
      ${foot()}</div>`;
    }
    const ws = withIsa(U.divisions()).flatMap((d) => d.groups.flatMap((g) => g.works)).filter((w) => ph(w.id));
    const row = (w, getty) => `<li><a href="#" data-go="work:${w.id}"><i>${esc(w.title)}</i></a><span>${credit(w.id, getty)}</span></li>`;
    return `<div class="b-page">${nav('')}
      <section class="b-pc">
        <h1 class="b-pc-h">Picture credits</h1>
        <h2 class="b-h2">The works</h2><ul class="b-pc-l">${ws.map((w) => row(w)).join('')}</ul>
        <h2 class="b-h2">The home page</h2><ul class="b-pc-l">${U.HERO.map((id) => U.work(id)).filter(Boolean).map((w) => row(w, true)).join('')}</ul>
      </section>
      ${foot()}</div>`;
  };

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
        <button type="button" class="b-ib" data-go="search" aria-label="Search">${ICON.search}</button>
        <button type="button" class="b-ib b-aab" data-act="panel:aa" data-keep aria-label="Text and view settings">Aa</button>
        <button type="button" class="b-ib" data-act="theme" aria-label="Dark or light">${ICON.moon}</button>
      </header>
      <main class="b-text" data-text></main>
    </div>`;

  B.hp = { tr: (S) => `${esc(U.trans(S.trans).short)}${S.cmp ? ` and ${esc(U.trans(S.cmp).short)}` : ''} ${ICON.caret}` };

  // A book opens on a plain head: the work, the book in red capitals in the
  // title face, its Greek title and the editions. (Round seven opened it on
  // its first words in giant capitals; John: "Not loving the HERO text".)

  B.text = (S) => {
    const tr = U.readerTrans(S);
    const cols = S.view === 'greek' ? ['g'] : S.view === 'english' ? tr : ['g', ...tr];
    let lastSi = -1;
    let html = `<header class="b-bookh">
        <p class="b-bk-k">Nicomachean Ethics</p>
        <h1 class="b-bk-t">Book I</h1>
        <p class="b-bk-s"><span lang="grc">Ἠθικὰ Νικομάχεια Α</span> · Greek: Bywater, 1894${S.view === 'greek' ? '' : ` · English: ${tr.map((t) => `${esc(U.trans(t).who)}, ${esc(U.trans(t).year)}`).join(' and ')}`}</p>
      </header>`;
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
        <ol class="b-toc-b">${U.bookList().map((b) => `<li><p class="b-toc-bh"><span>Book ${ROMAN[b.b]}</span><small>${b.n} chapters</small></p>
          ${b.b === 1 ? `<ol class="b-toc-c">${U.chapterList().map((c) => `<li><a href="#" data-act="ch:${c.ch}" data-ch-link="${c.ch}"><span>${c.ch}</span>${esc(c.title)}</a></li>`).join('')}</ol>` : ''}</li>`).join('')}</ol>
      </aside>`;
    }
    if (P.ui.panel === 'book') return `<div class="b-menu" style="left:${phone ? 12 : at.x}px;top:${at.y + 8}px"><ul class="b-bm">${U.bookList().map((b) => `<li><a href="#" ${b.b === 1 ? 'data-act="ch:1" aria-current="true"' : 'data-act="msg:book"'}><span>Book ${ROMAN[b.b]}</span><small>${b.n} chapters</small></a></li>`).join('')}</ul></div>`;
    if (P.ui.panel === 'picker') return `<div class="b-menu b-pk" style="right:${at.r}px;top:${at.y + 8}px"><p class="b-mk">Translation</p>${transList(S)}<p class="b-note2">Each translation keeps its own Bekker numbers in the margin.</p></div>`;
    if (P.ui.panel === 'aa') {
      const sl = (k, label, min, max) => `<label class="b-sl"><span>${label}</span><output>${Math.round(S[k] * 100)}%</output><input type="range" min="${min}" max="${max}" step="0.05" value="${S[k]}" data-range="${k}"></label>`;
      return `<div class="b-menu b-aa" style="${phone ? 'left:12px;right:12px' : `right:${at.r}px`};top:${at.y + 8}px">
        ${views(S)}${gfonts(S)}${phone ? `<p class="b-mk">Translation</p>${transList(S)}` : ''}
        ${sl('fs', 'Text size', 0.8, 1.4)}${sl('lh', 'Line spacing', 0.85, 1.4)}${phone ? '' : sl('cw', 'Column width', 0.75, 1.3)}
        <label class="b-chk"><input type="checkbox" checked> <span>Add the citation when I copy Greek</span></label>
        <p class="b-aa-f"><button type="button" data-noop>Print</button><button type="button" data-act="reset">Reset</button></p>
      </div>`;
    }
    return '';
  };

  // ── Search: no photographs ───────────────────────────────────────────────
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
        <div class="b-sr-n"><p class="b-sr-big">${fmt(R.count)}</p><div class="b-sr-r"><p class="b-sr-t">places in ${R.works.length} works for <span lang="grc">${esc(R.head)}</span>, ${esc(R.gloss)}.</p><p class="b-sr-l"><a href="#" data-go="lexicon:arete">Lexicon</a><a href="#" data-noop>Export as CSV</a></p></div></div>
        <div class="b-sr-body">
        <nav class="b-sr-w" aria-label="Works with hits">${R.works.map((x, i) => `<a href="#" data-noop class="${i === 0 ? 'on' : ''}"${i === 0 ? ' aria-current="true"' : ''}><span>${esc(x.title)}</span><b>${x.count}</b></a>`).join('')}</nav>
        <div class="b-sr-main">
        <section class="b-sg"><h2>Nicomachean Ethics <span>${en.count} places · Book I shown</span></h2>
          ${b1.chapters.map((c) => `<div class="b-sch"><h3><b>${esc(c.chapter)}</b> ${esc(U.TITLES[c.chapter] || '')}</h3>
            ${(() => { let last = ''; return c.hits.map((h) => { const win = U.hitWindow(h.cite, h.form); const e = U.engAt(h.cite, 'ross'); const same = e === last; last = e; return `<div class="b-hit"><a href="#" class="b-hr" data-go="reader:${h.cite}"><b>${ROMAN[b1.book]}.${esc(c.chapter)}</b>${h.cite}</a><div class="b-hg" lang="grc">${win ? win.filter((l) => l.here).map((l) => l.html).join(' ') : esc(h.form)}</div>${same ? '' : `<p class="b-he">${esc(e)} <span>Ross</span></p>`}</div>`; }).join(''); })()}</div>`).join('')}
        </section>
        ${R.groups.filter((g) => g.work !== 'EN').slice(0, 5).map((g) => `<section class="b-sg closed"><h2>${esc(g.title)} <span>${g.count} place${g.count === 1 ? '' : 's'}</span></h2></section>`).join('')}
        </div></div>
      </section>
      ${foot()}</div>`;
  };

  // ── Lexicon: no photographs ──────────────────────────────────────────────
  // The headword itself is the page's poster: as the lexicon prints it,
  // accents and breathing kept, red, as wide as the column allows.
  B.lexicon = (S) => {
    const L = U.lemmaPage(S.lex) || U.lemmaPage('arete');
    const dz = L.distinctiveness;
    return `<div class="b-page">${nav('lexicon')}
      <section class="b-lx">
        <h1 class="b-wp hw-${U.variant('b', 'hw')}" data-fit="word" data-hw="${U.variant('b', 'hw')}" data-title="${esc(L.head)}" data-fmax="150" lang="grc">${esc(L.head)}</h1>
        <div class="b-lx-h"><p class="b-lx-gl">${esc((L.glosses || []).join('; '))}</p></div>
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
