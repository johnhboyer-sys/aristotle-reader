// Autosave: full model→file→model round trip (marks, greek spans, footnote
// anchors and bodies) + the debounced scheduler with fake timers (flush,
// in-flight re-dirty, error retention, pending-write gating on load).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { parseChapterFile, serializeChapterFile } from '../../chapterfile';
import { getScheme } from '../../citation/registry';
import { buildRowDoc, joinRowDocs } from '../../editor/serialize';
import type { InlineRun, MarkSet } from '../../editor/serialize';
import { docFromJSON, emptyRowDocJSON } from '../../editor/schema';
import type { PMDocJSON } from '../../editor/schema';
import type { ChapterModel } from '../../editor/model';
import { chapterFileName } from '../storage';
import {
  serializeModel,
  chapterFileFromModel,
  spansFromModel,
  splitRaw,
  columnStartsFromModel,
  rowAddressSource,
  hydrateFromFile,
  anchoredFootnoteCount,
  loadChapterFile,
  createAutosave,
  AUTOSAVE_DEBOUNCE_MS,
} from '../autosave';
import type { LoadResult, SaveState, SpineRow } from '../autosave';
import { MemStorage, GatedStorage, FlakyStorage } from './memStorage';

const SCHEME = 'bekker-metaphysics' as const;
const t = (text: string, marks: MarkSet = {}): InlineRun => ({ kind: 'text', text, marks });
const m = (id: string): InlineRun => ({ kind: 'marker', id });
const addr = (raw: string) => ({ scheme: SCHEME, raw });

function makeModel(): ChapterModel {
  const row0 = buildRowDoc([
    t('The '),
    t('cause', { bold: true }),
    t(' of '),
    t('being', { italic: true, fnRef: '1' }),
    m('1'),
    t(' plainly'),
  ]);
  const row1 = buildRowDoc([
    t('τὸ τί ἦν εἶναι', { greek: true }),
    t(' — as they say '),
    t('always', { underline: true }),
  ]);
  const row2 = buildRowDoc([]);
  return {
    workId: 'meta',
    workTitle: 'Metaphysics',
    scheme: SCHEME,
    book: 7,
    bookLabel: 'Ζ',
    chapter: 17,
    bekkerRange: '1041a6–1041a8',
    rows: [
      { address: addr('1041a6'), greek: 'Τί δὲ χρὴ λέγειν καὶ ὁποῖόν τι τὴν οὐσίαν', english: row0.toJSON() },
      { address: addr('1041a7'), greek: 'ἄλλην οἷον ἀρχὴν ποιησάμενοι λέγωμεν', english: row1.toJSON() },
      { address: addr('1041a8'), greek: 'ἔσται δῆλον καὶ περὶ ἐκείνης', english: row2.toJSON() },
    ],
    footnotes: [
      { id: '1', body: 'See *Physics* B — τὸ αἴτιον.', anchored: true },
      { id: '2', body: 'Unanchored line one\nand a continuation line.', anchored: false },
    ],
    dirty: false,
  };
}

function spineOf(model: ChapterModel): SpineRow[] {
  return model.rows.map((r) => ({ address: r.address, greek: r.greek }));
}

/** makeModel() with row addresses spanning three Bekker columns. */
function makeMultiColumnModel(): ChapterModel {
  const model = makeModel();
  model.rows = [
    { ...model.rows[0], address: addr('1041a33') },
    { ...model.rows[1], address: addr('1041b1') },
    { ...model.rows[2], address: addr('1042a1') },
  ];
  return model;
}

describe('splitRaw (presentation-level column/line slicing)', () => {
  it('splits trailing digits as the line, prefix as the column', () => {
    expect(splitRaw('1041a6')).toEqual({ column: '1041a', line: 6 });
    expect(splitRaw('100b3')).toEqual({ column: '100b', line: 3 });
    expect(splitRaw('980a21')).toEqual({ column: '980a', line: 21 });
  });

  it('returns null for raws it cannot slice', () => {
    expect(splitRaw('')).toBeNull(); // hydration's spine-drift filler address
    expect(splitRaw('abc')).toBeNull(); // no digit suffix
    expect(splitRaw('12345')).toBeNull(); // no column prefix
  });
});

describe('columnStartsFromModel', () => {
  it('single column: one pair — the first row @1', () => {
    expect(columnStartsFromModel(makeModel())).toEqual([{ ref: '1041a6', rowIndex: 1 }]);
  });

  it('detects column changes by comparing the column part of consecutive raws', () => {
    expect(columnStartsFromModel(makeMultiColumnModel())).toEqual([
      { ref: '1041a33', rowIndex: 1 },
      { ref: '1041b1', rowIndex: 2 },
      { ref: '1042a1', rowIndex: 3 },
    ]);
  });

  it('carries the actual line number of a segment start (never assumes 1)', () => {
    const model = makeMultiColumnModel();
    model.rows[1] = { ...model.rows[1], address: addr('1041b4') };
    model.rows[2] = { ...model.rows[2], address: addr('1041b5') };
    expect(columnStartsFromModel(model)).toEqual([
      { ref: '1041a33', rowIndex: 1 },
      { ref: '1041b4', rowIndex: 2 },
    ]);
  });

  it('returns undefined when any row address cannot be sliced (spine-drift filler rows)', () => {
    const model = makeModel();
    model.rows[2] = { ...model.rows[2], address: addr('') };
    expect(columnStartsFromModel(model)).toBeUndefined();
  });

  it('returns undefined when the written span_start is not the first row address (span drift)', () => {
    const model = makeModel();
    expect(columnStartsFromModel(model, { start: '1041a5', end: '1041a8' })).toBeUndefined();
  });

  it('returns undefined when lines do not increment by 1 within a column (not representable exactly)', () => {
    const model = makeModel();
    model.rows[1] = { ...model.rows[1], address: addr('1041a9') }; // gap: a6, a9, a8
    expect(columnStartsFromModel(model)).toBeUndefined();
  });

  it('returns undefined for an empty model', () => {
    const model = makeModel();
    model.rows = [];
    expect(columnStartsFromModel(model)).toBeUndefined();
  });
});

