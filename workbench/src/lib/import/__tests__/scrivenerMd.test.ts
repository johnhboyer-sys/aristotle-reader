/**
 * d3a §9 committed synthetic suite — INVENTED pseudo-Greek only (zero TLG /
 * translation text), so it runs on CI with no `.dev-corpus`. Covers all nine
 * areas of the Stage-0 spec plus its gates. Real-pair acceptance lives in
 * scrivener-acceptance.test.ts (skip-when-absent).
 *
 * The pseudo-Greek uses real Greek-block codepoints (so `norm()`/Greek-script
 * detection behave) but is nonsense words — αβαβ, γδγδ, etc.
 */

import { describe, expect, it } from 'vitest';
import {
  detectFormat,
  harvestMarkers,
  scrubGreekFlow,
  markInlineGreek,
  importFootnotes,
  segmentEnglish,
  normalizeScrivenerPair,
  toParsedImportFile,
} from '../scrivenerMd';
import { relineateGreek } from '../align';
import { distributeSegment } from '../plan';
import { tokenStream } from '../compareKey';
import { serializeChapterFile, parseChapterFile } from '../../chapterfile/parse';

// ── §1 format detection ───────────────────────────────────────────────────────

describe('§1 detectFormat', () => {
  it('canonical: frontmatter + [GREEK]/[ENGLISH]', () => {
    const raw = '---\nwork: metaphysics\n---\n[GREEK]\nαβαβ\n[ENGLISH]\nx\n';
    expect(detectFormat(raw)).toBe('canonical');
  });
  it('scrivener-md: no headers, ≥3 markers, Greek script', () => {
    const raw = 'αβαβ γδγδ (1041a6) εζεζ (9) ηθηθ (10) ικικ';
    expect(detectFormat(raw)).toBe('scrivener-md');
  });
  it('unknown: prose with no markers and no headers', () => {
    expect(detectFormat('just some english prose with no markers at all')).toBe('unknown');
  });
});

// ── §2 marker grammar + enum disambiguation ───────────────────────────────────

describe('§2 harvestMarkers — all four forms + unclosed repair', () => {
  it('FULL_REF / PAREN_LINE / UNCLOSED / TAB_BARE', () => {
    const text = 'αβ (1041a6) γδ (25) εζ (16 ηθ\t14 ικ';
    const m = harvestMarkers(text);
    const kinds = m.map((x) => x.kind);
    expect(kinds).toContain('full');
    expect(kinds).toContain('paren-line');
    expect(kinds).toContain('unclosed');
    expect(kinds).toContain('tab-bare');
    // full-ref carries its bekker; unclosed repaired to a closed line number.
    expect(m.find((x) => x.kind === 'full')!.bekker).toBe('1041a6');
    expect(m.find((x) => x.kind === 'unclosed')!.line).toBe(16);
    expect(m.find((x) => x.kind === 'tab-bare')!.line).toBe(14);
  });

  it('a full-ref is not mis-read as a paren-line (no overlap double-count)', () => {
    const m = harvestMarkers('αβ (1041a6) γδ');
    expect(m).toHaveLength(1);
    expect(m[0].kind).toBe('full');
  });

  it('single-digit space-preceded paren-line is an enum suspect; tab-preceded is not', () => {
    const m = harvestMarkers('text (1) more\t(5) end');
    const one = m.find((x) => x.line === 1)!;
    const five = m.find((x) => x.line === 5)!;
    expect(one.enumSuspect).toBe(true);
    expect(five.enumSuspect).toBeUndefined(); // tab-preceded → real marker
  });
});

describe('§2 enum disambiguation — corroboration-gated drop', () => {
  it('drops an uncorroborated single-digit paren-line, keeps a corroborated one', () => {
    // English has "(1)" (enum) and "(5)" (real). Greek corroborates only 5.
    const englishBody = 'first (1) point then more text (5) tail';
    const greekLineNumbers = new Set<number>([5]);
    const { markers, flags } = segmentEnglish(englishBody, greekLineNumbers);
    expect(markers.map((m) => m.line)).toEqual([5]); // (1) dropped, (5) kept
    expect(flags.some((f) => f.kind === 'enum-dropped')).toBe(true);
  });

  it('never drops a corroborated token', () => {
    const { markers } = segmentEnglish('a (1) b', new Set<number>([1]));
    expect(markers.map((m) => m.line)).toEqual([1]);
  });
});

