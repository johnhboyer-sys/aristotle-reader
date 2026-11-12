// Pairing a search hit with its counterpart in the other language: the Greek
// a matched English word translates, or the English of a matched Greek word.
//
// The unit both sides share is a turn of the book's turnFlow, cut to one
// Stephanus section. A section alone is too coarse (a whole section of English
// under one word) and a turn alone too long (Timaeus' monologue runs pages).
// The Greek of a turn runs from its pin `g` to the next turn's; its English is
// cut where `es` says each section begins. A book with no turn flow falls back
// to Bekker tick spans, or a section when it has no ticks.
//
// Pure: no Svelte, no fetching. Ported between the sister readers as one file.
import type { BookData, Segment } from './data';
import { englishPlace, overlayPieces, plainEnglish, translationTexts } from './english-hit';
import { englishWords } from './search';
import type { TranslationRef } from './works';

type Ref = Pick<TranslationRef, 'id' | 'slot'>;
type Book = Pick<BookData, 'segments' | 'turnFlow'>;

/** English shown under a Greek hit: at most this many words, from the start
 * of the unit. */
export const PAIR_ENGLISH_WORDS = 60;
/** Greek shown under an English hit: at most this many lines, from the start
 * of the unit. */
export const PAIR_GREEK_LINES = 3;

/** One aligned unit of a book: a turn's part inside one section, or (with no
 * turn flow to go by) a whole section. */
export interface PairUnit {
  section: string;                                                  // column token
  greek: { n: number; from: number; to: number; text: string }[];   // line spans
  english: Record<string, string>;                                  // translation id → text
  /** The turn the unit is cut from; -1 for a whole section. */
  turn: number;
  /** Token index, within its section, of the unit's first Greek word. */
  first: number;
}

// A text the index counted words through, and the unit each part belongs to.
// `si` is the section a part falls in, for when that section has no unit.
interface Filed { text: string; cuts: { o: number; si: number; unit: PairUnit | undefined }[] }

export interface PairIndex {
  units: PairUnit[];
  /** @internal */ book: Book;
  /** @internal */ translations: Ref[];
  /** @internal Segment id → the unit of each Greek token, in token order. */
  owners: Map<string, PairUnit[]>;
  /** @internal Column → its units, in order. */
  bySection: Map<string, PairUnit[]>;
  /** @internal Translation id → segment id → the texts filed there, in order. */
  filed: Map<string, Map<string, Filed[]>>;
  /** @internal Segment id → whether the reference translation's turn slices
   * join to the section's text. */
  joins: Map<string, boolean>;
  /** @internal Segment id → its whole-section unit. */
  whole: Map<string, PairUnit>;
  /** @internal `${translation id} ${segment id}` → unitPieces, once asked for. */
  pieces: Map<string, UnitPiece[] | null>;
}

/** A stretch of a translation's text for a segment that lies in one unit, and
 * how many words the index counted in it. */
export interface UnitPiece { text: string; unit: PairUnit; words: number }

// A turn's English cut where each section begins. `c` is the section a piece
// opens, or undefined when it carries on in the section before it.
function cutBySection(text: string, es?: { o: number; c: string }[] | null) {
  const out: { from: number; to: number; c?: string }[] = [];
  let at = 0;
  let c: string | undefined;
  for (const m of es ?? []) {
    if (m.o < at || m.o > text.length) continue;
    if (m.o > at) out.push({ from: at, to: m.o, c });
    c = m.c;
    at = m.o;
  }
  out.push({ from: at, to: text.length, c });
  return out;
}