describe('rowAddressSource', () => {
  it('uses column_starts exact reconstruction when present', () => {
    const model = makeMultiColumnModel();
    const file = parseChapterFile(serializeModel(model), 'addr-cs');
    const addressOf = rowAddressSource(file.meta, [], getScheme(SCHEME));
    expect([1, 2, 3].map((i) => addressOf(i).raw)).toEqual(['1041a33', '1041b1', '1042a1']);
  });

  it('falls back to the corpus spine for corpus-owned schemes without column_starts', () => {
    const model = makeModel();
    const file = parseChapterFile(serializeModel(model, { start: '1041a5', end: '1041a8' }), 'addr-spine');
    expect(file.meta.columnStarts).toBeUndefined();
    const addressOf = rowAddressSource(file.meta, spineOf(model), getScheme(SCHEME));
    expect([1, 2, 3, 4].map((i) => addressOf(i))).toEqual([
      addr('1041a6'),
      addr('1041a7'),
      addr('1041a8'),
      { scheme: SCHEME, raw: '' },
    ]);
  });

  it('derives document-spine addresses from row ordinals', () => {
    const paragraphAddress = rowAddressSource(
      {
        schemaVersion: 1,
        work: 'free',
        book: 1,
        chapter: 1,
        citationScheme: 'paragraph',
        spanStart: '¶1',
        spanEnd: '¶3',
      },
      [],
      getScheme('paragraph'),
    );
    const lineAddress = rowAddressSource(
      {
        schemaVersion: 1,
        work: 'free',
        book: 1,
        chapter: 1,
        citationScheme: 'plain-line',
        spanStart: '1',
        spanEnd: '3',
      },
      [],
      getScheme('plain-line'),
    );
    expect([1, 2, 3].map((i) => paragraphAddress(i).raw)).toEqual(['¶1', '¶2', '¶3']);
    expect([1, 2, 3].map((i) => lineAddress(i).raw)).toEqual(['1', '2', '3']);
  });
});

describe('model → file', () => {
  it('writes frontmatter, verbatim greek, row markup and footnote entries', () => {
    const model = makeModel();
    const content = serializeModel(model);

    expect(content).toContain('schema_version: 1');
    expect(content).toContain('work: meta');
    expect(content).toContain('book: 7');
    expect(content).toContain('chapter: 17');
    expect(content).toContain('citation_scheme: bekker-metaphysics');
    expect(content).toContain('span_start: "1041a6"'); // from the model's row addresses
    expect(content).toContain('span_end: "1041a8"');
    expect(content).toContain('Τί δὲ χρὴ λέγειν καὶ ὁποῖόν τι τὴν οὐσίαν');
    expect(content).toContain('The **cause** of {^1:*being*} plainly');
    expect(content).toContain('{grc:τὸ τί ἦν εἶναι}');
    expect(content).toContain('1: See *Physics* B — τὸ αἴτιον.');
    // Unanchored bodies are user data — they persist too.
    expect(content).toContain('2: Unanchored line one');
  });

  it('footnote entries are sorted by chapter-local id', () => {
    const model = makeModel();
    model.footnotes.reverse();
    const file = chapterFileFromModel(model);
    expect(file.footnotes.map((f) => f.id)).toEqual([1, 2]);
  });

  it('refuses to serialize a non-integer footnote id (never write a corrupt file)', () => {
    const model = makeModel();
    model.footnotes.push({ id: 'nope', body: '', anchored: false });
    expect(() => serializeModel(model)).toThrow(/footnote id/);
  });

  it('writes column_starts on every save, computed from the model row addresses', () => {
    expect(serializeModel(makeModel())).toContain('column_starts: "1041a6@1"');
    expect(serializeModel(makeMultiColumnModel())).toContain('column_starts: "1041a33@1,1041b1@2,1042a1@3"');
  });

  it('column_starts round-trips: the parsed file carries the pairs', () => {
    const file = parseChapterFile(serializeModel(makeMultiColumnModel()), 'cs-roundtrip');
    expect(file.meta.columnStarts).toEqual([
      { ref: '1041a33', rowIndex: 1 },
      { ref: '1041b1', rowIndex: 2 },
      { ref: '1042a1', rowIndex: 3 },
    ]);
  });

  it('omits column_starts (still saving!) when row addresses are not exactly representable', () => {
    const model = makeModel();
    model.rows[2] = { ...model.rows[2], address: addr('') }; // spine-drift filler
    const content = serializeModel(model, { start: '1041a6', end: '1041a8' });
    expect(content).not.toContain('column_starts');
    expect(() => parseChapterFile(content, 'no-cs')).not.toThrow();
  });

  it('the reported round-trip bug shape (final english row EMPTY + footnotes) serializes and self-checks', () => {
    const model = makeModel(); // row 2 is an empty english row, footnotes present
    const content = serializeModel(model);
    const back = parseChapterFile(content, 'bugshape');
    expect(back.englishLines).toHaveLength(3);
    expect(back.englishLines[2]).toBe('');
    expect(back.greekLines).toHaveLength(3);
  });

  it('anchoredFootnoteCount counts distinct markers in the rows', () => {
    const model = makeModel();
    expect(anchoredFootnoteCount(model)).toBe(1);
    model.rows[2].english = buildRowDoc([t('x', { fnRef: '9' }), m('9')]).toJSON();
    expect(anchoredFootnoteCount(model)).toBe(2);
  });
});

