// Line-split display expansion + the pure split/un-split command halves
// (design doc D6, Slice 2). All node-env — docs built via parseRow.
import { describe, expect, it } from 'vitest';

import {
  expandRows,
  snapToWordStart,
  divideDocAt,
  splitUnsplitRow,
  mergeSegments,
  mergeNeedsConfirm,
} from '../gridRows';
import type { RowModel } from '../model';
import { parseRow, serializeRow, joinRowDocs } from '../serialize';
import { rowSchema, emptyRowDocJSON } from '../schema';
import type { PMDocJSON } from '../schema';
import type { Address } from '../../citation/types';

const addr = (raw: string): Address => ({ scheme: 'bekker-metaphysics', raw });
const doc = (markup: string): PMDocJSON => parseRow(markup).toJSON();
const textOf = (json: PMDocJSON): string => rowSchema.nodeFromJSON(json).textContent;
const markup = (json: PMDocJSON): string => serializeRow(rowSchema.nodeFromJSON(json));

function row(raw: string, greek: string, english = '', extra: Partial<RowModel> = {}): RowModel {
  return { address: addr(raw), greek, english: doc(english), ...extra };
}

// "τὸ δὲ τί ἦν εἶναι ..." — offsets are CODE UNITS into this exact string.
const GREEK = 'τὸ μὲν οὖν πρῶτον· ἡ γὰρ οὐσία ἀρχή τις';
const H_GAR = GREEK.indexOf('ἡ γὰρ'); // a word gap (char before is a space)

