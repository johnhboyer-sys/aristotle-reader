// Latin key derivation — the TypeScript port of the classical-philosophy-reader
// pipeline's reader_pipeline/latin.py. These cases pin the rules that module's
// docstrings and tests establish, so the two stay in step.
import { describe, expect, it } from 'vitest';
import {
  encliticVariants,
  foldLatin,
  isCapitalizedSurface,
  latinLookupVariants,
  toLatinKey,
} from '../latinKey';
import { parseAnalysesField } from '../morphology';
import { latinBaseKey } from '../provider';
import { latinWordAt } from '../wordAt';

describe('toLatinKey', () => {
  it('is the lowercased surface — no transliteration, no u/v or i/j rewrite', () => {
    expect(toLatinKey('Virtutem')).toBe('virtutem');
    expect(toLatinKey('UITA')).toBe('uita');
    expect(toLatinKey('coniunx')).toBe('coniunx');
  });

  it('never fails on odd input', () => {
    expect(toLatinKey('utrum-ne')).toBe('utrum-ne'); // interior hyphen kept verbatim
    expect(toLatinKey('')).toBe('');
  });
});

describe('encliticVariants', () => {
  it('offers the split host for -que/-ne/-ve', () => {
    expect(encliticVariants('populusque')).toEqual(['populus']);
    expect(encliticVariants('videsne')).toEqual(['vides']);
  });

  it('suppresses the split for common false enclitics', () => {
    for (const word of ['atque', 'neque', 'itaque', 'quoque', 'namque']) {
      expect(encliticVariants(word)).toEqual([]);
    }
  });

  it('will not reduce a token to a one-character host', () => {
    expect(encliticVariants('one')).toEqual([]); // host "o" is too short
  });
});

describe('latinLookupVariants', () => {
  it('tries the whole form BEFORE any split, so a real lemma resolves first', () => {
    expect(latinLookupVariants('quisque')).toEqual(['quisque', 'quis']);
  });

  it('adds capitalized candidates only for a capitalized surface, and last', () => {
    expect(latinLookupVariants('cicero')).toEqual(['cicero']);
    expect(latinLookupVariants('cicero', true)).toEqual(['cicero', 'Cicero']);
    // the capitalized forms follow EVERY lowercase candidate
    expect(latinLookupVariants('populusque', true)).toEqual([
      'populusque',
      'populus',
      'Populusque',
      'Populus',
    ]);
  });
});

describe('isCapitalizedSurface', () => {
  it('reports whether the clicked token itself was capitalized', () => {
    expect(isCapitalizedSurface('Cicero')).toBe(true);
    expect(isCapitalizedSurface('cicero')).toBe(false);
    expect(isCapitalizedSurface('')).toBe(false);
  });
});

describe('foldLatin', () => {
  it('unifies u/v and i/j so spelling conventions match each other', () => {
    expect(foldLatin('uita')).toBe(foldLatin('vita'));
    expect(foldLatin('coniunx')).toBe(foldLatin('conjunx'));
  });

  it('folds a macron to its BASE letter rather than deleting it', () => {
    expect(foldLatin('mālus')).toBe('malus');
    expect(foldLatin('ă')).toBe('a');
  });

  it('expands the æ/œ ligatures, which Unicode decomposition leaves alone', () => {
    expect(foldLatin('cæsar')).toBe('caesar');
    expect(foldLatin('pœna')).toBe('poena');
  });
});

describe('latinBaseKey — Diogenes lemma ↔ Lewis & Short headword', () => {
  it('strips quantity marks, homonym digits, and the # marker', () => {
    expect(latinBaseKey('va^co')).toBe('vaco');
    expect(latinBaseKey('va_gi_na')).toBe('vagina');
    expect(latinBaseKey('vallus1')).toBe('vallus');
    expect(latinBaseKey('edo#1')).toBe('edo');
    expect(latinBaseKey('bonum#')).toBe('bonum');
  });

  it('reduces a dictionary key and a morphology lemma to the SAME form', () => {
    // This is the whole point: the two sides spell the headword differently.
    expect(latinBaseKey('va^ri^us1')).toBe(latinBaseKey('varius'));
    expect(latinBaseKey('Py_tha^go^ras')).toBe(latinBaseKey('Pythagoras'));
  });
});

describe('parseAnalysesField — Morpheus analyses line bodies', () => {
  it('reads a single Latin analysis with a form,lemma pair', () => {
    expect(parseAnalysesField('{78555853 9 virtu_tem,virtus\t \tfem acc sg}')).toEqual([
      { lemma: 'virtus', form: 'virtu_tem', gloss: '', parse: 'fem acc sg' },
    ]);
  });

  it('reads a lemma-only analysis (no comma)', () => {
    expect(parseAnalysesField('{3824498 9 amo\t \tpres ind pass 1st sg}')).toEqual([
      { lemma: 'amo', form: '', gloss: '', parse: 'pres ind pass 1st sg' },
    ]);
  });

  it('reads the Greek gloss field, which Latin always leaves blank', () => {
    expect(parseAnalysesField('{60875356 9 lo/gos\tcomputation, reckoning\tmasc nom sg}')).toEqual([
      { lemma: 'lo/gos', form: '', gloss: 'computation, reckoning', parse: 'masc nom sg' },
    ]);
    expect(parseAnalysesField('{8099220 9 a)/nqrwpos\tman\tmasc gen sg}')).toEqual([
      { lemma: 'a)/nqrwpos', form: '', gloss: 'man', parse: 'masc gen sg' },
    ]);
  });

  it('reads every analysis of an ambiguous form, homonym markers intact', () => {
    const analyses = parseAnalysesField(
      '{24486703 9 e_sse,edo#1\t \tpres inf act}{70660545 9 sum#1\t \tpres inf act}',
    );
    expect(analyses).toEqual([
      { lemma: 'edo#1', form: 'e_sse', gloss: '', parse: 'pres inf act' },
      { lemma: 'sum#1', form: '', gloss: '', parse: 'pres inf act' },
    ]);
  });

  it('ignores malformed braces rather than throwing', () => {
    expect(parseAnalysesField('{nonsense}')).toEqual([]);
    expect(parseAnalysesField('')).toEqual([]);
  });
});

describe('latinWordAt', () => {
  it('finds the word under an offset', () => {
    const text = 'summum bonum est';
    expect(latinWordAt(text, 8)).toEqual({ text: 'bonum', start: 7, end: 12 });
  });

  it('treats punctuation and spaces as boundaries, and an interior hyphen too', () => {
    expect(latinWordAt('bonum, malum', 5)).toBeNull(); // the comma itself
    expect(latinWordAt('utrum-ne', 2)).toEqual({ text: 'utrum', start: 0, end: 5 });
  });

  it('keeps accented and quantity-marked letters inside the word', () => {
    expect(latinWordAt('mālus', 2)?.text).toBe('mālus');
    expect(latinWordAt('cæsar', 1)?.text).toBe('cæsar');
  });

  it('returns null outside any word', () => {
    expect(latinWordAt('', 0)).toBeNull();
    expect(latinWordAt('   ', 1)).toBeNull();
  });
});