describe('model → file → model round trip', () => {
  it('preserves marks, greek spans, footnote anchors and bodies', () => {
    const model = makeModel();
    const file = parseChapterFile(serializeModel(model), 'roundtrip');
    const h = hydrateFromFile(file, spineOf(model), SCHEME);

    expect(h.rows).toHaveLength(3);
    for (let i = 0; i < 3; i++) {
      expect(h.rows[i].greek).toBe(model.rows[i].greek);
      expect(h.rows[i].address).toEqual(model.rows[i].address);
      const back = docFromJSON(h.rows[i].english);
      const orig = docFromJSON(model.rows[i].english);
      expect(back.eq(orig)).toBe(true);
    }
    expect(h.footnotes).toEqual([
      { id: '1', body: 'See *Physics* B — τὸ αἴτιον.', anchored: true },
      { id: '2', body: 'Unanchored line one\nand a continuation line.', anchored: false },
    ]);
    expect(h.spans).toEqual({ start: '1041a6', end: '1041a8' });
    expect(h.notice).toBeNull();
  });

  it('prefers the FILE greek when the corpus differs, with a quiet notice', () => {
    const model = makeModel();
    const file = parseChapterFile(serializeModel(model), 'greekdrift');
    const spine = spineOf(model);
    spine[1] = { ...spine[1], greek: 'ἄλλην οἷον ἀρχὴν ποιησάμενοι λέγωμεν· ἴσως' };
    const h = hydrateFromFile(file, spine, SCHEME);
    expect(h.rows[1].greek).toBe('ἄλλην οἷον ἀρχὴν ποιησάμενοι λέγωμεν'); // the file's
    expect(h.notice).toMatch(/Saved Greek differs/);
  });

  it('prefers the FILE row count on drift: addresses fall back, spans come from the file meta', () => {
    const model = makeModel();
    const file = parseChapterFile(serializeModel(model), 'countdrift');
    const shortSpine = spineOf(model).slice(0, 2);
    const h = hydrateFromFile(file, shortSpine, SCHEME);
    expect(h.rows).toHaveLength(3); // the file's count, not the spine's
    expect(h.rows[2].address).toEqual({ scheme: SCHEME, raw: '' });
    expect(h.rows[2].greek).toBe(model.rows[2].greek);
    expect(h.spans).toEqual({ start: '1041a6', end: '1041a8' }); // file meta
    expect(h.notice).toMatch(/3 lines but the corpus spine has 2/);

    const longSpine = [...spineOf(model), { address: addr('1041a9'), greek: 'extra' }];
    const h2 = hydrateFromFile(file, longSpine, SCHEME);
    expect(h2.rows).toHaveLength(3);
    expect(h2.notice).toMatch(/3 lines but the corpus spine has 4/);
  });

  it('a marker with no [FOOTNOTES] entry gets a working empty-body footnote', () => {
    const model = makeModel();
    model.footnotes = []; // marker {^1:…} stays in row 0
    const file = parseChapterFile(serializeModel(model), 'orphanmarker');
    const h = hydrateFromFile(file, spineOf(model), SCHEME);
    expect(h.footnotes).toEqual([{ id: '1', body: '', anchored: true }]);
  });

  it('serializes + parses heading levels; a CORPUS hydrate ignores them (gate)', () => {
    const model = makeModel();
    model.rows[0].headingLevel = 1;
    model.rows[1].headingLevel = 3; // a deep tier — levels are no longer 1|2
    const content = serializeModel(model);
    expect(content).toContain('headers: "1:1,2:3"');
    const file = parseChapterFile(content, 'levels-rt');
    expect(file.meta.headers).toEqual([
      { row: 1, level: 1 },
      { row: 2, level: 3 },
    ]);
    // A stray headers: line in a Bekker (corpus) file must NEVER turn a row into
    // a heading — hydration only applies headers to document-spine works. The
    // document-spine round-trip is covered in the document-spine describe below.
    const h = hydrateFromFile(file, spineOf(model), SCHEME);
    expect(h.rows[0].headingLevel).toBeUndefined();
    expect(h.rows[1].headingLevel).toBeUndefined();
  });

  it('writes no headers key when no row carries a heading level', () => {
    const content = serializeModel(makeModel());
    expect(content).not.toContain('headers:');
  });
});

describe('loadChapterFile', () => {
  it('distinguishes absent (fresh) from unreadable (must not overwrite)', async () => {
    const storage = new MemStorage();
    const fileName = chapterFileName(7, 17);
    expect(await loadChapterFile(storage, 'meta', fileName)).toEqual({ file: null, error: null });

    await storage.write('meta', fileName, '--- broken junk');
    const res = await loadChapterFile(storage, 'meta', fileName);
    expect(res.file).toBeNull();
    expect(res.error).toMatch(/frontmatter/);

    await storage.write('meta', fileName, serializeModel(makeModel()));
    const ok = await loadChapterFile(storage, 'meta', fileName);
    expect(ok.error).toBeNull();
    expect(ok.file?.meta.chapter).toBe(17);
  });
});

