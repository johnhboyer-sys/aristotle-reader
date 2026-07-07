// Phase-3 §B3: emitOverlayPieces re-inserts each footnote marker's
// `[^label]` text into the emitted RossPiece, right-to-left, and must not
// silently corrupt the Bekker-tick or emphasis piece-local offsets that were
// computed against the piece's PRE-insertion text. Not part of the spec's
// explicit §C test tables, but this is genuinely novel logic (an insertion,
// not a removal — the opposite direction from every other offset carry in
// this codebase) worth its own focused coverage.

import { describe, expect, it } from 'vitest';
import type { BookData } from '../../../../../app/src/lib/data';
import { emitOverlayPieces, type ChapterAlignment } from '../import-align';

describe('emitOverlayPieces: footnote marker re-insertion (§B3)', () => {
  const text =
    'Every good thing, as it seems, the noble aim is worth pursuing here for its own sake.';
  const goodStart = text.indexOf('good');
  const goodEnd = goodStart + 'good'.length;
  const markerOffset = text.indexOf(',') + 1; // glued right after "thing,"
  const nobleStart = text.indexOf('noble');
  const nobleEnd = nobleStart + 'noble'.length;
  const tickWordOffset = text.indexOf('worth'); // sits AFTER the marker

  const book: BookData = {
    book: 1,
    segments: [
      {
        id: 'seg-1094a',
        column: '1094a',
        greek: [],
        english: null,
        chapterStarts: [{ chapter: '1', beforeLine: 1, wordIndex: 0, engOffset: 0, bekker: '1094a' }],
      },
    ],
  };

  const aligned: ChapterAlignment[] = [
    {
      book: 1,
      chapter: '1',
      text,
      anchors: [
        { citation: '1094a1', offset: 0, tier: 'chapter', confidence: 'certain', score: 0, flags: [] },
        { citation: '1094a5', offset: tickWordOffset, tier: 'line', confidence: 'tagged', score: 0, flags: [] },
      ],
      emphasis: [
        { start: goodStart, end: goodEnd, style: 'italic' }, // before the marker — no shift expected
        { start: nobleStart, end: nobleEnd, style: 'italic' }, // after the marker — shift expected
      ],
      footnoteMarkers: [{ offset: markerOffset, label: '1', display: '1' }],
      stats: { tagged: 0, placed: 0, interpolated: 0 },
    },
  ];

  const { pieces, emphasis } = emitOverlayPieces(book, aligned);
  const piece = pieces['seg-1094a'][0];

  it('splices "[^1]" into the piece text glued right after "thing,"', () => {
    expect(piece.text).toBe(
      'Every good thing,[^1] as it seems, the noble aim is worth pursuing here for its own sake.'
    );
  });

  it('shifts the Bekker tick that falls after the marker by the marker text length; the one before it is untouched', () => {
    const markerLen = '[^1]'.length;
    expect(piece.bekker).toEqual([
      { n: 1, offset: 0, real: true }, // chapter-start anchor, before the marker — no shift
      { n: 5, offset: tickWordOffset + markerLen, real: true },
    ]);
    // Sanity: the shifted offset really does land on "worth" in the final text.
    const worthTick = piece.bekker!.find(t => t.n === 5)!;
    expect(piece.text.slice(worthTick.offset, worthTick.offset + 5)).toBe('worth');
  });

  it('does not shift an emphasis span entirely before the marker ("good")', () => {
    const goodSpan = emphasis['1094a'].find(e => piece.text.slice(e.start, e.end) === 'good');
    expect(goodSpan).toBeTruthy();
    expect(goodSpan!.start).toBe(goodStart);
  });

  it('does NOT shift an emphasis span after the marker ("noble") — Fix 1: PieceEmphasis lives in marker-free clean space, not piece.text\'s marker-inserted space', () => {
    const nobleSpan = emphasis['1094a'].find(e => e.start === nobleStart);
    expect(nobleSpan).toBeTruthy();
    expect(nobleSpan!.pieceText.slice(nobleSpan!.start, nobleSpan!.end)).toBe('noble');
    // pieceText stored for content-matching is the piece's PRE-marker-
    // insertion clean text (== the desktop painter's proseText() once
    // `.fn-marker` is excluded from its TreeWalker — see emphasis-paint.ts)
    // — NOT piece.text, which has "[^1]" spliced in for on-screen rendering.
    expect(nobleSpan!.pieceText).not.toBe(piece.text);
    expect(nobleSpan!.pieceText).not.toMatch(/\[\^/);
    expect(nobleSpan!.pieceText).toBe(text);
  });
});

describe('emitOverlayPieces: PieceEmphasis marker-free invariant (Fix 1 regression)', () => {
  // Mirrors an imported chapter whose raw source read `Every _good_[^1] thing.`
  // — "good" emphasized, glued right against a footnote marker on the very
  // next character. This is the tightest case: the marker sits immediately
  // adjacent to the emphasis span it's not part of.
  const text = 'Every good thing.';
  const goodStart = text.indexOf('good');
  const goodEnd = goodStart + 'good'.length;
  const markerOffset = goodEnd; // glued right after "good", before " thing."

  const book: BookData = {
    book: 1,
    segments: [
      {
        id: 'seg-1094a',
        column: '1094a',
        greek: [],
        english: null,
        chapterStarts: [{ chapter: '1', beforeLine: 1, wordIndex: 0, engOffset: 0, bekker: '1094a' }],
      },
    ],
  };

  const aligned: ChapterAlignment[] = [
    {
      book: 1,
      chapter: '1',
      text,
      anchors: [{ citation: '1094a1', offset: 0, tier: 'chapter', confidence: 'certain', score: 0, flags: [] }],
      emphasis: [{ start: goodStart, end: goodEnd, style: 'italic' }],
      footnoteMarkers: [{ offset: markerOffset, label: '1', display: '1' }],
      stats: { tagged: 0, placed: 0, interpolated: 0 },
    },
  ];

  const { pieces, emphasis } = emitOverlayPieces(book, aligned);
  const piece = pieces['seg-1094a'][0];

  it('splices the marker into the on-screen RossPiece text', () => {
    expect(piece.text).toBe('Every good[^1] thing.');
  });

  it('keeps the PieceEmphasis span selecting exactly "good" in marker-free pieceText, which carries no `[^`', () => {
    expect(emphasis['1094a']).toHaveLength(1);
    const span = emphasis['1094a'][0];
    expect(span.pieceText).toBe(text);
    expect(span.pieceText).not.toMatch(/\[\^/);
    expect(span.pieceText.slice(span.start, span.end)).toBe('good');
  });
});
