// The work page's Texts section prints a full entry for every translation the
// page offers (John, 14 Nov 2026). A translation added without an entry would
// drop silently out of that list, so every public one must have one.
import { describe, expect, it } from 'vitest';
import { WORKS } from '@shared/lib/works';
import bib from '../data/translation-bib.json';

const entries = bib as Record<string, string>;
const offered = WORKS.flatMap(w => w.translations.filter(t => !t.private).map(t => `${w.id}/${t.id}`));

describe('translation-bib', () => {
  it.each(offered)('%s has a full entry', key => {
    expect(entries[key]?.trim()).toBeTruthy();
  });

  it('holds no entry for a translation the site does not offer', () => {
    expect(Object.keys(entries).filter(k => !offered.includes(k))).toEqual([]);
  });

  // Titles in italics, as the In print list below them (John, 14 Nov); no other markup.
  it('marks titles with <i> and nothing else', () => {
    const bad = Object.entries(entries).filter(([, v]) => /[<>]/.test(v.replace(/<\/?i>/g, '')) || !/<i>[^<]+<\/i>/.test(v));
    expect(bad.map(([k]) => k)).toEqual([]);
  });

  it('marks the title of every Greek entry the same way', () => {
    const bad = WORKS.filter(w => w.greekSource.full && (!/<i>[^<]+<\/i>/.test(w.greekSource.full) || /[<>]/.test(w.greekSource.full.replace(/<\/?i>/g, ''))));
    expect(bad.map(w => w.id)).toEqual([]);
  });
});
