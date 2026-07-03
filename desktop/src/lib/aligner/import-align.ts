// Import-time alignment orchestration: what the import flow runs after tag
// scanning, and how the result becomes something the Reader can display.
//
// Density decides how gaps are filled (detected density — never the file's
// word for it):
//   exhaustive / five-line-or-column → the printed tags ARE the anchors
//     (confidence 'tagged'); single lines between them are interpolated by
//     Greek word-count and labelled estimates.
//   chapter-only → the TF-IDF+DP engine places column/half-column anchors
//     against the work's milestoned primary translation, then interpolates.
//   none → not alignable (we cannot even split chapters); the import flow
//     surfaces this and asks for at least {book.chapter} tags.
//
// Emission mirrors stage1_ross: each chapter's prose is sliced across the
// book's column segments proportionally between anchors, producing overlay
// pieces ({chapter, text, cont, bekker ticks with real/estimate flags}) in
// exactly the shape Reader.svelte renders from seg.overlays[id].

import type { BookData, RossPiece } from '../../../../app/src/lib/data';
import { alignChapter, dedupMonotonic, interpolate, snapWord, type Anchor, type ChapterInput } from './engine';
import type { EmphasisSpan, InlineTag, TagDensity } from '../translation-file';

export interface ChapterAlignment {
  book: number;
  chapter: string;
  text: string;               // the chapter's clean prose (tags stripped)
  anchors: Anchor[];
  emphasis: EmphasisSpan[];   // offsets into `text`, carried through unchanged (alignment never rewrites the chapter's own text/offsets)
  stats: { tagged: number; placed: number; interpolated: number };
}

/** Align one imported chapter according to the file's detected density. */
export function alignImportedChapter(
  input: ChapterInput,
  tags: InlineTag[],
  density: TagDensity,
  emphasis: EmphasisSpan[] = [],
): ChapterAlignment {
  let anchors: Anchor[];
  const cited = tags.filter(t => t.citation);
  if (density === 'chapter-only' || cited.length === 0) {
    // No usable in-chapter tags: DP against the milestoned reference.
    anchors = alignChapter(input, null);
  } else {
    // The printed tags are the truth; nothing model-placed outranks them.
    anchors = [{
      citation: input.citation, offset: 0, tier: 'chapter', confidence: 'certain', score: 0, flags: [],
    }];
    for (const t of cited) {
      if (t.citation === input.citation) continue;
      anchors.push({
        citation: t.citation!,
        offset: snapWord(input.targetText, Math.min(t.offset, input.targetText.length)),
        tier: t.kind === 'column' ? 'column' : 'line',
        confidence: 'tagged',
        score: 0,
        flags: [],
      });
    }
    anchors = dedupMonotonic(anchors);
    anchors = anchors.concat(interpolate(input, anchors));
    anchors.sort((x, y) =>
      x.offset - y.offset || (x.citation < y.citation ? -1 : x.citation > y.citation ? 1 : 0));
  }
  // engine.interpolate() (shared, parity-checked against the Python pipeline)
  // only fills BETWEEN pairs of placed anchors — it never extrapolates past
  // the last one. For a chapter whose only real/placed anchor is its own
  // chapter-start (very short chapters, or ones that don't reach the next
  // real Bekker tick), that leaves the entire rest of the chapter — and for
  // a one-anchor chapter, the WHOLE chapter — without a single interpolated
  // tick. Built-in translations don't hit this: their reference ticks are
  // baked in at 5-line density per column by the pipeline (stage1_ross),
  // independent of chapter boundaries. Imports have no such luxury, so fill
  // the tail here, import-side only, to keep engine.ts byte-for-byte parity
  // with align/aligner.py (scripts/parity.mjs diffs anchor-for-anchor).
  anchors = fillChapterTail(input, anchors);
  return {
    book: input.book,
    chapter: input.chapter,
    text: input.targetText,
    anchors,
    emphasis,
    stats: {
      tagged: anchors.filter(a => a.confidence === 'tagged').length,
      placed: anchors.filter(a => ['certain', 'reliable', 'uncertain'].includes(a.confidence)).length,
      interpolated: anchors.filter(a => a.confidence === 'interpolated').length,
    },
  };
}

/**
 * Extrapolate interpolated ticks from the last anchor (placed or already
 * interpolated) out to the chapter's last Greek line, using the same
 * word-count-proportional method as engine.interpolate() — just applied to
 * the open tail instead of a closed anchor pair. Rate comes from the last
 * anchor pair when there is one (continuity with the interior interpolation);
 * with only a single anchor in the whole chapter (no pair to derive a rate
 * from), falls back to a uniform rate across the chapter's full remaining
 * text/word span. No-op if the last anchor already covers the last line.
 */
