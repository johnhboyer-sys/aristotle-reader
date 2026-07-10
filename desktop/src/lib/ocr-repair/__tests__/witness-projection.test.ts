import { describe, expect, it } from 'vitest';
import type { CorpusConfig } from '../corpus-config';
import type { AlignOp } from '../align';
import { projectWitnessStructure } from '../witness-projection';

const config = (enabled = true): CorpusConfig => ({
  id: 'projection', workTitle: 'Posterior Analytics', runningHeadPlaceholder: 'HEAD',
  bekkerStart: { page: 1, col: 'a' }, bekkerEnd: { page: 1, col: 'b' },
  divisions: { books: 1, chaptersPerBook: [1] }, backbonePath: '', witnessPath: '', outDir: '',
  ...(enabled ? { witnessStructure: { format: 'genie-markdown' as const } } : {}),
});
// Fixtures model a real page: a head line (which the frozen converter strips
// and the projection must never edit) above the body line under test.
const prov = (col: number) => ({ page: 0, line: 1, col });
const apply = (body: string, ops: AlignOp[], enabled = true) => {
  const text = `HEAD\n${body}`;
  const outcome = projectWitnessStructure(text, ops, config(enabled));
  const lines = text.split('\n');
  for (const edit of [...outcome.edits].sort((a, b) => b.prov.col - a.prov.col)) {
    const line = lines[edit.prov.line];
    lines[edit.prov.line] = line.slice(0, edit.prov.col) + edit.after + line.slice(edit.prov.col + (edit.record.before?.length ?? 0));
  }
  return { ...outcome, text: lines.slice(1).join('\n') };
};

