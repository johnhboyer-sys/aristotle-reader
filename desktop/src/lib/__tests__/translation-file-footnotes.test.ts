// Phase-3 spec §C3: format round-trip (splitFootnoteBlock + scanFootnoteMarkers
// + the offset-carry through emphasis/tags). Includes the numeric worked
// example from §B2 and the legacy byte-identical guarantee.

import { describe, expect, it } from 'vitest';
import { parseTranslationFile, splitChapters } from '../translation-file';

function withFrontmatter(body: string, id = 'test'): string {
  return `---
formatVersion: 1
work: ne
translator: Test
license: public-domain
language: en
id: ${id}
---
${body}`;
}

describe('translation-file footnotes §C3: format round-trip', () => {
  it('markers + block -> parse: clean text identical to a no-footnote parse, tag offsets unchanged, marker on the correct word boundary, footnotes[label] populated', () => {
    const withFootnotes = withFrontmatter(
      '{1.1}Every good thing,[^1] as it seems, is worth pursuing for its own sake.\n\n' +
        '<!-- footnotes scope=continuous -->\n' +
        '[^1]: Reading πρακτικαῖς.\n'
    );
    const withoutFootnotes = withFrontmatter(
      '{1.1}Every good thing, as it seems, is worth pursuing for its own sake.\n'
    );
    const a = parseTranslationFile(withFootnotes);
    const b = parseTranslationFile(withoutFootnotes);

    // Byte-identical clean text and unchanged tag offsets/anchors — the
    // marker's own removal (and the footnote block's absence entirely from
    // body scanning) never perturbs the Bekker/chapter anchor stream.
    expect(a.text).toBe(b.text);
    expect(a.tags).toEqual(b.tags);

    expect(a.footnoteMarkers).toHaveLength(1);
    const marker = a.footnoteMarkers[0];
    expect(marker.label).toBe('1');
    expect(marker.display).toBe('1');
    // Glued directly after "thing," — no space before it.
    expect(a.text.slice(0, marker.offset)).toBe('Every good thing,');

    expect(a.footnotes).toEqual({ '1': 'Reading πρακτικαῖς.' });
    expect(a.footnoteScope).toBe('continuous');
  });

  it('a continuation line (indented >=3 spaces) is appended to the prior definition', () => {
    const raw = withFrontmatter(
      '{1.1}Aristotle is apparently referring to a Spartan embassy.64\n\n' +
        '<!-- footnotes -->\n' +
        '[^64]: Aristotle is apparently referring to a Spartan embassy to Athens in 369 bc to ask\n' +
        '   for aid against the Thebans.\n'
    );
    const p = parseTranslationFile(raw);
    expect(p.footnotes['64']).toBe(
      'Aristotle is apparently referring to a Spartan embassy to Athens in 369 bc to ask for aid against the Thebans.'
    );
    // No scope= attribute on the sentinel -> defaults to continuous (AM2).
    expect(p.footnoteScope).toBe('continuous');
  });

  it('emphasis + marker interaction: the §B2 worked example, verified numerically', () => {
    // emphText (post-emphasis-resolution) is `{1.1}Every good,[^1] aims
    // {1094a}high.` — reached here by wrapping "good" in a confident,
    // single-word italic span in the raw source.
    const raw = withFrontmatter('{1.1}Every _good_,[^1] aims {1094a}high.\n');
    const p = parseTranslationFile(raw);

    expect(p.text).toBe('Every good, aims high.\n');
    expect(p.tags).toEqual([
      { kind: 'chapter', raw: '1.1', offset: 0, book: 1, chapter: 1 },
      { kind: 'column', raw: '1094a', offset: 17, column: '1094a', line: 1, citation: '1094a1' },
    ]);
    // "good" — unshifted by the marker strip (both endpoints < the marker's
    // fnText offset), shifted -5 by the {1.1} tag strip: {11,15} -> {6,10}.
    expect(p.emphasis).toEqual([{ start: 6, end: 10, style: 'italic' }]);
    // marker at fnText offset 16, shifted -5 by the {1.1} tag strip -> 11,
    // landing glued right after "good,".
    expect(p.footnoteMarkers).toEqual([{ offset: 11, label: '1', display: '1' }]);
    expect(p.text.slice(0, p.footnoteMarkers[0].offset)).toBe('Every good,');
    expect(p.text[17]).toBe('h'); // the {1094a} tag's own anchor
  });

  it('a legacy file (no sentinel, no [^ markers) parses with empty footnote fields — byte-identical to a pre-Phase-3 parse (verified directly against the pre-Phase-3 module in a throwaway comparison harness during implementation)', () => {
    const raw = withFrontmatter(
      '{1.1}Every good thing, as it seems, is worth pursuing for its own sake.\n' +
        '{1094a}But since there are many _sorts_ of actions, their ends are many too.\n' +
        '{5}Some further point continues here for a while before the chapter ends.\n'
    );
    const p = parseTranslationFile(raw);
    expect(p.footnoteMarkers).toEqual([]);
    expect(p.footnotes).toEqual({});
    expect(p.footnoteScope).toBe('continuous');
    // The ordinary pipeline output is untouched by any of this file's machinery.
    expect(p.tags.map(t => t.kind)).toEqual(['chapter', 'column', 'line']);
    expect(p.emphasis).toHaveLength(1);
    expect(p.text).not.toMatch(/[[\]^]/); // no stray tag/marker syntax leaked through
  });

  it('per-chapter label round-trip: [^2.3.1] body + block -> {label: "2.3.1", display: "1"}', () => {
    const raw = withFrontmatter(
      '{2.3}Some chapter text ends with a marker here.[^2.3.1]\n\n' +
        '<!-- footnotes scope=per-chapter -->\n' +
        '[^2.3.1]: A per-chapter-scoped note, identified by book.chapter.number.\n'
    );
    const p = parseTranslationFile(raw);
    expect(p.footnoteScope).toBe('per-chapter');
    expect(p.footnoteMarkers).toHaveLength(1);
    expect(p.footnoteMarkers[0]).toMatchObject({ label: '2.3.1', display: '1' });
    expect(p.footnotes['2.3.1']).toBe('A per-chapter-scoped note, identified by book.chapter.number.');
  });

  it('splitChapters slices footnoteMarkers per chapter with chapter-local offsets, like tags/emphasis', () => {
    const raw = withFrontmatter(
      '{1.1}First chapter text ends with a marker.[^1]\n' +
        '{1.2}Second chapter text ends with another marker.[^2]\n\n' +
        '<!-- footnotes -->\n' +
        '[^1]: First note.\n' +
        '[^2]: Second note.\n'
    );
    const p = parseTranslationFile(raw);
    const { chapters } = splitChapters(p);
    expect(chapters).toHaveLength(2);
    expect(chapters[0].footnoteMarkers).toHaveLength(1);
    expect(chapters[0].footnoteMarkers[0].label).toBe('1');
    expect(chapters[0].text.slice(0, chapters[0].footnoteMarkers[0].offset)).toBe(
      'First chapter text ends with a marker.'
    );
    expect(chapters[1].footnoteMarkers).toHaveLength(1);
    expect(chapters[1].footnoteMarkers[0].label).toBe('2');
    expect(chapters[1].text.slice(0, chapters[1].footnoteMarkers[0].offset)).toBe(
      'Second chapter text ends with another marker.'
    );
  });

  it('a dagger work-level label round-trips ([^†] body + block)', () => {
    // A literal `†` (not `*`) inline body marker — see the note below on why
    // `*` is the wrong glyph to test here.
    const raw = withFrontmatter(
      '{1.1}Some opening chapter text follows the running head marker.[^†]\n\n' +
        '<!-- footnotes -->\n' +
        '[^†]: Translated by a synthetic hand for this fixture only.\n'
    );
    const p = parseTranslationFile(raw);
    expect(p.footnoteMarkers[0]).toMatchObject({ label: '†', display: '†' });
    expect(p.footnotes['†']).toBe('Translated by a synthetic hand for this fixture only.');
  });

  // NOT tested with a literal `[^*]` inline body marker: scanEmphasis runs
  // BEFORE scanFootnoteMarkers (locked pipeline order, §B2), and a lone `*`
  // inside `[^*]` is indistinguishable to it from a stray emphasis marker —
  // it gets swallowed as OCR-noise-shaped stray-asterisk cleanup, corrupting
  // the label before scanFootnoteMarkers ever sees it. This is not a gap in
  // practice: per §A3, a star/dagger note is a WORK-LEVEL attachment (the
  // marker lives in the running head, routed straight to front matter) —
  // it is never turned into a literal `[^*]` marker glued into body prose to
  // begin with. Logged in implementation-notes.md as a known, narrow,
  // spec-consistent limitation rather than silently worked around.
});
