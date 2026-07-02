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
import type { InlineTag, TagDensity } from '../translation-file';

export interface ChapterAlignment {
  book: number;
  chapter: string;
  text: string;               // the chapter's clean prose (tags stripped)
  anchors: Anchor[];
  stats: { tagged: number; placed: number; interpolated: number };
}

/** Align one imported chapter according to the file's detected density. */
export function alignImportedChapter(
  input: ChapterInput,
  tags: InlineTag[],
  density: TagDensity,
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
  return {
    book: input.book,
    chapter: input.chapter,
    text: input.targetText,
    anchors,
    stats: {
      tagged: anchors.filter(a => a.confidence === 'tagged').length,
      placed: anchors.filter(a => ['certain', 'reliable', 'uncertain'].includes(a.confidence)).length,
      interpolated: anchors.filter(a => a.confidence === 'interpolated').length,
    },
  };
}

// ── overlay emission ─────────────────────────────────────────────────────────

/**
 * Slice aligned chapter prose across a book's column segments, producing the
 * per-segment overlay pieces the Reader renders (seg.overlays[id] shape).
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
): Record<string, RossPiece[]> {
  const byChapter = new Map(aligned.filter(c => c.book === book.book).map(c => [c.chapter, c]));
  const out: Record<string, RossPiece[]> = {};

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
      (out[book.segments[si].id] ??= []).push(piece);
      cursor = sliceEnd;
      // consume skipped segments (no boundary signal): they get no piece
      si = nj - 1;
    }
  }
  return out;
}
