// Row markup serialization: hand-written cases for every construct + nesting,
// then a seeded randomized round-trip property test over the restricted
// schema (parse(serialize(doc)) structurally equals doc).
import { describe, expect, it } from 'vitest';
import type { Node as PMNode } from '@tiptap/pm/model';
import {
  serializeRow,
  parseRow,
  buildRowDoc,
  runsOf,
  orphanFnRefIds,
  assertRoundTrip,
  parseRowSegments,
  serializeRowSegments,
  encodeParaLine,
  decodeParaLine,
  joinRowDocs,
  stripFootnoteMarkup,
  stripFootnoteMarkupLine,
  type InlineRun,
  type MarkSet,
} from '../serialize';
import { docFromJSON } from '../schema';
import type { PMDocJSON } from '../schema';

const t = (text: string, marks: MarkSet = {}): InlineRun => ({ kind: 'text', text, marks });
const m = (id: string): InlineRun => ({ kind: 'marker', id });
const doc = (...runs: InlineRun[]): PMNode => buildRowDoc(runs);

function roundTrip(d: PMNode): PMNode {
  return parseRow(serializeRow(d));
}

describe('serializeRow — each construct', () => {
  it('plain text', () => {
    expect(serializeRow(doc(t('the cause of being')))).toBe('the cause of being');
  });

  it('empty row', () => {
    expect(serializeRow(doc())).toBe('');
    expect(roundTrip(doc()).eq(doc())).toBe(true);
  });

  it('bold / italic / underline', () => {
    expect(serializeRow(doc(t('bold', { bold: true })))).toBe('**bold**');
    expect(serializeRow(doc(t('it', { italic: true })))).toBe('*it*');
    expect(serializeRow(doc(t('ul', { underline: true })))).toBe('++ul++');
  });

  it('greek span holds literal Unicode', () => {
    expect(serializeRow(doc(t('τὸ τί ἦν εἶναι', { greek: true })))).toBe('{grc:τὸ τί ἦν εἶναι}');
  });

  it('footnote anchor + implicit marker', () => {
    expect(serializeRow(doc(t('anchored phrase', { fnRef: '3' }), m('3')))).toBe('{^3:anchored phrase}');
  });

  it('marker alone (anchor phrase deleted)', () => {
    expect(serializeRow(doc(m('7')))).toBe('{^7:}');
  });

  it('escapes * + { [ ^ ¶ and backslash in text; } only inside spans', () => {
    expect(serializeRow(doc(t('a*b+c{d[e^f}g\\h')))).toBe('a\\*b\\+c\\{d\\[e\\^f}g\\\\h');
    expect(serializeRow(doc(t('x}y', { greek: true })))).toBe('{grc:x\\}y}');
    expect(serializeRow(doc(t('a¶b⏎c')))).toBe('a\\¶b⏎c');
  });

  it('a literal ⏎ in a sentence-layer row round-trips byte-identically — the generic serializer never escapes it', () => {
    // Adversarial-review regression: only encodeParaLine (the [ENGLISH.PARA]
    // boundary) escapes ⏎; existing [ENGLISH] bytes must never change.
    const line = 'raw ⏎ stays';
    expect(serializeRow(parseRow(line))).toBe(line);
  });

  it('mixed plain and marked segments', () => {
    expect(serializeRow(doc(t('say '), t('this', { italic: true }), t(' plainly')))).toBe('say *this* plainly');
  });
});

describe('serializeRow — nesting and overlap (canonical order fnRef > greek > bold > italic > underline)', () => {
  it('bold inside greek span', () => {
    expect(serializeRow(doc(t('λόγος', { greek: true, bold: true })))).toBe('{grc:**λόγος**}');
  });

  it('bold spanning a greek boundary closes and reopens inside', () => {
    expect(serializeRow(doc(t('ab', { bold: true }), t('γδ', { bold: true, greek: true })))).toBe(
      '**ab**{grc:**γδ**}',
    );
  });

  it('bold inside a footnote anchor', () => {
    expect(serializeRow(doc(t('the ', { fnRef: '1' }), t('form', { fnRef: '1', bold: true }), m('1')))).toBe(
      '{^1:the **form**}',
    );
  });

  it('greek span inside a footnote anchor', () => {
    expect(serializeRow(doc(t('εἶδος', { fnRef: '2', greek: true }), m('2')))).toBe('{^2:{grc:εἶδος}}');
  });

  it("another footnote's bare marker inside a phrase", () => {
    expect(serializeRow(doc(t('one ', { fnRef: '1' }), m('9'), t(' two', { fnRef: '1' }), m('1')))).toBe(
      '{^1:one {^9:} two}',
    );
  });

  it('italic→bold boundary (*** run) round-trips', () => {
    const d = doc(t('a', { italic: true }), t('b', { bold: true }));
    expect(serializeRow(d)).toBe('*a***b**');
    expect(roundTrip(d).eq(d)).toBe(true);
  });

  it('italic→bold+italic boundary (**** run) round-trips', () => {
    const d = doc(t('a', { italic: true }), t('b', { bold: true, italic: true }));
    expect(serializeRow(d)).toBe('*a****b***');
    expect(roundTrip(d).eq(d)).toBe(true);
  });

  it('all five marks stacked', () => {
    const d = doc(t('x', { fnRef: '4', greek: true, bold: true, italic: true, underline: true }), m('4'));
    expect(serializeRow(d)).toBe('{^4:{grc:***++x++***}}');
    expect(roundTrip(d).eq(d)).toBe(true);
  });
});