describe('expandRows', () => {
  it('unsplit rows pass through 1:1 — segment 0, full Greek, not a continuation', () => {
    const rows = [row('1041a6', GREEK, 'first'), row('1041a7', 'ἕτερος στίχος', 'second')];
    const out = expandRows(rows);
    expect(out).toHaveLength(2);
    expect(out[0]).toMatchObject({
      rowIndex: 0,
      segment: 0,
      greekSlice: GREEK,
      greekStart: 0,
      continuation: false,
    });
    expect(out[0].address.raw).toBe('1041a6');
    expect(textOf(out[0].englishDoc)).toBe('first');
    expect(out[1]).toMatchObject({ rowIndex: 1, segment: 0, continuation: false });
  });

  it('a split row expands to two display rows sharing ONE address, Greek sliced at the offset', () => {
    const rows = [
      row('1041a6', 'πρώτη γραμμή', 'before'),
      row('1041a7', GREEK, 'part one', { splitOffsets: [H_GAR], english2: [doc('part two')] }),
      row('1041a8', 'τρίτη γραμμή', 'after'),
    ];
    const out = expandRows(rows);
    expect(out).toHaveLength(4);
    const [, seg0, seg1, next] = out;
    expect(seg0).toMatchObject({ rowIndex: 1, segment: 0, continuation: false, greekStart: 0 });
    expect(seg1).toMatchObject({ rowIndex: 1, segment: 1, continuation: true, greekStart: H_GAR });
    // Both gutters show the SAME raw address (D6 §5).
    expect(seg0.address.raw).toBe('1041a7');
    expect(seg1.address.raw).toBe('1041a7');
    expect(seg0.greekSlice).toBe(GREEK.slice(0, H_GAR));
    expect(seg1.greekSlice).toBe(GREEK.slice(H_GAR));
    expect(textOf(seg0.englishDoc)).toBe('part one');
    expect(textOf(seg1.englishDoc)).toBe('part two');
    expect(next.rowIndex).toBe(2);
  });

  it('two offsets → three segments/slices', () => {
    const greek = 'αβγ δεζ ηθι κλμ';
    const rows = [
      row('1b8', greek, 'one', { splitOffsets: [4, 8], english2: [doc('two'), doc('three')] }),
    ];
    const out = expandRows(rows);
    expect(out.map((d) => d.greekSlice)).toEqual(['αβγ ', 'δεζ ', 'ηθι κλμ']);
    expect(out.map((d) => d.greekStart)).toEqual([0, 4, 8]);
    expect(out.map((d) => d.continuation)).toEqual([false, true, true]);
  });

  it('drift: english2 longer than offsets → extra segment displays anchorless (empty slice, still a continuation)', () => {
    const greek = 'αβγ δεζ';
    const rows = [
      row('1b8', greek, 'one', { splitOffsets: [4], english2: [doc('two'), doc('three')] }),
    ];
    const out = expandRows(rows);
    expect(out).toHaveLength(3);
    expect(out[1]).toMatchObject({ greekSlice: 'δεζ', greekStart: 4, continuation: true });
    // English is never dropped: the anchorless extra segment still displays.
    expect(out[2]).toMatchObject({ greekSlice: '', greekStart: greek.length, continuation: true });
    expect(textOf(out[2].englishDoc)).toBe('three');
  });

  it('keys are stable: splitting one line changes NO other key and keeps its own segment-0 key', () => {
    const rows = [row('1041a6', GREEK, 'a'), row('1041a7', GREEK, 'b'), row('1041a8', GREEK, 'c')];
    const beforeKeys = expandRows(rows).map((d) => d.key);

    const split = [...rows];
    split[1] = { ...rows[1], splitOffsets: [H_GAR], english2: [doc('')] };
    const after = expandRows(split);

    expect(after).toHaveLength(4);
    expect(after[0].key).toBe(beforeKeys[0]); // row above untouched
    expect(after[1].key).toBe(beforeKeys[1]); // the split line's segment 0 keeps its key (no remount)
    expect(after[3].key).toBe(beforeKeys[2]); // row below untouched (ordinal shifted, key didn't)
    // Only the continuation is new.
    expect(beforeKeys).not.toContain(after[2].key);
  });

  it('re-splitting at a DIFFERENT offset mints a different continuation key (fresh mount, fresh doc)', () => {
    const at14 = expandRows([row('1b8', GREEK, 'x', { splitOffsets: [H_GAR], english2: [doc('y')] })]);
    const other = GREEK.indexOf('οὐσία');
    const atOther = expandRows([row('1b8', GREEK, 'x', { splitOffsets: [other], english2: [doc('y')] })]);
    expect(at14[1].key).not.toBe(atOther[1].key);
    expect(at14[0].key).toBe(atOther[0].key); // segment 0 key unaffected
  });

  it('keys are unique across the grid', () => {
    const rows = [
      row('1b8', GREEK, 'a', { splitOffsets: [H_GAR], english2: [doc('b')] }),
      row('1b9', GREEK, 'c'),
    ];
    const keys = expandRows(rows).map((d) => d.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('the default granularity is sentence (existing callers unchanged)', () => {
    const rows = [row('1b8', GREEK, 'a', { splitOffsets: [H_GAR], english2: [doc('b')] })];
    expect(expandRows(rows)).toEqual(expandRows(rows, 'sentence'));
  });
});

describe('expandRows (unit granularity, D8 §5)', () => {
  it('a split row collapses to ONE unit display row — whole Greek, segment 0, no continuation', () => {
    const rows = [row('1041a6', GREEK, 'first', { splitOffsets: [H_GAR], english2: [doc('second')] })];
    const sentence = expandRows(rows, 'sentence');
    const unit = expandRows(rows, 'unit');
    expect(sentence).toHaveLength(2); // the sentence view splits it
    expect(unit).toHaveLength(1); // the unit view does not
    expect(unit[0]).toMatchObject({
      rowIndex: 0,
      segment: 0,
      greekSlice: GREEK, // the WHOLE source text, not a slice
      greekStart: 0,
      continuation: false,
    });
    expect(textOf(unit[0].englishDoc)).toBe('first'); // segment 0's committed doc
  });

  it('one display row per model row regardless of splits, in order', () => {
    const rows = [
      row('¶1', GREEK, 'a', { splitOffsets: [H_GAR], english2: [doc('b')] }),
      row('¶2', 'δεύτερος', 'c'),
      row('¶3', 'τρίτος', ''),
    ];
    const unit = expandRows(rows, 'unit');
    expect(unit.map((d) => d.rowIndex)).toEqual([0, 1, 2]);
    expect(unit.every((d) => d.segment === 0 && !d.continuation)).toBe(true);
  });

  it('unit keys are stable, unique, and never collide with a sentence segment-0 key', () => {
    const rows = [
      row('¶1', GREEK, 'a', { splitOffsets: [H_GAR], english2: [doc('b')] }),
      row('¶2', 'δεύτερος', 'c'),
    ];
    const unit = expandRows(rows, 'unit');
    const keys = unit.map((d) => d.key);
    expect(new Set(keys).size).toBe(keys.length);
    // A sentence split inside the row must not remount the unit row: its key
    // omits the @offset the sentence segment-0 key carries.
    const sentenceSeg0Keys = new Set(expandRows(rows, 'sentence').filter((d) => d.segment === 0).map((d) => d.key));
    for (const k of keys) expect(sentenceSeg0Keys.has(k)).toBe(false);
  });
});

describe('snapToWordStart', () => {
  const greek = 'τὸ μὲν οὖν';
  // code-unit starts: 'τὸ'@0, 'μὲν'@3, 'οὖν'@7

  it('a click inside a word snaps BEFORE it (word start)', () => {
    expect(snapToWordStart(greek, 4)).toBe(3); // inside μὲν
    expect(snapToWordStart(greek, 8)).toBe(7); // inside οὖν
  });

  it('a click exactly on a word start stays there', () => {
    expect(snapToWordStart(greek, 3)).toBe(3);
    expect(snapToWordStart(greek, 7)).toBe(7);
  });

  it('a click at a word’s trailing edge snaps to THAT word — it begins the new paragraph', () => {
    // The caret resolves just PAST a word when you click its right side or the
    // space after it; that word must still be the first word of the new para.
    expect(snapToWordStart(greek, 6)).toBe(3); // space after μὲν → μὲν starts the new paragraph
  });

  it('the trailing edge of the FIRST word yields no valid split (its start is offset 0)', () => {
    expect(snapToWordStart(greek, 2)).toBeNull(); // space after τὸ → τὸ start = 0 → rejected
  });

  it('a click in leading whitespace (no word at or before it) looks FORWARD to the next word', () => {
    const g = '  οὖν'; // οὖν starts at index 2
    expect(snapToWordStart(g, 0)).toBe(2);
    expect(snapToWordStart(g, 1)).toBe(2);
  });

  it('the first word is not a split point (offset 0 rejected)', () => {
    expect(snapToWordStart(greek, 0)).toBeNull();
    expect(snapToWordStart(greek, 1)).toBeNull(); // inside τὸ → snaps to 0 → invalid
  });

  it('a click at the very end snaps back to the LAST word’s start (still a valid gap)', () => {
    expect(snapToWordStart(greek, greek.length)).toBe(7); // end of οὖν → its start
  });

  it('pulls a leading opening-paren into the new paragraph (not stranded on the prior line)', () => {
    // 'τὸ (μὲν': τὸ@0-1, ' '@2, '('@3, μὲν@4-6 — click inside μὲν → split BEFORE the '('.
    expect(snapToWordStart('τὸ (μὲν', 5)).toBe(3);
  });

  it('pulls a leading em-dash (and its separating space) into the new paragraph', () => {
    // 'τὸ — μὲν': τὸ@0-1, ' '@2, '—'@3, ' '@4, μὲν@5-7 — the dash opens the clause.
    expect(snapToWordStart('τὸ — μὲν', 6)).toBe(3);
  });

  it('leaves a TRAILING comma with the prior word (only opening marks/dashes attach forward)', () => {
    // 'τὸ, μὲν': the comma trails τὸ; μὲν starts clean at its own word start.
    expect(snapToWordStart('τὸ, μὲν', 5)).toBe(4);
  });

  it('a mark glued to the prior word (no separating space) falls back to the bare word start', () => {
    // 'τὸ(μὲν': '(' sits right after a letter, so splitting before it is invalid
    // (letter immediately before the offset) → keep the word start.
    expect(snapToWordStart('τὸ(μὲν', 4)).toBe(3);
  });

  it('trailing whitespace clicks (nothing after) are rejected', () => {
    expect(snapToWordStart('τὸ μὲν  ', 8)).toBeNull(); // gap with no following word
  });

  it('ano teleia is a word gap', () => {
    const g = 'πρῶτον· ἡ γὰρ';
    expect(snapToWordStart(g, g.indexOf('ἡ'))).toBe(g.indexOf('ἡ'));
  });

  it('out-of-range input is rejected', () => {
    expect(snapToWordStart(greek, -1)).toBeNull();
    expect(snapToWordStart(greek, greek.length + 5)).toBeNull();
  });
});

describe('divideDocAt', () => {
  it('divides plain text at the caret', () => {
    const [a, b] = divideDocAt(doc('first part second part'), 'first part'.length);
    expect(textOf(a)).toBe('first part');
    expect(textOf(b)).toBe('second part');
  });

  it('trims plain whitespace at the division point (un-split re-adds its own single space)', () => {
    const [a, b] = divideDocAt(doc('ends here.  Starts here'), 'ends here. '.length);
    expect(textOf(a)).toBe('ends here.');
    expect(textOf(b)).toBe('Starts here');
  });

  it('marks survive on both sides', () => {
    const [a, b] = divideDocAt(doc('**bold head** tail'), 'bold head'.length + 1);
    expect(markup(a)).toBe('**bold head**');
    expect(markup(b)).toBe('tail');
  });

  it('a footnote anchor NEVER splits: caret inside the phrase → whole anchor (phrase + marker) goes to the side holding the marker', () => {
    const source = 'before {^3:anchored phrase} after';
    const caretInsidePhrase = 'before anch'.length; // inside the fnRef run
    const [a, b] = divideDocAt(doc(source), caretInsidePhrase);
    expect(markup(a)).toBe('before');
    expect(markup(b)).toBe('{^3:anchored phrase} after');
  });

  it('caret between the phrase end and its marker also keeps the anchor whole on the marker side', () => {
    const source = '{^3:phrase} tail';
    const caretAtRunEnd = 'phrase'.length; // run [0,6), marker at 6 — pos 6 would orphan the run
    const [a, b] = divideDocAt(doc(source), caretAtRunEnd);
    expect(markup(a)).toBe('');
    expect(markup(b)).toBe('{^3:phrase} tail');
  });

  it('caret right AFTER the marker splits cleanly — anchor whole in the first side', () => {
    const source = '{^3:phrase} tail';
    const afterMarker = 'phrase'.length + 1; // marker node is size 1
    const [a, b] = divideDocAt(doc(source), afterMarker);
    expect(markup(a)).toBe('{^3:phrase}');
    expect(markup(b)).toBe('tail');
  });

  it('caret at 0 / at the end yields an empty side', () => {
    const [a0, b0] = divideDocAt(doc('everything'), 0);
    expect(textOf(a0)).toBe('');
    expect(textOf(b0)).toBe('everything');
    const [a1, b1] = divideDocAt(doc('everything'), 'everything'.length);
    expect(textOf(a1)).toBe('everything');
    expect(textOf(b1)).toBe('');
  });
});

describe('splitUnsplitRow', () => {
  const greek = 'τὸ μὲν οὖν πρῶτον';
  const offset = greek.indexOf('πρῶτον');

  it('no caret → ALL existing English stays in segment 0, continuation starts empty (John §4.2)', () => {
    const r = row('1b8', greek, 'the whole draft');
    const res = splitUnsplitRow(r, offset, null)!;
    expect(res.splitOffsets).toEqual([offset]);
    expect(textOf(res.english)).toBe('the whole draft');
    expect(res.english2).toHaveLength(1);
    expect(textOf(res.english2[0])).toBe('');
  });

  it('caret in the row’s English → the doc divides at the caret', () => {
    const r = row('1b8', greek, 'first half second half');
    const res = splitUnsplitRow(r, offset, 'first half'.length)!;
    expect(textOf(res.english)).toBe('first half');
    expect(textOf(res.english2[0])).toBe('second half');
    expect(res.splitOffsets).toEqual([offset]);
  });

  it('rejects an invalid offset (0, end, mid-word) — isValidSplitOffset is the authority', () => {
    const r = row('1b8', greek, 'draft');
    expect(splitUnsplitRow(r, 0, null)).toBeNull();
    expect(splitUnsplitRow(r, greek.length, null)).toBeNull();
    expect(splitUnsplitRow(r, offset + 1, null)).toBeNull(); // mid-πρῶτον
  });

  it('rejects an already-split row (Phase-1 UI is single-split)', () => {
    const r = row('1b8', greek, 'a', { splitOffsets: [3], english2: [doc('b')] });
    expect(splitUnsplitRow(r, offset, null)).toBeNull();
  });
});

describe('mergeSegments (un-split)', () => {
  const greek = 'τὸ μὲν οὖν πρῶτον';
  const offset = greek.indexOf('πρῶτον');

  it('rejoins the two English cells with a single space and drops the offset', () => {
    const r = row('1b8', greek, 'first half', { splitOffsets: [offset], english2: [doc('second half')] });
    const res = mergeSegments(r, 0)!;
    expect(textOf(res.english)).toBe('first half second half');
    expect(res.splitOffsets).toBeUndefined();
    expect(res.english2).toBeUndefined();
    // joinPos = the caret lands at the join point (end of the old segment 0).
    expect(res.joinPos).toBe('first half'.length);
  });

  it('an empty side joins silently to exactly the other side’s content', () => {
    const r = row('1b8', greek, 'all the prose', { splitOffsets: [offset], english2: [doc('')] });
    const res = mergeSegments(r, 0)!;
    expect(textOf(res.english)).toBe('all the prose');
    // Matches serialize.ts's joinRowDocs — the single join convention.
    expect(res.english).toEqual(joinRowDocs([r.english, emptyRowDocJSON()]));
  });

  it('footnote marks and markers survive the rejoin', () => {
    const r = row('1b8', greek, 'kept {^2:anchor}', { splitOffsets: [offset], english2: [doc('tail {^5:more}')] });
    const res = mergeSegments(r, 0)!;
    expect(markup(res.english)).toBe('kept {^2:anchor} tail {^5:more}');
  });

  it('a two-split row merges ONE boundary, keeping the other offset and segment', () => {
    const g = 'αβγ δεζ ηθι';
    const r = row('1b8', g, 'one', { splitOffsets: [4, 8], english2: [doc('two'), doc('three')] });
    const res = mergeSegments(r, 1)!; // merge segments 1+2
    expect(textOf(res.english)).toBe('one');
    expect(res.english2!.map(textOf)).toEqual(['two three']);
    expect(res.splitOffsets).toEqual([4]);
  });

  it('drift row (offsets shorter than english2): merging the anchorless boundary keeps the offsets', () => {
    const g = 'αβγ δεζ';
    const r = row('1b8', g, 'one', { splitOffsets: [4], english2: [doc('two'), doc('three')] });
    const res = mergeSegments(r, 1)!; // boundary 1 has no Greek anchor
    expect(res.splitOffsets).toEqual([4]);
    expect(res.english2!.map(textOf)).toEqual(['two three']);
  });

  it('returns null for a boundary that does not exist', () => {
    expect(mergeSegments(row('1b8', greek, 'unsplit'), 0)).toBeNull();
    const r = row('1b8', greek, 'a', { splitOffsets: [offset], english2: [doc('b')] });
    expect(mergeSegments(r, 1)).toBeNull();
    expect(mergeSegments(r, -1)).toBeNull();
  });
});

describe('mergeNeedsConfirm', () => {
  const greek = 'τὸ μὲν οὖν πρῶτον';
  const offset = greek.indexOf('πρῶτον');
  const split = (a: string, b: string) =>
    row('1b8', greek, a, { splitOffsets: [offset], english2: [doc(b)] });

  it('confirms ONLY when both English cells are non-empty', () => {
    expect(mergeNeedsConfirm(split('real prose', 'more prose'), 0)).toBe(true);
    expect(mergeNeedsConfirm(split('real prose', ''), 0)).toBe(false);
    expect(mergeNeedsConfirm(split('', 'more prose'), 0)).toBe(false);
    expect(mergeNeedsConfirm(split('', ''), 0)).toBe(false);
  });

  it('whitespace-only counts as empty; a bare footnote marker counts as content', () => {
    expect(mergeNeedsConfirm(split('prose', '   '), 0)).toBe(false);
    expect(mergeNeedsConfirm(split('prose', '{^3:}'), 0)).toBe(true);
  });

  it('an unsplit row never confirms', () => {
    expect(mergeNeedsConfirm(row('1b8', greek, 'x'), 0)).toBe(false);
  });
});
