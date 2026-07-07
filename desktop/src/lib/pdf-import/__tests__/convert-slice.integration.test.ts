// Phase-4A full-conversion integration test on the real Reeve slice, gated on
// ARISTOTLE_REEVE_SLICE exactly like gutter-slice.integration.test.ts (its
// sibling — the Phase-1/2/3 pins live there and are untouched by this file).
//
//   ARISTOTLE_REEVE_SLICE=/path/to/ne-slice.txt npm test
//
// Everything pinned below was MEASURED on the slice (2026-07-06) and then
// hand-verified against the raw text before pinning. The interesting
// findings, characterized:
//
//   - ticsEmitted 1325 = 1333 promoted − 8 suppressed (2 non-monotonic:
//     the corrupted 1029a1 and the MM-seam 1181a25; 6 unmarked-roll fallout
//     tics of the 1029a1 incident). Suppression is exactly the Phase-1
//     audit-refusal set; off-cadence and the 4 forwarded heading tics emit.
//   - The MM seam produces ONE scanTags warning: MM's printed 1181a25 was
//     refused (non-monotonic against NE's 1181b20), so the next emitted
//     column tag is MM's 1181b25 — re-entering column 1181b. The emitted
//     `{1181b25}` is also the new Phase-4A grammar (column + starting line)
//     exercised by the real corpus.
//   - displayBlocks is NOT empty (the spec's "expect []" guess measured
//     wrong, honestly): page 97 line 14 — "…the undemonstrated sayings 9–11"
//     — carries Reeve's unusual Bekker line-RANGE apparatus mark, whose wide
//     gap makes the line display-shaped. It is the SAME anomaly that
//     produces the one unmatched footnote marker ("11"); both surface in the
//     report for hand review rather than being silently absorbed.
//   - dehyphenation: 337 hyphen-eol joins, 0 hyphens kept (every line-end
//     fragment in the slice starts lowercase — compositor breaks).
//   - Verse quotations (Homer's Margites, Hesiod, Evenus) are printed as
//     indented lines within the paragraph-indent window, so each verse line
//     becomes its own paragraph — line structure preserved, by design.
//   - Multi-work seam collisions (the caller contract is one work per
//     conversion; report.seams carries the warning): MM's chapter key "1.1"
//     overwrites NE's in the titles map, MM's footnote labels 1/2/* shadow
//     NE's in the parsed definitions map (223 unique keys from 226 defs),
//     and the single threaded FootnoteState records footnote-scope-conflict
//     twice after the seam kills the already-decided 'continuous' hypothesis
//     (verdict stays continuous — the safe fallback).
//
// Do not loosen these pins to make the test pass; update them only for a
// deliberate, explained algorithm change.

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { convertLayoutExtraction, type ConvertSuccess } from '../index';
import { parseTranslationFile, splitChapters } from '../../translation-file';
import { alignImportedChapter } from '../../aligner/import-align';
import type { ChapterInput } from '../../aligner/engine';

const slicePath = process.env.ARISTOTLE_REEVE_SLICE;

if (!slicePath) {
  // eslint-disable-next-line no-console
  console.log(
    'convert-slice.integration.test: ARISTOTLE_REEVE_SLICE not set — skipping full-conversion integration test.'
  );
}

