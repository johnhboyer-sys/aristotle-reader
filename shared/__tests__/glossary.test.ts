import { describe, expect, it } from 'vitest';
import { GLOSSARY_ENTRIES, GLOSSARY_NOTE, GLOSSARY_TITLE, glossaryHref, glossarySlug, linkifyGlossaryRefs } from '../lib/glossary';

describe('glossary helpers', () => {
  it('parses the glossary markdown into entries', () => {
    expect(GLOSSARY_TITLE).toBe('GLOSSARY OF TECHNICAL TERMS');
    expect(GLOSSARY_NOTE).toContain('capital letters');
    expect(GLOSSARY_ENTRIES.length).toBeGreaterThan(10);
    expect(GLOSSARY_ENTRIES[0]).toEqual(expect.objectContaining({
      slug: expect.any(String),
      terms: expect.any(Array),
      html: expect.any(String),
    }));
  });

  it('normalizes macrons and punctuation when resolving slugs', () => {
    expect(glossarySlug('technē')).toBe('techne');
    expect(glossarySlug('Techne!')).toBe('techne');
    expect(glossarySlug('not-a-real-term')).toBeNull();
  });

  it('builds glossary hrefs and only linkifies glossary footnote references', () => {
    expect(glossaryHref('hexis')).toBe('/EN/glossary#hexis');
    expect(linkifyGlossaryRefs('No reference to <em>hexis</em>.')).toBe('No reference to <em>hexis</em>.');
    expect(linkifyGlossaryRefs('See Glossary, <em>hexis, diathesis</em>.')).toContain(
      '<a class="gloss-ref" href="/EN/glossary#hexis">hexis</a>',
    );
  });
});