/** The aligned units of a book, and what the lookups below need. */
export function pairUnits(book: Book, translations: Ref[]): PairIndex {
  const segs = book.segments;
  const turns = book.turnFlow?.turns ?? [];
  const index: PairIndex = {
    units: [], book, translations,
    owners: new Map(), bySection: new Map(), filed: new Map(), joins: new Map(), whole: new Map(),
    pieces: new Map(),
  };
  // As turnTranslationTexts reads it, so an overlay is filed where the
  // pipeline filed it.
  const col = new Map(segs.map((s, i) => [s.column, i]));

  // Turns with a Greek pin, as (section, line, offset), in order.
  const pins: { turn: number; si: number; li: number; o: number }[] = [];
  turns.forEach((t, turn) => {
    const si = t.g ? col.get(t.g.c) : undefined;
    if (si === undefined) return;
    const lines = segs[si].greek;
    const li = lines.findIndex(l => l.n >= t.g!.n);
    pins.push(li < 0 ? { turn, si, li: lines.length, o: 0 }
      : { turn, si, li, o: lines[li].n === t.g!.n ? t.g!.o : 0 });
  });

  if (!pins.length) {
    for (const seg of segs) {
      const ticks = seg.english?.bekker ?? [];
      const starts = [...new Set([seg.greek[0]?.n ?? 1, ...ticks.map(t => t.n)])].sort((a,b) => a-b);
      const units = starts.map((n, i): PairUnit => {
        const end = starts[i+1] ?? Infinity;
        const greek = seg.greek.filter(l => l.n >= n && l.n < end);
        const unit: PairUnit = { section: seg.column, turn: -1,
          first: seg.greek.filter(l => l.n < n).reduce((sum,l) => sum+l.tokens.length,0),
          greek: greek.map(l => ({ n:l.n, from:0, to:l.text.length, text:l.text.trim() })), english:{} };
        for (const t of translations) unit.english[t.id] = bekkerEnglish(seg, t, n, end);
        return unit;
      }).filter(u => u.greek.length);
      index.units.push(...units);
      index.bySection.set(seg.column, units);
      index.owners.set(seg.id, seg.greek.flatMap(l => l.tokens.map(() => units.find(u => u.greek.some(g => g.n === l.n))!)));
    }
    return index;
  }

  // Every Greek token goes to the last pin at or before it; a turn's tokens in
  // one section are one unit. Tokens before the first pin join the first turn.
  const cells = new Map<string, PairUnit>();   // `${turn}:${si}`
  let p = 0;
  segs.forEach((seg, si) => {
    const own: PairUnit[] = [];
    seg.greek.forEach((line, li) => {
      let open: { unit: PairUnit; span: PairUnit['greek'][number] } | undefined;
      const spans: PairUnit['greek'] = [];
      line.tokens.forEach((tok, ti) => {
        for (let next = pins[p + 1]; next && (next.si < si
          || (next.si === si && (next.li < li || (next.li === li && next.o <= tok.o))));
          next = pins[p + 1]) p++;
        const key = `${pins[p].turn}:${si}`;
        let unit = cells.get(key);
        if (!unit) {
          unit = { section: seg.column, greek: [], english: {}, turn: pins[p].turn, first: own.length };
          cells.set(key, unit);
          index.units.push(unit);
          (index.bySection.get(seg.column) ?? index.bySection.set(seg.column, []).get(seg.column)!).push(unit);
        }
        if (open?.unit !== unit) {
          if (open) open.span.to = tok.o;
          const span = { n: line.n, from: ti ? tok.o : 0, to: line.text.length, text: '' };
          unit.greek.push(span);
          spans.push(span);
          open = { unit, span };
        }
        own.push(unit);
      });
      for (const span of spans) span.text = line.text.slice(span.from, span.to).trim();
    });
    index.owners.set(seg.id, own);
  });

  // An English piece goes to its own turn's unit in its section. Where that
  // turn has no Greek in the section (its English runs a few words past its
  // Greek, or it is an English-only residual), the piece joins the nearest
  // turn's unit there, the earlier one on a tie.
  const attach = (turn: number, si: number, id: string, text: string): PairUnit | undefined => {
    let unit = cells.get(`${turn}:${si}`);
    if (!unit) {
      for (const u of index.bySection.get(segs[si].column) ?? []) {
        if (!unit || Math.abs(u.turn - turn) < Math.abs(unit.turn - turn)) unit = u;
      }
    }
    const piece = text.trim();
    if (unit && piece) unit.english[id] = unit.english[id] ? `${unit.english[id]} ${piece}` : piece;
    return unit;
  };
  const file = (id: string, si: number, f: Filed) => {
    const bySeg = index.filed.get(id) ?? index.filed.set(id, new Map()).get(id)!;
    (bySeg.get(segs[si].id) ?? bySeg.set(segs[si].id, []).get(segs[si].id)!).push(f);
  };

  for (const t of translations) {
    if (t.slot === 'english') {
      // The reference translation: a section's text is its turn slices in
      // order. A slice opens in the section the English before it ended in,
      // which need not be the section of the turn's Greek pin.
      let si = 0;
      const lead = book.turnFlow?.leadE;
      if (lead) file(t.id, 0, { text: lead, cuts: [{ o: 0, si: 0, unit: attach(-1, 0, t.id, lead) }] });
      turns.forEach((turn, i) => {
        for (const part of [turn, ...(turn.sub ?? [])]) {
          if (!part.e) continue;
          for (const cut of cutBySection(part.e, part.es)) {
            si = (cut.c === undefined ? undefined : col.get(cut.c)) ?? si;
            const text = part.e.slice(cut.from, cut.to);
            if (text) file(t.id, si, { text, cuts: [{ o: 0, si, unit: attach(i, si, t.id, text) }] });
          }
        }
      });
    } else if (t.slot === 'overlay') {
      // A turn-aligned translation: the index files a whole turn under the
      // section its Greek starts in (turnTranslationTexts), wherever its words
      // fall. `es` says where they do.
      let current = 0;
      turns.forEach((turn, i) => {
        current = (turn.g ? col.get(turn.g.c) : undefined) ?? current;
        const alt = turn.alt?.[t.id];
        if (!alt?.e) return;
        const f: Filed = { text: alt.e, cuts: [] };
        let si = current;
        for (const cut of cutBySection(alt.e, alt.es)) {
          si = (cut.c === undefined ? undefined : col.get(cut.c)) ?? si;
          f.cuts.push({ o: cut.from, si, unit: attach(i, si, t.id, alt.e.slice(cut.from, cut.to)) });
        }
        file(t.id, current, f);
      });
    }
  }
  return index;
}