describe.skipIf(!slicePath)('convertLayoutExtraction on the real Reeve slice (Phase 4A)', () => {
  const result = slicePath ? convertLayoutExtraction(readFileSync(slicePath, 'utf8')) : null;
  const ok = (result?.ok ? result : null) as ConvertSuccess | null;
  const parsed = ok ? parseTranslationFile(ok.tagged) : null;

  it('converts ok and reports exactly the measured emission facts', () => {
    expect(result!.ok).toBe(true);
    const report = ok!.report;

    const summary = [
      '--- convert-slice integration summary ---',
      `pages: ${report.pages}; ticsEmitted: ${report.ticsEmitted}`,
      `suppressed: ${JSON.stringify(report.ticsSuppressed)}`,
      `divisions: ${JSON.stringify(report.divisions)}; footnotes: ${JSON.stringify(report.footnotes)}`,
      `displayBlocks: ${JSON.stringify(report.displayBlocks)}`,
      `dehyphenation: ${JSON.stringify(report.dehyphenation)}; seams: ${JSON.stringify(report.seams)}`,
      `flags: ${JSON.stringify(report.flags)}`,
      '------------------------------------------',
    ].join('\n');
    // eslint-disable-next-line no-console
    console.log(summary);

    expect(report).toEqual({
      pages: 177, // splitPages counts the trailing \f's empty page
      ticsEmitted: 1325,
      ticsSuppressed: [
        { flag: 'non-monotonic', count: 2 },
        { flag: 'unmarked-roll', count: 6 },
      ],
      droppedLines: ['1119b20'],
      collapsedPages: [],
      divisions: { books: 11, chapters: 117, titled: 117 },
      footnotes: { scope: 'continuous', notes: 226, markers: 224, unmatched: ['11'] },
      displayBlocks: [{ page: 97, lines: [14, 14] }], // the "9–11" range-apparatus line
      dehyphenation: { joined: 337, kept: 0 },
      seams: ['book-sequence:restart:1'],
      flags: {
        'dropped-line:1119b20': 1,
        'non-monotonic:1029a1': 1,
        'non-monotonic:1181a25': 1,
        'anchor-forwarded-past-heading': 4,
        'unmarked-roll:5': 1,
        'unmarked-roll:10': 1,
        'unmarked-roll:15': 1,
        'unmarked-roll:20': 1,
        'unmarked-roll:25': 1,
        'unmarked-roll:30': 1,
        'position-unresolved:unmarked-roll': 6,
        'side-ambiguous': 2,
        'side-inferred': 1,
        'footnote-star-worklevel': 2,
        'footnote-marker-unmatched:11': 1,
        'book-sequence:restart:1': 1,
        'footnote-scope:continuous': 1,
        'footnote-scope-conflict': 2,
      },
    });
  });

  it("captures the edition's titles verbatim (116 keys — MM's 1.1 shadows NE's across the seam)", () => {
    expect(Object.keys(ok!.titles)).toHaveLength(116);
    expect(ok!.titles['1.2']).toBe('Ethics Is a Sort of Politics');
    expect(ok!.titles['5.1']).toBe('Sorts of Justice');
    expect(ok!.titles['10.9']).toBe('Politics, Legislators, and Happiness');
    // Seam collision, documented: MM 1.1 overwrites NE 1.1 ('Goods and Ends').
    expect(ok!.titles['1.1']).toBe('Ethics, Virtue, and the Good');
  });

  it('round-trips through parseTranslationFile: density, warnings, counts — measured and pinned', () => {
    const p = parsed!;
    expect(p.density).toBe('five-line-or-column');
    // The one warning is the characterized MM-seam column re-entry.
    expect(p.warnings).toEqual([
      'column {1181b} does not advance from {1181b} — check the source tags',
    ]);
    expect(p.tags).toHaveLength(1442); // 1325 tics + 117 chapter tags
    expect(p.footnoteMarkers).toHaveLength(224);
    expect(Object.keys(p.footnotes)).toHaveLength(223); // 226 defs − seam shadowing (1, 2, *)
    // The real corpus exercises the new column+line grammar at the seam.
    expect(ok!.tagged).toContain('{1181b25}');
    const tag1181b25 = p.tags.find((t) => t.raw === '1181b25')!;
    expect(tag1181b25).toMatchObject({ kind: 'column', column: '1181b', line: 25, citation: '1181b25' });
  });

  it('emits chapters splitChapters can consume: 117, with the {1.1} {1094a} Every opening', () => {
    const p = parsed!;
    const { chapters } = splitChapters(p);
    expect(chapters).toHaveLength(117); // 116 NE + MM 1.1 (seam handled, never dropped)

    expect(p.tags[0]).toMatchObject({ kind: 'chapter', book: 1, chapter: 1, offset: 0 });
    expect(p.tags[1]).toMatchObject({ kind: 'column', citation: '1094a1', offset: 0 });
    expect(p.text.slice(0, 5)).toBe('Every');
  });

  it('clean text has newlines ONLY at paragraph breaks — every break characterized', () => {
    const p = parsed!;
    const text = p.text.replace(/\n$/, '');
    const paragraphs = text.split('\n');
    // 973 breaks measured (974 newlines incl. the trailing one); no empty
    // paragraphs anywhere.
    expect(paragraphs).toHaveLength(974);
    expect(paragraphs.every((x) => x.trim().length > 0)).toBe(true);
    // Mid-sentence-looking breaks, all hand-verified: 5 lowercase starts =
    // verse-quotation lines (Margites ×2, Hesiod's "sharing equally?") + the
    // two breaks around the flagged page-97 display line; 4 comma-ends =
    // verse line-ends (Hesiod ×2, "minded my own business," and Evenus).
    expect((text.match(/\n[a-z]/g) ?? []).length).toBe(5);
    expect((text.match(/,\n/g) ?? []).length).toBe(4);
    expect(text).toContain('as Homer says in the Margites:\nhim the gods made neither a digger nor a plowman\nnor wise in');
  });

  it('the 20 John-confirmed gold anchors land exactly at their words (incl. 1094a1 Every, 1095a25 of)', () => {
    const p = parsed!;
    const gold: [string, string][] = [
      ['1094a1', 'Every'],
      ['1094a5', 'activities'],
      ['1094a10', 'But'],
      ['1094a15', 'choiceworthy'],
      ['1094a20', 'else'],
      ['1094a25', 'must'],
      ['1094b1', 'to'],
      ['1094b5', 'what'],
      ['1094b10', 'nobler'],
      ['1094b15', 'much'],
      ['1094b20', 'outline'],
      ['1094b25', 'that'],
      ['1095a1', 'while'],
      ['1095a5', 'for'],
      ['1095a10', 'accord'],
      ['1095a15', 'choice'],
      ['1095a20', 'well'],
      ['1095a25', 'of'],
      ['1095a30', 'We'],
      ['1095b1', 'For'], // reached across the direc-/tion. hyphen join
    ];
    for (const [citation, word] of gold) {
      const tag = p.tags.find((t) => t.citation === citation);
      expect(tag, citation).toBeTruthy();
      const got = p.text.slice(tag!.offset).split(/\s+/)[0].replace(/[.,;:'"’”]+$/, '');
      expect(`${citation}=${got}`).toBe(`${citation}=${word}`);
    }
  });

  it('footnote round-trip: definitions populated, markers glued to their words', () => {
    const p = parsed!;
    expect(p.footnoteScope).toBe('continuous');
    expect(p.footnotes['64']).toBe(
      'Aristotle is apparently referring to a Spartan embassy to Athens in 369 bc to ask for aid against the Thebans.'
    );
    expect(p.footnotes['*']).toContain('Translated by C. D. C. Reeve.');
    expect(p.footnotes['222']).toContain('158 constitutions');

    // The very first marker is note 1, glued after "sciences," (no space).
    const m1 = p.footnoteMarkers[0];
    expect(m1.label).toBe('1');
    expect(p.text.slice(m1.offset - 9, m1.offset)).toBe('sciences,');
  });

  it('alignImportedChapter on NE 1.2 yields tagged anchors for every printed tag', () => {
    const p = parsed!;
    const { chapters } = splitChapters(p);
    const ch = chapters[1]; // NE 1.2
    expect(ch.book).toBe(1);
    expect(ch.chapter).toBe(2);
    const cited = ch.tags.filter((t) => t.citation);
    expect(cited.length).toBeGreaterThanOrEqual(4);

    // Synthetic Greek line skeleton: the aligner only needs the citations to
    // exist in the chapter's line order for the tagged path.
    const input: ChapterInput = {
      book: 1,
      chapter: '2',
      citation: '1094a18', // NE 1.2's true opening citation
      targetText: ch.text,
      refText: '',
      refAnchors: [],
      greekLines: cited.map((t, i) => ({ citation: t.citation!, cumWords: i * 40 })),
    };
    const ca = alignImportedChapter(input, ch.tags, p.density, ch.emphasis, ch.footnoteMarkers);
    const tagged = ca.anchors.filter((a) => a.confidence === 'tagged');
    expect(ca.stats.tagged).toBe(cited.length);
    expect(tagged.map((a) => a.citation)).toEqual(cited.map((t) => t.citation));
    // Anchors sit exactly at the tags' clean-text offsets (word starts).
    for (const a of tagged) {
      const t = cited.find((x) => x.citation === a.citation)!;
      expect(a.offset).toBe(t.offset);
    }
  });
});
