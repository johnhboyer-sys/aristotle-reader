import { beforeEach, describe, expect, it, vi } from 'vitest';
import { dehyphenate, listReviewItems, resolveReviews } from '../lib/dehyphenate';

vi.mock('nspell', () => ({
  default: () => ({
    correct: (word: string) => ['understanding', 'self', 'restraint'].includes(word.toLowerCase()),
  }),
}));

vi.mock('../assets/dict-en/index.aff?raw', () => ({ default: '' }));
vi.mock('../assets/dict-en/index.dic?raw', () => ({ default: '' }));

describe('dehyphenate', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('joins OCR line-break hyphens when only the closed form is a word', async () => {
    const result = await dehyphenate('The under-\nstanding is plain.');

    expect(result.text).toBe('The understanding is plain.');
    expect(result.ran).toBe(true);
    expect(result.reviewCount).toBe(0);
    expect(result.decisions[0]).toMatchObject({
      original: 'under-\nstanding',
      closed: 'understanding',
      hyphenated: 'under-standing',
      action: 'joined',
    });
  });

  it('preserves real compounds when both parts are words and the closed form is not', async () => {
    const result = await dehyphenate('This is self-\nrestraint.');

    expect(result.text).toBe('This is self-restraint.');
    expect(result.decisions[0].action).toBe('kept-hyphen');
  });

  it('marks capitalized or uncertain split words for review and resolves choices', async () => {
    const result = await dehyphenate('Ostwald-\nstyle and eudai-\nmonia.');

    expect(result.reviewCount).toBe(2);
    expect(result.text).toContain('[REVIEW: "Ostwaldstyle" or "Ostwald-style"?]');
    expect(result.text).toContain('[REVIEW: "eudaimonia" or "eudai-monia"?]');
    expect(listReviewItems(result.text)).toEqual([
      expect.objectContaining({ index: 0, closed: 'Ostwaldstyle', hyphenated: 'Ostwald-style' }),
      expect.objectContaining({ index: 1, closed: 'eudaimonia', hyphenated: 'eudai-monia' }),
    ]);
    expect(resolveReviews(result.text, new Map([[0, 'Ostwald-style']]))).toContain('Ostwald-style');
  });

  it('leaves Greek and mid-line hyphens untouched when no ASCII line-break site exists', async () => {
    const text = 'Ἀριστο-\nτέλης keeps self-restraint mid-line.';
    const result = await dehyphenate(text);

    expect(result).toEqual({ text, decisions: [], reviewCount: 0, ran: false });
  });
});
