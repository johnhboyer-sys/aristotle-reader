import { describe, expect, it } from 'vitest';
import { getWork, listWorks, parseManifest } from '../manifest';
// Import the same YAML files Vite's `?raw` loads for the real registry, so
// the parsing-logic tests below and getWork/listWorks share one source of
// truth (the .yaml files) without depending on Node's `fs` module (not
// available in this browser-targeted tsconfig).
import metaphysicsYaml from '../manifests/metaphysics.yaml?raw';
import posteriorAnalyticsYaml from '../manifests/posterior-analytics.yaml?raw';

describe('parseManifest', () => {
  it('parses the metaphysics manifest with 14 books, book 2 lowercase alpha', () => {
    const m = parseManifest(metaphysicsYaml, 'metaphysics.yaml');
    expect(m.id).toBe('metaphysics');
    expect(m.title).toBe('Metaphysics');
    expect(m.author).toBe('Aristotle');
    expect(m.scheme).toBe('bekker-metaphysics');
    expect(m.originalLanguage).toBe('greek');
    expect(m.tlgAuthor).toBe('0086');
    expect(m.tlgWork).toBe('025');
    expect(m.books).toHaveLength(14);
    expect(m.books[0]).toEqual({ n: 1, label: 'Α' });
    expect(m.books[1]).toEqual({ n: 2, label: 'α' });
    expect(m.books[1].label).not.toBe(m.books[0].label);
    expect(m.books[13]).toEqual({ n: 14, label: 'Ν' });
  });

  it('parses the posterior-analytics manifest with 2 books', () => {
    const m = parseManifest(posteriorAnalyticsYaml, 'posterior-analytics.yaml');
    expect(m.id).toBe('posterior-analytics');
    expect(m.scheme).toBe('bekker-standard');
    expect(m.tlgAuthor).toBe('0086');
    expect(m.tlgWork).toBe('001');
    expect(m.books).toEqual([
      { n: 1, label: 'I' },
      { n: 2, label: 'II' },
    ]);
  });

  it('throws a clear error on an unknown citation_scheme', () => {
    const bad = `
id: bogus
title: "Bogus"
author: "Nobody"
citation_scheme: not-a-real-scheme
books:
  - { n: 1, label: "I" }
`;
    expect(() => parseManifest(bad, 'bogus.yaml')).toThrow(/unknown citation_scheme/);
  });

  it('throws on missing required fields', () => {
    const bad = `
id: bogus
title: "Bogus"
books:
  - { n: 1, label: "I" }
`;
    expect(() => parseManifest(bad, 'bogus.yaml')).toThrow(/missing or invalid required field/);
  });

  it('throws on empty or malformed books list', () => {
    const bad = `
id: bogus
title: "Bogus"
author: "Nobody"
citation_scheme: bekker-standard
books: []
`;
    expect(() => parseManifest(bad, 'bogus.yaml')).toThrow(/books/);
  });
});

describe('getWork / listWorks (Vite ?raw-backed registry)', () => {
  it('getWork resolves both built-in works', () => {
    expect(getWork('metaphysics').title).toBe('Metaphysics');
    expect(getWork('posterior-analytics').title).toBe('Posterior Analytics');
  });

  it('getWork throws on an unknown id', () => {
    expect(() => getWork('nonexistent')).toThrow(/unknown work/);
  });

  it('listWorks returns both manifests', () => {
    const ids = listWorks().map((w) => w.id).sort();
    expect(ids).toEqual(['metaphysics', 'posterior-analytics']);
  });
});