describe('§4a marker stripping — no marker token leaks into segment text', () => {
  it('BOTH halves of a doubled boundary are stripped from the text (BUG-2 fixture)', () => {
    // The Scrivener convention doubles a boundary when one Bekker line spans two
    // English lines: "…(9)\n…(9)". Collapse keeps ONE as the boundary; the other
    // must ALSO be stripped from the joined segment text — the original bug
    // leaked a literal "(9)" mid-cell.
    const body = 'line one ends (9)\nline two also nine (9)\nline three (10)\ntail line';
    const { segments, markers } = segmentEnglish(body, new Set<number>([9, 10]));
    // One collapsed (9) boundary + the (10) boundary.
    expect(markers.map((m) => m.line)).toEqual([9, 10]);
    // NO marker token survives in any segment's text or lines.
    for (const seg of segments) {
      expect(seg.text).not.toMatch(/\(9\)|\(10\)/);
      for (const l of seg.lines) expect(l).not.toMatch(/\(9\)|\(10\)/);
    }
    // The text between the doubled markers is kept (folded into the segment).
    const joined = segments.map((s) => s.text).join(' | ');
    expect(joined).toContain('line one ends');
    expect(joined).toContain('line two also nine');
    expect(joined).toContain('tail line');
  });

  it('every kept marker form is stripped; dropped enums stay as prose', () => {
    const body = 'alpha (73a21) beta\t14 gamma (25) both (1) kinds';
    const { segments } = segmentEnglish(body, new Set<number>([14, 25]));
    const joined = segments.map((s) => s.text).join(' ');
    expect(joined).not.toContain('(73a21)');
    expect(joined).not.toMatch(/(?:^|\s)14(?:\s|$)/);
    expect(joined).not.toContain('(25)');
    expect(joined).toContain('(1)'); // uncorroborated enum = prose, kept
  });
});

// ── §3 hyphen rejoin + re-anchor ──────────────────────────────────────────────

describe('§3 scrubGreekFlow — both hyphen forms + marker re-anchor', () => {
  it('rejoins a space-split hyphen (ἐπι- στήμην form)', () => {
    const { greekFlow } = scrubGreekFlow(['αβαβγ- δεδε ζηζη']);
    expect(greekFlow).toContain('αβαβγδεδε');
    expect(greekFlow).not.toContain('- ');
  });

  it('rejoins across an interleaved marker (διορί-\\t(25) σωμεν form)', () => {
    const { greekFlow, markers } = scrubGreekFlow(['αβαβ\t(25) γδγδ']);
    // With the hyphen the halves join; without a hyphen they stay separate but
    // the marker is preserved. Here test the interleaved-marker survival.
    expect(markers.some((m) => m.line === 25)).toBe(true);
  });

  it('rejoins and re-anchors the marker AFTER the joined word', () => {
    const { greekFlow, markers } = scrubGreekFlow(['αβαβγ-\t(25) δεδε']);
    // Joined word appears; marker survives as a sentinel; word precedes marker.
    expect(greekFlow.replace(/\{\{MK:\d+\}\}/g, '§')).toContain('αβαβγδεδε');
    expect(markers.some((m) => m.line === 25)).toBe(true);
  });

  it('keeps a hyphen + flags when halves are not one plausible word', () => {
    const { flags } = scrubGreekFlow(['word- 123notgreek']);
    expect(flags.some((f) => f.kind === 'uncertain-hyphen')).toBe(true);
  });

  it('scrubs trailing [[[[-style junk with a flag', () => {
    const { greekFlow, flags } = scrubGreekFlow(['αβαβ γδγδ.[[[[']);
    expect(greekFlow).not.toContain('[[[[');
    expect(flags.some((f) => f.kind === 'scrub')).toBe(true);
  });

  it('preserves editorial <…> (never deleted)', () => {
    const { greekFlow } = scrubGreekFlow(['αβαβ <γδγδ> εζεζ']);
    expect(greekFlow).toContain('<γδγδ>');
  });
});