describe('autosave scheduler (fake timers)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('debounces ~1s and writes the LATEST snapshot', async () => {
    const storage = new MemStorage();
    let content = 'one';
    const auto = createAutosave({ workId: 'w', fileName: 'debounce.md', storage, snapshot: () => content });

    auto.markDirty();
    await vi.advanceTimersByTimeAsync(AUTOSAVE_DEBOUNCE_MS - 1);
    expect(storage.writes).toBe(0);

    content = 'two';
    auto.markDirty(); // burst continues — timer restarts
    await vi.advanceTimersByTimeAsync(AUTOSAVE_DEBOUNCE_MS - 1);
    expect(storage.writes).toBe(0);

    await vi.advanceTimersByTimeAsync(1);
    expect(storage.writes).toBe(1);
    expect(storage.files.get('w/debounce.md')).toBe('two');
    expect(auto.state).toBe('saved');
  });

  it('flush saves immediately, cancels the timer; a clean flush writes nothing', async () => {
    const storage = new MemStorage();
    const auto = createAutosave({ workId: 'w', fileName: 'flush.md', storage, snapshot: () => 'x' });

    auto.markDirty();
    await auto.flush(); // chapter switch / blur / hidden
    expect(storage.writes).toBe(1);

    await vi.advanceTimersByTimeAsync(10_000);
    expect(storage.writes).toBe(1); // debounce timer was cancelled

    await auto.flush(); // nothing dirty
    expect(storage.writes).toBe(1);
  });

  it('an edit landing during an in-flight write is not lost — the final file is the final state', async () => {
    const storage = new GatedStorage();
    let content = 'v1';
    const auto = createAutosave({ workId: 'w', fileName: 'inflight.md', storage, snapshot: () => content });

    auto.markDirty();
    await vi.advanceTimersByTimeAsync(AUTOSAVE_DEBOUNCE_MS);
    expect(storage.pendingWrites).toBe(1); // v1 write in flight

    content = 'v2';
    auto.markDirty(); // lands mid-write

    storage.release();
    await vi.advanceTimersByTimeAsync(0);
    expect(storage.pendingWrites).toBe(1); // loop went again with the fresh snapshot

    storage.release();
    await vi.advanceTimersByTimeAsync(0);
    expect(storage.files.get('w/inflight.md')).toBe('v2');
    expect(storage.writes).toBe(2);

    await vi.advanceTimersByTimeAsync(10_000); // the second debounce timer fires — nothing left
    expect(storage.writes).toBe(2);
  });

  it('write failure keeps the data dirty and retries on the next flush', async () => {
    const storage = new FlakyStorage(1);
    const states: SaveState[] = [];
    let saved = 0;
    const auto = createAutosave({
      workId: 'w',
      fileName: 'flaky.md',
      storage,
      snapshot: () => 'precious',
      onState: (s) => states.push(s),
      onSaved: () => saved++,
    });

    auto.markDirty();
    await vi.advanceTimersByTimeAsync(AUTOSAVE_DEBOUNCE_MS);
    expect(auto.state).toBe('error');
    expect(storage.files.has('w/flaky.md')).toBe(false);
    expect(saved).toBe(0);

    await auto.flush(); // retry — nothing was thrown away
    expect(auto.state).toBe('saved');
    expect(storage.files.get('w/flaky.md')).toBe('precious');
    expect(states).toEqual(['saving', 'error', 'saving', 'saved']);
    expect(saved).toBe(1);
  });

  it('dispose flushes; later markDirty is ignored', async () => {
    const storage = new MemStorage();
    const auto = createAutosave({ workId: 'w', fileName: 'dispose.md', storage, snapshot: () => 'final' });

    auto.markDirty();
    await auto.dispose();
    expect(storage.files.get('w/dispose.md')).toBe('final');

    auto.markDirty();
    await vi.advanceTimersByTimeAsync(10_000);
    expect(storage.writes).toBe(1);
  });

  it('reopening a chapter awaits the in-flight write (flush BEFORE the next load)', async () => {
    const storage = new GatedStorage();
    const payload = serializeModel(makeModel());
    const fileName = chapterFileName(7, 17);
    const auto = createAutosave({ workId: 'meta', fileName, storage, snapshot: () => payload });

    auto.markDirty();
    const flushP = auto.flush(); // chapter switch: write goes in flight
    await vi.advanceTimersByTimeAsync(0);
    expect(storage.pendingWrites).toBe(1);

    let result: LoadResult | null = null;
    void loadChapterFile(storage, 'meta', fileName).then((r) => (result = r));
    await vi.advanceTimersByTimeAsync(0);
    expect(result).toBeNull(); // the read is parked behind the write

    storage.release();
    await vi.advanceTimersByTimeAsync(0);
    await flushP;
    await vi.advanceTimersByTimeAsync(0);
    expect(result).not.toBeNull();
    expect(result!.error).toBeNull();
    expect(result!.file?.meta.spanStart).toBe('1041a6'); // sees the just-flushed content
  });

  it('spansFromModel takes the first/last row addresses', () => {
    expect(spansFromModel(makeModel())).toEqual({ start: '1041a6', end: '1041a8' });
  });
});

// ── paragraph splits (design doc D6, slice 1) ────────────────────────────────
//
// Format layer only: chapterFileFromModel emits line_splits + ¶-segmented
// [ENGLISH] rows; hydrateFromFile restores segmented rows, applying the drift
// policy (a drifted split un-splits the line, English rejoined with a space,
// one plain sentence on the notice channel) and English-count-wins on any
// ¶-count vs offset-count skew. serializeModel's round-trip self-check must
// stay green on split models — the last line of defense on user data.