describe('parseRow — leniency and reconstruction', () => {
  it('re-applies the greek mark exactly', () => {
    const d = parseRow('{grc:ὕλη} and {grc:εἶδος}');
    const runs = runsOf(d);
    expect(runs).toHaveLength(3);
    expect(runs[0]).toEqual(t('ὕλη', { greek: true }));
    expect(runs[1]).toEqual(t(' and '));
    expect(runs[2]).toEqual(t('εἶδος', { greek: true }));
  });

  it('re-applies fnRef and re-inserts the marker node', () => {
    const d = parseRow('cause {^12:of being} qua');
    const runs = runsOf(d);
    expect(runs).toEqual([t('cause '), t('of being', { fnRef: '12' }), m('12'), t(' qua')]);
  });

  it('stray unescaped } at top level is literal', () => {
    const d = parseRow('a}b');
    expect(runsOf(d)).toEqual([t('a}b')]);
  });

  it('escaped constructs are literal text', () => {
    const d = parseRow('\\*not italic\\* \\{grc:no\\} \\[FOOTNOTES\\]');
    expect(runsOf(d)).toEqual([t('*not italic* {grc:no} [FOOTNOTES]')]);
  });
});

describe('footnote invariant helpers', () => {
  it('orphanFnRefIds finds anchors whose marker is gone', () => {
    expect(orphanFnRefIds(doc(t('lost anchor', { fnRef: '5' })))).toEqual(['5']);
    expect(orphanFnRefIds(doc(t('kept', { fnRef: '5' }), m('5')))).toEqual([]);
  });

  it('an interrupted anchor run is orphaned', () => {
    // fnRef run broken by unmarked text before its marker.
    const d = doc(t('one', { fnRef: '5' }), t(' gap '), m('5'));
    expect(orphanFnRefIds(d)).toEqual(['5']);
  });

  it('assertRoundTrip passes for a valid doc and throws for none', () => {
    expect(() => assertRoundTrip(doc(t('fine ', { bold: true }), t('ok', { fnRef: '1' }), m('1')))).not.toThrow();
  });
});

describe('stripFootnoteMarkup (D8 v1 — footnotes are sentence-layer only)', () => {
  it('removes marker nodes and clears fnRef marks, keeping every character of text', () => {
    const d = doc(t('Beta ', {}), t('stray', { fnRef: '2' }), m('2'), t(' tail ', {}), m('3'));
    const stripped = stripFootnoteMarkup(d);
    expect(stripped.eq(doc(t('Beta stray tail ')))).toBe(true);
  });

  it('keeps the other marks on a stripped fnRef run', () => {
    const d = doc(t('kept', { fnRef: '1', italic: true }), m('1'));
    expect(stripFootnoteMarkup(d).eq(doc(t('kept', { italic: true })))).toBe(true);
  });

  it('a marker-only doc strips to the empty doc', () => {
    expect(stripFootnoteMarkup(doc(m('7'))).content.size).toBe(0);
  });

  it('a doc with no footnote markup is unchanged', () => {
    const d = doc(t('plain ', { bold: true }), t('τὸ ὄν', { greek: true }));
    expect(stripFootnoteMarkup(d).eq(d)).toBe(true);
  });

  it('stripFootnoteMarkupLine works at the one-line-markup level (export boundary)', () => {
    expect(stripFootnoteMarkupLine('Beta {^2:stray} tail {^3:}')).toBe('Beta stray tail ');
    expect(stripFootnoteMarkupLine('no markers *here*')).toBe('no markers *here*');
  });
});