// ── §3 token re-lineation ─────────────────────────────────────────────────────

describe('§3 relineateGreek — token DP, row-count invariant', () => {
  it('8 fake tokens → 4 spine rows (2 each), exact walk', () => {
    const spine = ['αα ββ', 'γγ δδ', 'εε ζζ', 'ηη θθ'];
    const flow = 'αα ββ γγ δδ εε ζζ ηη θθ';
    const r = relineateGreek(flow, spine);
    expect(r.rows).toHaveLength(4); // row-count invariant
    expect(r.rows[0].userGreek).toContain('αα');
    expect(r.rows[3].userGreek).toContain('θθ');
    expect(r.coverage).toBeGreaterThan(0.9);
    expect(r.anyLowConfidence).toBe(false);
  });

  it('a typo token → its row is low-confidence but still placed', () => {
    const spine = ['αααα ββββ', 'γγγγ δδδδ'];
    const flow = 'αααα ββββ γγγγ δξδξ'; // δδδδ → δξδξ typo
    const r = relineateGreek(flow, spine);
    expect(r.rows).toHaveLength(2);
    // The divergent row is flagged low-confidence.
    expect(r.anyLowConfidence).toBe(true);
  });

  it('an editorial <…> insertion → its row flagged (kept, not dropped)', () => {
    const spine = ['αααα ββββ', 'γγγγ δδδδ'];
    const flow = 'αααα ββββ <ξξξξ> γγγγ δδδδ';
    const r = relineateGreek(flow, spine);
    expect(r.rows).toHaveLength(2);
    const edRow = r.rows.find((x) => x.editorial);
    expect(edRow).toBeDefined();
    expect(edRow!.lowConfidence).toBe(true);
    expect(edRow!.userGreek).toContain('<ξξξξ>');
  });

  it('row-count invariant holds even when the flow is short', () => {
    const r = relineateGreek('αααα', ['αααα', 'ββββ', 'γγγγ']);
    expect(r.rows).toHaveLength(3);
  });
});

describe('tokenStream helper', () => {
  it('surfaces + normalized keys, punctuation split out', () => {
    const t = tokenStream('ζητεῖ· τὸ <λευκόν>');
    expect(t.map((x) => x.surface)).toEqual(['ζητεῖ·', 'τὸ', '<λευκόν>']);
    expect(t[0].key).toBe('ζητει'); // ano teleia dropped by norm
    expect(t[2].key).toBe('λευκον'); // brackets dropped by norm
  });
});

// ── §4 distribution ───────────────────────────────────────────────────────────