function fillChapterTail(ch: ChapterInput, anchors: Anchor[]): Anchor[] {
  const cum = new Map(ch.greekLines.map(g => [g.citation, g.cumWords]));
  const order = ch.greekLines.map(g => g.citation);
  if (!order.length) return anchors;
  const pos = new Map(order.map((c, i) => [c, i]));
  const placed = new Set(anchors.map(a => a.citation));
  const anchored = anchors
    .filter(a => cum.has(a.citation))
    .sort((x, y) => x.offset - y.offset);
  if (!anchored.length) return anchors;

  const last = anchored[anchored.length - 1];
  const lastPos = pos.get(last.citation)!;
  if (lastPos + 1 >= order.length) return anchors; // already at the chapter's last line

  const lastCum = cum.get(last.citation)!;
  // Total Greek words in the chapter, counting the final line itself (the
  // running cumulative count is words BEFORE each line — see reference.ts).
  const finalCite = order[order.length - 1];
  const totalWords = cum.get(finalCite)! + wordCountApprox(ch, finalCite);

  // Prefer the rate from the last interior anchor pair (keeps the tail's
  // pacing consistent with the interpolation that precedes it); otherwise
  // fall back to a uniform rate spanning the rest of the chapter's text.
  let rate: number; // target-offset chars per Greek word
  if (anchored.length >= 2) {
    const prev = anchored[anchored.length - 2];
    const prevCum = cum.get(prev.citation);
    if (prevCum !== undefined && lastCum > prevCum && last.offset > prev.offset) {
      rate = (last.offset - prev.offset) / (lastCum - prevCum);
    } else {
      rate = fallbackRate(ch, last, lastCum, totalWords);
    }
  } else {
    rate = fallbackRate(ch, last, lastCum, totalWords);
  }
  if (!Number.isFinite(rate) || rate < 0) return anchors;

  const out = anchors.slice();
  for (const c of order.slice(lastPos + 1)) {
    if (placed.has(c)) continue;
    const words = cum.get(c)! - lastCum;
    let off = last.offset + pyRoundLocal(words * rate);
    off = snapWord(ch.targetText, Math.min(off, ch.targetText.length));
    out.push({ citation: c, offset: off, tier: 'line', confidence: 'interpolated', score: 0, flags: [] });
  }
  return out;
}

/** Uniform rate spanning from the last anchor to the chapter's own end. */
function fallbackRate(ch: ChapterInput, last: Anchor, lastCum: number, totalWords: number): number {
  const remainingWords = totalWords - lastCum;
  const remainingChars = ch.targetText.length - last.offset;
  if (remainingWords <= 0 || remainingChars <= 0) return 0;
  return remainingChars / remainingWords;
}

/** Greek word count of the chapter's final line (for the running total). */
function wordCountApprox(ch: ChapterInput, finalCitation: string): number {
  // greekLines only carries cumulative counts BEFORE each line; we don't have
  // the reference's per-line text here, so approximate the final line's own
  // word count as the average per-line count seen across the chapter. This
  // only affects how far the LAST tick's implied "words after last real line"
  // stretches — a small, honest estimate is fine since the tail ticks are
  // already flagged real:false.
  const n = ch.greekLines.length;
  if (n < 2) return 0;
  const first = ch.greekLines[0].cumWords, last = ch.greekLines[n - 1].cumWords;
  return n > 1 ? Math.round((last - first) / (n - 1)) : 0;
}

// Python's round(): banker's rounding (half to even) — mirrors engine.ts's
// private pyRound so the tail fill paces identically to the interior fill.
function pyRoundLocal(x: number): number {
  const floor = Math.floor(x);
  const diff = x - floor;
  if (diff > 0.5) return floor + 1;
  if (diff < 0.5) return floor;
  return floor % 2 === 0 ? floor : floor + 1;
}

// ── overlay emission ─────────────────────────────────────────────────────────

// A piece's emphasis ranges, offsets rebased into that PIECE's own text (same
// offset space piecesFor/flowOf in Reader.svelte read RossPiece.text with).
//
// `pieceText` carries the piece's FULL clean text so the desktop-side painter
// can match a rendered `.ross-prose` block by CONTENT rather than by trying
// to reconstruct which array index/chapter-key the Reader resolved it to: a
// single Bekker column can render several blocks (one per chapter that starts
// or continues there — see Reader.svelte's splitSegment, one `.seg-row`/
// `.english-col`/`.ross-prose` per block), and there's no DOM attribute that
// cleanly exposes "this .ross-prose is the cont-piece vs. chapter X's own
// piece" the way the Reader's internal pieceFor/pieceCont lookup does — so an
// exact-text match against each candidate `.ross-prose` in that column is the
// robust join, not an inferred ordering/key.
export interface PieceEmphasis { pieceText: string; start: number; end: number; style: EmphasisSpan['style']; }

/**
 * Slice aligned chapter prose across a book's column segments, producing the
 * per-segment overlay pieces the Reader renders (seg.overlays[id] shape), and
 * — in a PARALLEL structure, never on RossPiece itself (Reader.svelte only
 * reads text/cont/chapter/bekker/tables off a piece; an extra field would be
 * harmless but there's no need to touch app/src's RossPiece type at all) —
 * each piece's emphasis ranges rebased to that piece's own text.
 *
 * Column boundaries inside a chapter come from that chapter's anchors: the
 * anchor at each column's line 1 (or the nearest anchor at/before it) bounds
 * the slice. Bekker gutter ticks inside a piece carry real=true only for
 * anchors that came from printed tags or DP placement — interpolated lines
 * stay real=false so the reader keeps rendering them as estimates.
 */