// ── ¶ row segments (design doc D6, slice 1) ────────────────────────────────

describe('parseRowSegments / serializeRowSegments (¶ structural token)', () => {
  const json = (...runs: InlineRun[]): PMDocJSON => buildRowDoc(runs).toJSON();
  const segRoundTrip = (docs: PMDocJSON[]) => parseRowSegments(serializeRowSegments(docs));
  const eqDocs = (a: PMDocJSON[], b: PMDocJSON[]) => {
    expect(a.length).toBe(b.length);
    for (let i = 0; i < a.length; i++) {
      expect(docFromJSON(a[i]).eq(docFromJSON(b[i])), `segment ${i}`).toBe(true);
    }
  };

  it('a single segment serializes with no ¶ and parses back to one doc (old rows unchanged)', () => {
    const docs = [json(t('the cause of '), t('being', { bold: true }))];
    const line = serializeRowSegments(docs);
    expect(line).toBe('the cause of **being**');
    expect(line).not.toContain('¶');
    eqDocs(parseRowSegments(line), docs);
  });

  it('joins two segments with an unescaped ¶ and round-trips', () => {
    const docs = [json(t('first half')), json(t('second half'))];
    expect(serializeRowSegments(docs)).toBe('first half¶second half');
    eqDocs(segRoundTrip(docs), docs);
  });

  it('three segments (two splits on one line) round-trip', () => {
    const docs = [json(t('one')), json(t('two', { italic: true })), json(t('three'))];
    expect(serializeRowSegments(docs)).toBe('one¶*two*¶three');
    eqDocs(segRoundTrip(docs), docs);
  });

  it('an EMPTY continuation segment survives (trailing ¶)', () => {
    const docs = [json(t('translated part')), json()];
    expect(serializeRowSegments(docs)).toBe('translated part¶');
    eqDocs(segRoundTrip(docs), docs);
    // Leading empty segment too.
    const docs2 = [json(), json(t('only the continuation'))];
    expect(serializeRowSegments(docs2)).toBe('¶only the continuation');
    eqDocs(segRoundTrip(docs2), docs2);
  });

  it('a literal pilcrow in text escapes as \\¶ and stays ONE segment', () => {
    const docs = [json(t('a¶b'))];
    const line = serializeRowSegments(docs);
    expect(line).toBe('a\\¶b');
    const back = parseRowSegments(line);
    expect(back).toHaveLength(1);
    eqDocs(back, docs);
  });

  it('escaped literal ¶ inside split segments round-trips (escape beats delimiter)', () => {
    const docs = [json(t('a¶b', { bold: true })), json(t('c'))];
    expect(serializeRowSegments(docs)).toBe('**a\\¶b**¶c');
    eqDocs(segRoundTrip(docs), docs);
  });

  it('a segment ending in a literal backslash never swallows the delimiter', () => {
    const docs = [json(t('a\\')), json(t('b'))];
    expect(serializeRowSegments(docs)).toBe('a\\\\¶b');
    eqDocs(segRoundTrip(docs), docs);
  });

  it('footnote anchors and markers ride inside their segment', () => {
    const docs = [json(t('one', { fnRef: '1' }), m('1')), json(t('two '), m('2'))];
    expect(serializeRowSegments(docs)).toBe('{^1:one}¶two {^2:}');
    eqDocs(segRoundTrip(docs), docs);
  });

  it('parseRow itself still treats an unescaped ¶ as literal text (single-segment callers unchanged)', () => {
    const d = parseRow('a¶b');
    expect(runsOf(d)).toEqual([t('a¶b')]);
  });
});

describe('encodeParaLine / decodeParaLine (⏎ structural token)', () => {
  it('encodes raw newlines and decodes unescaped return symbols', () => {
    expect(encodeParaLine('one\ntwo\nthree')).toBe('one⏎two⏎three');
    expect(decodeParaLine('one⏎two⏎three')).toBe('one\ntwo\nthree');
  });

  it('escapes literal return symbols itself (the generic serializer leaves them raw) and decode keeps them for parseRow', () => {
    const markup = serializeRow(doc(t('literal ⏎ and break\nnext')));
    expect(markup).toBe('literal ⏎ and break\nnext');
    const encoded = encodeParaLine(markup);
    expect(encoded).toBe('literal \\⏎ and break⏎next');
    const decoded = decodeParaLine(encoded);
    expect(decoded).toBe('literal \\⏎ and break\nnext');
    expect(parseRow(decoded).textContent).toBe('literal ⏎ and break\nnext');
  });

  it('round-trips a para doc with both literal ⏎ text and real line breaks', () => {
    const original = doc(t('typed ⏎ token'), t('\n'), t('real break and ¶ too'));
    const encoded = encodeParaLine(serializeRow(original));
    expect(encoded).toBe('typed \\⏎ token⏎real break and \\¶ too');
    const back = parseRow(decodeParaLine(encoded));
    expect(back.eq(original)).toBe(true);
  });
});