describe('paragraph splits (design doc D6, slice 1)', () => {
  // makeModel row 0 greek: 'Τί δὲ χρὴ λέγειν καὶ ὁποῖόν τι τὴν οὐσίαν'
  // code-unit offsets 3 ('δὲ…') and 6 ('χρὴ…') sit right after word gaps.
  function makeSplitModel(): ChapterModel {
    const model = makeModel();
    model.rows[0] = {
      ...model.rows[0],
      splitOffsets: [3],
      english2: [buildRowDoc([t('and then a new paragraph')]).toJSON()],
    };
    return model;
  }

  const DRIFT_1041A6 =
    "A paragraph split in line 1041a6 didn't line up with the Greek and was removed — re-split if you still want it.";

  it('serializeModel emits line_splits and the ¶-joined English row, and the self-check stays green', () => {
    const content = serializeModel(makeSplitModel());
    expect(content).toContain('line_splits: "1041a6@3"');
    expect(content).toContain('The **cause** of {^1:*being*} plainly¶and then a new paragraph');
    const file = parseChapterFile(content, 'split-emit');
    expect(file.meta.lineSplits).toEqual([{ ref: '1041a6', offset: 3 }]);
    expect(file.englishLines[0]).toBe('The **cause** of {^1:*being*} plainly¶and then a new paragraph');
  });

  it('an unsplit model writes neither line_splits nor ¶ (old files stay byte-identical)', () => {
    const content = serializeModel(makeModel());
    expect(content).not.toContain('line_splits');
    expect(content).not.toContain('¶');
  });

  it('model → file → model round trip restores one split exactly (offsets, both segments, no notice)', () => {
    const model = makeSplitModel();
    const file = parseChapterFile(serializeModel(model), 'split-rt');
    const h = hydrateFromFile(file, spineOf(model), SCHEME);
    expect(h.notice).toBeNull();
    expect(h.rows[0].splitOffsets).toEqual([3]);
    expect(h.rows[0].english2).toHaveLength(1);
    expect(docFromJSON(h.rows[0].english).eq(docFromJSON(model.rows[0].english))).toBe(true);
    expect(docFromJSON(h.rows[0].english2![0]).eq(docFromJSON(model.rows[0].english2![0]))).toBe(true);
    expect(h.rows[1].splitOffsets).toBeUndefined();
    expect(h.rows[1].english2).toBeUndefined();
  });

  it('round-trips two splits on one line and a split on a non-adjacent line', () => {
    const model = makeModel();
    model.rows[0] = {
      ...model.rows[0],
      splitOffsets: [3, 6],
      english2: [buildRowDoc([t('second')]).toJSON(), buildRowDoc([t('third')]).toJSON()],
    };
    model.rows[2] = {
      ...model.rows[2],
      splitOffsets: [6], // after 'ἔσται ' in 'ἔσται δῆλον καὶ περὶ ἐκείνης'
      english2: [buildRowDoc([t('tail')]).toJSON()],
    };
    const content = serializeModel(model);
    expect(content).toContain('line_splits: "1041a6@3,1041a6@6,1041a8@6"');
    const h = hydrateFromFile(parseChapterFile(content, 'split-rt2'), spineOf(model), SCHEME);
    expect(h.notice).toBeNull();
    expect(h.rows[0].splitOffsets).toEqual([3, 6]);
    expect(h.rows[0].english2).toHaveLength(2);
    expect(docFromJSON(h.rows[0].english2![1]).eq(docFromJSON(model.rows[0].english2![1]))).toBe(true);
    expect(h.rows[1].splitOffsets).toBeUndefined();
    expect(h.rows[2].splitOffsets).toEqual([6]);
    expect(docFromJSON(h.rows[2].english2![0]).eq(docFromJSON(model.rows[2].english2![0]))).toBe(true);
  });

  it('an EMPTY continuation segment (untranslated second paragraph) round-trips', () => {
    const model = makeModel();
    model.rows[0] = { ...model.rows[0], splitOffsets: [3], english2: [emptyRowDocJSON()] };
    const content = serializeModel(model);
    expect(content).toContain('plainly¶');
    const h = hydrateFromFile(parseChapterFile(content, 'split-empty'), spineOf(model), SCHEME);
    expect(h.notice).toBeNull();
    expect(h.rows[0].splitOffsets).toEqual([3]);
    expect(h.rows[0].english2).toHaveLength(1);
    expect(docFromJSON(h.rows[0].english2![0]).eq(docFromJSON(emptyRowDocJSON()))).toBe(true);
  });

  it('drift: an out-of-range offset loads the line UNSPLIT with the exact notice, English rejoined with a space', () => {
    const model = makeSplitModel();
    const content = serializeModel(model).replace('line_splits: "1041a6@3"', 'line_splits: "1041a6@999"');
    const h = hydrateFromFile(parseChapterFile(content, 'split-range'), spineOf(model), SCHEME);
    expect(h.notice).toBe(DRIFT_1041A6);
    expect(h.rows[0].splitOffsets).toBeUndefined();
    expect(h.rows[0].english2).toBeUndefined();
    const rejoined = joinRowDocs([model.rows[0].english, model.rows[0].english2![0]]);
    expect(docFromJSON(h.rows[0].english).eq(docFromJSON(rejoined))).toBe(true);
  });

  it('drift: a non-word-boundary offset (mid-word) is treated the same way', () => {
    const model = makeSplitModel();
    const content = serializeModel(model).replace('line_splits: "1041a6@3"', 'line_splits: "1041a6@1"');
    const h = hydrateFromFile(parseChapterFile(content, 'split-boundary'), spineOf(model), SCHEME);
    expect(h.notice).toBe(DRIFT_1041A6);
    expect(h.rows[0].splitOffsets).toBeUndefined();
    expect(h.rows[0].english2).toBeUndefined();
    const rejoined = joinRowDocs([model.rows[0].english, model.rows[0].english2![0]]);
    expect(docFromJSON(h.rows[0].english).eq(docFromJSON(rejoined))).toBe(true);
  });

  it('skew: ¶ segments with NO offsets — English wins, segments preserved without an anchor, notice surfaced', () => {
    const model = makeSplitModel();
    const content = serializeModel(model).replace('line_splits: "1041a6@3"\n', '');
    const h = hydrateFromFile(parseChapterFile(content, 'split-skew-short'), spineOf(model), SCHEME);
    expect(h.notice).toBe(DRIFT_1041A6);
    expect(h.rows[0].splitOffsets).toBeUndefined();
    expect(h.rows[0].english2).toHaveLength(1); // nothing dropped
    expect(docFromJSON(h.rows[0].english).eq(docFromJSON(model.rows[0].english))).toBe(true);
    expect(docFromJSON(h.rows[0].english2![0]).eq(docFromJSON(model.rows[0].english2![0]))).toBe(true);
  });

  it('skew: MORE offsets than ¶ segments — English wins, extra offset dropped, segments intact, notice surfaced', () => {
    const model = makeSplitModel();
    const content = serializeModel(model).replace('line_splits: "1041a6@3"', 'line_splits: "1041a6@3,1041a6@6"');
    const h = hydrateFromFile(parseChapterFile(content, 'split-skew-long'), spineOf(model), SCHEME);
    expect(h.notice).toBe(DRIFT_1041A6);
    expect(h.rows[0].splitOffsets).toEqual([3]); // truncated to segments − 1
    expect(h.rows[0].english2).toHaveLength(1);
    expect(docFromJSON(h.rows[0].english2![0]).eq(docFromJSON(model.rows[0].english2![0]))).toBe(true);
  });

  it('drift: a split whose address no row carries is dropped with its notice; the orphaned ¶ segments stay (English wins)', () => {
    const model = makeSplitModel();
    const content = serializeModel(model).replace('line_splits: "1041a6@3"', 'line_splits: "1041b30@3"');
    const h = hydrateFromFile(parseChapterFile(content, 'split-noline'), spineOf(model), SCHEME);
    expect(h.notice).toContain(
      "A paragraph split in line 1041b30 didn't line up with the Greek and was removed — re-split if you still want it.",
    );
    expect(h.notice).toContain(DRIFT_1041A6); // row 0's segments now lack their anchor (skew)
    expect(h.rows[0].splitOffsets).toBeUndefined();
    expect(h.rows[0].english2).toHaveLength(1); // nothing dropped
  });

  it('maps line_splits refs via the corpus spine when the file has no column_starts (older addressing)', () => {
    const model = makeSplitModel();
    // Span drift makes columnStartsFromModel bail — the file is written
    // WITHOUT column_starts but WITH line_splits.
    const content = serializeModel(model, { start: '1041a5', end: '1041a8' });
    expect(content).not.toContain('column_starts');
    expect(content).toContain('line_splits: "1041a6@3"');
    const h = hydrateFromFile(parseChapterFile(content, 'split-spine-fallback'), spineOf(model), SCHEME);
    expect(h.notice).toBeNull();
    expect(h.rows[0].splitOffsets).toEqual([3]);
    expect(h.rows[0].english2).toHaveLength(1);
  });

  it('a split row whose address is the spine-drift filler saves WITHOUT its anchors but WITH its ¶ segments (self-check green)', () => {
    const model = makeSplitModel();
    model.rows[0] = { ...model.rows[0], address: addr('') };
    const content = serializeModel(model, { start: '1041a6', end: '1041a8' });
    expect(content).not.toContain('line_splits');
    expect(content).toContain('¶and then a new paragraph'); // prose never lost
    expect(() => parseChapterFile(content, 'split-filler')).not.toThrow();
  });

  it('footnote markers in continuation segments count and anchor (segment-order walk)', () => {
    const model = makeSplitModel();
    model.rows[0] = {
      ...model.rows[0],
      english2: [buildRowDoc([t('see note', { fnRef: '2' }), m('2'), t(' and '), m('9')]).toJSON()],
    };
    expect(anchoredFootnoteCount(model)).toBe(3); // 1 (segment 0) + 2 and 9 (continuation)
    const file = parseChapterFile(serializeModel(model), 'split-fn');
    const h = hydrateFromFile(file, spineOf(model), SCHEME);
    expect(h.footnotes).toEqual([
      { id: '1', body: 'See *Physics* B — τὸ αἴτιον.', anchored: true },
      { id: '2', body: 'Unanchored line one\nand a continuation line.', anchored: true },
      { id: '9', body: '', anchored: true }, // marker with no entry, found via the segment walk
    ]);
  });

  it('greek drift and split drift share the notice channel (sentences joined)', () => {
    const model = makeSplitModel();
    const content = serializeModel(model).replace('line_splits: "1041a6@3"', 'line_splits: "1041a6@999"');
    const spine = spineOf(model);
    spine[1] = { ...spine[1], greek: 'ἄλλην οἷον ἀρχὴν ποιησάμενοι λέγωμεν· ἴσως' };
    const h = hydrateFromFile(parseChapterFile(content, 'split-both'), spine, SCHEME);
    expect(h.notice).toBe(`Saved Greek differs from the corpus text — using the saved file. ${DRIFT_1041A6}`);
  });
});

