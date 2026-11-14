import { describe, expect, it } from 'vitest';
import { nameYear, yearOnly } from '../lib/edition-label';

describe('yearOnly', () => {
  it.each([
    ['(Oxford, 1921)', '(1921)'],
    ['(Budé, 1964–69)', '(1964–69)'],
    ['(Kegan Paul, rev. ed. 1893)', '(1893)'],
    ['(Macmillan, 4th ed. 1907)', '(1907)'],
    ['(1776; repr. 1912)', '(1776)'],
    ['(1812)', '(1812)'],
    ['(Loeb)', '(Loeb)'],
  ])('%s → %s', (a, b) => expect(yearOnly(a)).toBe(b));
});

describe('nameYear', () => {
  it.each([
    ['Ross (OCT, 1957)', 'Ross (1957)'],
    ['Busse (CAG IV.1, 1887)', 'Busse (1887)'],
    ['Lorimer (Les Belles Lettres, 1933)', 'Lorimer (1933)'],
    ['Fobes (1919)', 'Fobes (1919)'],
    ['Ross', 'Ross'],
  ])('%s → %s', (a, b) => expect(nameYear(a)).toBe(b));
});
