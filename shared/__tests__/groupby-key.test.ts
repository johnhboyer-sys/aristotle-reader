// Group by form, ruled (John, 13 Nov): a form is its spelling with the
// accents taken off and everything else kept, so the dative ἀρετῇ is not the
// nominative ἀρετή, and a heading shows one spelling of its group.
import { describe, expect, it } from 'vitest';
import { commonSpelling, formGroupsOf, formKey, headingSpelling } from '../lib/result-views';

describe('formKey', () => {
  // greekFold reads ᾽ (U+1FBD) as an elision, as ’ and ': one form, one group.
  it('groups an elision printed as ᾽ with ’ and \'', () => {
    expect(formKey('ἀλλ᾽')).toBe(formKey('ἀλλ’'));
    expect(formKey('ἀλλ᾽')).toBe(formKey("ἀλλ'"));
  });
  it('takes off acute, grave and circumflex, and nothing else', () => {
    expect(formKey('ἀρετή')).toBe(formKey('ἀρετὴ'));
    expect(formKey('ἀρετή')).toBe('ἀρετη');
    // The iota subscript stays: the dative is a form of its own.
    expect(formKey('ἀρετῇ')).toBe('ἀρετῃ');
    expect(formKey('ἀρετῇ')).not.toBe(formKey('ἀρετή'));
    // Breathings stay: ἤ and ἥ, ἦν and ἥν are not one form.
    expect(formKey('ἤ')).not.toBe(formKey('ἥ'));
    expect(formKey('ἦν')).not.toBe(formKey('ἥν'));
    // Diaeresis stays.
    expect(formKey('προΐεσθαι')).toBe('προϊεσθαι');
  });

  it('puts the accent shifts of one form together: enclitic double accents, ἐστίν beside ἔστιν', () => {
    expect(formKey('πρᾶξίς')).toBe(formKey('πρᾶξις'));
    expect(formKey('ἐστίν')).toBe(formKey('ἔστιν'));
    expect(formKey('ἐστιν')).toBe(formKey('ἔστιν'));
    // ... but not the forms with and without movable nu.
    expect(formKey('ἐστί')).not.toBe(formKey('ἐστίν'));
  });

  it('is lower-cased and keeps the elision mark, whichever the text prints', () => {
    expect(formKey('Ἀρετή')).toBe(formKey('ἀρετή'));
    expect(formKey("δ'")).toBe("δ'");
    expect(formKey('δ’')).toBe("δ'");
    expect(formKey("δ'")).not.toBe(formKey('δέ'));
  });

  it('keys a phrase on every word as spelled, so τὸ, τοῦ and τῷ τί ἦν εἶναι stand apart', () => {
    const keys = ['τὸ τί ἦν εἶναι', 'τοῦ τί ἦν εἶναι', 'τῷ τί ἦν εἶναι', 'τό τι ἦν εἶναι'].map(formKey);
    expect(keys[0]).toBe('το τι ἠν εἰναι');
    expect(keys[0]).toBe(keys[3]);
    expect(new Set(keys.slice(0, 3)).size).toBe(3);
  });

  it('is unchanged by Unicode composition', () => {
    expect(formKey('ἀρετῇ'.normalize('NFD'))).toBe(formKey('ἀρετῇ'.normalize('NFC')));
  });
});

describe('headingSpelling and commonSpelling', () => {
  it('never shows a grave: it counts as the acute', () => {
    expect(headingSpelling('ἀρετὴ')).toBe('ἀρετή');
    expect(headingSpelling('τὸ τί ἦν εἶναι')).toBe('τό τί ἦν εἶναι');
  });

  it('counts a double accent before an enclitic as the single one', () => {
    expect(headingSpelling('πρᾶξίς')).toBe('πρᾶξις');
    expect(headingSpelling('ἄνθρωπός')).toBe('ἄνθρωπος');
    expect(headingSpelling('ἀρετή')).toBe('ἀρετή');
  });

  it('heads a group with its commonest spelling, so counted', () => {
    // ἀρετὴ twice and ἀρετή once are three of ἀρετή.
    expect(commonSpelling(['ἀρετή', 'ἀρετὴ', 'ἀρετὴ', 'ἄρετη', 'ἄρετη'])).toBe('ἀρετή');
    expect(commonSpelling(['ἐστίν', 'ἔστιν', 'ἔστιν'])).toBe('ἔστιν');
  });

  it('breaks a tie for the headword’s own spelling, else the first met', () => {
    expect(commonSpelling(['ἐστίν', 'ἔστιν'])).toBe('ἐστίν');
    expect(commonSpelling(['ἔστιν', 'ἐστίν'])).toBe('ἔστιν');
    expect(commonSpelling(['ἐστίν', 'ἔστιν'], new Set(['ἔστιν']))).toBe('ἔστιν');
  });
});

describe('formGroupsOf, keyed as ruled', () => {
  const item = (id: number, spelling: string, hits = 1) =>
    ({ id, form: 'x', group: formKey(spelling), spellings: Array(hits).fill(spelling), hits });

  it('splits the cases the fold had joined, and heads each with one spelling', () => {
    const groups = formGroupsOf([item(1, 'ἀρετή'), item(2, 'ἀρετῇ'), item(3, 'ἀρετὴ'), item(4, 'ἀρετὴ')]);
    expect(groups.map(g => [g.heading, g.count, g.items.map(i => i.id)])).toEqual([
      ['ἀρετή', 3, [1, 3, 4]],
      ['ἀρετῇ', 1, [2]],
    ]);
  });

  it('heads a merged item by every hit it holds', () => {
    // One passage holding ἀρετὴ three times outweighs two of ἀρετή.
    const groups = formGroupsOf([item(1, 'ἀρετή'), item(2, 'ἀρετή'), { ...item(3, 'ἀρετὴ', 3), hits: 3 }]);
    expect(groups).toHaveLength(1);
    expect(groups[0].heading).toBe('ἀρετή');
    const shift = formGroupsOf([item(1, 'ἐστίν'), { ...item(2, 'ἔστιν', 3), hits: 3 }]);
    expect(shift.map(g => [g.heading, g.count])).toEqual([['ἔστιν', 4]]);
  });

  it('keeps the hits with no Greek last, under no heading', () => {
    const groups = formGroupsOf([{ id: 1, hits: 2 }, item(2, 'καί')]);
    expect(groups.map(g => [g.key, g.heading])).toEqual([['και', 'καί'], [null, '']]);
  });
});
