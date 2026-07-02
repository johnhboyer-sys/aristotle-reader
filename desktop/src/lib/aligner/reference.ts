// Build per-chapter alignment inputs from the emitted dist data (book-NN.json
// + chapters.json) — the desktop-side equivalent of the pipeline's
// align/reference.py, which reads stage-1 artifacts the app never ships.
//
// The reference translation is the work's primary English column: it carries
// the real TEI Bekker ticks (english.bekker[].real) exactly as stage1 emitted
// them, so the anchors assembled here are the same "column start + ~line 20"
// tier the pipeline aligns against. The target prose is whatever unmarked
// translation the import flow is placing (for the parity/regression harness:
// the work's own Ross overlay, reassembled from its distributed pieces).
//
// Pure data-in/data-out: no fetch, no fs — callers supply the shards, so the
// same module runs in the app (fetch), in Node scripts (fs), and in tests.

import type { BookData, ChapterRef, Segment } from '../../../../app/src/lib/data';
import type { ChapterInput, RefAnchor, GreekLine } from './engine';

/** Greek word count of a line (whitespace split, like the pipeline). */
const wordCount = (text: string): number => text.split(/\s+/).filter(Boolean).length;

interface ChapterPos { book: number; chapter: string; column: string; line: string; }

/**
 * Assemble ChapterInputs for one book.
 *
 * `targetProse` maps "book:chapter" → the unmarked translation's prose for
 * that chapter (from an import, or reassembleOverlay for the harness).
 * Chapters without target prose are skipped, mirroring the pipeline.
 */
export function buildChapterInputs(
  book: BookData,
  chapters: Record<string, ChapterRef[]>,
  targetProse: Map<string, string>,
): ChapterInput[] {
  const bookNum = book.book;
  const chList: ChapterPos[] = (chapters[String(bookNum)] ?? []).map(c => ({
    book: bookNum, chapter: String(c.chapter), column: c.column, line: c.line,
  }));
  const segs = book.segments;
  const segIdx = new Map(segs.map((s, i) => [s.column, i]));

  // Chapter-start english offset within its segment (from chapterStarts).
  const startOffset = (seg: Segment | undefined, chapter: string): number =>
    seg?.chapterStarts?.find(cs => cs.chapter === chapter)?.engOffset ?? 0;

  const out: ChapterInput[] = [];
  for (let i = 0; i < chList.length; i++) {
    const ch = chList[i];
    const target = targetProse.get(`${ch.book}:${ch.chapter}`) ?? '';
    if (!target) continue;

    const startIdx = segIdx.get(ch.column);
    if (startIdx === undefined) continue;
    const startOff = startOffset(segs[startIdx], ch.chapter);

    const nxt = chList[i + 1];
    let endIdx: number, endOff: number;
    if (nxt && segIdx.has(nxt.column)) {
      endIdx = segIdx.get(nxt.column)!;
      endOff = startOffset(segs[endIdx], nxt.chapter);
    } else {
      endIdx = segs.length - 1;
      endOff = segs[endIdx].english?.text.length ?? 0;
    }

    // Assemble the chapter's reference text; collect its real Bekker ticks.
    const chapCitation = `${ch.column}${ch.line}`;
    const anchors: RefAnchor[] = [{ citation: chapCitation, off: 0, tier: 'chapter' }];
    const parts: string[] = [];
    let base = 0;
    for (let idx = startIdx; idx <= endIdx; idx++) {
      const seg = segs[idx];
      const text = seg.english?.text ?? '';
      const segStart = idx === startIdx ? startOff : 0;
      const segEnd = idx === endIdx ? endOff : text.length;
      if (segEnd <= segStart) continue;
      for (const tick of seg.english?.bekker ?? []) {
        if (!tick.real || tick.offset < segStart || tick.offset >= segEnd) continue;
        const off = base + (tick.offset - segStart);
        if (off === 0) continue; // coincides with the chapter anchor
        anchors.push({
          citation: `${seg.column}${tick.n}`,
          off,
          tier: tick.n === 1 ? 'column' : 'half_column',
        });
      }
      parts.push(text.slice(segStart, segEnd));
      base += segEnd - segStart;
    }
    anchors.sort((a, b) => a.off - b.off);

    // Greek lines (citation + cumulative word count before the line), from the
    // chapter's start line to the next chapter's start line.
    const greekLines: GreekLine[] = [];
    let cum = 0;
    let counting = false;
    outer:
    for (let idx = 0; idx < segs.length; idx++) {
      const seg = segs[idx];
      for (const g of seg.greek) {
        const cite = `${seg.column}${g.n}`;
        if (!counting) {
          if (idx === startIdx && seg.chapterStarts?.some(cs => cs.chapter === ch.chapter && cs.beforeLine === g.n)) {
            counting = true;
          } else if (idx === startIdx && cite === chapCitation) {
            counting = true;
          }
        } else if (nxt && segIdx.get(nxt.column) === idx
          && seg.chapterStarts?.some(cs => cs.chapter === nxt.chapter && cs.beforeLine === g.n)) {
          break outer;
        }
        if (counting) {
          greekLines.push({ citation: cite, cumWords: cum });
          cum += wordCount(g.text);
        }
      }
    }

    out.push({
      book: bookNum,
      chapter: ch.chapter,
      citation: chapCitation,
      targetText: target,
      refText: parts.join(''),
      refAnchors: anchors,
      greekLines,
    });
  }
  return out;
}

/**
 * Reassemble a chapter-anchored overlay translation (Ross-style pieces
 * distributed across columns) back into per-chapter prose — used by the
 * parity/regression harness to give the TS engine the same unmarked target
 * the pipeline aligned. Keyed "book:chapter".
 */
export function reassembleOverlay(book: BookData, slot: 'ross' | 'third' = 'ross'): Map<string, string> {
  const out = new Map<string, string>();
  for (const seg of book.segments) {
    for (const p of (slot === 'ross' ? seg.ross : seg.third) ?? []) {
      const key = `${book.book}:${p.chapter}`;
      const prev = out.get(key);
      if (prev === undefined) {
        out.set(key, p.text);
      } else {
        // Pieces are contiguous slices of one prose stream; re-join without
        // losing the word boundary if the cut fell between characters.
        const needsSpace = prev.length > 0 && !/\s$/.test(prev) && !/^\s/.test(p.text);
        out.set(key, prev + (needsSpace ? ' ' : '') + p.text);
      }
    }
  }
  return out;
}
