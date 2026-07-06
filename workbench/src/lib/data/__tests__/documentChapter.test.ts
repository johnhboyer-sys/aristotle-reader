import { describe, expect, it } from 'vitest';
import { documentChapterForEditor } from '../documentChapter';
import { createFreeDocument } from '../../import/createFreeDocument';
import { freeWorkManifest } from '../../works/freeWorks';
import { getWork } from '../../works/manifest';
import type { ChapterFile } from '../../chapterfile';

function freeDoc(unit: 'lines' | 'paragraphs', text: string) {
  const { work, file } = createFreeDocument({ title: 'Doc', unit, text });
  return { work: freeWorkManifest(work), file };
}

describe('documentChapterForEditor', () => {
  it('builds the editor fixture from the chapter file itself (paragraph doc)', () => {
    const { work, file } = freeDoc('paragraphs', 'One sentence. Another one.\n\nSecond block here');
    const fixture = documentChapterForEditor(work, file);
    expect(fixture).not.toBeNull();
    expect(fixture!.workId).toBe('doc');
    expect(fixture!.workTitle).toBe('Doc');
    expect(fixture!.book).toBe(1);
    expect(fixture!.chapter).toBe(1);
    expect(fixture!.bookLabel).toBe('');
    expect(fixture!.scheme).toBe('paragraph');
    expect(fixture!.lines.map((l) => l.address.raw)).toEqual(['¶1', '¶2']);
    expect(fixture!.lines.map((l) => l.greek)).toEqual(file.greekLines);
    expect(fixture!.bekkerRange).toBe('¶1–2');
  });

  it('derives plain ordinal addresses for a line doc', () => {
    const { work, file } = freeDoc('lines', 'alpha\nbeta\ngamma');
    const fixture = documentChapterForEditor(work, file);
    expect(fixture!.lines.map((l) => l.address.raw)).toEqual(['1', '2', '3']);
    expect(fixture!.bekkerRange).toBe('1–3');
  });

  it('returns null for a rowless file (quiet unavailable, matching chapterForEditor)', () => {
    const { work, file } = freeDoc('lines', 'alpha');
    const empty: ChapterFile = { ...file, greekLines: [], englishLines: [] };
    expect(documentChapterForEditor(work, empty)).toBeNull();
  });

  it('refuses a corpus-spine work (capability gate)', () => {
    const { file } = freeDoc('lines', 'alpha');
    expect(() => documentChapterForEditor(getWork('metaphysics'), file)).toThrow(/corpus-spine/);
  });
});
