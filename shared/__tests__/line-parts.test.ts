import { describe, expect, it } from 'vitest';
import { lineParts, locateToken } from '../lib/line-parts';
import type { Token } from '../lib/data';

const tok = (t: string, o = 0): Token => ({ t, o, k: '' });
const texts = (parts: { text: string }[]) => parts.map(p => p.text);
const kinds = (parts: { tok: Token | null }[]) => parts.map(p => (p.tok ? 'token' : 'text'));

describe('lineParts — token/gap split', () => {
  it('splits a plain line into clickable words and verbatim gaps', () => {
    const text = 'λόγος, ἀρετή·';
    const parts = lineParts({ text, tokens: [tok('λόγος', 0), tok('ἀρετή', 7)] });
    expect(texts(parts).join('')).toBe(text);
    expect(kinds(parts)).toEqual(['token', 'text', 'token', 'text']);
  });

  it('drops a genuinely unlocatable token rather than printing a phantom', () => {
    // A token whose surface really isn't in `text` (a stale token list on a
    // line, e.g. Phys 226b.10) emits no part at all — a phantom would print a
    // word the line does not have. The verbatim text still renders in full.
    const parts = lineParts({ text: 'βγ', tokens: [tok('α', 0)] });
    expect(kinds(parts)).toEqual(['text']);
    expect(texts(parts)).toEqual(['βγ']);
  });
});

describe('lineParts — editorial sigla inside a word', () => {
  // Cat 4b line 12: the OCT supplies <κλ> inside ἀνακεκλίσθαι, so the token
  // surface doesn't occur verbatim and a plain indexOf misses it. The word must
  // print ONCE, in its bracketed form, and stay clickable.
  it('matches a token across an angle-bracket supplement', () => {
    const text = 'τὸ δὲ ἀνακε<κλ>ίσθαι';
    const tokens = [tok('τὸ', 0), tok('δὲ', 3), tok('ἀνακεκλίσθαι', 6)];
    const parts = lineParts({ text, tokens });
    // The rendered line is byte-identical to the source text.
    expect(texts(parts).join('')).toBe(text);
    expect(kinds(parts)).toEqual(['token', 'text', 'token', 'text', 'token']);
    // One part for the supplemented word, printed verbatim, carrying its Token.
    expect(parts[4]).toEqual({ text: 'ἀνακε<κλ>ίσθαι', tok: tokens[2] });
    expect(texts(parts).filter(t => t.includes('ἀνακε'))).toHaveLength(1);
  });

  it('pulls in a closer for a bracket opened inside the word', () => {
    // Cat 4b line 9: "τὴ<ν>" — the supplement closes after the word's last
    // letter, so the closer belongs to the token span, not to the next gap.
    const text = 'τὴ<ν> εἰς';
    const tokens = [tok('τὴν', 0), tok('εἰς', 6)];
    const parts = lineParts({ text, tokens });
    expect(texts(parts).join('')).toBe(text);
    expect(parts[0]).toEqual({ text: 'τὴ<ν>', tok: tokens[0] });
    expect(texts(parts)).toEqual(['τὴ<ν>', ' ', 'εἰς']);
  });

  it('matches a token across a square-bracket deletion at the line head', () => {
    // A line-head deletion: "[προς]θῶμεν".
    const text = '[προς]θῶμεν αὐτὰς';
    const tokens = [tok('προςθῶμεν', 0), tok('αὐτὰς', 12)];
    const parts = lineParts({ text, tokens });
    expect(texts(parts).join('')).toBe(text);
    expect(kinds(parts)).toEqual(['text', 'token', 'text', 'token']);
    expect(parts[1]).toEqual({ text: 'προς]θῶμεν', tok: tokens[0] });
  });

  it('matches a mid-word square-bracket deletion (DM 981a αὐτουργεῖ[ν])', () => {
    const text = 'εὔσχημον αὐτουργεῖ[ν]';
    const tokens = [tok('εὔσχημον', 0), tok('αὐτουργεῖν', 9)];
    const parts = lineParts({ text, tokens });
    expect(texts(parts).join('')).toBe(text);
    expect(parts[2]).toEqual({ text: 'αὐτουργεῖ[ν]', tok: tokens[1] });
  });

  it('leaves a phrase-level closer outside a word whose bracket closed mid-word', () => {
    // Cat 4b "ἀνακε<κλ>ίσθαι" closes its bracket INSIDE the word, so nothing is
    // owing at its end. A closer sitting right after the word is then the
    // phrase's, not the word's, and must stay out of the clickable span. (In
    // the corpus a "," or a space follows every mid-word-closing word, so this
    // is the adversarial form of those lines.)
    const text = '[ἀνακε<κλ>ίσθαι] δὲ';
    const tokens = [tok('ἀνακεκλίσθαι', 1), tok('δὲ', 17)];
    const parts = lineParts({ text, tokens });
    expect(texts(parts).join('')).toBe(text);
    expect(texts(parts)).toEqual(['[', 'ἀνακε<κλ>ίσθαι', '] ', 'δὲ']);
    expect(parts.find(p => p.tok)).toEqual({ text: 'ἀνακε<κλ>ίσθαι', tok: tokens[0] });
  });

  it('splits a supplement that spans two words (GA 779a ἀτελ<ῆ τικτόντ>ων)', () => {
    const text = 'τῶν ἀτελ<ῆ τικτόντ>ων, καθεύδειν';
    const tokens = [tok('τῶν', 0), tok('ἀτελῆ', 4), tok('τικτόντων', 11), tok('καθεύδειν', 23)];
    const parts = lineParts({ text, tokens });
    expect(texts(parts).join('')).toBe(text);
    expect(texts(parts)).toEqual(['τῶν', ' ', 'ἀτελ<ῆ', ' ', 'τικτόντ>ων', ', ', 'καθεύδειν']);
  });
});

describe('locateToken', () => {
  it('prefers a plain match and reports its exact span', () => {
    expect(locateToken('ἀρετή λόγος', 'λόγος', 0)).toEqual({ start: 6, end: 11 });
  });

  it('never matches before `from`', () => {
    expect(locateToken('καὶ καὶ', 'καὶ', 4)).toEqual({ start: 4, end: 7 });
    expect(locateToken('καὶ', 'καὶ', 1)).toBeNull();
  });

  it('returns null when the word is not in the line at all', () => {
    expect(locateToken('ἐν ἐλαχίστοις', 'τρισίν', 0)).toBeNull();
  });

  it('does not treat a non-siglum character as skippable', () => {
    // "**" is a lacuna mark, not a bracket: the token is left unlocated rather
    // than silently swallowing arbitrary text into a word's span.
    expect(locateToken('ὅτε ἔδει**το λογισμὸς', 'ἔδειτο', 0)).toBeNull();
  });
});
