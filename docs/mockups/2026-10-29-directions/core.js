/* The four directions: shared data access, the reading text, the word
   sidebar's model, routing and the mockup's own controls. Each direction
   (dir-a.js … dir-d.js) adds its page templates to window.T. */
(function () {
  'use strict';
  const D = window.DATA;
  const T = (window.T = window.T || {});
  const U = (window.U = {});

  // ── Small helpers ────────────────────────────────────────────────────────
  const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const fmt = (n) => Number(n).toLocaleString('en-US');
  const ROMAN = ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII', 'XIII', 'XIV'];
  const GNUM = ['', 'Α', 'Β', 'Γ', 'Δ', 'Ε', 'Ϛ', 'Ζ', 'Η', 'Θ', 'Ι', 'ΙΑ', 'ΙΒ', 'ΙΓ', 'ΙΔ'];
  // Greek in capitals drops its accents and breathings, as inscriptions and
  // capital-set titles do.
  const caps = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().normalize('NFC');
  const fold = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/ς/g, 'σ');
  Object.assign(U, { esc, fmt, ROMAN, GNUM, caps, fold });

  // Beta Code → Greek, for the rare card whose headword has no manifest entry.
  const BG = { a: 'α', b: 'β', g: 'γ', d: 'δ', e: 'ε', z: 'ζ', h: 'η', q: 'θ', i: 'ι', k: 'κ', l: 'λ', m: 'μ', n: 'ν', c: 'ξ', o: 'ο', p: 'π', r: 'ρ', s: 'σ', t: 'τ', u: 'υ', f: 'φ', x: 'χ', y: 'ψ', w: 'ω' };
  const BD = { ')': '̓', '(': '̔', '/': '́', '\\': '̀', '=': '͂', '|': 'ͅ', '+': '̈' };
  U.betaToGreek = (b) => {
    let out = '';
    let cap = false;
    for (const ch of String(b).replace(/[0-9^_]/g, '')) {
      if (ch === '*') { cap = true; continue; }
      if (BG[ch]) { out += cap ? BG[ch].toUpperCase() : BG[ch]; cap = false; } else if (BD[ch]) out += BD[ch];
    }
    return out.normalize('NFC').replace(/σ(?=$|[\s,.;·])/g, 'ς');
  };

  // ── The corpus registry ──────────────────────────────────────────────────
  const W = D.registry.works;
  const byId = Object.fromEntries(W.map((w) => [w.id, w]));
  U.W = W;
  U.work = (id) => byId[id];
  const citeRe = /^(\d{1,4})([ab])(\d+)?$/;
  U.parseCite = (c) => {
    const m = citeRe.exec(String(c || '').trim().toLowerCase().replace(/[\s.:]+/g, ''));
    return m ? { page: +m[1], side: m[2], line: m[3] ? +m[3] : 1, col: m[1] + m[2] } : null;
  };
  // A citation as a position on Bekker's one numbered line, in pages.
  U.citeX = (c) => {
    const p = typeof c === 'string' ? U.parseCite(c) : c;
    if (!p) return 0;
    return p.page + (p.side === 'b' ? 0.5 : 0) + Math.min(p.line, 40) / 80;
  };
  U.isBekker = (w) => !(w.citation && w.citation.scheme === 'busse');
  U.workSpan = (w) => {
    const books = Object.values(w.spans || {});
    if (!books.length) return null;
    return { first: books[0][0], last: books[books.length - 1][1] };
  };
  U.spanText = (w, short) => {
    const s = U.workSpan(w);
    if (!s || !U.isBekker(w)) return w.id === 'Isa' ? 'Busse 1–22' : '';
    if (!short) return `${s.first}–${s.last}`;
    const a = U.parseCite(s.first);
    const b = U.parseCite(s.last);
    return `${a.col}–${b.col}`;
  };
  U.pages = (w) => {
    const s = U.workSpan(w);
    if (!s || !U.isBekker(w)) return 0;
    return Math.max(1, Math.round(U.citeX(s.last) - U.citeX(s.first) + 0.5));
  };
  // Bekker pages the site carries (the Problemata, Magna Moralia and a few
  // short treatises are not on it).
  U.corpusPages = () => W.filter((w) => w.id !== 'Isa').reduce((n, w) => n + U.pages(w), 0);
  U.chapters = (id) => D.workChapters[id] || {};
  U.chapterCount = (id) => Object.values(U.chapters(id)).reduce((n, b) => n + b.length, 0);
  U.bookSpan = (w, b) => (w.spans && w.spans[String(b)]) || null;
  // Translation names: "H. Rackham (Loeb, 1926)" → parts.
  U.transParts = (t) => {
    const m = /^(.*?)\s*\((.*?),?\s*(\d{4}(?:[–-]\d{2,4})?)\)\s*$/.exec(t.name) || /^(.*?)\s*\((.*)\)$/.exec(t.name);
    return { short: t.short, who: m ? m[1] : t.name, pub: m ? (m[2] || '').replace(/,$/, '') : '', year: m && m[3] ? m[3] : '' };
  };
  // The registry's divisions, with each work resolved.
  U.divisions = () => D.registry.categories.map((c) => ({
    numeral: c.numeral || '',
    title: c.title,
    appendix: !c.numeral,
    groups: c.subcategories
      ? c.subcategories.map((s) => ({ ref: s.ref, label: s.label, works: s.works.map((x) => byId[x.id]).filter(Boolean) }))
      : [{ ref: '', label: '', works: c.works.map((x) => byId[x.id]).filter(Boolean) }],
  }));
  U.divisionOf = (id) => U.divisions().find((d) => d.groups.some((g) => g.works.some((w) => w.id === id)));
  U.further = (id) => D.registry.further[id] || [];
  U.START = ['EN', 'Pol', 'Poet', 'DA', 'Meta', 'Cat'];
  U.RESUME = { work: 'EN', book: 1, cite: '1097b22', chapter: '7', trans: 'ostwald' };

  // ── Nicomachean Ethics I: the reading text ───────────────────────────────
  const GK = D.greek;
  const EN = D.english;
  const EN_TRANS = byId.EN.translations.map((t) => ({ ...t, ...U.transParts(t) }));
  U.EN_TRANS = EN_TRANS;
  U.trans = (id) => EN_TRANS.find((t) => t.id === id);
  U.TITLES = D.titles; // Ostwald's chapter titles, Book I
  U.ALL_TITLES = D.allTitles;

  // Split each Bekker column at the chapter starts it holds: a block is one
  // chapter's share of one column, Greek lines and English alike.
  const BLOCKS = [];
  (function buildBlocks() {
    let cur = null;
    GK.forEach((col, si) => {
      const starts = col.starts.slice().sort((a, b) => a.beforeLine - b.beforeLine || a.w - b.w);
      const bounds = [];
      if (!starts.length || !(starts[0].beforeLine === 1 && starts[0].w === 0)) bounds.push({ li: 0, wi: 0, chapter: cur, start: null });
      for (const s of starts) bounds.push({ li: s.beforeLine - 1, wi: s.w, chapter: s.chapter, start: s });
      bounds.forEach((b, k) => {
        const next = bounds[k + 1];
        const endLi = next ? next.li : col.lines.length - 1;
        const lines = [];
        for (let li = b.li; li <= endLi; li++) {
          const L = col.lines[li];
          const w0 = li === b.li ? b.wi : 0;
          let w1 = L.w.length;
          if (next && li === next.li) {
            if (next.wi === 0) continue;
            w1 = Math.min(next.wi, L.w.length);
          }
          if (w1 <= w0) continue;
          lines.push({ n: L.n, li, w0, w1, cont: w0 > 0 });
        }
        const e = EN[si];
        const r0 = b.start ? b.start.engOffset : 0;
        const r1 = next && next.start ? next.start.engOffset : e.rackham.text.length;
        const rk = {
          text: e.rackham.text.slice(r0, r1),
          bekker: e.rackham.bekker.filter((t) => t.offset >= r0 && t.offset < r1).map((t) => ({ ...t, offset: t.offset - r0 })),
          paras: e.rackham.paras.filter((p) => p > r0 && p < r1).map((p) => p - r0),
        };
        const piece = (arr) => {
          const x = (arr || []).find((p) => p.chapter === b.chapter);
          return x ? { text: x.text, bekker: x.bekker || [], cont: x.cont } : null;
        };
        BLOCKS.push({
          si, col: col.col, chapter: b.chapter, start: !!b.start, bekker: b.start ? b.start.bekker : '',
          lines, eng: { rackham: rk, ross: piece(e.ross), ostwald: piece(e.ostwald), peters: piece(e.peters) },
        });
        cur = b.chapter;
      });
    });
  })();
  U.BLOCKS = BLOCKS;
  U.GK = GK;
  U.colOf = (bk) => GK[bk.si];
  U.lineCite = (si, n) => `${GK[si].col}${n}`;
  U.showNum = (n) => n === 1 || n % 5 === 0;
  U.chapterList = () => (D.chapters['1'] || []).map((c) => ({ ch: c.chapter, bekker: c.bekker, title: D.titles[c.chapter] || '' }));
  U.bookList = () => Object.entries(D.chapters).map(([b, chs]) => ({ b: +b, n: chs.length, first: chs[0].bekker.split('–')[0], last: chs[chs.length - 1].bekker.split('–').pop(), chs }));

  // One Greek line as clickable tokens. `opts.hit` marks a form.
  U.lineHTML = (bk, L, opts = {}) => {
    const words = GK[bk.si].lines[L.li].w.slice(L.w0, L.w1);
    let out = '';
    words.forEach(([disp, k, pre, len], i) => {
      const wi = L.w0 + i;
      const word = disp.slice(pre, pre + len);
      const cls = 'tok' + (opts.hit && fold(word) === opts.hit ? ' hit' : '');
      out += esc(disp.slice(0, pre)) + `<span class="${cls}" data-k="${esc(k)}" data-s="${bk.si}" data-l="${L.li}" data-w="${wi}">${esc(word)}</span>` + esc(disp.slice(pre + len));
    });
    return out;
  };

  // A translation's share of a block, cut at its Bekker ticks. Each tick is
  // a .bk span the direction's CSS sets in the margin; .approx marks an
  // estimated one. Ostwald's [^1.3] become note buttons.
  U.engHTML = (bk, tid, opts = {}) => {
    const p = bk.eng[tid];
    if (!p || !p.text) return '';
    const text = p.text;
    const marks = [];
    for (const t of p.bekker || []) marks.push({ at: t.offset, kind: 'tick', n: t.n, real: t.real });
    if (tid === 'rackham') for (const a of p.paras || []) marks.push({ at: a, kind: 'para' });
    marks.sort((a, b) => a.at - b.at || (a.kind === 'para' ? -1 : 1));
    const col = GK[bk.si].col;
    const tick = (m) => `<span class="bk${m.real ? '' : ' approx'}" data-c="${col}${m.n}" title="${m.real ? 'Bekker ' : 'Bekker, estimated: '}${col}${m.n}">${m.n}</span>`;
    const note = (s) => esc(s).replace(/\[\^(\d+)\.(\d+)\]/g, (_, a, b) => `<button type="button" class="fn" data-act="fn:${a}.${b}" aria-label="Ostwald’s note ${b}">${b}</button>`);
    const paras = [[]];
    let pos = 0;
    const push = (s) => {
      const bits = s.split('\n');
      bits.forEach((bit, i) => { if (i > 0) paras.push([]); if (bit) paras[paras.length - 1].push(note(bit)); });
    };
    for (const m of marks) {
      push(text.slice(pos, m.at));
      pos = m.at;
      if (m.kind === 'para') { if (paras[paras.length - 1].length) paras.push([]); } else paras[paras.length - 1].push(tick(m));
    }
    push(text.slice(pos));
    const cls = opts.pclass || 'ep';
    return paras.filter((q) => q.length).map((q, i) => `<p class="${cls}${i === 0 && p.cont ? ' cont' : ''}">${q.join('')}</p>`).join('');
  };
  U.footnote = (id) => D.footnotes[id] || '';

  // The current translation set for the reader.
  U.readerTrans = (S) => {
    const left = S.trans;
    const right = S.cmp && S.cmp !== left ? S.cmp : null;
    return right ? [left, right] : [left];
  };

  // Find a line by citation, within Book I.
  U.findLine = (cite) => {
    const p = U.parseCite(cite);
    if (!p) return null;
    for (const bk of BLOCKS) {
      if (bk.col !== p.col) continue;
      for (const L of bk.lines) if (L.n === p.line && !L.cont) return { bk, L };
    }
    return null;
  };
  U.bookIRange = () => ({ first: `${GK[0].col}1`, last: `${GK[GK.length - 1].col}${GK[GK.length - 1].lines.length}` });
  // Which work carries a column (for a jump typed anywhere).
  U.workForCite = (cite) => {
    const x = U.citeX(cite);
    let best = null;
    for (const w of W) {
      if (!U.isBekker(w)) continue;
      const s = U.workSpan(w);
      if (!s) continue;
      if (x >= U.citeX(s.first) - 0.01 && x <= U.citeX(s.last) + 0.01) {
        for (const [b, sp] of Object.entries(w.spans)) if (x >= U.citeX(sp[0]) - 0.01 && x <= U.citeX(sp[1]) + 0.01) return { w, book: +b };
        best = best || { w, book: 1 };
      }
    }
    return best;
  };

  // ── The word sidebar's model (as WordPopup.svelte builds it) ─────────────
  const DIALECTS = ['attic', 'epic', 'doric', 'ionic', 'aeolic', 'homeric'];
  function splitParse(parse) {
    const m = /\(([^)]*)\)\s*$/.exec(parse || '');
    if (!m) return { text: (parse || '').trim(), dialect: '' };
    const named = m[1].split(/\s+/).filter((w) => DIALECTS.includes(w));
    if (!named.length) return { text: (parse || '').trim(), dialect: '' };
    const text = parse.slice(0, m.index).trim();
    if (named.includes('attic')) return { text, dialect: '' };
    return { text, dialect: named.length === 1 ? `${named[0]} only` : named.join(' ') };
  }
  U.cards = (key) => {
    const an = D.analyses[key] || [];
    const out = [];
    const seen = new Map();
    for (const a of an) {
      const keys = a.lsj && a.lsj.length ? a.lsj : [''];
      const exact = keys.length === 1;
      for (const k of keys) {
        const id = k || `lemma:${a.lemma}`;
        let c = seen.get(id);
        if (!c) {
          const meta = k ? D.heads[k] : null;
          c = { id, lsj: k, head: (meta && meta.head) || U.betaToGreek(a.lemma), hom: (meta && meta.hom) || '', gloss: a.gloss, exact, rows: [], ref: (k && D.lemmata[k]) || null };
          seen.set(id, c);
          out.push(c);
        }
        if (exact) { if (a.gloss) c.gloss = a.gloss; else if (!c.exact) c.gloss = ''; c.exact = true; } else if (!c.exact && !c.gloss && a.gloss) c.gloss = a.gloss;
        const row = splitParse(a.parse);
        if (!c.rows.some((r) => r.text === row.text && r.dialect === row.dialect)) c.rows.push(row);
      }
    }
    return out;
  };
  // Morpheus abbreviations spelt out.
  const LONG = { masc: 'masculine', fem: 'feminine', neut: 'neuter', nom: 'nominative', gen: 'genitive', dat: 'dative', acc: 'accusative', voc: 'vocative', sg: 'singular', pl: 'plural', dual: 'dual', pres: 'present', imperf: 'imperfect', fut: 'future', aor: 'aorist', perf: 'perfect', plup: 'pluperfect', futperf: 'future perfect', ind: 'indicative', subj: 'subjunctive', opt: 'optative', imperat: 'imperative', inf: 'infinitive', part: 'participle', act: 'active', mid: 'middle', pass: 'passive', mp: 'middle or passive', '1st': 'first person', '2nd': 'second person', '3rd': 'third person', comp: 'comparative', superl: 'superlative', adverbial: 'adverb', indeclform: 'indeclinable', 'nom/voc': 'nominative or vocative', 'nom/acc': 'nominative or accusative', 'nom/voc/acc': 'nominative, vocative or accusative', 'masc/fem': 'masculine or feminine', 'masc/neut': 'masculine or neuter', 'masc/fem/neut': 'any gender', 'gen/dat': 'genitive or dative', 'voc/acc': 'vocative or accusative', 'nom/acc/voc': 'nominative, accusative or vocative', 'dat/abl': 'dative' };
  U.longParse = (t) => String(t || '').split(/\s+/).map((w) => LONG[w] || w).join(' ');
  // The parse as named features, for a table.
  const FEAT = {
    case: ['nom', 'gen', 'dat', 'acc', 'voc', 'nom/voc', 'nom/acc', 'nom/voc/acc', 'gen/dat', 'voc/acc', 'nom/acc/voc'],
    number: ['sg', 'pl', 'dual'], gender: ['masc', 'fem', 'neut', 'masc/fem', 'masc/neut', 'masc/fem/neut'],
    tense: ['pres', 'imperf', 'fut', 'aor', 'perf', 'plup', 'futperf'], mood: ['ind', 'subj', 'opt', 'imperat', 'inf', 'part'],
    voice: ['act', 'mid', 'pass', 'mp'], person: ['1st', '2nd', '3rd'], degree: ['comp', 'superl'],
  };
  U.features = (t) => {
    const out = {};
    for (const w of String(t || '').split(/\s+/)) for (const [f, vals] of Object.entries(FEAT)) if (vals.includes(w)) out[f] = LONG[w] || w;
    if (/adverbial/.test(t)) out.form = 'adverb';
    if (/indeclform/.test(t)) out.form = 'indeclinable';
    return out;
  };
  U.lsj = (k) => D.lsj[k] || null;
  // Grammata's entry. The site may not restyle it, so every direction shows
  // this one neutral setting of it.
  U.t8 = (k) => {
    const e = U.lsj(k);
    if (!e) return '<div class="t8"><p class="t8-none">No dictionary entry for this form.</p></div>';
    const top = e.s.filter((s) => s.l <= 2).length;
    return `<div class="t8" lang="en"><div class="t8h"><b lang="grc">${esc(e.h)}</b>${e.gen ? ` <span lang="grc">${esc(e.gen)}</span>` : ''}<a class="t8-l" href="#" data-noop>Logeion ↗</a></div>
      <ol class="t8s">${e.s.map((s) => `<li class="l${Math.min(s.l, 4)}"><span class="t8n">${esc(s.n || 'I.')}</span><span class="t8g">${esc(s.g)}</span>${s.a.length ? `<span class="t8a">${s.a.map(esc).join(' · ')}</span>` : ''}</li>`).join('')}</ol>
      <p class="t8f">${e.total} sense${e.total === 1 ? '' : 's'}${top ? '' : ''} · citations on Logeion</p></div>`;
  };
  U.lemmaPage = (slug) => D.lemmaPages[slug];
  U.TOP = D.topLemmata;
  U.ALPHA = D.alphaAr;
  U.LEMMA_TOTAL = D.lemmaTotal;

  // ── Search: ἀρετή, any form, as the lemma data counts it ─────────────────
  U.search = (() => {
    const L = D.lemmaPages.arete;
    const groups = L.instancesByWork.map((g) => ({
      work: g.work, title: g.title, count: g.count,
      books: g.books.map((b) => ({ book: b.book, chapters: b.chapters.map((c) => ({ chapter: c.chapter, bekker: c.bekker, hits: c.instances.map(([col, line, form]) => ({ col, line, form, cite: `${col}${line}` })) })) })),
    }));
    return { q: 'ἀρετή', head: L.head, gloss: (L.glosses || [])[0] || '', count: L.count, works: L.byWork, groups };
  })();
  // A hit's Greek window, from the reading text (Book I only).
  U.hitWindow = (cite, form) => {
    const f = U.findLine(cite);
    if (!f) return null;
    const { bk, L } = f;
    const fo = fold(form);
    const all = [];
    for (const b of BLOCKS) for (const l of b.lines) all.push({ b, l });
    const at = all.findIndex((x) => x.b === bk && x.l === L);
    const pick = all.slice(Math.max(0, at - 1), at + 2);
    return pick.map(({ b, l }) => ({ n: l.n, cont: l.cont, cite: `${b.col}${l.n}`, html: U.lineHTML(b, l, { hit: fo }), here: b === bk && l === L }));
  };
  // The English at a hit: the stretch of a translation between the ticks
  // on either side of the line.
  U.engAt = (cite, tid = 'ross', max = 230) => {
    const p = U.parseCite(cite);
    if (!p) return '';
    for (const bk of BLOCKS) {
      if (bk.col !== p.col) continue;
      const piece = bk.eng[tid];
      if (!piece) continue;
      const ticks = piece.bekker || [];
      if (!ticks.length) continue;
      const first = bk.lines[0];
      const last = bk.lines[bk.lines.length - 1];
      if (!first || p.line < first.n || p.line > last.n) continue;
      let a = 0;
      let b = piece.text.length;
      for (const t of ticks) { if (t.n <= p.line) a = t.offset; else { b = t.offset; break; } }
      let s = piece.text.slice(a, b).replace(/\[\^[\d.]+\]/g, '').replace(/\s+/g, ' ').trim();
      if (s.length > max) s = s.slice(0, max).replace(/\s+\S*$/, '') + ' …';
      return s;
    }
    return '';
  };

  // ── Mockup state and routing ─────────────────────────────────────────────
  const PAGES = ['overview', 'home', 'work', 'reader', 'search', 'lexicon'];
  const DIRS = ['a', 'b', 'c', 'd'];
  const prefersDark = () => {
    const t = document.documentElement.dataset.theme;
    if (t) return t === 'dark';
    return !!(window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches);
  };
  const S = (U.S = {
    page: 'overview', dir: 'a', theme: prefersDark() ? 'dark' : 'light',
    width: window.innerWidth < 700 ? 'phone' : 'desktop', notes: window.innerWidth > 1100,
    workId: 'EN', view: 'both', trans: 'ostwald', cmp: null, word: null, card: null, panel: null,
    fs: 1, lh: 1, cw: 1, target: null, fn: null, fnAt: null, lex: 'arete', phoneLang: 'both', open: {},
  });
  function readHash() {
    const h = (location.hash || '').slice(1);
    const m = /^([abcd])-(home|work|reader|search|lexicon)$/.exec(h);
    if (m) { S.dir = m[1]; S.page = m[2]; } else if (h === 'overview') S.page = 'overview';
  }
  function writeHash() {
    const h = S.page === 'overview' ? 'overview' : `${S.dir}-${S.page}`;
    if (location.hash.slice(1) !== h) history.replaceState(null, '', `#${h}`);
  }

  const $ = (sel, el = document) => el.querySelector(sel);
  const $$ = (sel, el = document) => Array.from(el.querySelectorAll(sel));
  U.$ = $;
  U.$$ = $$;

  // The stage: one design page at 1440 (scaled to fit) or 390.
  const stageWrap = $('#stage-wrap');
  const box = $('#stage-box');
  const frame = $('#frame');
  const view = $('#view');
  const over = $('#over');
  const notes = $('#notes');

  // The frame is laid out at the design width and scaled down to fit, so
  // layout numbers (scrollTop, offsets) stay in design pixels.
  U.scale = 1;
  function fit() {
    if (S.page === 'overview') return;
    const side = S.notes && notes && notes.offsetParent && getComputedStyle(notes).position !== 'absolute' ? notes.offsetWidth + 20 : 0;
    const avail = Math.max(320, stageWrap.clientWidth - side - 24);
    const h = Math.max(420, window.innerHeight - $('#bar').offsetHeight - 20);
    const W0 = S.width === 'phone' ? 390 : 1440;
    const H0 = S.width === 'phone' ? 844 : 900;
    const s = S.width === 'phone' ? Math.min(1, h / H0, avail / W0) : Math.min(1, avail / W0);
    U.scale = s;
    frame.style.width = `${W0}px`;
    frame.style.height = `${Math.round((S.width === 'phone' ? Math.min(h, H0 * s) : h) / s)}px`;
    frame.style.transform = `scale(${s})`;
    box.style.width = `${Math.round(W0 * s)}px`;
    box.style.height = `${Math.round(frame.offsetHeight * s)}px`;
  }

  // Rendering. Each direction supplies T[dir][page]() → html, plus optional
  // T[dir].text(), .side(), .panel(), .after().
  function render(keepScroll) {
    writeHash();
    syncBar();
    document.body.classList.toggle('on-overview', S.page === 'overview');
    $('#overview').hidden = S.page !== 'overview';
    stageWrap.hidden = S.page === 'overview';
    if (S.page === 'overview') { window.scrollTo(0, 0); return; }
    const t = T[S.dir];
    frame.className = `frame dir-${S.dir} ${S.theme} ${S.width}`;
    const top = keepScroll ? U.scroller().scrollTop : 0;
    view.innerHTML = t[S.page] ? t[S.page](S) : `<p style="padding:3rem">Not drawn yet.</p>`;
    over.innerHTML = '';
    fit();
    if (S.page === 'reader') { fillHead(); fillText(); fillSide(); fillPanel(); }
    if (t.after) t.after(S);
    renderNotes();
    U.headH();
    const sc = U.scroller();
    if (keepScroll) sc.scrollTop = top; else sc.scrollTop = 0;
    if (S.target) { const c = S.target; S.target = null; requestAnimationFrame(() => U.goTo(c, true)); }
    tick();
  }
  U.render = render;
  // The sticky head's height, for panels that hang below it.
  U.headH = () => {
    const h = $('[data-sticky]', view);
    frame.style.setProperty('--head-h', `${h ? Math.round(h.getBoundingClientRect().height / U.scale) : 0}px`);
    document.documentElement.style.setProperty('--bar-h', `${$('#bar').offsetHeight}px`);
  };
  U.scroller = () => $('[data-scroll]', view) || view;

  function fillText() {
    const el = $('[data-text]', view);
    if (!el) return;
    const t = T[S.dir];
    el.innerHTML = t.text(S);
    const body = $('[data-body]', view);
    if (body) {
      body.classList.toggle('word-open', !!S.word);
      body.dataset.view = S.view;
      body.classList.toggle('cmp', !!(S.cmp && S.cmp !== S.trans));
      body.style.setProperty('--fs', S.fs);
      body.style.setProperty('--lh', S.lh);
      body.style.setProperty('--cw', S.cw);
    }
    if (S.word) markWord();
  }
  function fillSide() {
    const t = T[S.dir];
    const host = t.sideInline ? $('[data-side]', view) : over;
    if (!host) return;
    $$('.side-host', over).forEach((n) => n.remove());
    if (t.sideInline) { host.innerHTML = t.side(S); return; }
    if (!S.word) return;
    const div = document.createElement('div');
    div.className = 'side-host';
    div.innerHTML = t.side(S);
    over.appendChild(div);
  }
  function fillPanel() {
    $$('.panel-host', over).forEach((n) => n.remove());
    const t = T[S.dir];
    if (!S.panel && !S.fn) return;
    const div = document.createElement('div');
    div.className = 'panel-host';
    div.innerHTML = (S.fn && t.note ? t.note(S) : '') + (S.panel && t.panel ? t.panel(S) : '');
    over.appendChild(div);
  }
  U.fillText = fillText;
  U.fillSide = fillSide;
  U.fillPanel = fillPanel;
  function markWord() {
    $$('.tok.on', view).forEach((n) => n.classList.remove('on'));
    if (!S.word) return;
    const el = $(`.tok[data-s="${S.word.si}"][data-l="${S.word.li}"][data-w="${S.word.wi}"]`, view);
    if (el) el.classList.add('on');
  }

  // Keep the reading position when the text re-renders.
  // The first Greek line below the sticky head (binary search: the lines are
  // in document order, so their tops only grow).
  function topLine() {
    const sc = U.scroller();
    const r = sc.getBoundingClientRect();
    const head = $('[data-sticky]', view);
    const y0 = r.top + (head ? head.getBoundingClientRect().bottom - r.top : 0) + 30 * U.scale;
    const lines = $$('[data-cite]', view).filter((l) => l.offsetParent !== null);
    if (!lines.length) return null;
    let lo = 0;
    let hi = lines.length - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (lines[mid].getBoundingClientRect().bottom > y0) hi = mid; else lo = mid + 1;
    }
    return lines[lo].dataset.cite;
  }
  U.topLine = topLine;
  U.goTo = (cite, flash) => {
    const el = $(`[data-cite="${cite}"]`, view);
    const sc = U.scroller();
    if (!el || el.offsetParent === null) return false;
    const head = $('[data-sticky]', view);
    const off = head ? (head.getBoundingClientRect().bottom - sc.getBoundingClientRect().top) / U.scale : 0;
    const y = (el.getBoundingClientRect().top - sc.getBoundingClientRect().top) / U.scale + sc.scrollTop - Math.max(0, off) - 24;
    // Near the top, show the chapter head too.
    sc.scrollTop = y < 180 ? 0 : y;
    if (flash) { $$('.target', view).forEach((n) => n.classList.remove('target')); el.classList.add('target'); }
    tick();
    return true;
  };
  // Parts of a direction's head that follow the reading state.
  function fillHead() {
    const t = T[S.dir];
    if (!t.hp) return;
    $$('[data-hp]', view).forEach((n) => { const f = t.hp[n.dataset.hp]; if (f) n.innerHTML = f(S); });
  }
  U.fillHead = fillHead;
  function rerenderText() {
    const keep = topLine();
    fillHead();
    fillText();
    if (keep) U.goTo(keep);
    tick();
  }
  U.rerenderText = rerenderText;

  // The live location (Bekker line at the top of the text) and the chapter.
  function tick() {
    if (S.page !== 'reader') return;
    const c = topLine() || '1094a1';
    S.here = c;
    const bk = U.blockOfCite(c);
    S.hereCh = bk ? bk.chapter : '1';
    $$('[data-here]', view).forEach((n) => { n.textContent = c; if (n.tagName === 'INPUT' && document.activeElement !== n) n.value = c; });
    $$('[data-here-ch]', view).forEach((n) => { n.textContent = S.hereCh; });
    $$('[data-prog]', view).forEach((n) => { n.style.setProperty('--p', String(U.progress(c))); });
    $$('[data-ch-link]', view).forEach((n) => n.classList.toggle('now', n.dataset.chLink === S.hereCh));
    if (T[S.dir].tick) T[S.dir].tick(S);
  }
  U.tick = tick;
  U.blockOfCite = (c) => {
    const p = U.parseCite(c);
    if (!p) return null;
    let found = null;
    for (const bk of BLOCKS) { if (bk.col === p.col && bk.lines.some((l) => l.n <= p.line)) found = bk; }
    return found;
  };
  // Where a citation falls in Book I, 0–1.
  U.progress = (c) => {
    const x = U.citeX(c);
    const a = U.citeX(U.bookIRange().first);
    const b = U.citeX(U.bookIRange().last);
    return Math.max(0, Math.min(1, (x - a) / (b - a)));
  };

  // ── Events inside the design ─────────────────────────────────────────────
  function setWord(tok) {
    const k = tok.dataset.k;
    const si = +tok.dataset.s;
    const li = +tok.dataset.l;
    const wi = +tok.dataset.w;
    const L = GK[si].lines[li];
    S.word = { k, t: tok.textContent, si, li, wi, cite: `${GK[si].col}${L.n}` };
    S.card = null;
    const body = $('[data-body]', view);
    if (body) body.classList.add('word-open');
    markWord();
    fillSide();
  }
  U.setWord = setWord;
  U.stepWord = (d) => {
    const toks = $$('.tok', view);
    const at = toks.findIndex((t) => t.classList.contains('on'));
    const nx = toks[at + d];
    if (nx) { setWord(nx); nx.scrollIntoView({ block: 'nearest' }); }
  };

  view.addEventListener('click', onClick);
  over.addEventListener('click', onClick);
  function onClick(e) {
    const tok = e.target.closest('.tok');
    if (tok && S.page === 'reader') { e.preventDefault(); setWord(tok); return; }
    const a = e.target.closest('[data-go],[data-act],[data-noop],a[href="#"]');
    if (!a) {
      // A click outside the open panel closes it.
      if (S.panel && !e.target.closest('.panel-host,[data-keep]')) { S.panel = null; fillPanel(); syncActs(); }
      return;
    }
    e.preventDefault();
    if (a.dataset.go) return go(a.dataset.go);
    if (a.dataset.act) return act(a.dataset.act, a, e);
  }
  view.addEventListener('keydown', (e) => {
    const inp = e.target.closest('[data-jump]');
    if (inp && e.key === 'Enter') { e.preventDefault(); jump(inp.value, inp); }
    const sr = e.target.closest('[data-search]');
    if (sr && e.key === 'Enter') { e.preventDefault(); go('search'); }
  });
  view.addEventListener('input', (e) => {
    const r = e.target.closest('[data-range]');
    if (r) { S[r.dataset.range] = +r.value; const body = $('[data-body]', view); if (body) body.style.setProperty(`--${r.dataset.range}`, r.value); syncActs(); }
    const f = e.target.closest('[data-filter]');
    if (f && T[S.dir].filter) T[S.dir].filter(S, f.value, f);
  });
  over.addEventListener('input', (e) => {
    const r = e.target.closest('[data-range]');
    if (r) { S[r.dataset.range] = +r.value; const body = $('[data-body]', view); if (body) body.style.setProperty(`--${r.dataset.range}`, r.value); syncActs(); }
  });
  over.addEventListener('keydown', (e) => {
    const inp = e.target.closest('[data-jump]');
    if (inp && e.key === 'Enter') { e.preventDefault(); jump(inp.value, inp); }
  });
  view.addEventListener('scroll', onScroll, true);
  view.addEventListener('mousemove', (e) => { if (T[S.dir].move) T[S.dir].move(S, e); });
  view.addEventListener('mouseleave', (e) => { if (T[S.dir].move) T[S.dir].move(S, null); });
  let ticking = false;
  function onScroll() { if (ticking) return; ticking = true; requestAnimationFrame(() => { ticking = false; tick(); }); }

  // Navigation inside the design: "work:EN", "reader", "reader:1095b30",
  // "search", "lexicon:arete", "home".
  function go(to) {
    const [page, arg] = to.split(':');
    if (page === 'work') { S.workId = arg || 'EN'; S.page = 'work'; }
    else if (page === 'reader') {
      S.page = 'reader';
      S.word = null; S.panel = null; S.fn = null;
      if (arg && /^\d/.test(arg)) S.target = arg;
      if (arg === 'greek') S.view = 'greek';
      if (arg === 'compare') { S.cmp = S.trans === 'ross' ? 'ostwald' : 'ross'; S.view = 'both'; }
      if (arg && U.trans(arg)) { S.trans = arg; }
    }
    else if (page === 'lexicon') { S.page = 'lexicon'; if (arg) S.lex = arg; }
    else S.page = page;
    render();
  }
  U.go = go;

  function jump(val, inp) {
    const c = String(val || '').trim().toLowerCase().replace(/\s+/g, '');
    const p = U.parseCite(c);
    const say = (msg) => { const n = inp && inp.closest('[data-jump-host]'); const m = n && $('[data-jump-msg]', n); if (m) m.textContent = msg; };
    if (!p) { say('Type a Bekker number, such as 1094a1.'); return; }
    if (U.findLine(`${p.col}${p.line}`)) {
      if (S.page !== 'reader') { S.target = `${p.col}${p.line}`; S.page = 'reader'; render(); return; }
      S.panel = null; fillPanel();
      U.goTo(`${p.col}${p.line}`, true); say(''); return;
    }
    const hit = U.workForCite(c);
    if (hit) {
      if (hit.w.id === 'EN') say(`${p.col}${p.line} is in Book ${ROMAN[hit.book]}. This mockup carries Book I only.`);
      else { say(''); S.workId = hit.w.id; S.page = 'work'; render(); }
      return;
    }
    say(`No work in the corpus holds ${p.col}.`);
  }
  U.jump = jump;

  function act(name, el, e) {
    const [a, v] = name.split(':');
    const t = T[S.dir];
    switch (a) {
      // Two translations side by side: S.trans is the left column, S.cmp the
      // right. Choosing either one's partner swaps them.
      case 'view': S.view = v; rerenderText(); break;
      case 'trans': {
        const old = S.trans;
        S.trans = v;
        if (S.cmp === v) S.cmp = old === v ? null : old;
        if (S.view === 'greek') S.view = 'both';
        if (!t.keepPanelOnTrans) S.panel = null;
        rerenderText(); fillPanel(); break;
      }
      case 'cmp':
        if (v === 'off') S.cmp = null;
        else if (v === 'on' || v === 'toggle') {
          if (v === 'toggle' && S.cmp) S.cmp = null;
          else S.cmp = S.trans === 'ross' ? 'ostwald' : 'ross';
        } else if (v === S.trans) { S.trans = S.cmp || v; S.cmp = v === S.trans ? null : v; }
        else S.cmp = v;
        if (S.cmp && S.view === 'greek') S.view = 'both';
        if (!t.keepPanelOnTrans) S.panel = null;
        rerenderText(); fillPanel(); break;
      case 'swap': if (S.cmp) { const x = S.trans; S.trans = S.cmp; S.cmp = x; rerenderText(); } break;
      case 'panel': {
        S.panel = S.panel === v ? null : v;
        const r = el.getBoundingClientRect();
        const f = frame.getBoundingClientRect();
        S.panelAt = { x: (r.left - f.left) / U.scale, y: (r.bottom - f.top) / U.scale, r: (f.right - r.right) / U.scale, w: frame.offsetWidth };
        fillPanel(); break;
      }
      case 'close':
        if (v === 'word') { S.word = null; S.card = null; const body = $('[data-body]', view); if (body) body.classList.remove('word-open'); markWord(); fillSide(); }
        else if (v === 'fn') { S.fn = null; fillPanel(); }
        else { S.panel = null; fillPanel(); }
        break;
      case 'card': S.card = S.card === v ? null : v; fillSide(); break;
      case 'fn': {
        S.fn = S.fn === v ? null : v;
        const r = el.getBoundingClientRect();
        const f = frame.getBoundingClientRect();
        S.fnAt = { x: (r.left - f.left) / U.scale, y: (r.bottom - f.top) / U.scale };
        fillPanel(); break;
      }
      case 'ch': { S.panel = null; fillPanel(); const bk = BLOCKS.find((b) => b.chapter === v && b.start); if (bk) { const L = bk.lines.find((l) => !l.cont) || bk.lines[0]; U.goTo(`${bk.col}${L.n}`, false); } break; }
      case 'line': U.goTo(v, true); break;
      case 'step': U.stepWord(+v); break;
      case 'reset': S.fs = 1; S.lh = 1; S.cw = 1; rerenderText(); fillPanel(); break;
      case 'theme': S.theme = S.theme === 'dark' ? 'light' : 'dark'; render(true); break;
      case 'lang': S.phoneLang = v; S.view = v === 'greek' ? 'greek' : v === 'english' ? 'english' : 'both'; rerenderText(); break;
      case 'jumpgo': { const host = el.closest('[data-jump-host]'); const inp = host && $('[data-jump]', host); if (inp) jump(inp.value, inp); break; }
      default: if (t.act) t.act(S, a, v, el, e);
    }
    syncActs();
  }
  U.act = act;
  // Pressed states for view / translation controls.
  function syncActs() {
    $$('[data-act]', frame).forEach((n) => {
      const [a, v] = n.dataset.act.split(':');
      let on = null;
      if (a === 'view') on = S.view === v;
      else if (a === 'trans') on = S.trans === v;
      else if (a === 'cmp' && (v === 'toggle' || v === 'on')) on = !!S.cmp;
      else if (a === 'cmp' && v !== 'off') on = S.cmp === v;
      else if (a === 'panel') on = S.panel === v;
      else if (a === 'lang') on = S.phoneLang === v;
      if (on !== null) { n.setAttribute('aria-pressed', String(on)); n.classList.toggle('is-on', on); }
    });
    $$('[data-range]', frame).forEach((r) => { if (document.activeElement !== r) r.value = S[r.dataset.range]; const o = r.closest('label') && $('output', r.closest('label')); if (o) o.textContent = `${Math.round(S[r.dataset.range] * 100)}%`; });
  }
  U.syncActs = syncActs;

  // ── The mockup's own bar ──────────────────────────────────────────────────
  function syncBar() {
    $$('#bar [data-page]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.page === S.page)));
    $$('#bar [data-dir]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.dir === S.dir && S.page !== 'overview')));
    $$('#bar [data-theme-pick]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.themePick === S.theme)));
    $$('#bar [data-width]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.width === S.width)));
    $$('#bar [data-notes]').forEach((b) => b.setAttribute('aria-pressed', String(!!S.notes)));
    document.body.classList.toggle('notes-open', !!S.notes && S.page !== 'overview');
  }
  $('#bar').addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.page) { S.page = b.dataset.page; if (S.page === 'work') S.workId = 'EN'; S.word = null; S.panel = null; render(); }
    else if (b.dataset.dir) { S.dir = b.dataset.dir; if (S.page === 'overview') S.page = 'home'; S.word = null; S.panel = null; S.card = null; render(); }
    else if (b.dataset.themePick) { S.theme = b.dataset.themePick; render(true); }
    else if (b.dataset.width) { S.width = b.dataset.width; S.panel = null; render(); }
    else if (b.dataset.notes !== undefined) { S.notes = !S.notes; syncBar(); fit(); }
  });
  $('#overview').addEventListener('click', (e) => {
    const b = e.target.closest('[data-open]');
    if (!b) return;
    e.preventDefault();
    const [d, p] = b.dataset.open.split('-');
    S.dir = d; S.page = p || 'home'; S.word = null; S.panel = null; render();
  });
  document.addEventListener('keydown', (e) => {
    // ⌘K / Ctrl+K: the Go to field of whichever direction is showing.
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k' && S.page !== 'overview') {
      const f = $('[data-jump]', view);
      if (f) { e.preventDefault(); f.focus(); f.select(); }
      return;
    }
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    const t = e.target;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)) return;
    if (e.key >= '1' && e.key <= '4') { S.dir = DIRS[+e.key - 1]; if (S.page === 'overview') S.page = 'home'; S.word = null; S.panel = null; render(); }
    else if (e.key === 'ArrowRight' && !(S.page === 'reader' && S.word)) { S.page = PAGES[(PAGES.indexOf(S.page) + 1) % PAGES.length]; S.word = null; S.panel = null; render(); }
    else if (e.key === 'ArrowLeft' && !(S.page === 'reader' && S.word)) { S.page = PAGES[(PAGES.indexOf(S.page) + PAGES.length - 1) % PAGES.length]; S.word = null; S.panel = null; render(); }
    else if (S.page === 'reader' && S.word && (e.key === 'ArrowRight' || e.key === 'ArrowLeft')) { e.preventDefault(); U.stepWord(e.key === 'ArrowRight' ? 1 : -1); }
    else if (S.page === 'reader' && (e.key === 'g' || e.key === 'b' || e.key === 'e')) { act(`view:${{ g: 'greek', b: 'both', e: 'english' }[e.key]}`); }
    else if (S.page === 'reader' && (e.key === '[' || e.key === ']')) { const m = $('[data-jump-msg]', view) || $('.b-st-msg', view); if (m) m.textContent = 'This mockup carries Book I only.'; }
    else if (e.key === '/' && S.page !== 'overview') { e.preventDefault(); go('search'); }
    else if (e.key === 't') { S.theme = S.theme === 'dark' ? 'light' : 'dark'; render(true); }
    else if (e.key === 'p') { S.width = S.width === 'phone' ? 'desktop' : 'phone'; S.panel = null; render(); }
    else if (e.key === 'n') { S.notes = !S.notes; syncBar(); fit(); }
    else if (e.key === 'Escape') {
      if (S.panel || S.fn) { S.panel = null; S.fn = null; fillPanel(); syncActs(); }
      else if (S.word) act('close:word');
    }
  });
  window.addEventListener('resize', () => { fit(); U.headH(); });
  window.addEventListener('hashchange', () => { readHash(); render(); });

  // ── Notes beside the stage ───────────────────────────────────────────────
  function renderNotes() {
    const N = window.NOTES || {};
    const d = N[S.dir] || {};
    const p = (d.pages || {})[S.page] || '';
    notes.innerHTML = `<div class="n-in"><p class="n-k">Direction ${S.dir.toUpperCase()}</p><h2>${esc(d.name || '')}</h2><p class="n-idea">${d.idea || ''}</p>
      ${p ? `<h3>This page</h3><div class="n-p">${p}</div>` : ''}
      ${d.type ? `<h3>Type and colour</h3><p>${d.type}</p>` : ''}
      ${d.risk ? `<h3>The risk</h3><p>${d.risk}</p>` : ''}
      <h3>Try</h3><p class="n-try">${(d.tries && d.tries[S.page]) || 'Use the tabs above, or 1–4 for a direction, ← → for pages, t for dark, p for phone.'}</p></div>`;
  }

  // Boot once every direction has registered.
  U.boot = () => {
    readHash();
    if (!T[S.dir]) S.dir = 'a';
    render();
    window.addEventListener('load', fit);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { fit(); tick(); });
  };
})();
