import { describe, expect, it } from 'vitest';
import { proposeSplits } from '../../reference/assign';
import { createManifest, upsertChapter } from '../../reference/manifest';
import {
  MANIFEST_FILE,
  MemReferenceStorage,
  parseReferenceChapterFile,
} from '../../reference/storage';
import { parseManifest } from '../../reference/manifest';
import {
  assignedRows,
  duplicateTargets,
  importGate,
  replaceQuestion,
  rowsFromBlocks,
  unassignedCount,
  unassignedSentence,
  writeAssignedBlocks,
  type AssignmentRow,
} from '../importModel';

const NOW = '2026-07-03T00:00:00.000Z';

describe('rowsFromBlocks', () => {
  it('carries proposeSplits detection into editable rows', () => {
    const blocks = proposeSplits('# Book 7\n## 17\nZ.17 text.\n## 16\nZ.16 text.');
    const rows = rowsFromBlocks(blocks);
    expect(rows).toEqual([
      { book: 7, chapter: 17, text: 'Z.17 text.' },
      { book: 7, chapter: 16, text: 'Z.16 text.' },
    ]);
  });

  it('the no-structure fallback becomes one unassigned row', () => {
    const rows = rowsFromBlocks(proposeSplits('Plain prose with no headings at all.'));
    expect(rows).toEqual([
      { book: null, chapter: null, text: 'Plain prose with no headings at all.' },
    ]);
  });
});

describe('assignment accounting', () => {
  const rows: AssignmentRow[] = [
    { book: 7, chapter: 17, text: 'assigned' },
    { book: 7, chapter: null, text: 'half-assigned counts as unassigned' },
    { book: null, chapter: null, text: 'unassigned' },
  ];

  it('assignedRows keeps only fully assigned rows', () => {
    expect(assignedRows(rows)).toEqual([{ book: 7, chapter: 17, text: 'assigned' }]);
  });

  it('unassignedCount counts everything else', () => {
    expect(unassignedCount(rows)).toBe(2);
  });

  it('unassignedSentence pluralizes and disappears at zero', () => {
    expect(unassignedSentence(rows)).toBe(
      "2 sections weren't assigned to a chapter, so they won't be imported.",
    );
    expect(unassignedSentence([rows[0], rows[1]])).toBe(
      "1 section wasn't assigned to a chapter, so it won't be imported.",
    );
    expect(unassignedSentence([rows[0]])).toBeNull();
  });
});

describe('importGate', () => {
  it('blocks when nothing is assigned', () => {
    const gate = importGate([{ book: null, chapter: null, text: 'x' }]);
    expect(gate.enabled).toBe(false);
    expect(gate.reason).toBe('Assign at least one section to a chapter.');
  });

  it('blocks when two sections target the same chapter', () => {
    const gate = importGate([
      { book: 7, chapter: 17, text: 'a' },
      { book: 7, chapter: 17, text: 'b' },
    ]);
    expect(gate.enabled).toBe(false);
    expect(gate.reason).toContain('book 7, chapter 17');
  });

  it('opens for a clean assignment even with unassigned leftovers', () => {
    const gate = importGate([
      { book: 7, chapter: 17, text: 'a' },
      { book: null, chapter: null, text: 'leftover' },
    ]);
    expect(gate).toEqual({ enabled: true, reason: null });
  });
});

describe('duplicateTargets / replaceQuestion', () => {
  it('finds assigned rows that already exist in the manifest', () => {
    let manifest = createManifest('metaphysics', 'ross', 'Ross', NOW);
    manifest = upsertChapter(manifest, { book: 7, chapter: 17, file: 'chapter-07-17.md' }, NOW);
    const rows: AssignmentRow[] = [
      { book: 7, chapter: 17, text: 'replaces' },
      { book: 7, chapter: 16, text: 'new chapter' },
    ];
    expect(duplicateTargets(rows, manifest)).toEqual([
      { book: 7, chapter: 17, file: 'chapter-07-17.md' },
    ]);
  });

  it('is empty for a new edition (no manifest yet)', () => {
    expect(duplicateTargets([{ book: 7, chapter: 17, text: 'x' }], null)).toEqual([]);
  });

  it('replaceQuestion phrases the D5 confirm sentence', () => {
    expect(replaceQuestion('Ross', 7, 17)).toBe(
      'Replace the Ross text already imported for book 7, chapter 17?',
    );
  });
});

describe('writeAssignedBlocks', () => {
  it('writes normalized chapter files + a manifest for a new edition', async () => {
    const storage = new MemReferenceStorage();
    const rows: AssignmentRow[] = [
      { book: 7, chapter: 17, text: 'A sub-\nstance is a cause.\r\n\r\nSecond para.' },
      { book: null, chapter: null, text: 'dropped' },
    ];
    const result = await writeAssignedBlocks(storage, {
      workId: 'metaphysics',
      slug: 'ross',
      displayName: 'Ross (Oxford, 1924)',
      existingManifest: null,
      rows,
      now: NOW,
    });

    expect(result.written).toEqual([{ book: 7, chapter: 17, file: 'chapter-07-17.md' }]);
    expect(result.manifest.chapters).toEqual([
      { book: 7, chapter: 17, file: 'chapter-07-17.md' },
    ]);

    const rawChapter = await storage.read('metaphysics', 'ross', 'chapter-07-17.md');
    const parsed = parseReferenceChapterFile(rawChapter!);
    expect(parsed?.meta).toEqual({ work: 'metaphysics', book: 7, chapter: 17, edition: 'ross' });
    // normalizeReferenceText's rawKept form: CRLF folded, hyphenation rejoined.
    expect(parsed?.body).toBe('A substance is a cause.\n\nSecond para.');

    const rawManifest = await storage.read('metaphysics', 'ross', MANIFEST_FILE);
    expect(parseManifest(rawManifest!)).toEqual(result.manifest);
  });

  it('upserts into an existing edition, replacing a re-imported chapter', async () => {
    const storage = new MemReferenceStorage();
    const first = await writeAssignedBlocks(storage, {
      workId: 'metaphysics',
      slug: 'ross',
      displayName: 'Ross',
      existingManifest: null,
      rows: [
        { book: 7, chapter: 16, text: 'Z.16 first pass.' },
        { book: 7, chapter: 17, text: 'Z.17 first pass.' },
      ],
      now: NOW,
    });

    const later = '2026-07-04T00:00:00.000Z';
    const second = await writeAssignedBlocks(storage, {
      workId: 'metaphysics',
      slug: 'ross',
      displayName: 'Ross',
      existingManifest: first.manifest,
      rows: [{ book: 7, chapter: 17, text: 'Z.17 replaced.' }],
      now: later,
    });

    // Manifest keeps both chapters, no duplicate entry, timestamp bumped.
    expect(second.manifest.chapters).toEqual([
      { book: 7, chapter: 16, file: 'chapter-07-16.md' },
      { book: 7, chapter: 17, file: 'chapter-07-17.md' },
    ]);
    expect(second.manifest.importedAt).toBe(later);

    const replaced = await storage.read('metaphysics', 'ross', 'chapter-07-17.md');
    expect(parseReferenceChapterFile(replaced!)?.body).toBe('Z.17 replaced.');
    const untouched = await storage.read('metaphysics', 'ross', 'chapter-07-16.md');
    expect(parseReferenceChapterFile(untouched!)?.body).toBe('Z.16 first pass.');
  });
});
