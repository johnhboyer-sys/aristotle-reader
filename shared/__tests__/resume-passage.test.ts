import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { resumePassage } from '../lib/resume-passage';
import type { BookData, Segment } from '../lib/data';
import type { TranslationRef } from '../lib/works';
const translation = (slot: TranslationRef['slot'] = 'english', extra = {}): TranslationRef => ({ id: 'chosen', name: 'Chosen', short: 'Chosen', slot, ...extra });
const work = (slot: TranslationRef['slot'] = 'english', extra = {}) => ({ translations: [translation(slot, extra)], defaultTranslation: 'chosen' });
const book = (segment: Partial<Segment>): BookData => ({ book: 1, segments: [{ id: '1:1a', column: '1a', greek: [], english: null, ...segment }] });
const greek = (n: number, text: string) => ({ n, text, tokens: [] });

describe('saved passage', () => {
  it('keeps the suffix of Physics VII lettered lines', () => {
    const data: BookData = JSON.parse(readFileSync(resolve('../app/public/data/Phys/book-07.json'), 'utf8'));
    expect(resumePassage(data, work(), '244b5a')?.greek).toMatch(/^ἅπαν γὰρ σῶμα/);
    expect(resumePassage(data, work(), '244b5')?.greek).toMatch(/^<ὑπόκειται/);
    expect(resumePassage(data, work(), '244b5z')).toBeNull();
  });
  it('keeps English semicolon clauses at Categories 2a11', () => {
    const data: BookData = JSON.parse(readFileSync(resolve('../app/public/data/Cat/book-01.json'), 'utf8'));
    expect(resumePassage(data, work(), '2a11')?.english).toBe('Substance, in the truest and primary and most definite sense of the word, is that which is neither predicable of a subject nor present in a subject; for instance, the individual man or horse.');
  });

  it('uses the Greek word and the chosen overlay chapter, not primary engOffset', () => {
    const data: BookData = JSON.parse(readFileSync(resolve('../app/public/data/EN/book-02.json'), 'utf8'));
    const result = resumePassage(data, { translations: [translation('english'), translation('third', { id: 'ostwald' })], defaultTranslation: 'ostwald' }, '1104b3');
    expect(result?.chapter).toBe('3');
    expect(result?.greek).toBe('Σημεῖον δὲ δεῖ ποιεῖσθαι τῶν ἕξεων τὴν ἐπιγινομένην ἡδονὴν ἢ λύπην τοῖς ἔργοις·');
    expect(result?.english).toBe('An index to our characteristics is provided by the pleasure or pain which follows upon the tasks we have achieved.');
  });
  it('uses engOffset for an english-slot chapter start', () => {
    const data = book({ greek: [greek(1, 'τέλος. Ἀρχή.')], chapterStarts: [{ chapter: '2', beforeLine: 1, wordIndex: 1, engOffset: 6, bekker: '1a1' }], english: { text: 'Tail. Start here.', notes: [], markers: [] } });
    expect(resumePassage(data, work(), '1a1')).toEqual({ chapter: '2', greek: 'Ἀρχή.', english: 'Start here.' });
  });
  it('skips a continued sentence mid-line and interpolates English markers', () => {
    const data = book({ greek: [greek(1, 'ἀρχὴ'), greek(2, 'τέλος. Νέα πρότασις; ἄλλη.')], english: { text: 'Old sentence. Next sentence! Last.', notes: [], markers: [], bekker: [{ n: 1, offset: 0, real: true }, { n: 3, offset: 14, real: true }] } });
    expect(resumePassage(data, work(), '1a2')).toEqual({ chapter: null, greek: 'Νέα πρότασις;', english: 'Next sentence!' });
  });
  it('skips sentence tails at the first line of a column', () => {
    const data = book({ greek: [greek(1, 'ἀρχὴ')], english: { text: 'Old', notes: [], markers: [] } });
    data.segments.push({ id: '1:1b', column: '1b', greek: [greek(1, 'τέλος. Νέα πρότασις.')], english: { text: 'sentence. Next sentence.', notes: [], markers: [], bekker: [{n: 1, offset: 0, real: true}] } });
    expect(resumePassage(data, work(), '1b1')).toEqual({ chapter: null, greek: 'Νέα πρότασις.', english: 'Next sentence.' });
  });
  it('never shows a private translation or substitutes another one', () => {
    const data = book({ greek: [greek(1, 'Λόγος.')], english: { text: 'Private.', notes: [], markers: [] } });
    expect(resumePassage(data, work('english', { private: true }), '1a1')?.english).toBeNull();
  });
  it('cuts long sentences at a word boundary with an ellipsis', () => {
    const data = book({ greek: [greek(1, 'λέξις '.repeat(60) + '.')], english: { text: 'word '.repeat(60) + '.', notes: [], markers: [] } });
    const result = resumePassage(data, work(), '1a1')!;
    expect(result.greek.length).toBeLessThanOrEqual(220);
    expect(result.greek).toMatch(/λέξις…$/);
    expect(result.english).toMatch(/word…$/);
  });
  it('handles secondary legacy slots, overlays and an absent default', () => {
    const data = book({ greek: [greek(1, 'Λόγος.')], ross: [{ chapter: '1', text: 'Legacy.', cont: false }], overlays: { chosen: [{ chapter: '1', text: 'Overlay.', cont: false }] } });
    expect(resumePassage(data, work('secondary'), '1a1')?.english).toBe('Legacy.');
    expect(resumePassage(data, work('overlay'), '1a1')?.english).toBe('Overlay.');
    expect(resumePassage(data, { translations: [translation('secondary') ] }, '1a1')?.english).toBeNull();
  });
  it('returns null for a missing segment, missing line, malformed data or citation', () => {
    for (const data of [null, undefined, {} as BookData, book({})]) {
      expect(resumePassage(data, work(), '9b3')).toBeNull();
      expect(resumePassage(data, work(), 'invalid')).toBeNull();
    }
    expect(resumePassage(book({}), work(), '1a1')).toBeNull();
  });
});