describe('§4 distributeSegment', () => {
  it('1:1 line count → place by position, quiet ✓', () => {
    const pieces = distributeSegment(['line a', 'line b', 'line c'], 3, [4, 4, 4]);
    expect(pieces.map((p) => p.state)).toEqual(['matched', 'matched', 'matched']);
    expect(pieces.every((p) => !p.flagged)).toBe(true);
    expect(pieces.map((p) => p.text)).toEqual(['line a', 'line b', 'line c']);
  });

  it('off-by-1 (one fewer line) → auto-resolve, quiet, trailing no-source', () => {
    const pieces = distributeSegment(['line a', 'line b'], 3, [4, 4, 4]);
    expect(pieces[0].state).toBe('matched');
    expect(pieces[1].state).toBe('matched');
    expect(pieces[2].state).toBe('no-source');
    expect(pieces.slice(0, 2).every((p) => !p.flagged)).toBe(true);
  });

  it('merged paragraph with clean sentence boundaries → spread, confident (quiet)', () => {
    // Every cut lands on a real boundary (. ; .) → coherent pieces, so the
    // placement is confident and NOT flagged (John 2026-07-15: only shaky
    // mid-clause hard cuts flag).
    const seg = ['First sentence here. Second sentence follows; third clause too. Fourth ends.'];
    const pieces = distributeSegment(seg, 3, [10, 10, 10]);
    expect(pieces).toHaveLength(3);
    expect(pieces.every((p) => !p.flagged)).toBe(true);
    // Text is SPREAD, not dumped on row 0 with the rest blank.
    expect(pieces.filter((p) => p.text.trim().length > 0).length).toBeGreaterThan(1);
  });

  it('merged paragraph with NO boundary near a target → forced hard cut is flagged', () => {
    // A long boundary-free run: cutting it into rows must slice mid-clause, so
    // at least one piece is a flagged shaky guess.
    const seg = [
      'alpha beta gamma delta epsilon zeta eta theta iota kappa lambda mu nu xi omicron pi rho sigma tau upsilon phi chi psi omega ',
    ];
    const pieces = distributeSegment(seg, 3, [10, 10, 10]);
    expect(pieces).toHaveLength(3);
    expect(pieces.some((p) => p.flagged && p.state === 'split')).toBe(true);
  });

  it('pre-split cuts at sentence/clause boundaries, weighted by Greek token counts', () => {
    const seg = ['Alpha beta gamma. Delta epsilon zeta. Eta theta iota.'];
    // Weight the middle row heavily → its piece should be the longest.
    const pieces = distributeSegment(seg, 3, [1, 8, 1]);
    expect(pieces).toHaveLength(3);
    const lens = pieces.map((p) => p.text.length);
    expect(lens[1]).toBeGreaterThanOrEqual(lens[0]);
  });
});

// ── §5 footnotes ──────────────────────────────────────────────────────────────