describe('chapter-scoped witness projection', () => {
  it('repairs a short similar word run', () => {
    const ops: AlignOp[] = [{ t: 'match', aRaw: 'The', bRaw: 'The', aProv: prov(0) }, { t: 'aOnly', aRaw: 'hé’does', aProv: prov(4) }, { t: 'bOnly', bRaw: 'he' }, { t: 'bOnly', bRaw: 'does' }, { t: 'match', aRaw: 'this.', bRaw: 'this.', aProv: prov(12) }];
    const out = apply('The hé’does this.', ops);
    expect(out.text).toBe('The he does this.');
    expect(out.records).toContainEqual(expect.objectContaining({ rule: 'word-identity', evidence: expect.objectContaining({ kind: 'witness-projection' }) }));
  });
  it('refuses a low-similarity run into review', () => {
    const out = apply('A xxxx Z', [{ t: 'match', aRaw: 'A', bRaw: 'A', aProv: prov(0) }, { t: 'aOnly', aRaw: 'xxxx', aProv: prov(2) }, { t: 'bOnly', bRaw: 'truth' }, { t: 'match', aRaw: 'Z', bRaw: 'Z', aProv: prov(7) }]);
    expect(out.text).toBe('A xxxx Z'); expect(out.records[0].evidence?.kind).toBe('witness-projection-review');
  });
  it('refuses Greek backbone runs', () => {
    const out = apply('A λόγος Z', [{ t: 'match', aRaw: 'A', bRaw: 'A', aProv: prov(0) }, { t: 'aOnly', aRaw: 'λόγος', aProv: prov(2) }, { t: 'bOnly', bRaw: 'logos' }, { t: 'match', aRaw: 'Z', bRaw: 'Z', aProv: prov(8) }]);
    expect(out.text).toBe('A λόγος Z'); expect(out.records[0].evidence?.reason).toBe('greek');
  });
  it('glues a sup marker while replacing a confirmed garble glyph', () => {
    // ">" is the OCR's misread of the printed superscript 5 (the real
    // Apostle 71a case) — a true garble tail, replaced by the digit.
    const out = apply('understood,>', [{ t: 'aOnly', aRaw: 'understood,>', aProv: prov(0) }, { t: 'bOnly', bRaw: 'understood,<sup>5</sup>' }]);
    expect(out.text).toBe('understood,5'); expect(out.records[0].evidence?.kind).toBe('witness-sup-marker');
  });
  it('glues a sup marker to a clean word', () => {
    const out = apply('understood,', [{ t: 'aOnly', aRaw: 'understood,', aProv: prov(0) }, { t: 'bOnly', bRaw: 'understood,<sup>5</sup>' }]);
    expect(out.text).toBe('understood,5');
  });
  it('wraps a short matched italic span', () => {
    const out = apply('what is known', [{ t: 'match', aRaw: 'what', bRaw: '*what', aProv: prov(0) }, { t: 'match', aRaw: 'is', bRaw: 'is', aProv: prov(5) }, { t: 'match', aRaw: 'known', bRaw: 'known*', aProv: prov(8) }]);
    expect(out.text).toBe('*what is known*'); expect(out.records[0].rule).toBe('emphasis');
  });
  it('sends a long italic span to review', () => {
    const words = 'one two three four five six seven'.split(' '); let col = 0;
    const ops = words.map((word, i): AlignOp => { const op: AlignOp = { t: 'match', aRaw: word, bRaw: `${i === 0 ? '*' : ''}${word}${i === words.length - 1 ? '*' : ''}`, aProv: prov(col) }; col += word.length + 1; return op; });
    const out = apply(words.join(' '), ops); expect(out.text).toBe(words.join(' ')); expect(out.records[0].evidence?.reason).toBe('span-too-long');
  });
  it('refuses a digit-only run — no letter content to score', () => {
    // "(3)" and "(5)" both fold to '' under matchKey, which short-circuits
    // similarity to a perfect 1.0 — without the refusal this silently
    // rewrites enumeration markers and numbers.
    const out = apply('reason (3) it', [
      { t: 'match', aRaw: 'reason', bRaw: 'reason', aProv: prov(0) },
      { t: 'aOnly', aRaw: '(3)', aProv: prov(7) },
      { t: 'bOnly', bRaw: '(5)' },
      { t: 'match', aRaw: 'it', bRaw: 'it', aProv: prov(11) },
    ]);
    expect(out.text).toBe('reason (3) it');
    expect(out.records[0].evidence?.reason).toBe('no-letter-content');
  });

  it('keeps legitimate trailing punctuation when gluing a sup marker', () => {
    // Witness sets the marker before the comma ("virtue⁷,") — the backbone
    // comma is real text, not a garble tail, and must survive the glue.
    const out = apply('virtue,', [
      { t: 'aOnly', aRaw: 'virtue,', aProv: prov(0) },
      { t: 'bOnly', bRaw: 'virtue<sup>7</sup>' },
    ]);
    expect(out.text).toBe('virtue,7');
  });

  it('does not merge gap regions across a chapter-seam barrier', () => {
    // vote's chapterScopedOps inserts an empty match op between per-chapter
    // streams; a trailing aOnly of one chapter must not pair with the leading
    // bOnly of the next.
    const out = apply('tail garble here', [
      { t: 'match', aRaw: 'tail', bRaw: 'tail', aProv: prov(0) },
      { t: 'aOnly', aRaw: 'garble', aProv: prov(5) },
      { t: 'match', aRaw: '', bRaw: '' },
      { t: 'bOnly', bRaw: 'gamble' },
      { t: 'match', aRaw: 'here', bRaw: 'here', aProv: prov(12) },
    ]);
    expect(out.text).toBe('tail garble here');
    expect(out.edits).toEqual([]);
  });

  it('projects a single-word italic matching a single-word work title', () => {
    // A one-word title (Physics) folds equal to a load-bearing body italic
    // of the same word — the furniture filter must only apply to multi-word
    // titles.
    const cfg = { ...config(), workTitle: 'Physics' };
    const outcome = projectWitnessStructure('HEAD\nthe physics here', [
      { t: 'match', aRaw: 'physics', bRaw: '*physics*', aProv: prov(4) },
    ], cfg);
    expect(outcome.edits).toHaveLength(1);
    expect(outcome.edits[0].after).toBe('*physics*');
  });

  it("refuses an edit on a page's first non-blank line into review", () => {
    // line 0 is the page head the converter strips — projecting there is
    // invisible at best and trips the stage-5 running-head invariant.
    const headProv = { page: 0, line: 0, col: 0 };
    const outcome = projectWitnessStructure('understood,?\nbody line', [
      { t: 'aOnly', aRaw: 'understood,?', aProv: headProv },
      { t: 'bOnly', bRaw: 'understood,<sup>5</sup>' },
    ], config());
    expect(outcome.edits).toEqual([]);
    expect(outcome.records[0].evidence?.kind).toBe('witness-projection-review');
    expect(outcome.records[0].evidence?.reason).toBe('page-head-line');
  });

  it('glues a Unicode-superscript witness marker (knowledge³³)', () => {
    const out = apply('knowledge®', [
      { t: 'match', aRaw: 'knowledge®', bRaw: 'knowledge³³', aProv: prov(0) },
    ]);
    expect(out.text).toBe('knowledge33');
  });

  it('adopts the witness quote glyph when tokens differ only in quotes', () => {
    const out = apply("such-and-such]'", [
      { t: 'match', aRaw: "such-and-such]'", bRaw: 'such-and-such]”', aProv: prov(0) },
    ]);
    expect(out.text).toBe('such-and-such]”');
    expect(out.records[0].evidence?.kind).toBe('witness-quote-glyph');
  });

  it('never lets the quote-glyph pass change non-quote content', () => {
    const out = apply('figure]', [
      { t: 'match', aRaw: 'figure]', bRaw: 'figures]”', aProv: prov(0) },
    ]);
    expect(out.text).toBe('figure]');
  });

  it('is byte- and record-neutral without witnessStructure', () => {
    const text = 'hé’does'; const out = apply(text, [{ t: 'aOnly', aRaw: text, aProv: prov(0) }, { t: 'bOnly', bRaw: 'he does' }], false);
    expect(out.text).toBe(text); expect(out.records).toEqual([]); expect(out.edits).toEqual([]);
  });
});
