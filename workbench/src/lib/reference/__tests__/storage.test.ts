import { describe, expect, it } from 'vitest';
import {
  MemReferenceStorage,
  parseReferenceChapterFile,
  serializeReferenceChapterFile,
} from '../storage';

describe('serializeReferenceChapterFile / parseReferenceChapterFile round-trip', () => {
  it('round-trips front-matter and a verbatim body', () => {
    const meta = { work: 'metaphysics', book: 7, chapter: 17, edition: 'ross' };
    const body = 'We have to inquire what substance is.\n\nSecond paragraph.';
    const raw = serializeReferenceChapterFile(meta, body);
    const parsed = parseReferenceChapterFile(raw);
    expect(parsed).toEqual({ meta, body });
  });

  it('front-matter block has the expected shape', () => {
    const meta = { work: 'metaphysics', book: 7, chapter: 17, edition: 'ross' };
    const raw = serializeReferenceChapterFile(meta, 'Body text.');
    expect(raw.startsWith('---\nwork: metaphysics\nbook: 7\nchapter: 17\nedition: ross\n---\n')).toBe(
      true,
    );
  });

  it('parseReferenceChapterFile returns null when front-matter is missing', () => {
    expect(parseReferenceChapterFile('Just a body, no front-matter.')).toBeNull();
  });

  it('parseReferenceChapterFile returns null when a required field is missing', () => {
    const raw = '---\nwork: metaphysics\nbook: 7\n---\nBody.';
    expect(parseReferenceChapterFile(raw)).toBeNull();
  });

  it('parseReferenceChapterFile returns null when book/chapter are not numeric', () => {
    const raw = '---\nwork: metaphysics\nbook: seven\nchapter: 17\nedition: ross\n---\nBody.';
    expect(parseReferenceChapterFile(raw)).toBeNull();
  });
});

describe('MemReferenceStorage — write -> list -> read round-trip', () => {
  it('writes and reads back a file', async () => {
    const storage = new MemReferenceStorage();
    await storage.write('metaphysics', 'ross', 'chapter-07-17.md', 'content one');
    const read = await storage.read('metaphysics', 'ross', 'chapter-07-17.md');
    expect(read).toBe('content one');
  });

  it('read returns null for a missing file', async () => {
    const storage = new MemReferenceStorage();
    expect(await storage.read('metaphysics', 'ross', 'nope.md')).toBeNull();
  });

  it('list returns sorted filenames scoped to one edition', async () => {
    const storage = new MemReferenceStorage();
    await storage.write('metaphysics', 'ross', 'chapter-07-18.md', 'b');
    await storage.write('metaphysics', 'ross', 'chapter-07-17.md', 'a');
    await storage.write('metaphysics', 'ross', 'manifest.json', '{}');
    await storage.write('metaphysics', 'bostock', 'chapter-07-17.md', 'other edition');
    expect(await storage.list('metaphysics', 'ross')).toEqual([
      'chapter-07-17.md',
      'chapter-07-18.md',
      'manifest.json',
    ]);
  });

  it('list is empty for an edition with no files', async () => {
    const storage = new MemReferenceStorage();
    expect(await storage.list('metaphysics', 'ross')).toEqual([]);
  });

  it('write replaces existing content for the same file (replace semantics)', async () => {
    const storage = new MemReferenceStorage();
    await storage.write('metaphysics', 'ross', 'chapter-07-17.md', 'first import');
    await storage.write('metaphysics', 'ross', 'chapter-07-17.md', 'replaced import');
    expect(await storage.read('metaphysics', 'ross', 'chapter-07-17.md')).toBe('replaced import');
    expect(await storage.list('metaphysics', 'ross')).toEqual(['chapter-07-17.md']);
  });

  it('remove deletes a single file without affecting others', async () => {
    const storage = new MemReferenceStorage();
    await storage.write('metaphysics', 'ross', 'chapter-07-17.md', 'a');
    await storage.write('metaphysics', 'ross', 'chapter-07-18.md', 'b');
    await storage.remove('metaphysics', 'ross', 'chapter-07-17.md');
    expect(await storage.list('metaphysics', 'ross')).toEqual(['chapter-07-18.md']);
  });

  it('remove is a no-op for a missing file', async () => {
    const storage = new MemReferenceStorage();
    await expect(storage.remove('metaphysics', 'ross', 'nope.md')).resolves.toBeUndefined();
  });

  it('listEditions returns sorted slugs for a work', async () => {
    const storage = new MemReferenceStorage();
    await storage.write('metaphysics', 'bostock', 'manifest.json', '{}');
    await storage.write('metaphysics', 'ross', 'manifest.json', '{}');
    expect(await storage.listEditions('metaphysics')).toEqual(['bostock', 'ross']);
  });

  it('listEditions is empty for a work with no editions', async () => {
    const storage = new MemReferenceStorage();
    expect(await storage.listEditions('metaphysics')).toEqual([]);
  });

  it('removeEdition deletes all files under that slug only', async () => {
    const storage = new MemReferenceStorage();
    await storage.write('metaphysics', 'ross', 'manifest.json', '{}');
    await storage.write('metaphysics', 'ross', 'chapter-07-17.md', 'a');
    await storage.write('metaphysics', 'bostock', 'manifest.json', '{}');
    await storage.removeEdition('metaphysics', 'ross');
    expect(await storage.list('metaphysics', 'ross')).toEqual([]);
    expect(await storage.listEditions('metaphysics')).toEqual(['bostock']);
  });
});