describe('§5 importFootnotes', () => {
  it('remaps ids to chapter-local first-appearance order + rewrites anchors', () => {
    const eng =
      'the substance[^fn3] and the cause[^fn7]\n\n[^fn3]: first body\n\n[^fn7]: second body';
    const { text, footnotes } = importFootnotes(eng);
    // fn3 → 1, fn7 → 2 (first-appearance).
    expect(footnotes.map((f) => [f.sourceLabel, f.id])).toEqual([
      ['fn3', 1],
      ['fn7', 2],
    ]);
    expect(text).toContain('{^1:substance}');
    expect(text).toContain('{^2:cause}');
  });

  it('multi-paragraph body round-trips intact', () => {
    const eng = 'x[^fn1]\n\n[^fn1]: para one\n\npara two\n\npara three';
    const { footnotes } = importFootnotes(eng);
    expect(footnotes[0].body).toContain('para one');
    expect(footnotes[0].body).toContain('para two');
    expect(footnotes[0].body).toContain('para three');
    expect(footnotes[0].body.split('\n\n').length).toBeGreaterThanOrEqual(3);
  });

  it('anchor extends left over an abutting parenthetical Greek gloss', () => {
    const eng = 'the substance (τὴν οὐσίαν)[^fn2]\n\n[^fn2]: body';
    const { text } = importFootnotes(eng);
    expect(text).toContain('{^1:substance (τὴν οὐσίαν)}');
  });

  it('orphan ref (no body) → kept anchor, empty body, non-blocking sentence', () => {
    const eng = 'referenced[^fn9] here';
    const { footnotes, flags } = importFootnotes(eng);
    expect(footnotes[0]).toMatchObject({ id: 1, sourceLabel: 'fn9', body: '' });
    const f = flags.find((x) => x.kind === 'orphan-footnote-ref');
    expect(f?.message).toBe(
      "Footnote fn9 is referenced but has no text — it'll import empty; add the text later or remove the marker.",
    );
  });

  it('orphan body (no ref) → surfaced, left out', () => {
    const eng = 'no refs here\n\n[^fn5]: an orphan body';
    const { footnotes, flags } = importFootnotes(eng);
    expect(footnotes).toHaveLength(0); // body without a ref is not imported
    const f = flags.find((x) => x.kind === 'orphan-footnote-body');
    expect(f?.message).toBe(
      "There's a footnote with no place in the text (its marker is missing) — it can't be attached, so it's been left out; check footnote fn5.",
    );
  });

  it('ref-precedes-gloss inside parens: forward anchor, no character loss, no residue', () => {
    // BUG-1 fixture (d3a §5 addendum): the ref sits at the START of the
    // parenthetical, BEFORE the Greek gloss it annotates; a second ref follows
    // the closing paren. The old one-pass splicer went stale here (fn2's anchor
    // extension reached LEFT past fn1) and mangled the text ("is (" lost,
    // literal "fn1]" residue).
    const eng =
      'the substance is ([^fn1]τὴν οὐσίαν)[^fn2] and what sort\n\n[^fn1]: body one\n\n[^fn2]: body two';
    const { text, footnotes } = importFootnotes(eng);
    // fn1 anchors FORWARD onto the gloss it abuts; fn2 anchors backward onto
    // the word before the group (an anchor nested inside fn1's anchor is
    // unrepresentable in the editor's fnRef mark).
    expect(text).toContain('({^1:τὴν οὐσίαν})');
    expect(text).toContain('{^2:is}');
    // No character of the surrounding English is lost, no ref residue remains.
    const stripped = text.replace(/\{\^(\d+):([^{}]*)\}/g, '$2');
    expect(stripped).toContain('the substance is (τὴν οὐσίαν) and what sort');
    expect(text).not.toContain('[^');
    expect(text).not.toMatch(/fn\d+\]/);
    expect(footnotes.map((f) => [f.sourceLabel, f.id])).toEqual([
      ['fn1', 1],
      ['fn2', 2],
    ]);
  });

  it('ref opening a NON-Greek parenthetical anchors the word before the group', () => {
    const eng = 'the claim is ([^fn1]a latin note here) end\n\n[^fn1]: body';
    const { text } = importFootnotes(eng);
    expect(text).toContain('{^1:is}');
    expect(text).toContain('(a latin note here)');
    expect(text).not.toContain('[^');
  });

  it('normalizes U+2028/tab "soft" paragraph separators so bodies round-trip', () => {
    // Scrivener/OCR bodies carry U+2028 (LINE SEPARATOR) + tab-indent instead of
    // real newlines; the chapterfile serializer splits on \n only, so an
    // unnormalized body strands a later "N:" mid-line and merges footnotes.
    const LS = String.fromCharCode(0x2028);
    const eng = `ref[^fn1] more[^fn2]\n\n[^fn1]: part one.${LS}\tpart two of one.\n\n[^fn2]: body two`;
    const { footnotes } = importFootnotes(eng);
    expect(footnotes).toHaveLength(2);
    // The soft separator became a real paragraph break (no U+2028 left).
    expect(footnotes[0].body).not.toContain(LS);
    expect(footnotes[0].body).toContain('part one.');
    expect(footnotes[0].body).toContain('part two of one.');
    // And the two footnotes round-trip through serialize/parse without merging.
    const file = {
      meta: {
        schemaVersion: 1,
        work: 'metaphysics',
        book: 7,
        chapter: 17,
        citationScheme: 'bekker-standard' as const,
        spanStart: '1041a6',
        spanEnd: '1041a7',
        columnStarts: [{ ref: '1041a6', rowIndex: 1 }],
      },
      greekLines: ['αβ', 'γδ'],
      englishLines: ['x', ''],
      footnotes: footnotes.map((f) => ({ id: f.id, body: f.body })),
    };
    const reparsed = parseChapterFile(serializeChapterFile(file), 'fn-u2028');
    expect(reparsed.footnotes.map((f) => f.id)).toEqual([1, 2]);
  });
});

// ── §6 inline Greek ───────────────────────────────────────────────────────────

