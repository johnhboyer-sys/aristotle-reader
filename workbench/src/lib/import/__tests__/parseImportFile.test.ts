import { describe, expect, it } from 'vitest';
import { parseImportFile } from '../parseImportFile';

describe('parseImportFile', () => {
  const body = (g: string[], e: string[]) => `[GREEK]\n${g.join('\n')}\n[ENGLISH]\n${e.join('\n')}\n`;

  it('parses a well-formed file with optional bekker_start', () => {
    const raw = `---\nwork: metaphysics\nbook: 7\nchapter: 17\nbekker_start: 1041a6\n---\n${body(['α β', 'γ δ'], ['a b', 'c d'])}`;
    const r = parseImportFile(raw);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.frontmatter).toEqual({ work: 'metaphysics', book: 7, chapter: 17, bekkerStart: '1041a6' });
    expect(r.value.greek).toEqual(['α β', 'γ δ']);
    expect(r.value.english).toEqual(['a b', 'c d']);
  });

  it('accepts a file with no book/chapter (unhinted)', () => {
    const raw = `---\nwork: metaphysics\n---\n${body(['α'], ['a'])}`;
    const r = parseImportFile(raw);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.frontmatter.book).toBeUndefined();
    expect(r.value.frontmatter.chapter).toBeUndefined();
  });

  it('guard (d): count mismatch produces the d3 §7 sentence with real counts', () => {
    const raw = `---\nwork: metaphysics\n---\n[GREEK]\n${['a', 'b', 'c'].join('\n')}\n[ENGLISH]\n${['x', 'y'].join('\n')}\n`;
    const r = parseImportFile(raw);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.kind).toBe('count-mismatch');
    expect(r.message).toBe(
      'This file has 3 Greek lines but 2 English lines — they must match one-to-one; fix the file and try again.',
    );
  });

  it('guard (e): an empty block produces the d3 §7 sentence', () => {
    const raw = `---\nwork: metaphysics\n---\n[GREEK]\n[ENGLISH]\nx\n`;
    const r = parseImportFile(raw);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.kind).toBe('empty-block');
    expect(r.message).toBe("This file's [GREEK] section is empty — there's nothing to import.");
  });

  it('rejects a file with no frontmatter', () => {
    const r = parseImportFile('[GREEK]\na\n[ENGLISH]\nb\n');
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.kind).toBe('no-frontmatter');
  });

  it('rejects a missing [ENGLISH] section', () => {
    const r = parseImportFile('---\nwork: metaphysics\n---\n[GREEK]\na\n');
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.kind).toBe('missing-section');
  });
});
