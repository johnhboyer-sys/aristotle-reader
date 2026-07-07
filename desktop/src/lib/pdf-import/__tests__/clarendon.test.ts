// Phase 5 §3: synthetic Clarendon end-to-end test (committed fixture, no
// copyright concerns — see fixtures/clarendon-geometry.ts for the geometry
// and why a fourth chapter was added beyond the spec's illustrative three).
//
// This exercises a DIFFERENT corner of the importer than the golden
// Reeve-geometry conversion in emit.test.ts: keyworded headings (spelled-out
// "BOOK TWO", Roman "CHAPTER I".."IV") with NO titles at all (flush-left
// body prose directly under every heading), a column ROLL (676a->676b) and
// a PAGE-turn roll (676b->677a) with no drop/off-cadence flags, and — the
// main point — footnotes numbered PER-CHAPTER (reset to 1 at every chapter
// boundary), which the scope-autodetection state machine (Phase 3 §A4)
// correctly identifies as 'per-chapter' (not 'continuous'/'per-book') and
// scopes every label "<book>.<chapter>.<N>" end to end through emission and
// the parseTranslationFile round-trip.
//
// The golden string and every count below were MEASURED from the
// implementation, then checked by hand against the fixture's own geometry
// feature by feature before being pinned (2026-07-06).

import { describe, expect, it } from 'vitest';
import { convertLayoutExtraction } from '../index';
import { parseTranslationFile, splitChapters } from '../../translation-file';
import { clarendonFourPages } from './fixtures/clarendon-geometry';

const GOLDEN =
  '{2.1} {676a} Of temperance and its excess let us speak in turn, for it too concerns itself with bodily ' +
  'pleasures and how a person stands toward them in,[^2.1.1] {5} practice. Some pleasures belong to the ' +
  'soul alone and others belong to the body, and it is the bodily sort that most concern us here,[^2.1.2] ' +
  '{10} in this further discussion, since license and its opposite are judged mainly by how a person ' +
  'handles food, drink, and the pleasures of touch.\n\n' +
  '{2.2} Next let us turn to the pleasures that concern the body more narrowly, {15} and how a settled ' +
  'disposition toward them differs from a mere episode,[^2.2.1] since habit and nature together shape how ' +
  'far a person yields to them. {676b} A further distinction concerns whether the excess is chiefly a ' +
  'fault of appetite or rather of judgment, for the two seldom fail in quite the same,[^2.2.2] {5} way, ' +
  'and the difference matters for how correction ought to proceed.\n\n' +
  '{2.3} Let us now consider the pleasures of touch more narrowly, since these {10} are the ones in which ' +
  'license is most commonly said to be found, for the other senses contribute little to the excess we are ' +
  'discussing,[^2.3.1] {15} here, and a person who yields to them readily earns the name license, while ' +
  'one who resists them earns a name nearer to insensibility,[^2.3.2] {677a} though few persons truly ' +
  'fall so far toward that further extreme.\n\n' +
  '{2.4} Finally we should say something briefly about the remaining pleasures, {5} those that belong to ' +
  'hearing, sight, and smell rather than to touch,[^2.4.1] for these too admit of a similar excess, though ' +
  'a much rarer one.';

const GOLDEN_TAGGED = `${GOLDEN}\n\n<!-- footnotes scope=per-chapter -->\n` +
  '[^2.1.1]: A synthetic gloss for chapter one, note one.\n' +
  '[^2.1.2]: A synthetic gloss for chapter one, note two, continuing here.\n' +
  '[^2.2.1]: A synthetic gloss for chapter two, note one.\n' +
  '[^2.2.2]: A synthetic gloss for chapter two, note two, continuing here.\n' +
  '[^2.3.1]: A synthetic gloss for chapter three, note one.\n' +
  '[^2.3.2]: A synthetic gloss for chapter three, note two, continuing here.\n' +
  '[^2.4.1]: A synthetic gloss for chapter four, note one.\n';

