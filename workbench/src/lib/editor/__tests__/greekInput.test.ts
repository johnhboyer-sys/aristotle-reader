// Greek-mode pending-buffer logic, driven keystroke by keystroke through the
// same pure core the plugin uses (pushChar/popChar/isBetaChar). The plugin
// wires these to handleTextInput; the buffer semantics live here.
import { describe, expect, it } from 'vitest';
import {
  pushChar,
  popChar,
  isBetaChar,
  isBoundaryChar,
  typeSequence,
  type PendingRun,
} from '../plugins/greekInput';

/** Simulate typing keystroke-by-keystroke; returns [committedText, pendingRun]. */
function typeChars(input: string): { text: string; run: PendingRun | null; renderings: string[] } {
  let committed = '';
  let run: PendingRun | null = null;
  const renderings: string[] = [];
  for (const ch of input) {
    if (isBetaChar(ch)) {
      run = pushChar(run, ch);
      renderings.push(committed + run.rendered);
    } else {
      committed += (run?.rendered ?? '') + ch;
      run = null;
      renderings.push(committed);
    }
  }
  return { text: committed + (run?.rendered ?? ''), run, renderings };
}

describe('greek input pending buffer', () => {
  it('ACCEPTANCE: typing "to\\ ti/ h)=n ei)=nai" produces τὸ τί ἦν εἶναι', () => {
    const { text } = typeChars('to\\ ti/ h)=n ei)=nai');
    expect(text).toBe('τὸ τί ἦν εἶναι');
  });

  it('re-decodes the whole buffer on every keystroke (suffix diacritics)', () => {
    // "h" alone is η; ")" makes it ἠ; "=" flips the accent to a circumflex ἦ.
    const { renderings } = typeChars('h)=n');
    expect(renderings).toEqual(['η', 'ἠ', 'ἦ', 'ἦν']);
  });

  it('acceptance phrase decodes word by word at each boundary', () => {
    const { renderings } = typeChars('to\\ ti/');
    // After 't','o','\' → pending τὸ; the space commits it.
    expect(renderings[2]).toBe('τὸ');
    expect(renderings[3]).toBe('τὸ ');
    expect(renderings.at(-1)).toBe('τὸ τί');
  });

  it('final sigma: "lo/gos " resolves to λόγος when the space lands', () => {
    const { renderings, text } = typeChars('lo/gos ');
    // While pending, the buffer-final s already shows as ς (end of buffer =
    // word end for the whole-buffer decode)...
    expect(renderings[5]).toBe('λόγος');
    // ...and the space commits it unchanged.
    expect(text).toBe('λόγος ');
  });

  it('final sigma flips back to medial σ when a letter follows', () => {
    const { renderings } = typeChars('esti');
    expect(renderings[1]).toBe('ες'); // word-final for now
    expect(renderings[2]).toBe('εστ'); // σ resolved medial by the τ landing
    expect(renderings[3]).toBe('εστι');
  });

  it('mid-word s stays σ, word-end s stays ς — both in one phrase', () => {
    const { text } = typeChars('sofo\\s ');
    expect(text).toBe('σοφὸς ');
  });

  it('backspace pops the raw buffer and re-decodes', () => {
    let run: PendingRun | null = null;
    for (const ch of 'h)=') run = pushChar(run, ch);
    expect(run!.rendered).toBe('ἦ');
    run = popChar(run!); // remove "="
    expect(run!.rendered).toBe('ἠ');
    run = popChar(run!); // remove ")"
    expect(run!.rendered).toBe('η');
    run = popChar(run!); // remove "h"
    expect(run).toBeNull();
  });

  it('backspace across a sigma restores the final form', () => {
    let run: PendingRun | null = null;
    for (const ch of 'esti') run = pushChar(run, ch);
    run = popChar(run!); // "est" → εστ
    expect(run!.rendered).toBe('εστ');
    run = popChar(run!); // "es" → ες (word-final again)
    expect(run!.rendered).toBe('ες');
  });

  it('capital marker *: "*)aristote/lhs" → Ἀριστοτέλης', () => {
    const { text } = typeChars('*)aristote/lhs');
    expect(text).toBe('Ἀριστοτέλης');
  });

  it('boundary chars are exactly the non-Beta ones', () => {
    for (const ch of 'abzw)(/\\=|+*') expect(isBetaChar(ch)).toBe(true);
    for (const ch of ' .,;·:!?0"\'') expect(isBetaChar(ch)).toBe(false);
    expect(isBoundaryChar(' ')).toBe(true);
    expect(isBoundaryChar('a')).toBe(false);
  });

  it('typeSequence helper matches the harness', () => {
    expect(typeSequence('to\\ ti/ h)=n ei)=nai')).toBe('τὸ τί ἦν εἶναι');
    expect(typeSequence('lo/gos kai\\ e)/rgon')).toBe('λόγος καὶ ἔργον');
  });
});