// The old B-view rule: text from the last tick at or before the line,
// up to the next tick. Other translations use their own tick offsets.
export function bekkerEnglish(seg: Segment, t: Ref, from: number, to: number): string {
  const pieces = t.slot === 'english' ? (seg.english ? [seg.english] : []) : overlayPieces(seg,t);
  const start = (piece: typeof pieces[number]) => {
    const chapter = 'chapter' in piece ? piece.chapter : undefined;
    const cont = 'cont' in piece && piece.cont;
    return cont ? seg.greek[0]?.n ?? 1 : seg.chapterStarts?.find(c => c.chapter === chapter)?.beforeLine ?? piece.bekker?.[0]?.n ?? seg.greek[0]?.n ?? 1;
  };
  return pieces.map((piece, k) => {
    if (to <= start(piece) || from >= (pieces[k+1] ? start(pieces[k+1]) : Infinity)) return '';
    const ticks = piece.bekker ?? [];
    let at = -1;
    for (let i=0;i<ticks.length;i++) { if (ticks[i].n <= from) at=i; else break; }
    const end = ticks.find(t => t.n >= to)?.offset ?? piece.text.length;
    return piece.text.slice(at >= 0 ? ticks[at].offset : 0, end).trim();
  }).filter(Boolean).join(' ');
}

/** Widen both languages by the same number of Greek lines, keeping the
 * original unit as the key used to merge hits. Turn units stay unchanged. */
export function pairContext(index: PairIndex, seg: Segment, unit: PairUnit, context: '1' | '3' | 's'): PairUnit {
  if (index.book.turnFlow || context === '1') return unit;
  const reach = context === 's' ? Infinity : 1;
  const from = unit.greek[0]?.n ?? 1;
  const to = unit.greek.at(-1)?.n ?? from;
  const greek = seg.greek.filter(l => l.n >= from-reach && l.n <= to+reach);
  return { ...unit, greek: greek.map(l => ({n:l.n,from:0,to:l.text.length,text:l.text})),
    english: Object.fromEntries(index.translations.map(t => [t.id, bekkerEnglish(seg,t,from-reach,to+reach+1)])) };
}

// A whole section as one unit: every Greek line, every translation's text.
function wholeSection(index: PairIndex, seg: Segment): PairUnit {
  let unit = index.whole.get(seg.id);
  if (!unit) {
    unit = {
      section: seg.column, turn: -1, first: 0, english: {},
      greek: seg.greek.map(l => ({ n: l.n, from: 0, to: l.text.length, text: l.text.trim() })),
    };
    for (const t of index.translations) {
      let texts = translationTexts(seg, t);
      if (!texts.length) texts = (index.filed.get(t.id)?.get(seg.id) ?? []).map(f => f.text);
      const text = texts.map(s => s.trim()).filter(Boolean).join(' ');
      if (text) unit.english[t.id] = text;
    }
    index.whole.set(seg.id, unit);
  }
  return unit;
}