describe('document-spine chapter files (D8 Phase B)', () => {
  const paddr = (raw: string) => ({ scheme: 'paragraph' as const, raw });
  const laddr = (raw: string) => ({ scheme: 'plain-line' as const, raw });
  const textOf = (json: PMDocJSON) => docFromJSON(json).textContent;

  function paragraphModel(): ChapterModel {
    return {
      workId: 'free-paragraph',
      workTitle: 'Free Paragraph',
      scheme: 'paragraph',
      book: 1,
      bookLabel: '',
      chapter: 1,
      bekkerRange: '¶1–2',
      rows: [
        {
          address: paddr('¶1'),
          greek: 'Alpha sentence. Beta sentence.',
          english: buildRowDoc([t('Alpha sentence')]).toJSON(),
          english2: [buildRowDoc([t('Beta sentence')]).toJSON()],
          splitOffsets: [16],
          englishPara: buildRowDoc([t('Paragraph one whole')]).toJSON(),
        },
        {
          address: paddr('¶2'),
          greek: 'Gamma sentence.',
          english: emptyRowDocJSON(),
          englishPara: buildRowDoc([t('Paragraph two whole')]).toJSON(),
        },
      ],
      footnotes: [],
      dirty: false,
    };
  }

  function paragraphModelOf(h: ReturnType<typeof hydrateFromFile>): ChapterModel {
    return {
      workId: 'free-paragraph',
      workTitle: 'Free Paragraph',
      scheme: 'paragraph',
      book: 1,
      bookLabel: '',
      chapter: 1,
      bekkerRange: '¶1–2',
      rows: h.rows,
      footnotes: h.footnotes,
      dirty: false,
    };
  }

  it('serializes and hydrates a paragraph-scheme file with [ENGLISH.PARA], sentence line_splits, and ¶ spans', () => {
    const model = paragraphModel();
    const content = serializeModel(model);
    expect(content).toContain('citation_scheme: paragraph');
    expect(content).toContain('span_start: "¶1"');
    expect(content).toContain('span_end: "¶2"');
    expect(content).not.toContain('column_starts');
    expect(content).toContain('line_splits: "¶1@16"');
    expect(content).toContain('[ENGLISH.PARA]\nParagraph one whole\nParagraph two whole\n');

    const file = parseChapterFile(content, 'paragraph-doc');
    expect(file.englishParaLines).toEqual(['Paragraph one whole', 'Paragraph two whole']);
    const h = hydrateFromFile(file, [], 'paragraph');
    expect(h.notice).toBeNull();
    expect(h.rows.map((r) => r.address.raw)).toEqual(['¶1', '¶2']);
    expect(h.spans).toEqual({ start: '¶1', end: '¶2' });
    expect(h.rows[0].splitOffsets).toEqual([16]);
    expect(h.rows[0].english2).toHaveLength(1);
    expect(textOf(h.rows[0].englishPara!)).toBe('Paragraph one whole');
  });

  it('round-trips heading levels through a document-spine file (deep tiers)', () => {
    const model = paragraphModel();
    model.rows[0].headingLevel = 2;
    model.rows[1].headingLevel = 1;
    const content = serializeModel(model);
    expect(content).toContain('headers: "1:2,2:1"');
    const h = hydrateFromFile(parseChapterFile(content, 'para-headers'), [], 'paragraph');
    expect(h.rows[0].headingLevel).toBe(2);
    expect(h.rows[1].headingLevel).toBe(1);
  });

  it('saves paragraph-layer newlines as one physical [ENGLISH.PARA] row and hydrates them back', () => {
    const model = paragraphModel();
    model.rows[0].englishPara = buildRowDoc([t('Paragraph one'), t('\n'), t('whole')]).toJSON();
    const content = serializeModel(model);
    expect(content).toContain('[ENGLISH.PARA]\nParagraph one⏎whole\nParagraph two whole\n');

    const file = parseChapterFile(content, 'paragraph-newline');
    expect(file.englishParaLines).toEqual(['Paragraph one⏎whole', 'Paragraph two whole']);
    const h = hydrateFromFile(file, [], 'paragraph');
    expect(textOf(h.rows[0].englishPara!)).toBe('Paragraph one\nwhole');
  });

  it('a paragraph-layer file without ⏎ stays byte-identical through hydrate and save', () => {
    const content = serializeModel(paragraphModel());
    expect(content).not.toContain('⏎');
    const h = hydrateFromFile(parseChapterFile(content, 'paragraph-no-token'), [], 'paragraph');
    expect(serializeModel(paragraphModelOf(h))).toBe(content);
  });

  it('serializes a plain-line document with paragraph_starts and no column_starts', () => {
    const model: ChapterModel = {
      workId: 'free-lines',
      workTitle: 'Free Lines',
      scheme: 'plain-line',
      book: 1,
      bookLabel: '',
      chapter: 1,
      bekkerRange: '1–3',
      rows: [
        { address: laddr('1'), greek: 'Line one', english: buildRowDoc([t('one')]).toJSON() },
        { address: laddr('2'), greek: 'Line two', english: buildRowDoc([t('two')]).toJSON() },
        { address: laddr('3'), greek: 'Line three', english: emptyRowDocJSON() },
      ],
      footnotes: [],
      dirty: false,
    };
    const doc = chapterFileFromModel(model);
    doc.meta.paragraphStarts = [1, 3];
    const content = serializeChapterFile(doc);
    const file = parseChapterFile(content, 'plain-line-doc');
    expect(file.meta.paragraphStarts).toEqual([1, 3]);
    expect(content).not.toContain('column_starts');
    expect(content).toContain('span_start: "1"');
    expect(content).toContain('span_end: "3"');
    expect(serializeChapterFile(file)).toBe(content);
  });

  it('drift-degrade behavior is reused on paragraph rows', () => {
    const model = paragraphModel();
    const content = serializeModel(model).replace('line_splits: "¶1@16"', 'line_splits: "¶1@999"');
    const h = hydrateFromFile(parseChapterFile(content, 'paragraph-drift'), [], 'paragraph');
    expect(h.notice).toBe("A paragraph split in line ¶1 didn't line up with the Greek and was removed — re-split if you still want it.");
    expect(h.rows[0].splitOffsets).toBeUndefined();
    expect(h.rows[0].english2).toBeUndefined();
    expect(textOf(h.rows[0].english)).toBe('Alpha sentence Beta sentence');
    expect(textOf(h.rows[0].englishPara!)).toBe('Paragraph one whole');
  });

  it('hydrate-with-empty-spine produces synthetic addresses and preserves English-count-wins', () => {
    const raw = `---
schema_version: 1
work: free-paragraph
book: 1
chapter: 1
citation_scheme: paragraph
span_start: "¶1"
span_end: "¶1"
line_splits: "¶1@16,¶1@21"
---
[GREEK]
Alpha sentence. Beta sentence.

[ENGLISH]
one¶two
`;
    const h = hydrateFromFile(parseChapterFile(raw, 'paragraph-skew'), [], 'paragraph');
    expect(h.rows.map((r) => r.address.raw)).toEqual(['¶1']);
    expect(h.rows[0].splitOffsets).toEqual([16]);
    expect(h.rows[0].english2).toHaveLength(1);
    expect(textOf(h.rows[0].english2![0])).toBe('two');
    expect(h.notice).toBe("A paragraph split in line ¶1 didn't line up with the Greek and was removed — re-split if you still want it.");
  });

  it('malformed paragraph_starts degrades to a sanitized grouping + one-line notice — the document stays openable', () => {
    const raw = `---
schema_version: 1
work: free-lines
book: 1
chapter: 1
citation_scheme: plain-line
span_start: "1"
span_end: "2"
paragraph_starts: "2,2,9"
---
[GREEK]
Line one
Line two

[ENGLISH]
one
two
`;
    const file = parseChapterFile(raw, 'bad-starts');
    expect(file.meta.paragraphStarts).toEqual([2]);
    const h = hydrateFromFile(file, [], 'plain-line');
    expect(h.rows.map((r) => r.greek)).toEqual(['Line one', 'Line two']); // prose intact
    expect(textOf(h.rows[0].english)).toBe('one');
    expect(h.paragraphStarts).toEqual([2]);
    expect(h.notice).toBe(
      'Some of the saved paragraph grouping was invalid and was removed — regroup if you still want it.',
    );
  });
});