describe('joinRowDocs (drift-policy rejoin: single space, nothing lost)', () => {
  const json = (...runs: InlineRun[]): PMDocJSON => buildRowDoc(runs).toJSON();

  it('joins non-empty segments with a single plain space, preserving marks and markers', () => {
    const joined = joinRowDocs([
      json(t('one', { bold: true })),
      json(t('two', { fnRef: '1' }), m('1')),
    ]);
    const expected = buildRowDoc([t('one', { bold: true }), t(' '), t('two', { fnRef: '1' }), m('1')]);
    expect(docFromJSON(joined).eq(expected)).toBe(true);
  });

  it('skips empty segments (no stray spaces)', () => {
    const joined = joinRowDocs([json(t('kept')), json(), json(t('also kept'))]);
    const expected = buildRowDoc([t('kept'), t(' '), t('also kept')]);
    expect(docFromJSON(joined).eq(expected)).toBe(true);
    expect(docFromJSON(joinRowDocs([json(), json()])).eq(buildRowDoc([]))).toBe(true);
  });

  it('a single segment joins to itself', () => {
    const joined = joinRowDocs([json(t('alone', { italic: true }))]);
    expect(docFromJSON(joined).eq(buildRowDoc([t('alone', { italic: true })]))).toBe(true);
  });
});

// ── randomized round-trip property test ────────────────────────────────────

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t2 = Math.imul(a ^ (a >>> 15), 1 | a);
    t2 = (t2 + Math.imul(t2 ^ (t2 >>> 7), 61 | t2)) ^ t2;
    return ((t2 ^ (t2 >>> 14)) >>> 0) / 4294967296;
  };
}

// Pool exercises escapes, delimiters-as-literals, Greek, spaces, brackets.
const POOL = 'abc de*+{}[]^\\λόγος τὸ ἦν ς.·;';

function randText(rng: () => number): string {
  const len = 1 + Math.floor(rng() * 6);
  let s = '';
  for (let i = 0; i < len; i++) s += POOL[Math.floor(rng() * POOL.length)];
  return s;
}

function randMarks(rng: () => number): MarkSet {
  const set: MarkSet = {};
  if (rng() < 0.3) set.greek = true;
  if (rng() < 0.3) set.bold = true;
  if (rng() < 0.3) set.italic = true;
  if (rng() < 0.2) set.underline = true;
  return set;
}

function genRuns(rng: () => number, nextFn: () => string): InlineRun[] {
  const runs: InlineRun[] = [];
  const items = 1 + Math.floor(rng() * 7);
  for (let i = 0; i < items; i++) {
    const roll = rng();
    if (roll < 0.65) {
      runs.push(t(randText(rng), randMarks(rng)));
    } else if (roll < 0.85) {
      // Footnote span: 1-2 contiguous fnRef runs + closing marker (the
      // editor-maintained invariant; see serialize.ts header).
      const id = nextFn();
      const inner = 1 + Math.floor(rng() * 2);
      for (let k = 0; k < inner; k++) {
        runs.push(t(randText(rng), { ...randMarks(rng), fnRef: id }));
      }
      runs.push(m(id));
    } else {
      runs.push(m(nextFn())); // bare marker (deleted anchor phrase)
    }
  }
  return runs;
}

describe('property: parse(serialize(doc)) equals doc', () => {
  it('holds over 400 seeded random docs', () => {
    const rng = mulberry32(20260702);
    let fnCounter = 0;
    const nextFn = () => String(++fnCounter);

    for (let iter = 0; iter < 400; iter++) {
      const d = buildRowDoc(genRuns(rng, nextFn));
      const line = serializeRow(d);
      const back = parseRow(line);
      if (!back.eq(d)) {
        // Readable failure with the seed iteration.
        expect
          .soft(back.toJSON(), `iteration ${iter}, line: ${line}`)
          .toEqual(d.toJSON());
        throw new Error(`round-trip mismatch at iteration ${iter}: ${line}`);
      }
      expect(line).not.toContain('\n');
    }
  });
});
