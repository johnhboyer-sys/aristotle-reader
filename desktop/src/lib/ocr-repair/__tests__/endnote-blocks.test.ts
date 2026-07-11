import { describe, expect, it } from 'vitest';
import type { CorpusConfig } from '../corpus-config';
import { cleanNoteBody, emitEndnoteBlocks } from '../endnote-blocks';
import type { WitnessCommentary } from '../witness-commentary';

const config: CorpusConfig = {
  id: 'endnotes', workTitle: 'Posterior Analytics', runningHeadPlaceholder: 'HEAD',
  bekkerStart: { page: 71, col: 'a' }, bekkerEnd: { page: 71, col: 'b' },
  divisions: { books: 1, chaptersPerBook: [2] }, backbonePath: '', witnessPath: '', outDir: '',
  witnessStructure: { format: 'genie-markdown' }, endnotes: { source: 'witness-commentary' },
};

const commentary = (entries: [string, number, string][]): WitnessCommentary => {
  const notes: WitnessCommentary['notes'] = new Map();
  for (const [key, n, body] of entries) {
    const perChapter = notes.get(key as `${number}:${number}`) ?? new Map<number, string>();
    perChapter.set(n, body);
    notes.set(key as `${number}:${number}`, perChapter);
  }
  return { notes, diagnostics: [] };
};

const page = (...lines: string[]) => lines.join('\n');

describe('endnote block emission', () => {
  it('appends a page-bottom note block for glued markers, blank-line separated', () => {
    const text = page(
      'RUNNING HEAD',
      '           BOOK ONE',
      '                    CHAPTER 1',
      '71a        All teaching proceeds from previous knowledge.1 And each of the',
      '           other arts.2'
    );
    const out = emitEndnoteBlocks(text, commentary([['1:1', 1, 'First note body.'], ['1:1', 2, 'Second note body.']]), config);

    const lines = out.text.split('\n');
    expect(out.notesEmitted).toBe(2);
    expect(lines.at(-4)).toBe('');
    expect(lines.at(-3)).toBe('<<notes scope=per-chapter>>');
    expect(lines.at(-2)).toBe('           1. First note body.');
    expect(lines.at(-1)).toBe('           2. Second note body.');
  });

  it('keeps chapter scope across a mid-page chapter boundary', () => {
    const text = page(
      'RUNNING HEAD',
      '           BOOK ONE',
      '                    CHAPTER 1',
      '           ends the chapter here.3',
      '                    CHAPTER 2',
      '           and a new chapter begins.1'
    );
    const out = emitEndnoteBlocks(text, commentary([['1:1', 3, 'Chapter one note.'], ['1:2', 1, 'Chapter two note.']]), config);

    const body = out.text.split('\n');
    expect(body).toContain('           3. Chapter one note.');
    expect(body).toContain('           1. Chapter two note.');
    expect(body.indexOf('           3. Chapter one note.')).toBeLessThan(body.indexOf('           1. Chapter two note.'));
  });

  it('flags a marker with no commentary note instead of inventing one', () => {
    const text = page('HEAD', '           BOOK ONE', '                    CHAPTER 1', '           lost note marker.7');
    const out = emitEndnoteBlocks(text, commentary([]), config);

    expect(out.notesEmitted).toBe(0);
    expect(out.markersUnmatched).toBe(1);
    expect(out.changes).toContainEqual(expect.objectContaining({ evidence: expect.objectContaining({ kind: 'endnote-missing-note', marker: 7 }) }));
    expect(out.text).toBe(text);
  });

  it('never reads a gutter tick or a Bekker line number as a marker', () => {
    const text = page(
      'HEAD',
      '           BOOK ONE',
      '                    CHAPTER 1',
      '71a        no marker on this line at all',
      '5          nor on this one'
    );
    const out = emitEndnoteBlocks(text, commentary([['1:1', 5, 'Should not appear.'], ['1:1', 71, 'Nor this.']]), config);

    expect(out.notesEmitted).toBe(0);
    expect(out.text).toBe(text);
  });

  it('wraps long note bodies at the body margin without display-shaped runs', () => {
    const long = Array.from({ length: 40 }, (_, i) => `word${i}`).join(' ');
    const text = page('HEAD', '           BOOK ONE', '                    CHAPTER 1', '           short body.1');
    const out = emitEndnoteBlocks(text, commentary([['1:1', 1, long]]), config);

    const noteLines = out.text.split('\n').slice(6);
    expect(noteLines.length).toBeGreaterThan(1);
    for (const line of noteLines) {
      expect(line.startsWith('           ')).toBe(true);
      expect(/\S\s{4,}\S/u.test(line)).toBe(false);
    }
  });

  it('emits each (chapter, marker) once even when the marker repeats', () => {
    const text = page('HEAD', '           BOOK ONE', '                    CHAPTER 1', '           twice1 marked1 here');
    const out = emitEndnoteBlocks(text, commentary([['1:1', 1, 'Once only.']]), config);

    expect(out.notesEmitted).toBe(1);
  });
});

describe('cleanNoteBody', () => {
  it('converts TeX overlines to combining macrons and unwraps sup markup', () => {
    expect(cleanNoteBody('then $\\overline{\\text{MN}}$ is true')).toBe('then M̄N̄ is true');
    expect(cleanNoteBody('see 72b5-3a20$^{12}$ and <sup>3</sup>')).toBe('see 72b5-3a2012 and 3');
    expect(cleanNoteBody('term $b$ here')).toBe('term b here');
    expect(cleanNoteBody('escaped 1\\. dot')).toBe('escaped 1. dot');
  });
});
