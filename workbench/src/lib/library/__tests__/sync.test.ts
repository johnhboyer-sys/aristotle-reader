// sync.ts — pure-logic tests (build spec §11): mtime/hash change detection
// incl. the touched-timestamp-same-content case, conflict/placeholder
// filename patterns, and the reload decision matrix.
import { describe, expect, it } from 'vitest';
import {
  contentHash,
  snapshotOf,
  hasChanged,
  decideReload,
  isConflictedCopy,
  conflictOriginalFile,
  isCloudPlaceholder,
  placeholderRealName,
  classifyLibraryFile,
  classifyLibraryFiles,
  chapterLibraryStatuses,
} from '../sync';

describe('contentHash', () => {
  it('is deterministic for the same text', () => {
    expect(contentHash('hello')).toBe(contentHash('hello'));
  });
  it('differs for different text', () => {
    expect(contentHash('hello')).not.toBe(contentHash('hellp'));
  });
});

describe('hasChanged', () => {
  it('reports no change when mtime and content are both identical', () => {
    const known = snapshotOf(1000, 'the text');
    expect(hasChanged(known, 1000, 'the text')).toBe(false);
  });

  it('reports a change when content actually differs (even with mtime unknown)', () => {
    const known = snapshotOf(null, 'old text');
    expect(hasChanged(known, null, 'new text')).toBe(true);
  });

  it('reports a change when mtime and content both differ', () => {
    const known = snapshotOf(1000, 'old text');
    expect(hasChanged(known, 2000, 'new text')).toBe(true);
  });

  // The key false-positive guard: a sync client (Drive, iCloud) can re-touch
  // a file's mtime during a re-index pass without altering a single byte.
  // That must NEVER trigger a reload prompt.
  it('does NOT report a change when only the mtime moved but content is identical', () => {
    const known = snapshotOf(1000, 'unchanged text');
    expect(hasChanged(known, 5000, 'unchanged text')).toBe(false);
  });

  it('falls back to hash comparison when mtimes match but were both unknown', () => {
    const known = snapshotOf(null, 'a');
    expect(hasChanged(known, null, 'a')).toBe(false);
    expect(hasChanged(known, null, 'b')).toBe(true);
  });
});

describe('decideReload — clean/dirty × changed/unchanged matrix', () => {
  it('unchanged + clean → none', () => {
    expect(decideReload(false, false)).toEqual({ kind: 'none' });
  });
  it('unchanged + dirty → none (local edits are irrelevant if disk did not move)', () => {
    expect(decideReload(false, true)).toEqual({ kind: 'none' });
  });
  it('changed + clean → reload-seamless', () => {
    expect(decideReload(true, false)).toEqual({ kind: 'reload-seamless' });
  });
  it('changed + dirty → ask', () => {
    expect(decideReload(true, true)).toEqual({ kind: 'ask' });
  });
});

describe('isConflictedCopy / conflictOriginalFile', () => {
  it('matches Google Drive numbered duplicates', () => {
    expect(isConflictedCopy('b01c01 (1).md')).toBe(true);
    expect(conflictOriginalFile('b01c01 (1).md')).toBe('b01c01.md');
  });

  it('matches Google Drive "conflicted copy" suffix', () => {
    const file = 'b01c01 (conflicted copy 2026-07-02).md';
    expect(isConflictedCopy(file)).toBe(true);
    expect(conflictOriginalFile(file)).toBe('b01c01.md');
  });

  it('matches Dropbox "X\'s conflicted copy DATE" suffix', () => {
    const file = "b01c01 (John's conflicted copy 2026-07-02).md";
    expect(isConflictedCopy(file)).toBe(true);
    expect(conflictOriginalFile(file)).toBe('b01c01.md');
  });

  it('matches iCloud Drive bare numeric suffix against our own chapter-file stem', () => {
    const file = 'b01c01 2.md';
    expect(isConflictedCopy(file)).toBe(true);
    expect(conflictOriginalFile(file)).toBe('b01c01.md');
  });

  it('does not flag a normal chapter file', () => {
    expect(isConflictedCopy('b01c01.md')).toBe(false);
    expect(isConflictedCopy('.footnote-index.json')).toBe(false);
  });

  it('does not flag an unrelated filename with a trailing number (avoids false positives)', () => {
    // Not our chapter-file convention — should not be treated as an
    // iCloud-style conflicted copy of anything.
    expect(isConflictedCopy('notes 2.md')).toBe(false);
  });
});

