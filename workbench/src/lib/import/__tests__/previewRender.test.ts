import { describe, it, expect } from 'vitest';
import { parsePreviewEnglish } from '../previewRender';

describe('parsePreviewEnglish', () => {
  it('passes plain text through unchanged', () => {
    expect(parsePreviewEnglish('and belongs, it is clear')).toEqual([
      { kind: 'text', text: 'and belongs, it is clear' },
    ]);
  });

  it('decodes an inline-Greek token', () => {
    expect(parsePreviewEnglish('the cause ({grc:εἶναι}).')).toEqual([
      { kind: 'text', text: 'the cause (' },
      { kind: 'grc', text: 'εἶναι' },
      { kind: 'text', text: ').' },
    ]);
  });

  it('decodes a footnote anchor, keeping the anchored phrase', () => {
    expect(parsePreviewEnglish('[to {^15:something}], it is clear')).toEqual([
      { kind: 'text', text: '[to ' },
      { kind: 'fn', id: '15', phrase: [{ kind: 'text', text: 'something' }] },
      { kind: 'text', text: '], it is clear' },
    ]);
  });

  it('decodes a footnote anchoring inline Greek (nested)', () => {
    expect(parsePreviewEnglish('what ({^1:{grc:τὴν οὐσίαν}}) is')).toEqual([
      { kind: 'text', text: 'what (' },
      { kind: 'fn', id: '1', phrase: [{ kind: 'grc', text: 'τὴν οὐσίαν' }] },
      { kind: 'text', text: ') is' },
    ]);
  });

  it('leaves an unbalanced / unrecognised brace as literal text', () => {
    expect(parsePreviewEnglish('a {grc:εἶναι without close')).toEqual([
      { kind: 'text', text: 'a {grc:εἶναι without close' },
    ]);
    expect(parsePreviewEnglish('set {x} aside')).toEqual([{ kind: 'text', text: 'set {x} aside' }]);
  });
});
