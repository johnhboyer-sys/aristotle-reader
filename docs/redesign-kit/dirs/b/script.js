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
      cap: 'Hippocrates’ lunes, μηνίσκοι. The <i>Prior Analytics</i> uses them to show a problem brought near to proof: “the circle is made equal to a rectilinear figure by the help of lunules” (II.25, 69a30).',
    },
    Int: {
      title: '[H. Bouwman, teacher of Dutch, at his desk before the class, Stedelijk Gymnasium, Utrecht]', maker: 'Unknown photographer', date: 'between 1921 and 1935', medium: 'Photograph',
      holder: 'Het Utrechts Archief', rights: 'Public Domain Mark', url: 'https://hetutrechtsarchief.nl/beeld/DC4176145B515BF08435018550A4F732',
      cap: 'Greek verbs in the past tense, chalked at a Utrecht gymnasium. For the <i>De Interpretatione</i>, ‘he was healthy’ and ‘he will be healthy’ “are not verbs, but tenses of a verb” (3, 16b16).',
    },
    Top: {
      title: '[Portrait of a male mathematics teacher with moustache seated at his classroom desk]', maker: 'Unknown maker, American', date: 'about 1900', medium: 'Gelatin silver print',
      holder: 'J. Paul Getty Museum', ref: '84.XD.879.104', rights: 'CC0', url: 'https://www.getty.edu/art/collection/object/d839395b-8962-4342-a085-e99ee7837884',
      cap: '“Find out by measuring how many times the diameter of a circle is contained in the circumference”: induction, which the <i>Topics</i> calls “a passage from individuals to universals” (I.12, 105a13).',
    },
  };
  const chalk = (id, getty) => !getty && U.variant('b', 'logic') === 'chalk' && !!CHALK[id];
  const ph = (id, getty) => (chalk(id, getty) ? CHALK[id] : U.PH[id]);

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
  function sylBreaks(word) {
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
  function fitPoster(el, P) {
    const box = POSTER[P.kind];
    const id = faceId();
    const F = FACES[id];
    el.style.fontFamily = `${F.fam}, "Sofia Sans", system-ui, sans-serif`;
    el.style.fontWeight = String(F.w);
    // Round five's rule in every face: a word breaks once, at a syllable,
    // where whole it would hold the title under half its largest size.
    const fmax = id === 'r5' ? (P.kind === 'phone' ? 110 : 300) : (P.kind === 'phone' ? 170 : 400);
    const lines = block(el.dataset.title, box, pw100, { share: 0.8, base: 0.01, fmax });
    if (!lines.length) return;
    const lh = 0.88;
    const textH = lines.reduce((n, x) => n + x.f * lh, 0);
    const gap = lines.length > 1 ? Math.max(0, Math.min((box.H - textH) / (lines.length - 1), 0.5 * Math.min(...lines.map((x) => x.f)))) : 0;
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
  // Literata, as large as the column and `data-fmax` allow. Greek capitals
  // would drop the accents, and in a sans ΑΡΕΤΗ reads as Latin APETH.
  const cvL = document.createElement('canvas').getContext('2d');
  let litIn = false;
  function fitWord(el) {
    const W = el.clientWidth;
    if (!W) return;
    cvL.font = '400 100px Literata';
    const w = litIn ? cvL.measureText(el.dataset.title).width : 55 * [...el.dataset.title].length;
    const f = Math.max(24, Math.min(+el.dataset.fmax || 260, (W / w) * 100 * 0.98));
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
  function fitAll(P) {
    for (const el of P.view.querySelectorAll('[data-fit="poster"]')) fitPoster(el, P);
    for (const el of P.view.querySelectorAll('[data-fit="type"], [data-fit="word"]')) { refit(el); RO.observe(el); }
  }
  B.after = (S, P) => fitAll(P);
  B.fitText = fitAll;
  // Measure again once Sofia Sans, Latin and Greek, is in.
  const SAMPLE = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ,.’ ΑΒΓΔΕΖΗΘΙΚΛΜΝΞΟΠΡΣΤΥΦΧΨΩ';
  Promise.all([document.fonts.load('600 100px "Sofia Sans"', SAMPLE), document.fonts.load('400 100px Literata', 'ἀρετή αβγ')]).catch(() => []).then(() => {
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
    if (chalk(id, getty)) return `img/b/chalk/${printed ? 'printed' : 'bw'}/${cut}/${id}.jpg`;
    return printed ? `img/b/printed/${cut}/${id}.jpg` : `img/b/${cut}/${id}.jpg`;
  };
  const CUT = { desktop: ['desk', 1600, 667], phone: ['phone', 720, 900] };
  function poster(id, title, kind, P, opts = {}) {
    const p = ph(id, opts.getty);
    const [cut, w, h] = CUT[P.kind];
    const img = p ? `<img src="${src(id, cut, opts.getty)}" alt="${esc(p.title)}" width="${w}" height="${h}" decoding="async">` : '';
    const t = opts.tag || 'h1';
    return `<section class="b-po ${kind}">
      ${opts.link ? `<a href="#" class="b-po-a" data-go="${opts.link}" aria-hidden="true" tabindex="-1">${img}</a>` : img}
      <${t} class="b-po-t" data-fit="poster" data-title="${esc(title)}">${esc(title)}</${t}>
    </section>`;
  }
  const credit = (id, full) => {
    const p = ph(id);
    if (!p) return '';
    const holder = p.holder || 'J. Paul Getty Museum';
    const ref = p.holder ? p.ref : p.acc;
    const by = `${esc(holder)}${ref ? `, ${esc(ref)}` : ''} (${esc(p.rights || 'CC0')})`;
    const rec = holder === 'J. Paul Getty Museum' ? 'Object record' : 'Archive record';
    return `<p class="b-cr"><span class="b-cr-c">${p.cap}</span> <span class="b-cr-m"><i>${esc(p.title)}</i>, ${esc(p.maker)}, ${esc(p.date)}.${full ? ` ${esc(p.medium)}${U.variant('b') !== 'printed' && id !== 'Col' ? ', shown in black and white' : ''}. ${by}. <a href="#" data-noop>${rec}</a>` : ` ${esc(holder)}.`}</span></p>`;
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
  // Porphyry's Isagoge is not in the registry's divisions; it stands after the logic.
  const withIsa = (divs) => { const isa = U.work('Isa'); return divs.map((d) => (d.numeral === 'I' && isa ? { ...d, groups: [...d.groups, { ref: '', label: 'With it, a commentary', works: [{ ...isa, title: 'Porphyry, Isagoge' }] }] } : d)); };
  B.home = (S, P) => {
    const id = U.HERO[S.hero % U.HERO.length];
    const w = U.work(id);
    const divs = withIsa(U.divisions());
    return `<div class="b-page">${nav('home')}
      ${poster(id, 'The complete works of Aristotle', 'hero', P, { link: `work:${id}`, getty: true })}
      <p class="b-hero-cr"><span>${ph(id, true).cap}</span> <span class="b-cr-m">Photograph for <a href="#" data-go="work:${id}"><i>${esc(w.title)}</i></a>: <i>${esc(ph(id, true).title)}</i>, ${esc(ph(id, true).maker)}, ${esc(ph(id, true).date)}.</span> <button type="button" class="b-next" data-act="hero">Next photograph</button></p>
      <section class="b-intro">
        <p class="b-lead">Greek and English, side by side. Click any Greek word to parse it and read its dictionary entry; search every work in either language.</p>
        <div class="b-intro-r">
          <div class="b-search">${ICON.search}<input data-search placeholder="φύσις, justice, ἀρετή …" aria-label="Search the corpus" autocomplete="off" spellcheck="false"><button type="button" data-go="search">Search</button></div>
          <p class="b-cont"><a href="#" data-go="reader:${U.RESUME.cite}">Continue reading <i>Nicomachean Ethics</i>, Book I, chapter 7</a></p>
        </div>
      </section>
      ${divs.map((d) => `<section class="b-div">
          <h2 class="b-dh">${esc(d.appendix ? 'Doubted and spurious works' : DIV[d.title] || d.title)}</h2>
          <div class="b-dw">${d.groups.map((g) => `${g.label ? `<h3 class="b-sub">${esc(g.label)}</h3>` : ''}<ul class="b-works">${g.works.map((x) => `<li><a href="#" data-go="work:${x.id}"><span class="b-wt">${esc(x.title)}${tag(x)}</span><span class="b-wg" lang="grc">${esc(x.greekTitle)}</span><span class="b-we">${esc(U.extent(x))}</span></a></li>`).join('')}</ul>`).join('')}</div>
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
      ${credit(w.id, true)}
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
        <ol class="b-toc-b">${U.bookList().map((b) => `<li><p class="b-toc-bh"><span><b>${ROMAN[b.b]}</b> Book ${ROMAN[b.b]}</span><small>${b.n} chapters</small></p>
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
            ${(() => { let last = ''; return c.hits.map((h) => { const win = U.hitWindow(h.cite, h.form); const e = U.engAt(h.cite, 'ross'); const same = e === last; last = e; return `<div class="b-hit"><a href="#" class="b-hr" data-go="reader:${h.cite}">${h.cite}</a><div class="b-hg" lang="grc">${win ? win.filter((l) => l.here).map((l) => l.html).join(' ') : esc(h.form)}</div>${same ? '' : `<p class="b-he">${esc(e)} <span>Ross</span></p>`}</div>`; }).join(''); })()}</div>`).join('')}
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
        <h1 class="b-wp" data-fit="word" data-title="${esc(L.head)}" data-fmax="300" lang="grc">${esc(L.head)}</h1>
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