describe('clarendon: keyworded no-title chapters, per-chapter footnote scope (Phase 5 §3)', () => {
  const result = convertLayoutExtraction(clarendonFourPages);

  it('converts ok and emits exactly the golden tagged output', () => {
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.tagged).toBe(GOLDEN_TAGGED);
  });

  it('titles map is empty — no title line ever follows a keyworded heading in this edition', () => {
    if (!result.ok) return;
    expect(result.titles).toEqual({});
  });

  it('reports the measured emission facts: 4 chapters, per-chapter scope, a clean roll (no anomaly flags)', () => {
    if (!result.ok) return;
    expect(result.report).toEqual({
      pages: 4,
      ticsEmitted: 10,
      ticsSuppressed: [],
      droppedLines: [],
      collapsedPages: [],
      divisions: { books: 1, chapters: 4, titled: 0 },
      footnotes: { scope: 'per-chapter', notes: 7, markers: 7, unmatched: [] },
      displayBlocks: [],
      dehyphenation: { joined: 0, kept: 0 },
      seams: [],
      flags: {
        // BOOK TWO is this document's first-ever division: a from-nothing
        // gap (expected == 1, got 2), flagged, never renumbered — the same
        // shape as the existing "BOOK FOUR" opening case in
        // divisions.test.ts's Clarendon describe block.
        'book-sequence:gap:0->2': 1,
        // The scope verdict locks on the THIRD discriminating (chapter-
        // boundary-crossing) reset — see fixtures/clarendon-geometry.ts's
        // header for why a fourth chapter was necessary to reach it.
        'footnote-scope:per-chapter': 1,
      },
    });
  });

  it("scoped labels round-trip end to end: [^2.1.1]..[^2.4.1], scope='per-chapter'", () => {
    if (!result.ok) return;
    const p = parseTranslationFile(result.tagged);
    expect(p.warnings).toEqual([]);
    expect(p.density).toBe('five-line-or-column');
    expect(p.footnoteScope).toBe('per-chapter');
    expect(p.footnoteMarkers).toHaveLength(7);
    expect(p.footnoteMarkers.map((m) => m.label)).toEqual([
      '2.1.1', '2.1.2', '2.2.1', '2.2.2', '2.3.1', '2.3.2', '2.4.1',
    ]);
    // Printed number displays verbatim regardless of the scoped label.
    expect(p.footnoteMarkers.map((m) => m.display)).toEqual(['1', '2', '1', '2', '1', '2', '1']);
    expect(p.footnotes).toEqual({
      '2.1.1': 'A synthetic gloss for chapter one, note one.',
      '2.1.2': 'A synthetic gloss for chapter one, note two, continuing here.',
      '2.2.1': 'A synthetic gloss for chapter two, note one.',
      '2.2.2': 'A synthetic gloss for chapter two, note two, continuing here.',
      '2.3.1': 'A synthetic gloss for chapter three, note one.',
      '2.3.2': 'A synthetic gloss for chapter three, note two, continuing here.',
      '2.4.1': 'A synthetic gloss for chapter four, note one.',
    });
  });

  it('round-trips through parseTranslationFile: chapters split cleanly, the roll produces clean column tags', () => {
    if (!result.ok) return;
    const p = parseTranslationFile(result.tagged);
    const { chapters } = splitChapters(p);
    expect(chapters).toHaveLength(4);
    expect(chapters.map((c) => [c.book, c.chapter])).toEqual([
      [2, 1],
      [2, 2],
      [2, 3],
      [2, 4],
    ]);

    // {2.1} {676a} lands adjacently at offset 0, same adjacency contract as
    // the Reeve golden.
    expect(p.tags[0]).toMatchObject({ kind: 'chapter', book: 2, chapter: 1, offset: 0 });
    expect(p.tags[1]).toMatchObject({ kind: 'column', citation: '676a1', offset: 0 });
    expect(p.text.slice(0, 2)).toBe('Of');

    // The column roll (676a -> 676b, mid chapter 2) and the page-turn roll
    // (676b -> 677a, mid chapter 3) both round-trip as clean column tags —
    // no dropped-line/non-monotonic/off-cadence flags anywhere in the
    // report above proves the audit accepted both rolls at face value.
    const rollTag = p.tags.find((t) => t.citation === '676b1')!;
    expect(rollTag).toMatchObject({ kind: 'column', column: '676b', line: 1 });
    const pageTurnTag = p.tags.find((t) => t.citation === '677a1')!;
    expect(pageTurnTag).toMatchObject({ kind: 'column', column: '677a', line: 1 });

    // Clean text: no newline anywhere but the paragraph breaks (one per
    // chapter — no blank lines survived inside a chapter's own body).
    const text = p.text.replace(/\n$/, '');
    expect(text.split('\n')).toHaveLength(4);
    expect(text.split('\n').every((para) => para.trim().length > 0)).toBe(true);
  });
});