/** The unit holding the Greek token at `pos` (a token index within the
 * segment, as the index counts them). A unit with no Greek is never chosen. */
export function unitAtGreek(index: PairIndex, seg: Segment, pos: number): PairUnit {
  const own = index.owners.get(seg.id);
  return own?.[Math.min(Math.max(pos, 0), own.length - 1)] ?? wholeSection(index, seg);
}

/** Whether the reference translation's turn slices, joined in order, are the
 * section's text word for word. Where they are not, a word position cannot be
 * counted through the slices, and unitAtEnglish answers with the section. */
export function referenceJoinHolds(index: PairIndex, seg: Segment, t: Ref): boolean {
  let holds = index.joins.get(seg.id);
  if (holds === undefined) {
    const want = englishWords(seg.english?.text ?? '');
    const got = (index.filed.get(t.id)?.get(seg.id) ?? []).flatMap(f => englishWords(f.text));
    holds = want.length === got.length && want.every((w, i) => w.word === got[i].word);
    index.joins.set(seg.id, holds);
  }
  return holds;
}

/** A translation's texts for `seg` (translationTexts), cut finer: each piece
 * lies in one unit, and the pieces hold the same words in the same order, so
 * the index's word positions count through them unchanged and a passage drawn
 * from one piece never shows another unit's words. Undefined where the words
 * cannot be placed in turns: no turn data, a translation cut by section, or
 * a reference section whose slices do not join to its text. */
export function unitPieces(index: PairIndex, seg: Segment, t: Ref): UnitPiece[] | undefined {
  const key = `${t.id} ${seg.id}`;
  let pieces = index.pieces.get(key);
  if (pieces === undefined) {
    // A translation cut by section on the segment itself (translationTexts
    // reads those first) was indexed from those pieces, not from the turns.
    const placed = t.slot === 'english' ? referenceJoinHolds(index, seg, t) : !translationTexts(seg, t).length;
    const filed = placed ? index.filed.get(t.id)?.get(seg.id) : undefined;
    pieces = filed ? [] : null;
    for (const f of filed ?? []) {
      const unit = (c: Filed['cuts'][number]) => c.unit ?? wholeSection(index, index.book.segments[c.si]);
      const whole = englishWords(f.text).length;
      const parts = f.cuts.map((c, i) => {
        const text = f.text.slice(c.o, f.cuts[i + 1]?.o ?? f.text.length);
        return { text, unit: unit(c), words: englishWords(text).length };
      });
      // A cut inside a word would change the count: leave that text whole.
      if (parts.reduce((n, part) => n + part.words, 0) === whole) pieces!.push(...parts.filter(part => part.text));
      else pieces!.push({ text: f.text, unit: unit(f.cuts[0]), words: whole });
    }
    index.pieces.set(key, pieces);
  }
  return pieces ?? undefined;
}

/** The unit holding an English word: `wordPos` is the index's word position,
 * counted through the translation's texts for `seg` (translationTexts). The
 * whole section when the word cannot be placed in a turn. */
export function unitAtEnglish(index: PairIndex, seg: Segment, t: Ref, wordPos: number): PairUnit {
  if (!index.book.turnFlow) {
    const words = translationTexts(seg,t).flatMap(text => englishWords(text));
    const place = englishPlace(seg,t,[wordPos],[words[wordPos]?.word ?? '*'],false);
    const units = index.bySection.get(seg.column) ?? [];
    return units.find(u => u.greek.some(l => l.n === place?.line)) ?? wholeSection(index,seg);
  }
  let n = wordPos;
  for (const piece of unitPieces(index, seg, t) ?? []) {
    if (n < piece.words) return piece.unit;
    n -= piece.words;
  }
  return wholeSection(index, seg);
}

/** The unit's English in one translation, '' when it has none. With `near`,
 * a unit without any (a few Greek words past where its English was cut) takes
 * the nearest unit's in the same section. */
export function unitEnglish(index: PairIndex, unit: PairUnit, id: string, near = false): string {
  if (unit.english[id] || !near) return unit.english[id] ?? '';
  const peers = index.bySection.get(unit.section) ?? [];
  const at = peers.indexOf(unit);
  let best = '';
  let gap = Infinity;
  peers.forEach((u, i) => {
    if (u.english[id] && Math.abs(i - at) < gap) { best = u.english[id]; gap = Math.abs(i - at); }
  });
  return best;
}