describe('paragraph-layer footnote markers (D8 v1 rule — footnotes are sentence-layer only)', () => {
  const textOf = (json: PMDocJSON) => docFromJSON(json).textContent;

  // {^1:anchored} lives in the SENTENCE layer (live footnote); {^2:stray} and
  // the bodyless {^3:} arrived in [ENGLISH.PARA] by paste/hand edit.
  const paraMarkerFile = `---
schema_version: 1
work: free-paragraph
book: 1
chapter: 1
citation_scheme: paragraph
span_start: "¶1"
span_end: "¶2"
---
[GREEK]
Alpha source.
Beta source.

[ENGLISH]
Alpha {^1:anchored} here.


[ENGLISH.PARA]

Beta {^2:stray} tail {^3:}

[FOOTNOTES]
1: sentence-layer note
2: para-only note
`;

  function modelOf(h: ReturnType<typeof hydrateFromFile>): ChapterModel {
    return {
      workId: 'free-paragraph',
      workTitle: 'Free Paragraph',
      scheme: 'paragraph',
      book: 1,
      bookLabel: '',
      chapter: 1,
      bekkerRange: '¶1–2',
      rows: h.rows,
      footnotes: h.footnotes,
      dirty: false,
    };
  }

  it('hydration strips para-layer markers (phrase kept) and never anchors or invents footnotes from them', () => {
    const h = hydrateFromFile(parseChapterFile(paraMarkerFile, 'para-markers'), [], 'paragraph');
    // Sentence-layer marker anchors normally; the para-only body stays
    // UNANCHORED (kept + recoverable — matching the panel's sentence-layer
    // scan); the bodyless para marker {^3:} invents nothing.
    expect(h.footnotes).toEqual([
      { id: '1', body: 'sentence-layer note', anchored: true },
      { id: '2', body: 'para-only note', anchored: false },
    ]);
    // Para-layer prose is lossless minus the decoration.
    expect(textOf(h.rows[1].englishPara!)).toBe('Beta stray tail ');
  });

  it('the file round-trips without gaining or losing footnote bodies, and the stripped para layer stays stripped', () => {
    const h = hydrateFromFile(parseChapterFile(paraMarkerFile, 'para-markers'), [], 'paragraph');
    const saved = serializeModel(modelOf(h));
    expect(saved).toContain('1: sentence-layer note');
    expect(saved).toContain('2: para-only note');
    expect(saved).toContain('Alpha {^1:anchored} here.'); // sentence layer untouched
    expect(saved).toContain('Beta stray tail '); // para layer: text kept
    expect(saved).not.toContain('{^2:');
    expect(saved).not.toContain('{^3:');

    const h2 = hydrateFromFile(parseChapterFile(saved, 'para-markers-resaved'), [], 'paragraph');
    expect(h2.footnotes).toEqual(h.footnotes); // stable: no empty-bodied recreation
  });

  it('deleting the para-only footnote body cannot resurrect on reload (the failure this rule prevents)', () => {
    const h = hydrateFromFile(parseChapterFile(paraMarkerFile, 'para-markers'), [], 'paragraph');
    const model = modelOf(h);
    // Panel Delete on the unanchored footnote 2: body removed from the model.
    model.footnotes = model.footnotes.filter((f) => f.id !== '2');
    const saved = serializeModel(model);
    const h2 = hydrateFromFile(parseChapterFile(saved, 'after-delete'), [], 'paragraph');
    expect(h2.footnotes).toEqual([{ id: '1', body: 'sentence-layer note', anchored: true }]);
  });

  it('save boundary: a marker pasted into the LIVE para layer is stripped on serialize and never counted', () => {
    const h = hydrateFromFile(parseChapterFile(paraMarkerFile, 'para-markers'), [], 'paragraph');
    const model = modelOf(h);
    model.rows[0].englishPara = buildRowDoc([t('pasted '), t('phrase', { fnRef: '9' }), m('9')]).toJSON();
    expect(anchoredFootnoteCount(model)).toBe(1); // only the sentence-layer {^1}
    const doc = chapterFileFromModel(model);
    expect(doc.englishParaLines![0]).toBe('pasted phrase');
  });

  it('a marker-only para line strips to nothing — no [ENGLISH.PARA] resurrection from decoration alone', () => {
    const raw = paraMarkerFile.replace('Beta {^2:stray} tail {^3:}', '{^2:}');
    const h = hydrateFromFile(parseChapterFile(raw, 'marker-only-para'), [], 'paragraph');
    expect(h.rows[1].englishPara).toBeUndefined();
    const saved = serializeModel(modelOf(h));
    expect(saved).not.toContain('[ENGLISH.PARA]'); // no other row has para content
    expect(saved).toContain('2: para-only note'); // the body itself is still kept
  });
});