describe('§6 markInlineGreek', () => {
  it('≥60% Greek parenthetical → {grc:…} with parens OUTSIDE', () => {
    const { text, count } = markInlineGreek('the term (τὸ καθόλου) here');
    expect(text).toBe('the term ({grc:τὸ καθόλου}) here');
    expect(count).toBe(1);
  });

  it('pure-Latin parenthetical untouched', () => {
    const { text, count } = markInlineGreek('the term (the universal) here');
    expect(text).toBe('the term (the universal) here');
    expect(count).toBe(0);
  });

  it('<60% Greek parenthetical untouched', () => {
    const { text, count } = markInlineGreek('mixed (one αβ two three four) end');
    expect(text).toBe('mixed (one αβ two three four) end');
    expect(count).toBe(0);
  });

  it('a parenthetical that is one footnote anchor over Greek → grc INSIDE the anchor', () => {
    // The ref-precedes-gloss import path produces `({^1:τὴν οὐσίαν})`; the greek
    // mark goes inside the anchor so both marks cover the same phrase.
    const { text, count } = markInlineGreek('is ({^1:τὴν οὐσίαν}) and');
    expect(text).toBe('is ({^1:{grc:τὴν οὐσίαν}}) and');
    expect(count).toBe(1);
  });

  it('any other anchor-bearing parenthetical is left untouched (never split an anchor)', () => {
    const { text, count } = markInlineGreek('is (τὸ {^1:αβ} γδ) end');
    expect(text).toBe('is (τὸ {^1:αβ} γδ) end');
    expect(count).toBe(0);
  });
});

// ── §7 scrub rules ────────────────────────────────────────────────────────────

describe('§7 scrub — conservative, flagged', () => {
  it('markdown emphasis is opaque (not touched)', () => {
    const { text } = markInlineGreek('a **bold** word');
    expect(text).toContain('**bold**');
  });
  it('a real dash between words is never rejoined', () => {
    const { greekFlow } = scrubGreekFlow(['αβαβ — γδγδ']);
    expect(greekFlow).toContain('—');
  });
});

// ── gates: honesty + round-trip ───────────────────────────────────────────────

describe('gates', () => {
  it('honesty: every anomaly produces a visible flag', () => {
    const n = normalizeScrivenerPair(
      'αβαβγ- δεδε (1041a6) ζηζη <ξξξξ> ικικ.[[[[',
      'text (1) uncorroborated[^fn1] gloss (τὸ αβ)\n\n[^fn2]: orphan body',
      { work: 'metaphysics', book: 7, chapter: 17 },
    );
    const kinds = new Set(n.flags.map((f) => f.kind));
    expect(kinds.has('scrub')).toBe(true);
    expect(kinds.has('inline-greek')).toBe(true);
    expect(kinds.has('orphan-footnote-body')).toBe(true);
    // Every flag carries a plain-language sentence.
    for (const f of n.flags) expect(f.message.length).toBeGreaterThan(0);
  });

  it('round-trip: a serialized chapter file with {grc:}/{^id:}/footnotes re-parses', () => {
    // Build a ChapterFile carrying the markup a scrivener import emits.
    const file = {
      meta: {
        schemaVersion: 1,
        work: 'metaphysics',
        book: 7,
        chapter: 17,
        citationScheme: 'bekker-standard' as const,
        spanStart: '1041a6',
        spanEnd: '1041a7',
        columnStarts: [{ ref: '1041a6', rowIndex: 1 }],
      },
      greekLines: ['αβαβ', 'γδγδ'],
      englishLines: ['the substance {^1:phrase} and ({grc:τὸ αβ})', ''],
      footnotes: [{ id: 1, body: 'body line one\nbody line two' }],
    };
    const serialized = serializeChapterFile(file);
    const reparsed = parseChapterFile(serialized, 'roundtrip');
    expect(reparsed).toEqual(file);
  });

  it('toParsedImportFile carries the scrivener side-channel + segment english', () => {
    const n = normalizeScrivenerPair(
      'αβαβ (1041a6) γδγδ (9) εζεζ',
      'first line (9)\nsecond line (10)',
      { work: 'metaphysics', book: 7, chapter: 17 },
    );
    const parsed = toParsedImportFile(n);
    expect(parsed.scrivener).toBe(n);
    expect(parsed.greek).toHaveLength(1); // the joined flow (markers stripped)
    expect(parsed.english.length).toBeGreaterThan(0);
  });
});