/** A whole section in one translation, '' when it has none there. The
 * reference translation is the segment's own text, and so is a translation
 * cut by section; a turn-aligned one is its words that fall in the section,
 * unit by unit in order. Not the texts the index filed under the segment: it
 * files a turn where its Greek starts, wherever its words fall. */
export function sectionEnglish(index: PairIndex, seg: Segment, t: Ref): string {
  if (t.slot === 'english') return seg.english?.text ?? '';
  const own = translationTexts(seg, t);
  if (own.length) return own.map(s => s.trim()).filter(Boolean).join(' ');
  return (index.bySection.get(seg.column) ?? []).map(u => u.english[t.id]).filter(Boolean).join(' ');
}

/** English to print under a Greek hit: plain text, cut to PAIR_ENGLISH_WORDS. */
export function pairEnglishText(text: string): string {
  const words = plainEnglish(text).split(/\s+/).filter(Boolean);
  return words.length > PAIR_ENGLISH_WORDS
    ? `${words.slice(0, PAIR_ENGLISH_WORDS).join(' ')} …`
    : words.join(' ');
}

/** Greek to print under an English hit: the unit's first PAIR_GREEK_LINES lines. */
export function pairGreekText(unit: PairUnit): string {
  const lines = unit.greek.map(s => s.text).filter(Boolean);
  return lines.slice(0, PAIR_GREEK_LINES).join(' ') + (lines.length > PAIR_GREEK_LINES ? ' …' : '');
}

/** The context control counts Greek lines, centred on the hit's line. */
export function pairGreekWindow(seg: Segment, unit: PairUnit, line: number, context: '1' | '3' | 's'): PairUnit {
  if (context === 's') return unit;
  const count = Number(context);
  const at = Math.max(0, seg.greek.findIndex(l => l.n >= line));
  const from = Math.max(0, Math.min(at - Math.floor(count / 2), seg.greek.length - count));
  return { ...unit, greek: seg.greek.slice(from, from + count).map(l => ({ n: l.n, from: 0, to: l.text.length, text: l.text })) };
}

/** English window within the aligned span. A hit supplies its character
 * offset; otherwise ticks place the Greek line in this translator's text. */
export function pairEnglishWindow(seg: Segment, t: Ref, unit: PairUnit, line: number, greekWords: number, hitOffset?: number): string {
  const text = plainEnglish(unit.english[t.id] ?? '');
  let center = hitOffset;
  if (center === undefined) {
    const pieces = t.slot === 'english' ? (seg.english ? [seg.english] : []) : overlayPieces(seg, t);
    for (const piece of pieces) {
      const ticks = piece.bekker ?? [];
      const before = [...ticks].reverse().find(tick => tick.n <= line);
      const after = ticks.find(tick => tick.n > line);
      if (!before) continue;
      const end = after ?? { n: (seg.greek.at(-1)?.n ?? line) + 1, offset: piece.text.length };
      const offset = before.offset + (end.offset - before.offset) * (line - before.n) / Math.max(1, end.n - before.n);
      // The span is a trimmed slice of this piece (possibly with its peers).
      const plainPiece = plainEnglish(piece.text);
      const start = plainPiece.indexOf(text);
      if (start >= 0) { center = plainEnglish(piece.text.slice(0, Math.round(offset))).length - start; break; }
      const anchor = plainEnglish(piece.text.slice(before.offset, after?.offset)).trim();
      const inSpan = text.indexOf(anchor);
      if (anchor && inSpan >= 0) { center = inSpan + plainEnglish(piece.text.slice(before.offset, Math.round(offset))).length; break; }
    }
  }
  const words = [...text.matchAll(/\S+/g)];
  if (!words.length) return '';
  const count = Math.min(80, Math.max(30, Math.round(greekWords * 1.4)));
  const found = words.findIndex(w => w.index! + w[0].length > (center ?? 0));
  const at = found < 0 ? words.length - 1 : found;
  const from = Math.max(0, Math.min(at - Math.floor(count / 2), words.length - count));
  const to = Math.min(words.length, from + count);
  return (from ? '… ' : '') + text.slice(words[from].index, words[to - 1].index! + words[to - 1][0].length) + (to < words.length ? ' …' : '');
}