describe('isCloudPlaceholder / placeholderRealName', () => {
  it('matches the dot-prefixed .icloud stub convention', () => {
    expect(isCloudPlaceholder('.b01c01.md.icloud')).toBe(true);
    expect(placeholderRealName('.b01c01.md.icloud')).toBe('b01c01.md');
  });

  it('does not flag a normal file or a regenerable dotfile cache', () => {
    expect(isCloudPlaceholder('b01c01.md')).toBe(false);
    expect(isCloudPlaceholder('.footnote-index.json')).toBe(false);
  });
});

describe('classifyLibraryFile / classifyLibraryFiles', () => {
  it('classifies a normal chapter file', () => {
    expect(classifyLibraryFile('b01c01.md')).toEqual({
      file: 'b01c01.md',
      kind: 'normal',
      originalFile: null,
    });
  });

  it('classifies a conflicted copy with its recovered original', () => {
    expect(classifyLibraryFile('b01c01 (1).md')).toEqual({
      file: 'b01c01 (1).md',
      kind: 'conflicted',
      originalFile: 'b01c01.md',
    });
  });

  it('classifies an iCloud placeholder stub', () => {
    expect(classifyLibraryFile('.b02c03.md.icloud')).toEqual({
      file: '.b02c03.md.icloud',
      kind: 'placeholder',
      originalFile: null,
    });
  });

  it('placeholder takes precedence over conflict pattern matching (dot-prefixed stub)', () => {
    // A placeholder stub for a conflicted copy: ".b01c01 (1).md.icloud" — it
    // must be classified as a placeholder (not downloaded), not conflicted.
    const result = classifyLibraryFile('.b01c01 (1).md.icloud');
    expect(result.kind).toBe('placeholder');
  });

  it('classifies a mixed directory listing', () => {
    const files = ['b01c01.md', 'b01c02.md', 'b01c02 (1).md', '.b01c03.md.icloud', '.footnote-index.json'];
    const result = classifyLibraryFiles(files);
    expect(result.map((r) => r.kind)).toEqual(['normal', 'normal', 'conflicted', 'placeholder', 'normal']);
  });
});

describe('chapterLibraryStatuses', () => {
  it('marks a chapter whose clean file is currently only an iCloud stub', () => {
    const statuses = chapterLibraryStatuses(['.b01c01.md.icloud']);
    expect(statuses.get('b01c01.md')).toEqual({ isPlaceholder: true, conflicts: [] });
  });

  it('collects conflicted-copy siblings under the chapter they shadow', () => {
    const statuses = chapterLibraryStatuses(['b01c01.md', 'b01c01 (1).md', 'b01c01 2.md']);
    expect(statuses.get('b01c01.md')).toEqual({
      isPlaceholder: false,
      conflicts: ['b01c01 (1).md', 'b01c01 2.md'],
    });
  });

  it('a normal, unremarkable chapter file has no entry at all', () => {
    const statuses = chapterLibraryStatuses(['b01c01.md']);
    expect(statuses.has('b01c01.md')).toBe(false);
  });

  it('handles a mixed listing across multiple chapters', () => {
    const files = ['b01c01.md', 'b01c02.md', '.b01c02.md.icloud', 'b01c03 (conflicted copy 2026-07-02).md'];
    const statuses = chapterLibraryStatuses(files);
    expect(statuses.get('b01c01.md')).toBeUndefined();
    expect(statuses.get('b01c02.md')).toEqual({ isPlaceholder: true, conflicts: [] });
    expect(statuses.get('b01c03.md')).toEqual({
      isPlaceholder: false,
      conflicts: ['b01c03 (conflicted copy 2026-07-02).md'],
    });
  });
});
