import { describe, expect, it } from 'vitest';
import { WORKS, bookLabel, furtherReading, getWork, inPrintHref, isBookless, visibleTranslations, workLanding, workPath } from '../lib/works';

describe('works registry helpers', () => {
  it('looks up works and normalizes book labels and paths', () => {
    const en = getWork('EN');
    expect(en?.title).toBe('Nicomachean Ethics');
    expect(en && bookLabel(en, 1)).toBe('I');
    expect(en && bookLabel(en, 99)).toBe('99');
    expect(workPath('EN', 99)).toBe('/EN/book/10');
    expect(workPath('EN', -3)).toBe('/EN/book/1');
    expect(workLanding('EN')).toBe('/EN');
  });

  it('reports bookless works and visible translations', () => {
    const cat = getWork('Cat');
    expect(cat && isBookless(cat)).toBe(true);
    expect(cat && visibleTranslations(cat).every((t) => !t.private)).toBe(true);
    expect(WORKS.length).toBeGreaterThan(10);
  });

  it('adds runtime extra translations without mutating the registry entry', () => {
    const en = getWork('EN')!;
    (globalThis as { __ARISTOTLE_EXTRA_TRANSLATIONS__?: unknown }).__ARISTOTLE_EXTRA_TRANSLATIONS__ = {
      EN: [{ id: 'mine', name: 'Local Import', short: 'Local', slot: 'overlay' }],
    };
    expect(visibleTranslations(en).map((t) => t.id)).toContain('mine');
    delete (globalThis as { __ARISTOTLE_EXTRA_TRANSLATIONS__?: unknown }).__ARISTOTLE_EXTRA_TRANSLATIONS__;
  });

  it('creates stable in-print links from curated metadata', () => {
    const item = furtherReading('EN')[0];
    expect(item.cite).toContain('Nicomachean Ethics');
    expect(inPrintHref({ kind: 'translation', cite: 'A <em>Book</em> & commentary' })).toBe(
      'https://www.google.com/search?tbm=bks&q=A%20Book%20%26%20commentary',
    );
  });
});
