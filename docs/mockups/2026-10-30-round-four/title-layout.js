/* Title settings for B's posters, after round four. John: "I think title
   could to be bigger. It should fill the picture. Not like the letters are so
   big they cover every inch, but rather we bump up the pt a bit and space out
   the words and play with kearning." Then: "Let a word break and wrap."

   TL.set(title, kind, opt, w100) gives a poster title's lines: each line's
   text, size, letter spacing, word spacing and line height. kind is
   'desktop' or 'phone'; w100(s) is the width of s in Sofia Sans SemiBold at
   100px. For 'now' it gives null: the title as round four sets it, sized by
   TL.now. Used by titles.html and title-options.cjs. */
(function (root) {
  'use strict';
  // The poster and the room for its title (round four's dir-b.css).
  const BOX = {
    desktop: { w: 1440, h: 600, W: 1296, top: 30, bottom: 26 },
    phone: { w: 390, h: 488, W: 354, top: 18, bottom: 16 },
  };
  // Whole words: now, justified, stacked, stacked-spread.
  // Words may break: block, block-big, block-spread.
  const OPTIONS = ['now', 'justified', 'stacked', 'stacked-spread', 'block', 'block-big', 'block-spread'];

  // Round four's rule (dir-b.js fz): the largest size at which the longest
  // word fits the width and the wrapped lines fit a share of the height.
  const SIZE = {
    desktop: { hero: { w: 1296, h: 600, max: 176 }, work: { w: 1296, h: 600, max: 230 } },
    phone: { hero: { w: 354, h: 488, max: 64 }, work: { w: 354, h: 488, max: 66 } },
  };
  const CAPW = { A: 0.579, B: 0.568, C: 0.62, D: 0.633, E: 0.524, F: 0.497, G: 0.644, H: 0.652, I: 0.249, J: 0.252, K: 0.585, L: 0.469, M: 0.764, N: 0.653, O: 0.634, P: 0.539, Q: 0.634, R: 0.596, S: 0.54, T: 0.532, U: 0.635, V: 0.584, W: 0.848, X: 0.565, Y: 0.544, Z: 0.538, ',': 0.234, '.': 0.235, '’': 0.234 };
  const wordW = (x, f) => [...x].reduce((n, ch) => n + (CAPW[ch] || 0.62), 0) * f * 1.02;
  function count(words, f, w) {
    let n = 1;
    let line = 0;
    for (const x of words) {
      const ww = wordW(x, f);
      if (line && line + 0.2 * f + ww > w) { n++; line = ww; } else line += (line ? 0.2 * f : 0) + ww;
    }
    return n;
  }
  function now(title, kind, poster) {
    const box = SIZE[kind][poster];
    const share = poster === 'hero' ? 0.82 : 0.72;
    const words = title.toUpperCase().split(/\s+/);
    let f = box.max;
    while (f > 18 && (Math.max(...words.map((x) => wordW(x, f))) > box.w || count(words, f, box.w) * 0.9 * f > box.h * share)) f -= 2;
    return f;
  }

  function set(orig, kind, opt, w100) {
    if (opt === 'now') return null;
    const title = orig.toUpperCase();
    const phone = kind === 'phone';
    const { W, h, top, bottom } = BOX[kind];
    const Havail = h - top - bottom;
    const words = title.split(/\s+/);
    const nat = (line, f) => (w100(line) * f) / 100;
    const splits = [];
    const rec = (i, acc) => {
      if (i === words.length) { splits.push(acc); return; }
      if (acc.length >= 5) return;
      for (let j = i + 1; j <= words.length; j++) rec(j, [...acc, words.slice(i, j).join(' ')]);
    };
    rec(0, []);
    // Spread a line to the width: word spaces up to 1em more, then letters
    // up to Lmax em. A line that would need more stays short.
    const spread = (line, f, Lmax) => {
      const extra = W - nat(line, f);
      const k = line.split(' ').length;
      const n = line.length;
      const S = k > 1 ? Math.min(extra / (k - 1), 1.0 * f) : 0;
      const rem = extra - S * (k - 1);
      const need = n > 1 ? rem / (n - 1) : Infinity;
      if (need <= Lmax * f + 0.01) return { S, L: Math.max(0, need), filled: true, Lem: Math.max(0, need) / f, short: 0 };
      return { S: 0, L: 0, filled: false, Lem: 0, short: 1 - nat(line, f) / W };
    };
    // Justified: one size, as large as fits the share of the height.
    const justified = (Lmax, share) => {
      for (let f = phone ? 96 : 260; f >= 20; f -= 1) {
        let best = null;
        for (const sp of splits) {
          if (sp.some((l) => nat(l, f) > W)) continue;
          if (sp.length * 0.9 * f > share * Havail) continue;
          const s = sp.map((l) => spread(l, f, Lmax));
          const bad = s.reduce((a, x) => a + (x.filled ? x.Lem * x.Lem : 0.05 + 2 * x.short * x.short), 0) + sp.length * 0.002;
          if (!best || bad < best.bad) best = { bad, sp, s };
        }
        if (best) return best.sp.map((l, i) => ({ text: l, f, ...best.s[i] }));
      }
      return [];
    };
    // Stacked: each line at its own size, filling the width; sizes within
    // 2.2 times of each other. A title that would end up on one line while
    // justified gives two takes the justified setting instead.
    const stacked = (share) => {
      let best = null;
      for (const sp of splits) {
        const fs2 = sp.map((l) => (W / w100(l)) * 100 * 0.995);
        const mn = Math.min(...fs2), mx = Math.max(...fs2);
        if (mx / mn > 2.2) continue;
        if (fs2.reduce((a, f) => a + 0.9 * f, 0) > share * Havail) continue;
        const sum = fs2.reduce((a, f) => a + f, 0);
        if (!best || mn * 2 + sum * 0.2 > best.score) best = { score: mn * 2 + sum * 0.2, sp, fs2 };
      }
      const st = best ? best.sp.map((l, i) => ({ text: l, f: best.fs2[i], S: 0, L: 0 })) : null;
      const j = justified(0.15, share);
      return st && !(st.length === 1 && j.length > 1) ? st : j;
    };
    // Block: words may break between letters, keeping at least minPiece
    // letters on each side; every line but the last meets both edges.
    const block = (share, base, minPiece) => {
      const txt = title;
      const ok = [];
      for (let i = 1; i < txt.length; i++) {
        if (txt[i] === ' ') { ok.push({ i, sp: true }); continue; }
        if (txt[i - 1] === ' ') continue;
        const ws = txt.lastIndexOf(' ', i - 1) + 1;
        let we = txt.indexOf(' ', i); if (we < 0) we = txt.length;
        const left = txt.slice(ws, i).replace(/[^A-Z]/g, '').length;
        const right = txt.slice(i, we).replace(/[^A-Z]/g, '').length;
        if (left >= minPiece && right >= minPiece) ok.push({ i, sp: false });
      }
      const natL = (line, f) => nat(line, f) + base * f * (line.length - 1);
      const pts = [{ i: 0, sp: false }, ...ok, { i: txt.length, sp: false }];
      for (let f = phone ? 110 : 300; f >= 20; f -= 1) {
        // best[b]: the cheapest way to set the text up to break point b
        const best = pts.map(() => null);
        best[0] = { cost: 0, prev: -1, n: 0 };
        for (let b = 1; b < pts.length; b++) {
          for (let a = b - 1; a >= 0; a--) {
            if (!best[a]) continue;
            const line = txt.slice(pts[a].i + (pts[a].sp ? 1 : 0), pts[b].i);
            if (!line) continue;
            const w = natL(line, f);
            // letters may close up by 0.03em to fit
            if (w - 0.03 * f * (line.length - 1) > W) break;
            const last = b === pts.length - 1;
            const pieces = line.split(' ').map((x) => x.replace(/[^A-Z]/g, '').length);
            const startsMid = a > 0 && !pts[a].sp;
            const endsMid = !last && !pts[b].sp;
            if ((startsMid && pieces[0] < minPiece) || (endsMid && pieces[pieces.length - 1] < minPiece)) continue;
            // a line must reach both edges once its word spaces open up by
            // up to 1em each and its letters by up to 0.15em
            const nsp = (line.match(/ /g) || []).length;
            if (!last && w + nsp * f + (line.length - 1) * 0.15 * f < W) continue;
            const cost = best[a].cost + (last ? 0.3 : 1) * 10 * Math.min(1, 1 - w / W) ** 2 + (endsMid ? 0.6 : 0);
            if (!best[b] || cost < best[b].cost) best[b] = { cost, prev: a, n: best[a].n + 1 };
          }
        }
        const end = best[pts.length - 1];
        if (!end || end.n * 0.88 * f > share * Havail) continue;
        const out = [];
        for (let b = pts.length - 1; b > 0; b = best[b].prev) out.unshift(txt.slice(pts[best[b].prev].i + (pts[best[b].prev].sp ? 1 : 0), pts[b].i));
        return out.map((line, k) => {
          const extra = W - natL(line, f);
          const nsp = (line.match(/ /g) || []).length;
          const S = nsp ? Math.max(0, Math.min(extra / nsp, f)) : 0;
          const dL = line.length > 1 ? (extra - S * nsp) / (line.length - 1) : 0;
          // a last line that would need wide letter spacing stays short
          if (k === out.length - 1 && dL > 0.15 * f) return { text: line, f, L: base * f, S: 0, lh: 0.88 };
          return { text: line, f, L: base * f + dL, S, lh: 0.88 };
        });
      }
      return [];
    };
    return {
      justified: () => justified(0.15, 0.85),
      stacked: () => stacked(0.8),
      'stacked-spread': () => stacked(0.97),
      block: () => block(phone ? 0.55 : 0.8, 0, 3),
      'block-big': () => block(0.88, 0.03, 3),
      'block-spread': () => block(0.88, 0.03, 3),
    }[opt]();
  }

  // The lines as HTML: one block per line, its spacing set inline. The
  // trailing letter space is taken back so a line ends at the edge.
  const html = (lines) => lines.map((x) => `<span style="display:block;white-space:pre;font-size:${x.f.toFixed(1)}px;line-height:${x.lh || 0.9};letter-spacing:${x.L.toFixed(2)}px;word-spacing:${x.S.toFixed(2)}px;margin-right:${(-x.L).toFixed(2)}px">${x.text}</span>`).join('');

  root.TL = { BOX, OPTIONS, set, now, html, spreads: (opt) => opt.endsWith('-spread') };
})(typeof window !== 'undefined' ? window : globalThis);