export function emitOverlayPieces(
  book: BookData,
  aligned: ChapterAlignment[],
): { pieces: Record<string, RossPiece[]>; emphasis: Record<string /* column */, PieceEmphasis[]> } {
  const byChapter = new Map(aligned.filter(c => c.book === book.book).map(c => [c.chapter, c]));
  const out: Record<string, RossPiece[]> = {};
  const emphOut: Record<string, PieceEmphasis[]> = {};

  // Which chapters appear in which segments, in order — walk chapterStarts.
  // A chapter runs from its start segment to the segment before the next
  // chapter's start (inclusive).
  const startsBySeg = book.segments.map(s => s.chapterStarts ?? []);
  interface Span { chapter: string; fromSeg: number; toSeg: number; }
  const spans: Span[] = [];
  for (let i = 0; i < book.segments.length; i++) {
    for (const cs of startsBySeg[i]) {
      if (spans.length) spans[spans.length - 1].toSeg = i;
      spans.push({ chapter: cs.chapter, fromSeg: i, toSeg: book.segments.length - 1 });
    }
  }
  // A chapter that starts mid-segment shares its first segment with the
  // previous chapter's tail, so toSeg above (set to the NEXT start's segment)
  // is correct: both chapters contribute a piece there.

  for (const span of spans) {
    const ca = byChapter.get(span.chapter);
    if (!ca) continue;
    const text = ca.text;
    // Offset of each segment boundary inside the chapter prose: the anchor for
    // that segment's column start (line 1), else the nearest anchor before it.
    const segStartOffset = (segIndex: number): number => {
      const col = book.segments[segIndex].column;
      const exact = ca.anchors.find(a => a.citation === `${col}1`);
      if (exact) return exact.offset;
      // Nearest anchor within this column (lowest line number present).
      const inCol = ca.anchors.filter(a => a.citation.startsWith(col));
      if (inCol.length) return Math.min(...inCol.map(a => a.offset));
      return -1; // no signal — merge into the neighbouring slice
    };

    let cursor = 0;
    for (let si = span.fromSeg; si <= span.toSeg; si++) {
      const isFirst = si === span.fromSeg;
      let sliceEnd = text.length;
      // find the next segment with a known boundary
      let nj = si + 1;
      while (nj <= span.toSeg) {
        const off = segStartOffset(nj);
        if (off >= cursor) { sliceEnd = off; break; }
        nj++;
      }
      if (nj > span.toSeg) sliceEnd = text.length;
      if (sliceEnd < cursor) sliceEnd = cursor;
      const pieceText = text.slice(cursor, sliceEnd);
      if (pieceText.trim().length === 0 && !isFirst) { continue; }

      const col = book.segments[si].column;
      const ticks = ca.anchors
        .filter(a => a.citation.startsWith(col) && a.offset >= cursor && a.offset < sliceEnd)
        .map(a => ({
          n: Number(a.citation.slice(col.length)),
          offset: a.offset - cursor,
          real: a.confidence !== 'interpolated',
        }))
        .filter(t => Number.isFinite(t.n) && t.n > 0)
        .sort((x, y) => x.n - y.n);

      const piece: RossPiece = {
        chapter: span.chapter,
        text: pieceText,
        cont: !isFirst,
        ...(ticks.length ? { bekker: ticks } : {}),
      };
      const segId = book.segments[si].id;
      (out[segId] ??= []).push(piece);

      // Emphasis spans wholly inside [cursor, sliceEnd) — clipped defensively
      // (a span should never straddle a piece boundary since pieces are cut
      // at anchor offsets and emphasis spans are word runs, but a boundary
      // landing mid-span would otherwise produce an out-of-range piece-local
      // offset for the desktop-side painter to choke on). Keyed by COLUMN
      // (not seg.id, unlike overlaysByBook) because that's what the rendered
      // DOM exposes (Reader.svelte's segment element is `#col-{column}`) —
      // the desktop-side paint pass runs on a debounce after every Reader
      // re-render and must resolve straight to a DOM id without a BookData
      // fetch in the hot path. `pieceText` (== pieceText, this piece's own
      // clean text) lets the painter match the right `.ross-prose` by content.
      const pieceEmph = ca.emphasis
        .filter(e => e.start >= cursor && e.end <= sliceEnd)
        .map(e => ({ pieceText, start: e.start - cursor, end: e.end - cursor, style: e.style }));
      if (pieceEmph.length) (emphOut[col] ??= []).push(...pieceEmph);

      cursor = sliceEnd;
      // consume skipped segments (no boundary signal): they get no piece
      si = nj - 1;
    }
  }
  return { pieces: out, emphasis: emphOut };
}
